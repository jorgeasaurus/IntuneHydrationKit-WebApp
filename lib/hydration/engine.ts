/**
 * Hydration Execution Engine
 * Manages task queue and executes operations against Microsoft Graph API
 */

import { GraphClient } from "@/lib/graph/client";
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
  appProtectionPolicyExists,
  getAppProtectionPolicyByName,
  deleteAppProtectionPolicy,
  getAllAppProtectionPolicies,
} from "@/lib/graph/appProtection";
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
  console.log(`[Execute Task] Starting task: ${task.category} - "${task.itemName}" (mode: ${context.operationMode})`);
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
    // Driver update profiles have names like "Win - OIB - WUfB Drivers - ..."
    const isDriverUpdateProfile = task.itemName.toLowerCase().includes("wufb drivers") ||
      task.itemName.toLowerCase().includes("driver update");

    if (isDriverUpdateProfile && context.hasWindowsDriverUpdateLicense === false) {
      console.log(`[Execute Task] Skipping driver update profile (no Windows E3/E5 license): "${task.itemName}"`);
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

    console.log(`[Execute Task] Routing to handler for category: ${task.category}`);
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
    task.endTime = new Date();

    console.log(`[Execute Task] Task completed:`, {
      itemName: task.itemName,
      status: task.status,
      success: result.success,
      skipped: result.skipped,
      error: result.error
    });

    if (result.success || result.skipped) {
      context.onTaskComplete?.(task);
    } else if (result.error) {
      context.onTaskError?.(task, new Error(result.error));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Execute Task] ✗ Exception caught for "${task.itemName}":`, errorMessage);
    console.error(`[Execute Task] Stack trace:`, error);
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
  console.log(`[Group Task] Looking up template for: "${task.itemName}"`);
  let template: GroupTemplate | DeviceGroup | undefined;
  const cachedGroups = getCachedTemplates("groups");

  if (cachedGroups && Array.isArray(cachedGroups)) {
    console.log(`[Group Task] Found ${cachedGroups.length} cached group templates`);
    template = (cachedGroups as GroupTemplate[]).find((g) => g.displayName === task.itemName);
    if (template) {
      console.log(`[Group Task] ✓ Found template in cache: "${template.displayName}"`);
    } else {
      console.log(`[Group Task] Template "${task.itemName}" not found in cache`);
    }
  } else {
    console.log("[Group Task] No cached templates found");
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    console.log("[Group Task] Trying hardcoded templates...");
    template = Templates.getDynamicGroupByName(task.itemName);
    if (template) {
      console.log(`[Group Task] ✓ Found template in hardcoded templates: "${template.displayName}"`);
    }
  }

  if (!template) {
    console.error(`[Group Task] ✗ Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if group already exists using pre-fetched cache
    console.log(`[Group Task] Checking if group exists: "${template.displayName}"`);
    const existingGroup = context.cachedIntuneGroups?.find(
      (g) => g.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingGroup) {
      console.log(`[Group Task] Group already exists, skipping: "${template.displayName}"`);
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
      console.log(`[Group Task] Converting simple template to full DeviceGroup format`);
      const simpleTemplate = template as GroupTemplate;
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
      console.log(`[Group Task] Template converted:`, {
        displayName: fullGroupTemplate.displayName,
        mailNickname: fullGroupTemplate.mailNickname,
        hasMembershipRule: !!fullGroupTemplate.membershipRule,
      });
    } else {
      console.log(`[Group Task] Using full template directly (has @odata.type)`);
    }

    // Create the group
    console.log(`[Group Task] Creating group: "${fullGroupTemplate.displayName}"`);
    const created = await createGroup(client, fullGroupTemplate);
    console.log(`[Group Task] ✓ Group created successfully with ID: ${created.id}`);

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
  const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  console.log(`[Filter Task] Looking up template for: "${task.itemName}"`);
  let template: FilterTemplate | DeviceFilter | undefined;
  const cachedFilterTemplates = getCachedTemplates("filters");

  if (cachedFilterTemplates && Array.isArray(cachedFilterTemplates)) {
    console.log(`[Filter Task] Found ${cachedFilterTemplates.length} cached filter templates`);
    template = (cachedFilterTemplates as FilterTemplate[]).find((f) => f.displayName === task.itemName);
    if (template) {
      console.log(`[Filter Task] ✓ Found template in cache: "${template.displayName}"`);
    } else {
      console.log(`[Filter Task] Template "${task.itemName}" not found in cache`);
    }
  } else {
    console.log("[Filter Task] No cached templates found");
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    console.log("[Filter Task] Trying hardcoded templates...");
    template = Templates.getDeviceFilterByName(task.itemName);
    if (template) {
      console.log(`[Filter Task] ✓ Found template in hardcoded templates: "${template.displayName}"`);
    }
  }

  if (!template) {
    console.error(`[Filter Task] ✗ Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if filter already exists using pre-fetched cache
    console.log(`[Filter Task] Checking if filter exists: "${template.displayName}"`);
    const existingFilter = context.cachedFilters?.find(
      (f) => f.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingFilter) {
      console.log(`[Filter Task] Filter already exists, skipping: "${template.displayName}"`);
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
      console.log(`[Filter Task] Converting simple template to full DeviceFilter format`);
      const simpleTemplate = template as FilterTemplate;
      fullFilterTemplate = {
        "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
        displayName: simpleTemplate.displayName,
        description: simpleTemplate.description,
        platform: simpleTemplate.platform as "android" | "iOS" | "macOS" | "windows10AndLater",
        rule: simpleTemplate.rule,
      };
      console.log(`[Filter Task] Template converted:`, {
        displayName: fullFilterTemplate.displayName,
        platform: fullFilterTemplate.platform,
        hasRule: !!fullFilterTemplate.rule,
      });
    } else {
      console.log(`[Filter Task] Using full template directly (has @odata.type)`);
    }

    // Create the filter
    console.log(`[Filter Task] Creating filter: "${fullFilterTemplate.displayName}"`);
    const created = await createFilter(client, fullFilterTemplate);
    console.log(`[Filter Task] ✓ Filter created successfully with ID: ${created.id}`);

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
      console.log(`[Filter Task] Filter not found in tenant, skipping: "${template.displayName}"`);
      return { task, success: true, skipped: true, error: "Filter not found in tenant" };
    }

    // Check if it was created by the hydration kit
    if (!existingFilter.description?.includes(HYDRATION_MARKER)) {
      console.log(`[Filter Task] Filter not created by Hydration Kit, skipping: "${template.displayName}"`);
      return { task, success: true, skipped: true, error: "Filter not created by Intune Hydration Kit" };
    }

    // Delete the filter directly using its ID
    console.log(`[Filter Task] Deleting filter: "${template.displayName}" (ID: ${existingFilter.id})`);
    await client.delete(`/deviceManagement/assignmentFilters/${existingFilter.id}`);
    console.log(`[Filter Task] ✓ Filter deleted successfully`);

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

    // Log the policy object to debug platform detection
    console.log(`[App Protection Delete] Policy object for "${template.displayName}":`, {
      id: policy.id,
      displayName: policy.displayName,
      odataType: policy["@odata.type"],
      allKeys: Object.keys(policy)
    });

    // Determine platform from @odata.type
    const odataType = policy["@odata.type"];
    let platform: "iOS" | "android";

    if (odataType === "#microsoft.graph.iosManagedAppProtection") {
      platform = "iOS";
    } else if (odataType === "#microsoft.graph.androidManagedAppProtection") {
      platform = "android";
    } else {
      // Fallback: check template's @odata.type if policy doesn't have it
      console.warn(`[App Protection Delete] Policy missing or invalid @odata.type: ${odataType}`);
      const templateOdataType = template["@odata.type"];
      console.log(`[App Protection Delete] Using template @odata.type: ${templateOdataType}`);

      if (templateOdataType === "#microsoft.graph.iosManagedAppProtection") {
        platform = "iOS";
      } else if (templateOdataType === "#microsoft.graph.androidManagedAppProtection") {
        platform = "android";
      } else {
        throw new Error(`Unable to determine platform for policy "${template.displayName}". @odata.type: ${odataType}, template @odata.type: ${templateOdataType}`);
      }
    }

    console.log(`[App Protection Delete] Detected platform: ${platform}`);

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
 * Clean a Settings Catalog policy for creation
 * Removes metadata fields that shouldn't be sent when creating
 */
function cleanSettingsCatalogPolicy(policy: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  // Fields to exclude when creating
  const excludeFields = [
    "@odata.context",
    "@odata.id",
    "@odata.editLink",
    "id",
    "createdDateTime",
    "lastModifiedDateTime",
    "createdDateTime@odata.type",
    "lastModifiedDateTime@odata.type",
    "#microsoft.graph.assign",
    "#microsoft.graph.clearEnrollmentTimeDeviceMembershipTarget",
    "#microsoft.graph.createCopy",
    "#microsoft.graph.reorder",
    "#microsoft.graph.retrieveEnrollmentTimeDeviceMembershipTarget",
    "#microsoft.graph.setEnrollmentTimeDeviceMembershipTarget",
    "#microsoft.graph.retrieveLatestUpgradeDefaultBaselinePolicy",
    "assignments@odata.context",
    "assignments@odata.associationLink",
    "assignments@odata.navigationLink",
    "settings@odata.context",
    "settings@odata.associationLink",
    "settings@odata.navigationLink",
    // Our internal metadata fields
    "_oibPlatform",
    "_oibPolicyType",
    "_oibFilePath",
    "_cisCategory",
    "_cisSubcategory",
    "_cisFilePath",
  ];

  for (const [key, value] of Object.entries(policy)) {
    if (!excludeFields.includes(key)) {
      // Clean nested settings array
      if (key === "settings" && Array.isArray(value)) {
        cleaned[key] = value.map((setting: Record<string, unknown>) => {
          const cleanedSetting: Record<string, unknown> = {};
          for (const [sk, sv] of Object.entries(setting)) {
            // Exclude metadata from settings too
            if (!sk.startsWith("@odata.") && !sk.includes("@odata.")) {
              cleanedSetting[sk] = sv;
            }
          }
          return cleanedSetting;
        });
      } else {
        cleaned[key] = value;
      }
    }
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
 */
async function createSettingsCatalogPolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy before sending
  const cleanedPolicy = cleanSettingsCatalogPolicy(policy);

  // Use 'name' field for Settings Catalog (not 'displayName')
  if (cleanedPolicy.displayName && !cleanedPolicy.name) {
    cleanedPolicy.name = cleanedPolicy.displayName;
    delete cleanedPolicy.displayName;
  }

  console.log(`[Settings Catalog] Creating policy: "${cleanedPolicy.name}"`);
  console.log(`[Settings Catalog] Policy payload keys:`, Object.keys(cleanedPolicy));

  const result = await client.post<{ id: string }>(
    "/deviceManagement/configurationPolicies",
    cleanedPolicy
  );

  console.log(`[Settings Catalog] ✓ Policy created with ID: ${result.id}`);
  return result;
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
 * Create a baseline compliance policy
 */
async function createBaselineCompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy - remove metadata but keep @odata.type
  const cleaned: Record<string, unknown> = {};
  const excludeFields = [
    "@odata.context", "@odata.id", "@odata.editLink", "id",
    "createdDateTime", "lastModifiedDateTime", "version",
    "_oibPlatform", "_oibPolicyType", "_oibFilePath",
  ];

  for (const [key, value] of Object.entries(policy)) {
    if (!excludeFields.includes(key) && !key.includes("@odata.") || key === "@odata.type") {
      cleaned[key] = value;
    }
  }

  console.log(`[Baseline Compliance] Creating policy: "${cleaned.displayName}"`);

  const result = await client.post<{ id: string }>(
    "/deviceManagement/deviceCompliancePolicies",
    cleaned
  );

  console.log(`[Baseline Compliance] ✓ Policy created with ID: ${result.id}`);
  return result;
}

/**
 * Create a CIS Baseline compliance policy
 * Cleans the policy payload to remove metadata that Graph API rejects
 */
async function createCISCompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy - remove metadata but keep @odata.type and essential fields
  const cleaned: Record<string, unknown> = {};
  const excludePatterns = [
    "@odata.context", "@odata.id", "@odata.editLink", "id",
    "createdDateTime", "lastModifiedDateTime", "version",
    "_cisCategory", "_cisSubcategory", "_cisFilePath",
    "assignments", "scheduledActionsForRule@odata",
    "deviceSettingStateSummaries@odata", "deviceStatuses@odata",
    "deviceStatusOverview@odata", "userStatuses@odata", "userStatusOverview@odata",
    "#microsoft.graph.scheduleActionsForRules",
  ];

  for (const [key, value] of Object.entries(policy)) {
    // Skip fields that match exclusion patterns
    const shouldExclude = excludePatterns.some(pattern => key.includes(pattern));
    if (shouldExclude) continue;

    // Keep @odata.type
    if (key === "@odata.type") {
      cleaned[key] = value;
      continue;
    }

    // Skip any other @odata fields except @odata.type
    if (key.includes("@odata.")) continue;

    // Include the field
    cleaned[key] = value;
  }

  // Ensure displayName is set
  if (!cleaned.displayName && cleaned.name) {
    cleaned.displayName = cleaned.name;
  }

  console.log(`[CIS Compliance] Creating policy: "${cleaned.displayName}"`);
  console.log(`[CIS Compliance] Policy payload keys:`, Object.keys(cleaned));

  const result = await client.post<{ id: string }>(
    "/deviceManagement/deviceCompliancePolicies",
    cleaned
  );

  console.log(`[CIS Compliance] ✓ Policy created with ID: ${result.id}`);
  return result;
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
  const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

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

      } else {
        // SettingsCatalog or unknown - use configurationPolicies endpoint
        const exists = await settingsCatalogPolicyExists(client, policyName);
        if (exists) {
          console.log(`[Baseline Task] Settings Catalog policy already exists, skipping: "${policyName}"`);
          return { task, success: false, skipped: true, error: "Policy already exists" };
        }
        const created = await createSettingsCatalogPolicy(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Baseline Task] Failed to create policy: "${policyName}"`, error);
      return { task, success: false, skipped: false, error: errorMessage };
    }

  } else if (mode === "delete") {
    try {
      if (policyType === "CompliancePolicies") {
        // Find and delete compliance policy
        const response = await client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
          `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(policyName)}'`
        );
        if (!response.value || response.value.length === 0) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }
        const policy = response.value[0];
        if (!policy.description?.includes(HYDRATION_MARKER)) {
          return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
        }
        await client.delete(`/deviceManagement/deviceCompliancePolicies/${policy.id}`);
        return { task, success: true, skipped: false };

      } else if (policyType === "AppProtection") {
        // Find and delete app protection policy
        const policy = context.cachedAppProtectionPolicies?.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (!policy || !policy.id) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }
        const odataType = policy["@odata.type"];
        const platform = odataType === "#microsoft.graph.iosManagedAppProtection" ? "iOS" : "android";
        await deleteAppProtectionPolicy(client, policy.id, platform);
        return { task, success: true, skipped: false };

      } else {
        // Settings Catalog - delete from configurationPolicies
        const response = await client.get<{ value: Array<{ id: string; name: string; description?: string }> }>(
          `/deviceManagement/configurationPolicies?$filter=name eq '${encodeURIComponent(policyName)}'`
        );
        if (!response.value || response.value.length === 0) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }
        const policy = response.value[0];
        if (!policy.description?.includes(HYDRATION_MARKER)) {
          return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
        }
        await client.delete(`/deviceManagement/configurationPolicies/${policy.id}`);
        return { task, success: true, skipped: false };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a CIS Baseline task (create or delete)
 * CIS Baselines are also Settings Catalog policies
 */
