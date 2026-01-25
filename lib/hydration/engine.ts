/**
 * Hydration Execution Engine
 * Manages task queue and executes operations against Microsoft Graph API
 */

import { GraphClient } from "@/lib/graph/client";
import { hasHydrationMarker, addHydrationMarker } from "@/lib/utils/hydrationMarker";
import { HydrationTask, OperationMode, TaskCategory, CISCategoryId, BaselineSelection, CategorySelections } from "@/types/hydration";
import {
  DeviceGroup,
  DeviceFilter,
  CompliancePolicy,
  ConditionalAccessPolicy,
  AppProtectionPolicy,
} from "@/types/graph";
import {
  createGroup,
  deleteGroupByName,
  getIntuneGroups,
} from "@/lib/graph/groups";
import {
  createFilter,
  getAllFilters,
} from "@/lib/graph/filters";
import {
  createCompliancePolicy,
  deleteCompliancePolicyByName,
  compliancePolicyExists,
} from "@/lib/graph/compliance";
import {
  createConditionalAccessPolicy,
  deleteConditionalAccessPolicyByName,
  conditionalAccessPolicyExists,
} from "@/lib/graph/conditionalAccess";
import { policyRequiresPremiumP2 } from "@/lib/graph/conditionalAccessP2";
import {
  createAppProtectionPolicy,
  deleteAppProtectionPolicy,
  getAllAppProtectionPolicies,
} from "@/lib/graph/appProtection";
import {
  createEnrollmentProfile,
  enrollmentProfileExists,
  deleteEnrollmentProfileByName,
  getEnrollmentProfileType,
  EnrollmentProfile,
} from "@/lib/graph/enrollment";
import * as Templates from "@/templates";
import {
  fetchDynamicGroups,
  fetchStaticGroups,
  fetchFilters,
  fetchCompliancePolicies,
  fetchConditionalAccessPolicies,
  fetchAppProtectionPolicies,
  fetchEnrollmentProfiles,
  fetchCISBaselinePolicies,
  fetchCISBaselinePoliciesByCategories,
  fetchBaselinePolicies,
  getCachedTemplates,
  cacheTemplates,
  clearCategoryCache,
  getAllTemplateCacheKeys,
  GroupTemplate,
  FilterTemplate,
  ComplianceTemplate,
  ConditionalAccessTemplate,
  AppProtectionTemplate,
  CISBaselinePolicy,
  BaselinePolicy,
} from "@/lib/templates/loader";

/**
 * Task execution context
 */
export interface ExecutionContext {
  client: GraphClient;
  operationMode: OperationMode;
  stopOnFirstError: boolean;
  onTaskStart?: (task: HydrationTask) => void;
  onTaskComplete?: (task: HydrationTask) => void;
  onTaskError?: (task: HydrationTask, error: Error) => void;
  shouldCancel?: () => boolean;
  shouldPause?: () => boolean;
  // Pre-fetched data caches to avoid repeated API calls
  cachedAppProtectionPolicies?: AppProtectionPolicy[];
  cachedIntuneGroups?: DeviceGroup[];
  cachedFilters?: DeviceFilter[];
  // Cached Settings Catalog policies for delete operations (fetched once, reused for all deletes)
  cachedSettingsCatalogPolicies?: Array<{ id: string; name: string; description?: string }>;
  // Cached Driver Update Profiles for delete operations
  cachedDriverUpdateProfiles?: Array<{ id: string; displayName: string; description?: string }>;
  // License flags for conditional skipping
  hasPremiumP2License?: boolean;
  hasWindowsDriverUpdateLicense?: boolean;
}

/**
 * Task execution result
 */
export interface ExecutionResult {
  task: HydrationTask;
  success: boolean;
  skipped: boolean;
  error?: string;
  warning?: string;
  createdId?: string;
}

/**
 * Sleep utility for delays between tasks
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a single task
 */