async function executeCISBaselineTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;
  const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Get template from cache - need to find the right cache key
  let template: CISBaselinePolicy | undefined;

  // Try to find in any CIS baseline cache
  const cacheKeys = Object.keys(sessionStorage).filter(k => k.startsWith("intune-hydration-templates-cisBaseline"));
  for (const key of cacheKeys) {
    const cacheKey = key.replace("intune-hydration-templates-", "");
    const cached = getCachedTemplates(cacheKey);
    if (cached && Array.isArray(cached)) {
      template = (cached as CISBaselinePolicy[]).find(
        (b) => b.displayName === task.itemName || (b as Record<string, unknown>).name === task.itemName
      );
      if (template) break;
    }
  }

  if (!template) {
    console.error(`[CIS Baseline Task] Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  // Determine policy type from @odata.type
  const odataType = template["@odata.type"] as string || "";
  const isCompliancePolicy = odataType.toLowerCase().includes("compliancepolicy");
  const policyName = template.displayName || (template as Record<string, unknown>).name as string || task.itemName;

  console.log(`[CIS Baseline Task] Processing "${policyName}" (@odata.type: ${odataType}, isCompliance: ${isCompliancePolicy})`);

  if (mode === "create") {
    try {
      if (isCompliancePolicy) {
        // Compliance policies go to deviceCompliancePolicies endpoint
        const exists = await compliancePolicyExistsByName(client, policyName);
        if (exists) {
          console.log(`[CIS Baseline Task] Compliance policy already exists, skipping: "${policyName}"`);
          return { task, success: false, skipped: true, error: "Policy already exists" };
        }
        const created = await createCISCompliancePolicy(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id };
      } else {
        // Settings Catalog policies
        const exists = await settingsCatalogPolicyExists(client, policyName);
        if (exists) {
          console.log(`[CIS Baseline Task] Settings Catalog policy already exists, skipping: "${policyName}"`);
          return { task, success: false, skipped: true, error: "Policy already exists" };
        }
        const created = await createSettingsCatalogPolicy(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CIS Baseline Task] Failed to create policy: "${policyName}"`, error);
      return { task, success: false, skipped: false, error: errorMessage };
    }
  } else if (mode === "delete") {
    try {
      if (isCompliancePolicy) {
        // Find and delete compliance policy
        const response = await client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
          `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(policyName)}'`
        );
        if (!response.value || response.value.length === 0) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }
        const policy = response.value[0];
        if (!policy.description?.includes(HYDRATION_MARKER)) {
          return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
        }
        await client.delete(`/deviceManagement/deviceCompliancePolicies/${policy.id}`);
        return { task, success: true, skipped: false };
      } else {
        // Find and delete Settings Catalog policy
        const response = await client.get<{ value: Array<{ id: string; name: string; description?: string }> }>(
          `/deviceManagement/configurationPolicies?$filter=name eq '${encodeURIComponent(policyName)}'`
        );
        if (!response.value || response.value.length === 0) {
          return { task, success: true, skipped: true, error: "Policy not found in tenant" };
        }
        const policy = response.value[0];
        if (!policy.description?.includes(HYDRATION_MARKER)) {
          return { task, success: true, skipped: true, error: "Policy not created by Intune Hydration Kit" };
        }
        await client.delete(`/deviceManagement/configurationPolicies/${policy.id}`);
        return { task, success: true, skipped: false };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
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

  // Pre-fetch App Protection policies if any appProtection tasks exist
  const hasAppProtectionTasks = tasks.some((task) => task.category === "appProtection");
  if (hasAppProtectionTasks && !context.cachedAppProtectionPolicies) {
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
        items = Array.from({ length: 728 }, (_, i) => ({
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