async function executeTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode } = context;

  // Update task status to running
  task.status = "running";
  task.startTime = new Date();
  context.onTaskStart?.(task);

  // Give React time to render the "running" state before task completes
  await sleep(100);

  try {
    let result: ExecutionResult;

    // Check for Windows Driver Update license requirement
    const isDriverUpdateProfile = task.itemName.toLowerCase().includes("wufb drivers") ||
      task.itemName.toLowerCase().includes("driver update");

    if (isDriverUpdateProfile && context.hasWindowsDriverUpdateLicense === false) {
      task.status = "skipped";
      task.error = "No Windows Driver Update license (Windows E3/E5, Microsoft 365 E3/E5, etc.)";
      task.endTime = new Date();
      context.onTaskComplete?.(task);
      return {
        task,
        success: true,
        skipped: true,
        error: task.error,
      };
    }
    switch (task.category) {
      case "groups":
        result = await executeGroupTask(task, context);
        break;
      case "filters":
        result = await executeFilterTask(task, context);
        break;
      case "compliance":
        result = await executeComplianceTask(task, client, operationMode);
        break;
      case "conditionalAccess":
        result = await executeConditionalAccessTask(task, context);
        break;
      case "appProtection":
        result = await executeAppProtectionTask(task, context);
        break;
      case "baseline":
        result = await executeBaselineTask(task, context);
        break;
      case "cisBaseline":
        result = await executeCISBaselineTask(task, context);
        break;
      case "enrollment":
        result = await executeEnrollmentTask(task, context);
        break;
      default:
        result = {
          task,
          success: false,
          skipped: false,
          error: `Unknown task category: ${task.category}`,
        };
    }

    // Update task with result
    task.status = result.skipped ? "skipped" : result.success ? "success" : "failed";
    task.error = result.error;
    task.warning = result.warning;
    task.endTime = new Date();

    if (result.success || result.skipped) {
      context.onTaskComplete?.(task);
    } else if (result.error) {
      context.onTaskError?.(task, new Error(result.error));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    task.status = "failed";
    task.error = errorMessage;
    task.endTime = new Date();
    context.onTaskError?.(task, error as Error);

    return {
      task,
      success: false,
      skipped: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute a group task (create or delete)
 */
async function executeGroupTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: GroupTemplate | DeviceGroup | undefined;
  const cachedGroups = getCachedTemplates("groups");

  if (cachedGroups && Array.isArray(cachedGroups)) {
    template = (cachedGroups as GroupTemplate[]).find((g) => g.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getDynamicGroupByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if group already exists using pre-fetched cache
    const existingGroup = context.cachedIntuneGroups?.find(
      (g) => g.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingGroup) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Group already exists",
      };
    }

    // Convert template to full DeviceGroup format if it's a simple template
    let fullGroupTemplate: DeviceGroup = template as DeviceGroup;
    if (!("@odata.type" in template)) {
      const simpleTemplate = template as GroupTemplate;
      const isStaticGroup = simpleTemplate.isStaticGroup === true || !simpleTemplate.membershipRule;

      if (isStaticGroup) {
        fullGroupTemplate = {
          "@odata.type": "#microsoft.graph.group",
          displayName: simpleTemplate.displayName,
          description: simpleTemplate.description,
          groupTypes: [],
          mailEnabled: false,
          mailNickname: simpleTemplate.displayName.replace(/[^a-zA-Z0-9]/g, ""),
          securityEnabled: true,
        };
      } else {
        fullGroupTemplate = {
          "@odata.type": "#microsoft.graph.group",
          displayName: simpleTemplate.displayName,
          description: simpleTemplate.description,
          groupTypes: ["DynamicMembership"],
          mailEnabled: false,
          mailNickname: simpleTemplate.displayName.replace(/[^a-zA-Z0-9]/g, ""),
          securityEnabled: true,
          membershipRule: simpleTemplate.membershipRule,
          membershipRuleProcessingState: "On",
        };
      }
    }

    const created = await createGroup(client, fullGroupTemplate);

    // Add the newly created group to the cache
    if (context.cachedIntuneGroups) {
      context.cachedIntuneGroups.push(created);
    }

    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Delete the group
    try {
      await deleteGroupByName(client, template.displayName);
      return { task, success: true, skipped: false };
    } catch (error) {
      // Group not found or not created by hydration kit - skip
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a filter task (create or delete)
 */
async function executeFilterTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: FilterTemplate | DeviceFilter | undefined;
  const cachedFilterTemplates = getCachedTemplates("filters");

  if (cachedFilterTemplates && Array.isArray(cachedFilterTemplates)) {
    template = (cachedFilterTemplates as FilterTemplate[]).find((f) => f.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getDeviceFilterByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if filter already exists using pre-fetched cache
    const existingFilter = context.cachedFilters?.find(
      (f) => f.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingFilter) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Filter already exists",
      };
    }

    // Convert template to full DeviceFilter format if it's a simple template
    let fullFilterTemplate: DeviceFilter = template as DeviceFilter;
    if (!("@odata.type" in template)) {
      const simpleTemplate = template as FilterTemplate;
      fullFilterTemplate = {
        "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
        displayName: simpleTemplate.displayName,
        description: simpleTemplate.description,
        platform: simpleTemplate.platform as "android" | "iOS" | "macOS" | "windows10AndLater",
        rule: simpleTemplate.rule,
      };
    }

    const created = await createFilter(client, fullFilterTemplate);

    // Add the newly created filter to the cache
    if (context.cachedFilters) {
      context.cachedFilters.push(created);
    }

    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Check if filter exists in tenant using pre-fetched cache
    const existingFilter = context.cachedFilters?.find(
      (f) => f.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (!existingFilter) {
      return { task, success: true, skipped: true, error: "Filter not found in tenant" };
    }

    // Check if it was created by the hydration kit
    if (!hasHydrationMarker(existingFilter.description)) {
      return { task, success: true, skipped: true, error: "Filter not created by Intune Hydration Kit" };
    }

    await client.delete(`/deviceManagement/assignmentFilters/${existingFilter.id}`);

    // Remove from cache
    if (context.cachedFilters) {
      const index = context.cachedFilters.findIndex((f) => f.id === existingFilter.id);
      if (index !== -1) {
        context.cachedFilters.splice(index, 1);
      }
    }

    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a compliance policy task (create or delete)
 */
async function executeComplianceTask(
  task: HydrationTask,
  client: GraphClient,
  mode: OperationMode
): Promise<ExecutionResult> {
  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: ComplianceTemplate | CompliancePolicy | undefined;
  const cachedCompliance = getCachedTemplates("compliance");
  if (cachedCompliance && Array.isArray(cachedCompliance)) {
    template = (cachedCompliance as ComplianceTemplate[]).find((c) => c.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getCompliancePolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  if (mode === "create") {
    // Check if policy already exists
    const exists = await compliancePolicyExists(client, template.displayName);
    if (exists) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Policy already exists",
      };
    }

    // Create the policy
    const created = await createCompliancePolicy(client, template);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Delete the policy
    try {
      await deleteCompliancePolicyByName(client, template.displayName);
      return { task, success: true, skipped: false };
    } catch (error) {
      // Policy not found or not created by hydration kit - skip
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a conditional access policy task (create or delete)
 */
async function executeConditionalAccessTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: ConditionalAccessTemplate | ConditionalAccessPolicy | undefined;
  const cachedCA = getCachedTemplates("conditionalAccess");
  if (cachedCA && Array.isArray(cachedCA)) {
    template = (cachedCA as ConditionalAccessTemplate[]).find((ca) => ca.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getConditionalAccessPolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  // Check if policy requires Premium P2 and tenant doesn't have it (PowerShell parity)
  if (mode === "create" && context.hasPremiumP2License === false) {
    if (policyRequiresPremiumP2(template as ConditionalAccessPolicy)) {
      console.log(
        `[Conditional Access] Skipped: ${template.displayName} - requires Azure AD Premium P2 license (uses risk-based conditions)`
      );
      return {
        task,
        success: false,
        skipped: true,
        error: "Requires Premium P2 license",
      };
    }
  }

  if (mode === "create") {
    // Check if policy already exists
    const exists = await conditionalAccessPolicyExists(client, template.displayName);
    if (exists) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Policy already exists",
      };
    }

    // Convert template to full ConditionalAccessPolicy format if needed
    let fullCATemplate: ConditionalAccessPolicy = template as ConditionalAccessPolicy;
    if (!("@odata.type" in template)) {
      const simpleTemplate = template as ConditionalAccessTemplate;
      fullCATemplate = {
        "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
        displayName: simpleTemplate.displayName,
        state: simpleTemplate.state as "enabled" | "disabled" | "enabledForReportingButNotEnforced",
        conditions: simpleTemplate.conditions as { [key: string]: unknown },
        grantControls: simpleTemplate.grantControls,
        sessionControls: simpleTemplate.sessionControls,
      };
    }

    // Create the policy (will be forced to disabled state)
    const created = await createConditionalAccessPolicy(client, fullCATemplate);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Delete the policy (must be disabled first)
    try {
      await deleteConditionalAccessPolicyByName(client, template.displayName);
      return { task, success: true, skipped: false };
    } catch (error) {
      // Policy not found or not created by hydration kit - skip
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute an app protection policy task (create or delete)
 */
async function executeAppProtectionTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: AppProtectionTemplate | AppProtectionPolicy | undefined;
  const cachedAppProtection = getCachedTemplates("appProtection");
  if (cachedAppProtection && Array.isArray(cachedAppProtection)) {
    template = (cachedAppProtection as AppProtectionTemplate[]).find((ap) => ap.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getAppProtectionPolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  if (mode === "create") {
    // Check if policy already exists using cached policies
    const existingPolicy = context.cachedAppProtectionPolicies?.find(
      (p) => p.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingPolicy) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Policy already exists",
      };
    }

    // Create the policy
    const created = await createAppProtectionPolicy(client, template);

    // Add the newly created policy to the cache
    if (context.cachedAppProtectionPolicies) {
      context.cachedAppProtectionPolicies.push(created);
    }

    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Get the policy from cache instead of making an API call
    const policy = context.cachedAppProtectionPolicies?.find(
      (p) => p.displayName.toLowerCase() === template.displayName.toLowerCase()
    );

    if (!policy || !policy.id) {
      // Policy doesn't exist, skip deletion
      return { task, success: true, skipped: true, error: "Policy not found in tenant" };
    }

    // Determine platform from @odata.type
    const odataType = policy["@odata.type"];
    let platform: "iOS" | "android";

    if (odataType === "#microsoft.graph.iosManagedAppProtection") {
      platform = "iOS";
    } else if (odataType === "#microsoft.graph.androidManagedAppProtection") {
      platform = "android";
    } else {
      // Fallback: check template's @odata.type if policy doesn't have it
      const templateOdataType = template["@odata.type"];
      if (templateOdataType === "#microsoft.graph.iosManagedAppProtection") {
        platform = "iOS";
      } else if (templateOdataType === "#microsoft.graph.androidManagedAppProtection") {
        platform = "android";
      } else {
        throw new Error(`Unable to determine platform for policy "${template.displayName}"`);
      }
    }

    // Delete the policy
    await deleteAppProtectionPolicy(client, policy.id, platform);

    // Remove the deleted policy from the cache
    if (context.cachedAppProtectionPolicies) {
      const index = context.cachedAppProtectionPolicies.findIndex((p) => p.id === policy.id);
      if (index !== -1) {
        context.cachedAppProtectionPolicies.splice(index, 1);
      }
    }

    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute an enrollment task (create or delete)
 * Handles Autopilot Deployment Profiles and Enrollment Status Page configurations
 */
async function executeEnrollmentTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Get template from cache
  let template: EnrollmentProfile | undefined;
  const cachedEnrollment = getCachedTemplates("enrollment");

  if (cachedEnrollment && Array.isArray(cachedEnrollment)) {
    template = (cachedEnrollment as EnrollmentProfile[]).find(
      (e) => e.displayName === task.itemName
    );
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  const profileType = getEnrollmentProfileType(template);

  if (mode === "create") {
    const exists = await enrollmentProfileExists(client, template);
    if (exists) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Profile already exists",
      };
    }

    const created = await createEnrollmentProfile(client, template);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    try {
      await deleteEnrollmentProfileByName(client, template.displayName, profileType);
      return { task, success: true, skipped: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Check if a setting or its children contain password/secret placeholders
 * Returns true if placeholders are found
 */
function containsSecretPlaceholders(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false;

  if (typeof obj === "string") {
    // Check for common placeholder patterns
    const placeholders = ["<YOUR", "YOUR_", "PLACEHOLDER", "CHANGE_ME", "TODO"];
    const upper = obj.toUpperCase();
    return placeholders.some(p => upper.includes(p));
  }

  if (Array.isArray(obj)) {
    return obj.some(item => containsSecretPlaceholders(item));
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    // Check if this is a password setting
    const settingDefId = record.settingDefinitionId as string || "";
    const isPasswordSetting = settingDefId.toLowerCase().includes("password") ||
      settingDefId.toLowerCase().includes("secret");

    if (isPasswordSetting) {
      // Check the value for placeholders
      const value = record.simpleSettingValue || record.value;
      if (containsSecretPlaceholders(value)) {
        return true;
      }
    }

    // Recursively check all values
    return Object.values(record).some(v => containsSecretPlaceholders(v));
  }

  return false;
}

/**
 * Check if a settingDefinitionId is for an actual secret/password VALUE field
 * vs settings that mention "password" but aren't credential fields (e.g., encryption type for password-protected files)
 */
function isActualSecretField(settingDefId: string): boolean {
  const lower = settingDefId.toLowerCase();

  // Patterns that indicate actual credential/secret VALUE fields
  const secretPatterns = [
    /_password$/,           // Ends with _password
    /password$/,            // Ends with password (e.g., networkpassword)
    /_pskvalue/,            // WiFi PSK
    /_secretkey/,           // Secret keys
    /_sharedkey/,           // Shared keys
    /_preSharedKey/i,       // Pre-shared keys
    /wifi.*password/i,      // WiFi passwords
    /network.*key/i,        // Network keys
    /network.*password/i,   // Network passwords (Cloud Remediation)
    /vpn.*secret/i,         // VPN secrets
    /_passphrase/,          // Passphrases
  ];

  // Patterns that should NOT trigger secret conversion (settings ABOUT passwords, not password values)
  const excludePatterns = [
    /passwordprotected/i,   // Settings about password-protected files
    /passwordrequired/i,    // Whether password is required
    /passwordexpir/i,       // Password expiration settings
    /passwordlength/i,      // Password length requirements
    /passwordquality/i,     // Password quality settings
    /passwordhistory/i,     // Password history settings
    /encryptiontype/i,      // Encryption type settings
  ];

  // If it matches an exclude pattern, it's not a secret field
  if (excludePatterns.some(p => p.test(lower))) {
    return false;
  }

  // If it matches a secret pattern, it is a secret field
  return secretPatterns.some(p => p.test(lower));
}

/**
 * Recursively clean a setting instance for Settings Catalog
 * Handles nested children and converts password settings to Secret type (only for actual credential fields)
 */
function cleanSettingInstance(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => cleanSettingInstance(item));
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      // Skip id and @odata metadata except @odata.type
      if (key === "id") continue;
      if (key.includes("@odata.") && key !== "@odata.type") continue;
      if (key === "settingDefinitions") continue;

      // Check if this is an actual secret/password VALUE field that needs type conversion
      const settingDefId = record.settingDefinitionId as string || "";
      const isSecretField = isActualSecretField(settingDefId);

      if (key === "simpleSettingValue" && isSecretField && typeof value === "object" && value !== null) {
        const simpleValue = value as Record<string, unknown>;
        const odataType = simpleValue["@odata.type"] as string || "";

        // Convert StringSettingValue to SecretSettingValue for actual credential fields
        if (odataType.includes("StringSettingValue")) {
          cleaned[key] = {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
            value: simpleValue.value,
            valueState: "notEncrypted"
          };
          continue;
        }
      }

      // Recursively clean nested objects and arrays
      cleaned[key] = cleanSettingInstance(value);
    }

    return cleaned;
  }

  return obj;
}

/**
 * Clean a Settings Catalog policy for creation
 * Removes metadata fields that shouldn't be sent when creating
 */
function cleanSettingsCatalogPolicy(policy: Record<string, unknown>): Record<string, unknown> {
  // Ensure hydration marker in description
  const description = addHydrationMarker(policy.description as string | undefined);

  // Build a clean body with only required properties (matches PowerShell approach)
  const cleaned: Record<string, unknown> = {
    name: policy.name || policy.displayName,
    description,
    platforms: policy.platforms,
    technologies: policy.technologies,
    settings: [],
  };

  // Add optional roleScopeTagIds if present
  if (policy.roleScopeTagIds && Array.isArray(policy.roleScopeTagIds)) {
    cleaned.roleScopeTagIds = policy.roleScopeTagIds;
  }

  // Add templateReference if present with a templateId (matches PowerShell)
  const templateRef = policy.templateReference as Record<string, unknown> | undefined;
  if (templateRef && templateRef.templateId) {
    cleaned.templateReference = {
      templateId: templateRef.templateId,
    };
  }

  // Clean settings array recursively - handles nested children and password type conversion
  const settings = policy.settings as Array<Record<string, unknown>> | undefined;
  if (settings && Array.isArray(settings)) {
    cleaned.settings = settings.map((setting: Record<string, unknown>) => {
      return cleanSettingInstance(setting);
    });
  }

  return cleaned;
}

/**
 * Check if a Settings Catalog policy exists by name
 */
async function settingsCatalogPolicyExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  try {
    const response = await client.get<{ value: Array<{ name: string }> }>(
      `/deviceManagement/configurationPolicies?$filter=name eq '${encodeURIComponent(displayName)}'`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Settings Catalog] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

/**
 * Create a Settings Catalog policy
 * Returns warning if policy contains placeholder secrets that need manual configuration
 */
async function createSettingsCatalogPolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string; warning?: string }> {
  // Check for placeholder secrets - warn but continue
  const settings = policy.settings;
  const policyName = (policy.name || policy.displayName) as string;
  let warning: string | undefined;

  if (settings && containsSecretPlaceholders(settings)) {
    warning = `Policy "${policyName}" contains placeholder values that require manual configuration with actual secrets.`;
  }

  // Clean the policy before sending
  const cleanedPolicy = cleanSettingsCatalogPolicy(policy);

  // Use 'name' field for Settings Catalog (not 'displayName')
  if (cleanedPolicy.displayName && !cleanedPolicy.name) {
    cleanedPolicy.name = cleanedPolicy.displayName;
    delete cleanedPolicy.displayName;
  }

  const result = await client.post<{ id: string }>(
    "/deviceManagement/configurationPolicies",
    cleanedPolicy
  );

  return { ...result, warning };
}

/**
 * Create a Device Configuration policy (includes UpdatePolicies/WUfB rings)
 */
async function createDeviceConfigurationPolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy before sending
  const cleanedPolicy = cleanPolicyRecursively(policy, true) as Record<string, unknown>;

  // Remove root-level id
  delete cleanedPolicy.id;

  // Ensure hydration marker in description
  cleanedPolicy.description = addHydrationMarker(cleanedPolicy.description as string | undefined);

  return client.post<{ id: string }>(
    "/deviceManagement/deviceConfigurations",
    cleanedPolicy
  );
}

/**
 * Create a Driver Update Profile (WUfB Drivers)
 */
async function createDriverUpdateProfile(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleanedPolicy = cleanPolicyRecursively(policy, true) as Record<string, unknown>;
  delete cleanedPolicy.id;
  cleanedPolicy.description = addHydrationMarker(cleanedPolicy.description as string | undefined);

  return client.post<{ id: string }>(
    "/deviceManagement/windowsDriverUpdateProfiles",
    cleanedPolicy
  );
}

/**
 * Check if a compliance policy exists by name
 */
async function compliancePolicyExistsByName(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  try {
    const response = await client.get<{ value: Array<{ displayName: string }> }>(
      `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(displayName)}'`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Compliance] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

/**
 * Recursively clean an object by removing OData metadata and other fields that Graph API rejects
 * Keeps @odata.type but removes all other @odata.* properties, ids, timestamps, etc.
 */
function cleanPolicyRecursively(obj: unknown, isRoot: boolean = true): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => cleanPolicyRecursively(item, false));
  }

  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    const excludeFields = [
      // OData metadata
      "@odata.context", "@odata.id", "@odata.editLink",
      // Timestamps and version
      "createdDateTime", "lastModifiedDateTime", "version",
      // Internal metadata
      "_oibPlatform", "_oibPolicyType", "_oibFilePath",
      // OData actions
      "#microsoft.graph.assign", "#microsoft.graph.scheduleActionsForRules",
      // Read-only properties (matches PowerShell Remove-ReadOnlyGraphProperties)
      "supportsScopeTags",
      "deviceManagementApplicabilityRuleOsEdition",
      "deviceManagementApplicabilityRuleOsVersion",
      "deviceManagementApplicabilityRuleDeviceMode",
      "creationSource",
      "settingCount",
      "priorityMetaData",
      "isAssigned",
      // Assignment-related (handled separately if needed)
      "assignments",
    ];

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip excluded fields
      if (excludeFields.includes(key)) {
        continue;
      }

      // Skip any property containing @odata. (except @odata.type)
      if (key.includes("@odata.") && key !== "@odata.type") {
        continue;
      }

      // Skip id fields in nested objects (but keep at root level if needed)
      if (key === "id" && !isRoot) {
        continue;
      }

      // Skip properties starting with # (OData actions)
      if (key.startsWith("#")) {
        continue;
      }

      // Recursively clean nested objects and arrays
      cleaned[key] = cleanPolicyRecursively(value, false);
    }

    return cleaned;
  }

  return obj;
}

/**
 * Create a baseline compliance policy
 */
async function createBaselineCompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleaned = cleanPolicyRecursively(policy, true) as Record<string, unknown>;
  delete cleaned.id;

  return client.post<{ id: string }>(
    "/deviceManagement/deviceCompliancePolicies",
    cleaned
  );
}

/**
 * Create a CIS Baseline compliance policy
 * Cleans the policy payload to remove metadata that Graph API rejects
 */
async function createCISCompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleaned = cleanPolicyRecursively(policy, true) as Record<string, unknown>;

  // Remove id and CIS-specific metadata
  delete cleaned.id;
  delete cleaned._cisCategory;
  delete cleaned._cisSubcategory;
  delete cleaned._cisFilePath;
  delete cleaned.assignments;

  if (!cleaned.displayName && cleaned.name) {
    cleaned.displayName = cleaned.name;
  }

  return client.post<{ id: string }>(
    "/deviceManagement/deviceCompliancePolicies",
    cleaned
  );
}

/**
 * Execute an OpenIntuneBaseline task (create or delete)
 * Routes to correct API based on policy type
 */
async function executeBaselineTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Get template from cache
  const cachedBaseline = getCachedTemplates("baseline");
  let template: BaselinePolicy | undefined;

  if (cachedBaseline && Array.isArray(cachedBaseline)) {
    template = (cachedBaseline as BaselinePolicy[]).find(
      (b) => b.displayName === task.itemName || b.name === task.itemName
    );
  }

  if (!template) {
    console.error(`[Baseline Task] Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  // Determine the policy type and route accordingly
  const policyType = template._oibPolicyType;
  const policyName = template.name || template.displayName || task.itemName;

  console.log(`[Baseline Task] Processing "${policyName}" (type: ${policyType})`);

  if (mode === "create") {
    try {
      // Route based on policy type
      if (policyType === "CompliancePolicies") {
        // Compliance policies go to deviceCompliancePolicies endpoint
        const exists = await compliancePolicyExistsByName(client, policyName);
        if (exists) {
          console.log(`[Baseline Task] Compliance policy already exists, skipping: "${policyName}"`);
          return { task, success: false, skipped: true, error: "Policy already exists" };
        }
        const created = await createBaselineCompliancePolicy(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "AppProtection") {
        // App Protection policies - use existing app protection handler
        const existingPolicy = context.cachedAppProtectionPolicies?.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (existingPolicy) {
          console.log(`[Baseline Task] App Protection policy already exists, skipping: "${policyName}"`);
          return { task, success: false, skipped: true, error: "Policy already exists" };
        }
        const created = await createAppProtectionPolicy(client, template as AppProtectionTemplate);
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "DeviceConfiguration" || policyType === "UpdatePolicies") {
        // DeviceConfiguration and UpdatePolicies use deviceConfigurations endpoint
        const existsResponse = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
          `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(policyName)}'&$select=id,displayName`
        );
        if (existsResponse.value && existsResponse.value.length > 0) {
          console.log(`[Baseline Task] Device Configuration policy already exists, skipping: "${policyName}"`);
          return { task, success: false, skipped: true, error: "Policy already exists" };
        }
        const created = await createDeviceConfigurationPolicy(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "DriverUpdateProfiles") {
        // DriverUpdateProfiles endpoint doesn't support $filter, fetch all and filter client-side
        const existsResponse = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
          `/deviceManagement/windowsDriverUpdateProfiles?$select=id,displayName`
        );
        const existingProfile = existsResponse.value?.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (existingProfile) {
          console.log(`[Baseline Task] Driver Update Profile already exists, skipping: "${policyName}"`);
          return { task, success: false, skipped: true, error: "Policy already exists" };
        }
        const created = await createDriverUpdateProfile(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id };

      } else {
        // SettingsCatalog (default) - use configurationPolicies endpoint
        const exists = await settingsCatalogPolicyExists(client, policyName);
        if (exists) {
          console.log(`[Baseline Task] Settings Catalog policy already exists, skipping: "${policyName}"`);
          return { task, success: false, skipped: true, error: "Policy already exists" };
        }
        const created = await createSettingsCatalogPolicy(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id, warning: created.warning };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Baseline Task] Failed to create policy: "${policyName}"`, error);
      return { task, success: false, skipped: false, error: errorMessage };
    }

  } else if (mode === "delete") {
    try {
      if (policyType === "CompliancePolicies") {
        // Find compliance policy by name first (to get ID)
        const response = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
          `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(policyName)}'&$select=id,displayName`
        );
        if (!response.value || response.value.length === 0) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }
        const policyId = response.value[0].id;

        // Fetch full policy by ID to get description
        const fullPolicy = await client.get<{ id: string; displayName: string; description?: string }>(
          `/deviceManagement/deviceCompliancePolicies/${policyId}?$select=id,displayName,description`
        );
        if (!hasHydrationMarker(fullPolicy.description)) {
          return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
        }

        await client.delete(`/deviceManagement/deviceCompliancePolicies/${policyId}`);
        console.log(`[Baseline Task] ✓ Deleted compliance policy: "${policyName}"`);
        return { task, success: true, skipped: false };

      } else if (policyType === "AppProtection") {
        // Find app protection policy in cache (includes platform info)
        const cachedPolicy = context.cachedAppProtectionPolicies?.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (!cachedPolicy || !cachedPolicy.id) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }

        // Determine platform from the cached policy's _platform property or by checking which endpoint it came from
        // The cache should have been populated with platform info
        const platform = cachedPolicy._platform as "iOS" | "android" || "android";

        // Fetch full policy to check the marker (deleteAppProtectionPolicy does this internally)
        try {
          await deleteAppProtectionPolicy(client, cachedPolicy.id, platform);
          console.log(`[Baseline Task] ✓ Deleted app protection policy: "${policyName}"`);
          return { task, success: true, skipped: false };
        } catch (deleteError) {
          const errMsg = deleteError instanceof Error ? deleteError.message : String(deleteError);
          if (errMsg.includes("Not created by Intune Hydration Kit")) {
            return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
          }
          throw deleteError;
        }

      } else if (policyType === "DeviceConfiguration" || policyType === "UpdatePolicies") {
        // DeviceConfiguration and UpdatePolicies use /deviceManagement/deviceConfigurations endpoint
        const response = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
          `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(policyName)}'&$select=id,displayName`
        );
        if (!response.value || response.value.length === 0) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }
        const policyId = response.value[0].id;

        // Fetch full policy by ID to get description
        const fullPolicy = await client.get<{ id: string; displayName: string; description?: string }>(
          `/deviceManagement/deviceConfigurations/${policyId}?$select=id,displayName,description`
        );
        if (!hasHydrationMarker(fullPolicy.description)) {
          return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
        }

        await client.delete(`/deviceManagement/deviceConfigurations/${policyId}`);
        console.log(`[Baseline Task] ✓ Deleted device configuration policy: "${policyName}"`);
        return { task, success: true, skipped: false };

      } else if (policyType === "DriverUpdateProfiles") {
        // Use pre-fetched cache for Driver Update Profiles
        let profiles = context.cachedDriverUpdateProfiles;

        if (!profiles || profiles.length === 0) {
          console.log(`[Baseline Task] No cached Driver Update Profiles - fetching now...`);
          const response = await client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
            `/deviceManagement/windowsDriverUpdateProfiles`
          );
          profiles = response.value || [];
          context.cachedDriverUpdateProfiles = profiles;
        }

        const matchingProfile = profiles.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (!matchingProfile) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }

        console.log(`[Baseline Task] Found Driver Update Profile: "${matchingProfile.displayName}" (ID: ${matchingProfile.id})`);
        console.log(`[Baseline Task] Description: "${matchingProfile.description || "(none)"}"`);

        // Check hydration marker
        if (!hasHydrationMarker(matchingProfile.description)) {
          console.log(`[Baseline Task] Marker check failed - description does not contain marker`);
          return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
        }

        await client.delete(`/deviceManagement/windowsDriverUpdateProfiles/${matchingProfile.id}`);
        console.log(`[Baseline Task] ✓ Deleted driver update profile: "${policyName}"`);
        return { task, success: true, skipped: false };

      } else {
        // Settings Catalog (default) - use pre-fetched cache to avoid repeated API calls
        // The cache was populated at the start of executeTasks for delete operations
        const allPolicies = context.cachedSettingsCatalogPolicies || [];

        if (allPolicies.length === 0) {
          console.log(`[Baseline Task] No cached Settings Catalog policies - fetching now...`);
          // Fallback: fetch if cache is empty (shouldn't happen in normal flow)
          const fetched = await client.getCollection<{ id: string; name: string; description?: string }>(
            `/deviceManagement/configurationPolicies?$select=id,name,description`
          );
          context.cachedSettingsCatalogPolicies = fetched;
        }

        // Find matching policy by name (case-insensitive)
        const matchingPolicy = (context.cachedSettingsCatalogPolicies || []).find(
          (p) => p.name?.toLowerCase() === policyName.toLowerCase()
        );
        if (!matchingPolicy) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }

        console.log(`[Baseline Task] Found Settings Catalog policy: "${matchingPolicy.name}" (ID: ${matchingPolicy.id})`);
        console.log(`[Baseline Task] Description: "${matchingPolicy.description || "(none)"}"`);

        // Check hydration marker
        if (!hasHydrationMarker(matchingPolicy.description)) {
          return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
        }

        // First check if the policy has any assignments
        let hasAssignments = false;
        try {
          const assignmentsResponse = await client.get<{ value: Array<{ id: string }> }>(
            `/deviceManagement/configurationPolicies/${matchingPolicy.id}/assignments`
          );
          hasAssignments = (assignmentsResponse.value?.length ?? 0) > 0;
          if (hasAssignments) {
            console.log(`[Baseline Task] Policy "${policyName}" has ${assignmentsResponse.value.length} assignment(s), removing...`);
          }
        } catch {
          console.log(`[Baseline Task] Could not check assignments for "${policyName}", will try delete directly`);
        }

        // Remove assignments if present (policies with assignments cannot be deleted)
        if (hasAssignments) {
          try {
            await client.post(`/deviceManagement/configurationPolicies/${matchingPolicy.id}/assign`, {
              assignments: []
            });
            console.log(`[Baseline Task] Cleared assignments for policy: "${policyName}"`);
            // Wait a moment for the assignment removal to propagate
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (assignError) {
            const assignErrorMsg = assignError instanceof Error ? assignError.message : String(assignError);
            console.log(`[Baseline Task] Warning: Could not clear assignments for "${policyName}": ${assignErrorMsg}`);
            // Continue anyway - the delete might still work
          }
        }

        try {
          await client.delete(`/deviceManagement/configurationPolicies/${matchingPolicy.id}`);
          console.log(`[Baseline Task] ✓ Deleted settings catalog policy: "${policyName}"`);
          // Remove from cache after successful delete
          if (context.cachedSettingsCatalogPolicies) {
            context.cachedSettingsCatalogPolicies = context.cachedSettingsCatalogPolicies.filter(
              (p) => p.id !== matchingPolicy.id
            );
          }
          return { task, success: true, skipped: false };
        } catch (deleteError) {
          // Delete returned an error, but policy might still be deleted (Intune backend quirk)
          // Verify by checking if policy still exists
          console.log(`[Baseline Task] Delete returned error for "${policyName}", verifying if policy was actually deleted...`);

          try {
            // Try to fetch the policy by ID - if it fails with 404, it was deleted
            await client.get(`/deviceManagement/configurationPolicies/${matchingPolicy.id}?$select=id`);
            // If we get here, the policy still exists - the delete truly failed
            console.error(`[Baseline Task] Policy "${policyName}" still exists - delete truly failed`);
            throw deleteError;
          } catch (verifyError) {
            const verifyErrorMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
            // Check if it's a 404 (policy not found = successfully deleted)
            if (verifyErrorMsg.includes("404") || verifyErrorMsg.toLowerCase().includes("not found")) {
              console.log(`[Baseline Task] ✓ Policy "${policyName}" confirmed deleted (verified via 404)`);
              // Remove from cache
              if (context.cachedSettingsCatalogPolicies) {
                context.cachedSettingsCatalogPolicies = context.cachedSettingsCatalogPolicies.filter(
                  (p) => p.id !== matchingPolicy.id
                );
              }
              return { task, success: true, skipped: false };
            }
            // Not a 404, rethrow the original delete error
            throw deleteError;
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Baseline Task] Delete failed for "${policyName}":`, errorMessage);
      return { task, success: false, skipped: false, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * CIS policy type enum for routing
 */
type CISPolicyType =
  | "SettingsCatalog"           // configurationPolicies - Settings Catalog (default)
  | "V2Compliance"              // compliancePolicies - Settings Catalog compliance
  | "V1Compliance"              // deviceCompliancePolicies - Legacy compliance
  | "DeviceConfiguration"       // deviceConfigurations - OMA-URI custom policies
  | "SecurityIntent"            // intents - Security baseline intents (deprecated)
  | "Unsupported";              // Policy type not supported for creation

/**
 * Detect the CIS policy type from the template's @odata.type and properties
 */
function detectCISPolicyType(template: Record<string, unknown>): CISPolicyType {
  const odataType = (template["@odata.type"] as string || "").toLowerCase();

  // Security Intents (deprecated security baselines) - NOT supported for creation
  // These require using the template createInstance endpoint which is complex
  if (odataType.includes("devicemanagementintent")) {
    return "Unsupported";
  }

  // Group Policy Configuration (ADMX-based templates like VS Code, Outlook profile) - NOT supported
  // These require a complex 2-step creation: create policy, then add definitionValues with bindings
  // Examples: groupPolicyConfiguration for VS Code settings, OneDrive KFM, Outlook profile
  if (odataType.includes("grouppolicyconfiguration")) {
    return "Unsupported";
  }

  // Device Configurations - various subtypes that all use /deviceConfigurations endpoint
  const deviceConfigPatterns = [
    "windows10customconfiguration",
    "windows10generalconfiguration",
    "windowshealthmonitoringconfiguration",
    "sharedpcconfiguration",
    "windows10endpointprotectionconfiguration",
    "windowsidentityprotectionconfiguration",
    "windowsdefenderadvancedthreatprotectionconfiguration",
    "deviceconfiguration",
  ];

  const isDeviceConfig = deviceConfigPatterns.some(pattern => odataType.includes(pattern));
  const hasOmaSettings = template.omaSettings && Array.isArray(template.omaSettings);

  if (isDeviceConfig || hasOmaSettings) {
    return "DeviceConfiguration";
  }

  // V2 Compliance (Settings Catalog compliance) - has platforms/technologies
  if (odataType.includes("devicemanagementcompliancepolicy")) {
    return "V2Compliance";
  }

  // V1 Compliance (legacy compliance) - has @odata.type like windows10CompliancePolicy
  if (
    odataType.includes("compliancepolicy") &&
    !odataType.includes("devicemanagement")
  ) {
    return "V1Compliance";
  }

  // Default: Settings Catalog (most CIS baselines are this type)
  return "SettingsCatalog";
}

/**
 * Create a V2 Compliance policy (Settings Catalog compliance)
 * Endpoint: /deviceManagement/compliancePolicies
 */
async function createV2CompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy recursively
  const cleaned = cleanPolicyRecursively(policy, true) as Record<string, unknown>;

  // Remove root-level id and CIS metadata
  delete cleaned.id;
  delete cleaned._cisCategory;
  delete cleaned._cisSubcategory;
  delete cleaned._cisFilePath;

  // Ensure hydration marker in description
  cleaned.description = addHydrationMarker(cleaned.description as string | undefined);

  // Use 'name' for Settings Catalog compliance (not displayName)
  if (cleaned.displayName && !cleaned.name) {
    cleaned.name = cleaned.displayName;
  }

  // Clean settings array - must have settingInstance structure
  const settings = cleaned.settings as Array<Record<string, unknown>> | undefined;
  if (settings && Array.isArray(settings)) {
    cleaned.settings = settings.map((setting: Record<string, unknown>) => {
      const cleanedSetting: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(setting)) {
        // Skip id and @odata metadata except @odata.type
        if (key === "id") continue;
        if (key.includes("@odata.") && key !== "@odata.type") continue;
        if (key === "settingDefinitions") continue;
        cleanedSetting[key] = value;
      }
      return cleanedSetting;
    });
  }

  console.log(`[V2 Compliance] Creating policy: "${cleaned.name}"`);
  console.log(`[V2 Compliance] Policy payload keys:`, Object.keys(cleaned));

  const result = await client.post<{ id: string }>(
    "/deviceManagement/compliancePolicies",
    cleaned
  );

  console.log(`[V2 Compliance] Policy created with ID: ${result.id}`);
  return result;
}

/**
 * Check if a V2 Compliance policy exists by name
 */
async function v2CompliancePolicyExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  try {
    const response = await client.get<{ value: Array<{ name: string }> }>(
      `/deviceManagement/compliancePolicies?$filter=name eq '${encodeURIComponent(displayName)}'`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[V2 Compliance] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

/**
 * Create a CIS Device Configuration policy (OMA-URI)
 * Endpoint: /deviceManagement/deviceConfigurations
 */
async function createCISDeviceConfiguration(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy recursively
  const cleaned = cleanPolicyRecursively(policy, true) as Record<string, unknown>;

  // Remove root-level id and CIS metadata
  delete cleaned.id;
  delete cleaned._cisCategory;
  delete cleaned._cisSubcategory;
  delete cleaned._cisFilePath;

  // Ensure hydration marker in description
  cleaned.description = addHydrationMarker(cleaned.description as string | undefined);

  console.log(`[CIS Device Config] Creating policy: "${cleaned.displayName}"`);

  const result = await client.post<{ id: string }>(
    "/deviceManagement/deviceConfigurations",
    cleaned
  );

  console.log(`[CIS Device Config] Policy created with ID: ${result.id}`);
  return result;
}

/**
 * Check if a device configuration exists by name
 */
async function deviceConfigurationExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  try {
    const response = await client.get<{ value: Array<{ displayName: string }> }>(
      `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(displayName)}'`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Device Config] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

/**
 * Execute a CIS Baseline task (create or delete)
 * Routes to correct endpoint based on policy type
 */
async function executeCISBaselineTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Get template from cache - need to find the right cache key
  let template: CISBaselinePolicy | undefined;

  // Try to find in any CIS baseline cache (includes both sessionStorage and in-memory fallback)
  // Task itemName can be displayName, name, or _cisFilePath (file path), so check all three
  const cacheKeys = getAllTemplateCacheKeys().filter(k => k.startsWith("intune-hydration-templates-cisBaseline"));
  for (const key of cacheKeys) {
    const cacheKey = key.replace("intune-hydration-templates-", "");
    const cached = getCachedTemplates(cacheKey);
    if (cached && Array.isArray(cached)) {
      template = (cached as CISBaselinePolicy[]).find(
        (b) => b.displayName === task.itemName ||
               (b as Record<string, unknown>).name === task.itemName ||
               b._cisFilePath === task.itemName
      );
      if (template) break;
    }
  }

  if (!template) {
    console.error(`[CIS Baseline Task] Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  // Detect the policy type for proper routing
  const policyType = detectCISPolicyType(template as Record<string, unknown>);
  const odataType = template["@odata.type"] as string || "";
  const policyName = template.displayName || (template as Record<string, unknown>).name as string || task.itemName;

  console.log(`[CIS Baseline Task] Processing "${policyName}" (type: ${policyType}, @odata.type: ${odataType})`);

  if (mode === "create") {
    try {
      switch (policyType) {
        case "Unsupported":
          // Security Intents, ADMX policies, and other unsupported types
          console.log(`[CIS Baseline Task] Skipping unsupported policy type: "${policyName}" (@odata.type: ${odataType})`);
          // Provide specific error message based on policy type
          let unsupportedReason = "This policy type is not supported for automated creation.";
          if (odataType.includes("grouppolicyconfiguration")) {
            unsupportedReason = "ADMX-based policies require complex 2-step creation with definition bindings. Please create manually in Intune.";
          } else if (odataType.includes("devicemanagementintent")) {
            unsupportedReason = "Security Intents require template instance creation. Please create manually in Intune.";
          }
          return {
            task,
            success: false,
            skipped: true,
            error: `Unsupported policy type: ${odataType}. ${unsupportedReason}`
          };

        case "V2Compliance":
          // Settings Catalog compliance -> /compliancePolicies
          const v2Exists = await v2CompliancePolicyExists(client, policyName);
          if (v2Exists) {
            console.log(`[CIS Baseline Task] V2 Compliance policy already exists, skipping: "${policyName}"`);
            return { task, success: false, skipped: true, error: "Policy already exists" };
          }
          const v2Created = await createV2CompliancePolicy(client, template as Record<string, unknown>);
          return { task, success: true, skipped: false, createdId: v2Created.id };

        case "V1Compliance":
          // Legacy compliance -> /deviceCompliancePolicies
          const v1Exists = await compliancePolicyExistsByName(client, policyName);
          if (v1Exists) {
            console.log(`[CIS Baseline Task] V1 Compliance policy already exists, skipping: "${policyName}"`);
            return { task, success: false, skipped: true, error: "Policy already exists" };
          }
          const v1Created = await createCISCompliancePolicy(client, template as Record<string, unknown>);
          return { task, success: true, skipped: false, createdId: v1Created.id };

        case "DeviceConfiguration":
          // Device configuration -> /deviceConfigurations
          const dcExists = await deviceConfigurationExists(client, policyName);
          if (dcExists) {
            console.log(`[CIS Baseline Task] Device Configuration already exists, skipping: "${policyName}"`);
            return { task, success: false, skipped: true, error: "Policy already exists" };
          }
          const dcCreated = await createCISDeviceConfiguration(client, template as Record<string, unknown>);
          return { task, success: true, skipped: false, createdId: dcCreated.id };

        case "SettingsCatalog":
        default:
          // Settings Catalog -> /configurationPolicies
          const scExists = await settingsCatalogPolicyExists(client, policyName);
          if (scExists) {
            console.log(`[CIS Baseline Task] Settings Catalog policy already exists, skipping: "${policyName}"`);
            return { task, success: false, skipped: true, error: "Policy already exists" };
          }
          const scCreated = await createSettingsCatalogPolicy(client, template as Record<string, unknown>);
          return { task, success: true, skipped: false, createdId: scCreated.id, warning: scCreated.warning };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CIS Baseline Task] Failed to create policy: "${policyName}"`, error);
      return { task, success: false, skipped: false, error: errorMessage };
    }
  } else if (mode === "delete") {
    try {
      switch (policyType) {
        case "Unsupported":
          // Can't delete what we can't create
          return { task, success: true, skipped: true, error: "Unsupported policy type" };

        case "V2Compliance":
          // Delete from /compliancePolicies
          const v2Response = await client.get<{ value: Array<{ id: string; name: string; description?: string }> }>(
            `/deviceManagement/compliancePolicies?$filter=name eq '${encodeURIComponent(policyName)}'`
          );
          if (!v2Response.value || v2Response.value.length === 0) {
            return { task, success: true, skipped: true, error: "Policy not found in tenant" };
          }
          const v2Policy = v2Response.value[0];
          if (!hasHydrationMarker(v2Policy.description)) {
            return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
          }
          await client.delete(`/deviceManagement/compliancePolicies/${v2Policy.id}`);
          return { task, success: true, skipped: false };

        case "V1Compliance":
          // Delete from /deviceCompliancePolicies
          const v1Response = await client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
            `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(policyName)}'`
          );
          if (!v1Response.value || v1Response.value.length === 0) {
            return { task, success: true, skipped: true, error: "Policy not found in tenant" };
          }
          const v1Policy = v1Response.value[0];
          if (!hasHydrationMarker(v1Policy.description)) {
            return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
          }
          await client.delete(`/deviceManagement/deviceCompliancePolicies/${v1Policy.id}`);
          return { task, success: true, skipped: false };

        case "DeviceConfiguration":
          // Delete from /deviceConfigurations
          const dcResponse = await client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
            `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(policyName)}'`
          );
          if (!dcResponse.value || dcResponse.value.length === 0) {
            return { task, success: true, skipped: true, error: "Policy not found in tenant" };
          }
          const dcPolicy = dcResponse.value[0];
          if (!hasHydrationMarker(dcPolicy.description)) {
            return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
          }
          await client.delete(`/deviceManagement/deviceConfigurations/${dcPolicy.id}`);
          return { task, success: true, skipped: false };

        case "SettingsCatalog":
        default:
          // Use pre-fetched cache for Settings Catalog policies
          let allPolicies = context.cachedSettingsCatalogPolicies || [];

          if (allPolicies.length === 0) {
            console.log(`[CIS Baseline Task] No cached Settings Catalog policies - fetching now...`);
            allPolicies = await client.getCollection<{ id: string; name: string; description?: string }>(
              `/deviceManagement/configurationPolicies?$select=id,name,description`
            );
            context.cachedSettingsCatalogPolicies = allPolicies;
          }

          // Find matching policy by name (case-insensitive)
          const policy = allPolicies.find(
            (p) => p.name?.toLowerCase() === policyName.toLowerCase()
          );
          if (!policy) {
            return { task, success: true, skipped: true, error: "Policy not found in tenant" };
          }

          console.log(`[CIS Baseline Task] Found Settings Catalog policy: "${policy.name}" (ID: ${policy.id})`);

          if (!hasHydrationMarker(policy.description)) {
            return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
          }

          // Check and clear assignments if present
          try {
            const assignmentsResponse = await client.get<{ value: Array<{ id: string }> }>(
              `/deviceManagement/configurationPolicies/${policy.id}/assignments`
            );
            if (assignmentsResponse.value?.length > 0) {
              console.log(`[CIS Baseline Task] Clearing ${assignmentsResponse.value.length} assignment(s)...`);
              await client.post(`/deviceManagement/configurationPolicies/${policy.id}/assign`, { assignments: [] });
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch {
            // Continue if assignments can't be checked/cleared
          }

          // Retry delete up to 5 times with delay (Intune backend can be flaky)
          let deleteAttempts = 0;
          const maxDeleteAttempts = 5;
          let lastDeleteError: Error | null = null;

          while (deleteAttempts < maxDeleteAttempts) {
            try {
              await client.delete(`/deviceManagement/configurationPolicies/${policy.id}`);
              console.log(`[CIS Baseline Task] Deleted settings catalog policy: "${policyName}"`);
              lastDeleteError = null;
              break;
            } catch (deleteError) {
              deleteAttempts++;
              lastDeleteError = deleteError instanceof Error ? deleteError : new Error(String(deleteError));
              console.warn(`[CIS Baseline Task] Delete attempt ${deleteAttempts}/${maxDeleteAttempts} failed for "${policyName}": ${lastDeleteError.message}`);

              if (deleteAttempts < maxDeleteAttempts) {
                // Wait longer between retries (2s, 4s)
                await new Promise(resolve => setTimeout(resolve, 2000 * deleteAttempts));
              }
            }
          }

          if (lastDeleteError) {
            // Provide more helpful error message for generic Intune errors
            let errorMsg = lastDeleteError.message;
            if (errorMsg.includes("An error has occurred")) {
              errorMsg = `Intune service error after ${maxDeleteAttempts} attempts. The policy may be in use or there's a temporary service issue. Try again later or delete manually in Intune.`;
            }
            return { task, success: false, skipped: false, error: errorMsg };
          }

          // Remove from cache
          if (context.cachedSettingsCatalogPolicies) {
            context.cachedSettingsCatalogPolicies = context.cachedSettingsCatalogPolicies.filter(
              (p) => p.id !== policy.id
            );
          }
          return { task, success: true, skipped: false };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: false, skipped: false, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a queue of tasks sequentially with delays
 */
export async function executeTasks(
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const TASK_DELAY_MS = 2000; // 2 second delay between tasks

  // Pre-fetch "Intune - " groups if any group tasks exist
  const hasGroupTasks = tasks.some((task) => task.category === "groups");
  if (hasGroupTasks && !context.cachedIntuneGroups) {
    console.log("[Execute Tasks] Pre-fetching all 'Intune - ' groups...");
    try {
      context.cachedIntuneGroups = await getIntuneGroups(context.client);
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedIntuneGroups.length} 'Intune - ' groups`);
    } catch (error) {
      console.error("[Execute Tasks] Failed to pre-fetch groups:", error);
      // Continue execution - individual tasks will handle errors
      context.cachedIntuneGroups = [];
    }
  }

  // Pre-fetch all filters if any filter tasks exist
  const hasFilterTasks = tasks.some((task) => task.category === "filters");
  if (hasFilterTasks && !context.cachedFilters) {
    console.log("[Execute Tasks] Pre-fetching all device filters...");
    try {
      context.cachedFilters = await getAllFilters(context.client);
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedFilters.length} device filters`);
    } catch (error) {
      console.error("[Execute Tasks] Failed to pre-fetch filters:", error);
      // Continue execution - individual tasks will handle errors
      context.cachedFilters = [];
    }
  }

  // Pre-fetch App Protection policies if any appProtection or baseline tasks exist
  // Baseline tasks can include AppProtection policies (e.g., Android/iOS BYOD)
  const hasAppProtectionTasks = tasks.some((task) => task.category === "appProtection");
  const hasBaselineTasks = tasks.some((task) => task.category === "baseline");
  if ((hasAppProtectionTasks || hasBaselineTasks) && !context.cachedAppProtectionPolicies) {
    console.log("[Execute Tasks] Pre-fetching all App Protection policies...");
    try {
      context.cachedAppProtectionPolicies = await getAllAppProtectionPolicies(context.client);
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedAppProtectionPolicies.length} App Protection policies`);
    } catch (error) {
      console.error("[Execute Tasks] Failed to pre-fetch App Protection policies:", error);
      // Continue execution - individual tasks will handle errors
      context.cachedAppProtectionPolicies = [];
    }
  }

  // Pre-fetch Settings Catalog policies for DELETE mode (baseline and CIS tasks)
  // This avoids calling getCollection for every single delete operation
  const hasCISTasks = tasks.some((task) => task.category === "cisBaseline");
  if (context.operationMode === "delete" && (hasBaselineTasks || hasCISTasks) && !context.cachedSettingsCatalogPolicies) {
    console.log("[Execute Tasks] Pre-fetching all Settings Catalog policies for delete operations...");
    try {
      context.cachedSettingsCatalogPolicies = await context.client.getCollection<{ id: string; name: string; description?: string }>(
        `/deviceManagement/configurationPolicies?$select=id,name,description`
      );
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedSettingsCatalogPolicies.length} Settings Catalog policies`);
    } catch (error) {
      console.error("[Execute Tasks] Failed to pre-fetch Settings Catalog policies:", error);
      context.cachedSettingsCatalogPolicies = [];
    }
  }

  // Pre-fetch Driver Update Profiles for DELETE mode
  if (context.operationMode === "delete" && hasBaselineTasks && !context.cachedDriverUpdateProfiles) {
    console.log("[Execute Tasks] Pre-fetching all Driver Update Profiles for delete operations...");
    try {
      const response = await context.client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
        `/deviceManagement/windowsDriverUpdateProfiles`
      );
      context.cachedDriverUpdateProfiles = response.value || [];
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedDriverUpdateProfiles.length} Driver Update Profiles`);
    } catch (error) {
      console.error("[Execute Tasks] Failed to pre-fetch Driver Update Profiles:", error);
      context.cachedDriverUpdateProfiles = [];
    }
  }

  for (const task of tasks) {
    // Check for cancellation before starting task
    if (context.shouldCancel?.()) {
      console.log("[Execute Tasks] Execution cancelled by user");
      // Mark remaining tasks as skipped
      for (let i = tasks.indexOf(task); i < tasks.length; i++) {
        tasks[i].status = "skipped";
        tasks[i].error = "Cancelled by user";
      }
      break;
    }

    // Handle pause
    while (context.shouldPause?.()) {
      console.log("[Execute Tasks] Execution paused, waiting...");
      await sleep(500);
    }

    const result = await executeTask(task, context);
    results.push(result);

    // Stop on first error if configured
    if (context.stopOnFirstError && !result.success && !result.skipped) {
      break;
    }

    // Add delay between tasks to avoid API throttling
    if (tasks.indexOf(task) < tasks.length - 1) {
      await sleep(TASK_DELAY_MS);
    }
  }

  return results;
}

/**
 * Build task queue from selected categories and templates
 * @deprecated Use buildTaskQueueAsync for real template loading
 */
export function buildTaskQueue(
  selectedCategories: TaskCategory[],
  operationMode: OperationMode
): HydrationTask[] {
  const tasks: HydrationTask[] = [];
  let taskId = 1;

  for (const category of selectedCategories) {
    let items: Array<{ displayName: string }> = [];

    switch (category) {
      case "groups":
        items = Templates.getDynamicGroups();
        break;
      case "filters":
        items = Templates.getDeviceFilters();
        break;
      case "baseline":
        // OpenIntuneBaseline policies will be fetched from GitHub at runtime
        // For now, create placeholder tasks based on the count
        items = Array.from({ length: 70 }, (_, i) => ({
          displayName: `Baseline Policy ${i + 1}`,
        }));
        break;
      case "cisBaseline":
        // CIS Intune Baselines - placeholder for sync version
        // Real data will be fetched in async version
        items = Array.from({ length: 720 }, (_, i) => ({
          displayName: `CIS Baseline Policy ${i + 1}`,
        }));
        break;
      case "compliance":
        items = Templates.getCompliancePolicies();
        break;
      case "conditionalAccess":
        items = Templates.getConditionalAccessPolicies();
        break;
      case "appProtection":
        items = Templates.getAppProtectionPolicies();
        break;
      case "enrollment":
        // Enrollment profiles not yet implemented in templates
        items = [];
        break;
      default:
        items = [];
    }

    for (const item of items) {
      tasks.push({
        id: `task-${taskId++}`,
        category,
        operation: operationMode,
        itemName: item.displayName,
        status: "pending",
      });
    }
  }

  return tasks;
}

/**
 * Options for building the task queue
 */
export interface BuildTaskQueueOptions {
  selectedCategories: TaskCategory[];
  operationMode: OperationMode;
  selectedCISCategories?: CISCategoryId[];
  baselineSelection?: BaselineSelection;
  categorySelections?: CategorySelections;
}

/**
 * Build task queue from selected categories (async version)
 * Fetches real templates from local IntuneTemplates directory
 */
export async function buildTaskQueueAsync(
  selectedCategories: TaskCategory[],
  operationMode: OperationMode,
  options?: {
    selectedCISCategories?: CISCategoryId[];
    baselineSelection?: BaselineSelection;
    categorySelections?: CategorySelections;
  }
): Promise<HydrationTask[]> {
  console.log(`[Task Queue] Building task queue for categories:`, selectedCategories);
  if (options?.selectedCISCategories) {
    console.log(`[Task Queue] Selected CIS categories:`, options.selectedCISCategories);
  }
  if (options?.baselineSelection?.selectedPolicies) {
    console.log(`[Task Queue] Selected baseline policies:`, options.baselineSelection.selectedPolicies.length);
  }
  if (options?.categorySelections) {
    console.log(`[Task Queue] Category selections provided for:`, Object.keys(options.categorySelections));
  }
  const tasks: HydrationTask[] = [];
  let taskId = 1;

  for (const category of selectedCategories) {
    console.log(`[Task Queue] Processing category: ${category}`);
    let items: Array<{ displayName: string }> = [];

    // CIS baselines use a special cache key that includes selected categories
    const cacheKey = category === "cisBaseline" && options?.selectedCISCategories
      ? `${category}-${options.selectedCISCategories.sort().join(",")}`
      : category;

    // Clear cache if categorySelections has selections for this category
    // This ensures we fetch fresh templates and don't use stale filtered cache
    const categorySelections = options?.categorySelections;
    const selectionKey = category as keyof CategorySelections;
    const selection = categorySelections?.[selectionKey];
    if (selection && 'selectedItems' in selection && selection.selectedItems && selection.selectedItems.length > 0) {
      console.log(`[Task Queue] Clearing cache for ${cacheKey} - specific items selected`);
      clearCategoryCache(cacheKey);
    }

    // Try to get from cache first
    const cached = getCachedTemplates(cacheKey);
    if (cached && Array.isArray(cached)) {
      console.log(`[Task Queue] ✓ Using ${cached.length} cached templates for ${cacheKey}`);
      items = cached as Array<{ displayName: string }>;
    } else {
      console.log(`[Task Queue] Cache miss for ${cacheKey}, fetching fresh templates...`);
      // Fetch fresh templates
      switch (category) {
        case "groups":
          {
            console.log(`[Task Queue] Fetching dynamic and static groups...`);
            const dynamicGroups = await fetchDynamicGroups();
            const staticGroups = await fetchStaticGroups();
            let allGroups = [...dynamicGroups, ...staticGroups];

            // Filter by selected items if categorySelections is provided
            const groupSelection = options?.categorySelections?.groups;
            if (groupSelection?.selectedItems && groupSelection.selectedItems.length > 0) {
              const selectedSet = new Set(groupSelection.selectedItems);
              allGroups = allGroups.filter(g => selectedSet.has(g.displayName));
              console.log(`[Task Queue] Filtered to ${allGroups.length} selected groups`);
            }

            items = allGroups;
            console.log(`[Task Queue] ✓ Using ${items.length} groups`);
            cacheTemplates(category, items);
          }
          break;
        case "filters":
          {
            console.log(`[Task Queue] Fetching device filters...`);
            let filters = await fetchFilters();

            // Filter by selected items if categorySelections is provided
            const filterSelection = options?.categorySelections?.filters;
            if (filterSelection?.selectedItems && filterSelection.selectedItems.length > 0) {
              const selectedSet = new Set(filterSelection.selectedItems);
              filters = filters.filter(f => selectedSet.has(f.displayName));
              console.log(`[Task Queue] Filtered to ${filters.length} selected filters`);
            }

            items = filters;
            console.log(`[Task Queue] ✓ Using ${items.length} filters`);
            cacheTemplates(category, items);
          }
          break;
        case "compliance":
          {
            let policies = await fetchCompliancePolicies();

            // Filter by selected items if categorySelections is provided
            const complianceSelection = options?.categorySelections?.compliance;
            if (complianceSelection?.selectedItems && complianceSelection.selectedItems.length > 0) {
              const selectedSet = new Set(complianceSelection.selectedItems);
              policies = policies.filter(p => selectedSet.has(p.displayName));
              console.log(`[Task Queue] Filtered to ${policies.length} selected compliance policies`);
            }

            items = policies;
            cacheTemplates(category, items);
          }
          break;
        case "conditionalAccess":
          {
            let policies = await fetchConditionalAccessPolicies();

            // Filter by selected items if categorySelections is provided
            const caSelection = options?.categorySelections?.conditionalAccess;
            if (caSelection?.selectedItems && caSelection.selectedItems.length > 0) {
              const selectedSet = new Set(caSelection.selectedItems);
              policies = policies.filter(p => selectedSet.has(p.displayName));
              console.log(`[Task Queue] Filtered to ${policies.length} selected CA policies`);
            }

            items = policies;
            cacheTemplates(category, items);
          }
          break;
        case "appProtection":
          {
            let policies = await fetchAppProtectionPolicies();

            // Filter by selected items if categorySelections is provided
            const appSelection = options?.categorySelections?.appProtection;
            if (appSelection?.selectedItems && appSelection.selectedItems.length > 0) {
              const selectedSet = new Set(appSelection.selectedItems);
              policies = policies.filter(p => selectedSet.has(p.displayName));
              console.log(`[Task Queue] Filtered to ${policies.length} selected app protection policies`);
            }

            items = policies;
            cacheTemplates(category, items);
          }
          break;
        case "enrollment":
          {
            let profiles = await fetchEnrollmentProfiles() as Array<{ displayName?: string }>;

            // Filter by selected items if categorySelections is provided
            const enrollmentSelection = options?.categorySelections?.enrollment;
            if (enrollmentSelection?.selectedItems && enrollmentSelection.selectedItems.length > 0) {
              const selectedSet = new Set(enrollmentSelection.selectedItems);
              profiles = profiles.filter(p => selectedSet.has(p.displayName || ""));
              console.log(`[Task Queue] Filtered to ${profiles.length} selected enrollment profiles`);
            }

            items = profiles as Array<{ displayName: string }>;
            cacheTemplates(category, items);
          }
          break;
        case "baseline":
          {
            console.log(`[Task Queue] Fetching OpenIntuneBaseline policies...`);
            let baselinePolicies = await fetchBaselinePolicies();

            // Filter by selected policies if baselineSelection is provided
            if (options?.baselineSelection?.selectedPolicies && options.baselineSelection.selectedPolicies.length > 0) {
              const selectedPaths = new Set(options.baselineSelection.selectedPolicies);
              baselinePolicies = baselinePolicies.filter(p => selectedPaths.has(p._oibFilePath));
              console.log(`[Task Queue] Filtered to ${baselinePolicies.length} selected baseline policies`);
            }

            items = baselinePolicies as Array<{ displayName: string }>;
            console.log(`[Task Queue] ✓ Using ${items.length} OpenIntuneBaseline policies`);
            cacheTemplates(category, baselinePolicies); // Cache the filtered policies
          }
          break;
        case "cisBaseline":
          {
            console.log(`[Task Queue] Fetching CIS Intune Baselines...`);
            let cisItems: CISBaselinePolicy[];

            // Use filtered fetch if specific categories are selected (legacy approach)
            if (options?.selectedCISCategories && options.selectedCISCategories.length > 0) {
              console.log(`[Task Queue] Fetching CIS baselines for selected categories:`, options.selectedCISCategories);
              cisItems = await fetchCISBaselinePoliciesByCategories(options.selectedCISCategories);
            } else {
              // Fetch all if no specific categories selected
              cisItems = await fetchCISBaselinePolicies();
            }

            // Filter by selected policy paths if categorySelections is provided (new approach)
            const cisSelection = options?.categorySelections?.cisBaseline;
            if (cisSelection?.selectedItems && cisSelection.selectedItems.length > 0) {
              const selectedPaths = new Set(cisSelection.selectedItems);
              cisItems = cisItems.filter(p => selectedPaths.has(p._cisFilePath));
              console.log(`[Task Queue] Filtered to ${cisItems.length} selected CIS policies`);
            }

            items = cisItems as Array<{ displayName: string }>;
            console.log(`[Task Queue] ✓ Using ${items.length} CIS baseline policies`);
            cacheTemplates(cacheKey, cisItems); // Cache the filtered policies
          }
          break;
        default:
          items = [];
      }
    }

    // For delete/preview mode with specific selections, use selectedItems directly
    // This ensures all selected items appear in the task queue, even if they don't exist in templates
    // During execution, items that don't exist in the tenant will be marked as "skipped"

    // Check if we have direct selections for this category
    const hasDirectSelections = selection && 'selectedItems' in selection && selection.selectedItems && selection.selectedItems.length > 0;

    // Special handling for baseline which uses baselineSelection instead of categorySelections
    const hasBaselineSelections = category === "baseline" && options?.baselineSelection?.selectedPolicies && options.baselineSelection.selectedPolicies.length > 0;

    if ((operationMode === "delete" || operationMode === "preview") && hasDirectSelections) {
      console.log(`[Task Queue] Using ${selection!.selectedItems!.length} selected items directly for ${category} (${operationMode} mode)`);
      for (const itemName of selection!.selectedItems!) {
        tasks.push({
          id: `task-${taskId++}`,
          category,
          operation: operationMode,
          itemName,
          status: "pending",
        });
      }
    } else if ((operationMode === "delete" || operationMode === "preview") && hasBaselineSelections) {
      // For baseline in delete/preview mode, create tasks from the filtered items array
      // The items array was already filtered by selectedPolicies paths in the switch case above
      console.log(`[Task Queue] Using ${items.length} baseline items for ${category} (${operationMode} mode)`);
      for (const item of items) {
        const itemRecord = item as Record<string, unknown>;
        const itemName = item.displayName || (itemRecord.name as string) || 'Unknown Policy';
        tasks.push({
          id: `task-${taskId++}`,
          category,
          operation: operationMode,
          itemName,
          status: "pending",
        });
      }
    } else {
      console.log(`[Task Queue] Creating ${items.length} tasks for ${category}:`,
        items.slice(0, 5).map(i => i.displayName || (i as Record<string, unknown>).name || 'Unknown').concat(items.length > 5 ? ['...'] : [])
      );

      for (const item of items) {
        // Get displayName with fallbacks for CIS policies that might have 'name' instead
        const itemRecord = item as Record<string, unknown>;
        const itemName = item.displayName || (itemRecord.name as string) || (itemRecord._cisFilePath as string) || 'Unknown Policy';

        tasks.push({
          id: `task-${taskId++}`,
          category,
          operation: operationMode,
          itemName,
          status: "pending",
        });
      }
    }
  }

  console.log(`[Task Queue] ✓ Task queue built successfully with ${tasks.length} total tasks`);
  return tasks;
}

/**
 * Get estimated task count for selected categories
 * Takes into account individual item selections if provided
 */
export function getEstimatedTaskCount(
  selectedCategories: TaskCategory[],
  categorySelections?: CategorySelections
): number {
  let count = 0;

  for (const category of selectedCategories) {
    count += getEstimatedCategoryCount(category, categorySelections);
  }

  return count;
}

/**
 * Get estimated count for a single category
 * Returns selection count if items are selected, otherwise returns metadata count
 */
export function getEstimatedCategoryCount(
  category: TaskCategory,
  categorySelections?: CategorySelections
): number {
  // Check if we have individual item selections for this category
  if (categorySelections) {
    const selectionKey = category as keyof CategorySelections;
    const selection = categorySelections[selectionKey];

    if (selection) {
      // For baseline, use selectedPolicies
      if (selectionKey === 'baseline' && 'selectedPolicies' in selection) {
        return selection.selectedPolicies.length;
      }
      // For other categories, use selectedItems
      if ('selectedItems' in selection && selection.selectedItems.length > 0) {
        return selection.selectedItems.length;
      }
    }
  }

  // Fall back to metadata count if no selections
  const metadata = Templates.TEMPLATE_METADATA[category as keyof typeof Templates.TEMPLATE_METADATA];
  return metadata?.count || 0;
}
