/**
 * Batch Executor for Hydration Tasks
 * Executes CREATE operations using Microsoft Graph $batch endpoint
 */

import {
  BatchRequest,
  BatchResponse,
  chunkArray,
  extractBatchError,
  isBatchResponseSuccess,
  isBatchResponseConflict,
  isBatchResponseRetryable,
  getRetryAfterFromBatchResponse,
} from "@/lib/graph/batch";
import type { ApiVersion } from "@/lib/graph/batch";
import { getBatchConfig } from "@/lib/config/batchConfig";
import { HydrationTask, BatchProgress } from "@/types/hydration";
import { ExecutionContext, ExecutionResult, CISPolicyType, ActivityMessage } from "./types";
import { detectCISPolicyType } from "./policyDetection";
import { cleanSettingsCatalogPolicy, cleanPolicyRecursively } from "./cleaners";
import { sleep, hasODataUnsafeChars } from "./utils";
import { addHydrationMarker, hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import {
  settingsCatalogPolicyExists,
  v2CompliancePolicyExists,
  deviceConfigurationExists,
} from "./policyCreators";
import {
  getCachedTemplates,
  getAllTemplateCacheKeys,
  GroupTemplate,
  FilterTemplate,
  ConditionalAccessTemplate,
  CISBaselinePolicy,
  BaselinePolicy,
} from "@/lib/templates/loader";
import * as Templates from "@/templates";
import { DeviceGroup, DeviceFilter } from "@/types/graph";

/**
 * Helper to emit status updates to UI
 */
function emitStatus(
  context: ExecutionContext,
  message: string,
  type: ActivityMessage["type"] = "info",
  category?: string
) {
  context.onStatusUpdate?.({
    id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date(),
    message,
    type,
    category,
  });
}

/**
 * Task prepared for batch execution
 */
interface PreparedBatchTask {
  task: HydrationTask;
  request: BatchRequest;
  apiVersion: ApiVersion;
}

/**
 * Result of preparing a task for batch execution
 */
type BatchPrepareResult =
  | { type: "batch"; data: PreparedBatchTask }
  | { type: "skip"; reason: string }
  | { type: "sequential" };

/**
 * Endpoint mapping for each task category
 */
const CATEGORY_ENDPOINTS: Record<string, string> = {
  groups: "/groups",
  filters: "/deviceManagement/assignmentFilters",
  compliance: "/deviceManagement/deviceCompliancePolicies",
  conditionalAccess: "/identity/conditionalAccess/policies",
  appProtection_ios: "/deviceAppManagement/iosManagedAppProtections",
  appProtection_android: "/deviceAppManagement/androidManagedAppProtections",
  enrollment_autopilot: "/deviceManagement/windowsAutopilotDeploymentProfiles",
  enrollment_esp: "/deviceManagement/deviceEnrollmentConfigurations",
  settingsCatalog: "/deviceManagement/configurationPolicies",
  deviceConfiguration: "/deviceManagement/deviceConfigurations",
  driverUpdate: "/deviceManagement/windowsDriverUpdateProfiles",
  v2Compliance: "/deviceManagement/compliancePolicies",
};


/**
 * Verify if a compliance policy was created after a 504 timeout
 * Returns the created policy ID if found, null otherwise
 * Includes a delay before checking to allow async creation to complete
 * and retries verification if not found initially
 */
async function verifyCompliancePolicyCreated(
  policyName: string,
  context: ExecutionContext
): Promise<string | null> {
  const VERIFICATION_TIMEOUT = 10000; // 10 second timeout per attempt
  const INITIAL_DELAY = 3000; // Wait 3 seconds before first check
  const RETRY_DELAY = 2000; // Wait 2 seconds between retries
  const MAX_RETRIES = 2; // Try up to 3 times total

  try {
    console.log(`[BatchExecutor] Verifying compliance policy creation for "${policyName}" after 504 timeout...`);

    // Wait before first verification to allow async creation to complete
    console.log(`[BatchExecutor] Waiting ${INITIAL_DELAY}ms before verification...`);
    await sleep(INITIAL_DELAY);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log(`[BatchExecutor] Retry ${attempt}/${MAX_RETRIES} for "${policyName}"...`);
        await sleep(RETRY_DELAY);
      }

      // Create a timeout promise
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error("Verification timeout")), VERIFICATION_TIMEOUT);
      });

      // Fetch fresh compliance policies from Graph API with timeout
      const fetchPromise = context.client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
        "/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description"
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (response?.value) {
        const foundPolicy = response.value.find(
          (p) => p.displayName?.toLowerCase() === policyName.toLowerCase()
        );

        if (foundPolicy) {
          console.log(`[BatchExecutor] Compliance policy "${policyName}" was created successfully (ID: ${foundPolicy.id}) despite 504 timeout`);

          // Update the cache with the newly created policy
          if (context.cachedCompliancePolicies) {
            context.cachedCompliancePolicies.push({
              id: foundPolicy.id,
              displayName: foundPolicy.displayName,
              description: foundPolicy.description,
            });
          }

          return foundPolicy.id;
        }
      }
    }

    console.log(`[BatchExecutor] Compliance policy "${policyName}" not found after ${MAX_RETRIES + 1} verification attempts - creation actually failed`);
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[BatchExecutor] Error verifying compliance policy creation for "${policyName}":`, errorMessage);
    return null;
  }
}

/**
 * Build result type for request body builders
 */
type BuildBodyResult =
  | { type: "body"; body: Record<string, unknown> }
  | { type: "skip"; reason: string }
  | { type: "error"; reason: string };

/**
 * Build request body for a group task
 */
function buildGroupRequestBody(task: HydrationTask, context: ExecutionContext): BuildBodyResult {
  let template: GroupTemplate | DeviceGroup | undefined;
  const cachedGroups = getCachedTemplates("groups");

  console.log(`[BatchExecutor:groups] Building body for "${task.itemName}"`);
  console.log(`[BatchExecutor:groups] Cached groups available: ${cachedGroups ? (cachedGroups as unknown[]).length : 0}`);

  if (cachedGroups && Array.isArray(cachedGroups)) {
    template = (cachedGroups as GroupTemplate[]).find((g) => g.displayName === task.itemName);
    if (template) {
      console.log(`[BatchExecutor:groups] Found template in cache for "${task.itemName}"`);
    }
  }

  if (!template) {
    template = Templates.getDynamicGroupByName(task.itemName);
    if (template) {
      console.log(`[BatchExecutor:groups] Found template in Templates module for "${task.itemName}"`);
    }
  }

  if (!template) {
    console.log(`[BatchExecutor:groups] ✗ No template found for "${task.itemName}"`);
    return { type: "error", reason: "Template not found" };
  }

  // Check if already exists in cache — match with or without [IHD] prefix
  console.log(`[BatchExecutor:groups] Checking existence in ${context.cachedIntuneGroups?.length || 0} cached groups`);
  const templateName = template!.displayName.toLowerCase();
  const templateNameStripped = templateName.startsWith("[ihd] ") ? templateName.slice(6) : templateName;
  const existingGroup = context.cachedIntuneGroups?.find((g) => {
    const cachedName = g.displayName.toLowerCase();
    const cachedNameStripped = cachedName.startsWith("[ihd] ") ? cachedName.slice(6) : cachedName;
    return cachedName === templateName || cachedNameStripped === templateNameStripped;
  });
  if (existingGroup) {
    console.log(`[BatchExecutor:groups] ✗ Group already exists: "${task.itemName}"`);
    return { type: "skip", reason: "Group already exists" };
  }

  console.log(`[BatchExecutor:groups] ✓ Will create group: "${task.itemName}"`)

  // Build full group template
  if (!("@odata.type" in template)) {
    const simpleTemplate = template as GroupTemplate;
    const isStaticGroup = simpleTemplate.isStaticGroup === true || !simpleTemplate.membershipRule;

    if (isStaticGroup) {
      return {
        type: "body",
        body: {
          "@odata.type": "#microsoft.graph.group",
          displayName: simpleTemplate.displayName,
          description: addHydrationMarker(simpleTemplate.description),
          groupTypes: [],
          mailEnabled: false,
          mailNickname: simpleTemplate.displayName.replace(/[^a-zA-Z0-9]/g, ""),
          securityEnabled: true,
        },
      };
    } else {
      return {
        type: "body",
        body: {
          "@odata.type": "#microsoft.graph.group",
          displayName: simpleTemplate.displayName,
          description: addHydrationMarker(simpleTemplate.description),
          groupTypes: ["DynamicMembership"],
          mailEnabled: false,
          mailNickname: simpleTemplate.displayName.replace(/[^a-zA-Z0-9]/g, ""),
          securityEnabled: true,
          membershipRule: simpleTemplate.membershipRule,
          membershipRuleProcessingState: "On",
        },
      };
    }
  }

  // Already full template
  const fullTemplate = template as DeviceGroup;
  return {
    type: "body",
    body: {
      ...fullTemplate,
      description: addHydrationMarker(fullTemplate.description),
    },
  };
}

/**
 * Build request body for a filter task
 */
function buildFilterRequestBody(task: HydrationTask, context: ExecutionContext): BuildBodyResult {
  let template: FilterTemplate | DeviceFilter | undefined;
  const cachedFilterTemplates = getCachedTemplates("filters");

  if (cachedFilterTemplates && Array.isArray(cachedFilterTemplates)) {
    template = (cachedFilterTemplates as FilterTemplate[]).find((f) => f.displayName === task.itemName);
  }

  if (!template) {
    template = Templates.getDeviceFilterByName(task.itemName);
  }

  if (!template) return { type: "error", reason: "Template not found" };

  // Check if already exists in cache
  const existingFilter = context.cachedFilters?.find(
    (f) => f.displayName.toLowerCase() === template!.displayName.toLowerCase()
  );
  if (existingFilter) return { type: "skip", reason: "Filter already exists" };

  // Build full filter template
  if (!("@odata.type" in template)) {
    const simpleTemplate = template as FilterTemplate;
    return {
      type: "body",
      body: {
        "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
        displayName: simpleTemplate.displayName,
        description: addHydrationMarker(simpleTemplate.description),
        platform: simpleTemplate.platform,
        rule: simpleTemplate.rule,
      },
    };
  }

  const fullTemplate = template as DeviceFilter;
  return {
    type: "body",
    body: {
      ...fullTemplate,
      description: addHydrationMarker(fullTemplate.description),
    },
  };
}


/**
 * Build request body for a conditional access task
 */
function buildConditionalAccessRequestBody(task: HydrationTask): BuildBodyResult {
  const cachedPolicies = getCachedTemplates("conditionalAccess");
  let template: ConditionalAccessTemplate | { displayName: string; [key: string]: unknown } | undefined;

  if (cachedPolicies && Array.isArray(cachedPolicies)) {
    template = (cachedPolicies as ConditionalAccessTemplate[]).find((p) => p.displayName === task.itemName);
  }

  if (!template) {
    // Templates.getConditionalAccessPolicyByName returns ConditionalAccessPolicy type
    const templatePolicy = Templates.getConditionalAccessPolicyByName(task.itemName);
    if (templatePolicy) {
      template = templatePolicy as { displayName: string; [key: string]: unknown };
    }
  }

  if (!template) return { type: "error", reason: "Template not found" };

  // CA policies must be created in disabled state
  return {
    type: "body",
    body: {
      ...template,
      state: "disabled",
      displayName: `${template.displayName} [Intune Hydration Kit]`,
    },
  };
}

/**
 * Result of building a baseline/CIS request body
 */
interface BaselineRequestResult {
  body: Record<string, unknown>;
  endpoint: string;
  policyType: CISPolicyType;
}

/** Returned when a policy already exists and should be skipped (not sent to sequential) */
interface BaselineSkipResult {
  skip: true;
  reason: string;
}

type BaselineBuildResult = BaselineRequestResult | BaselineSkipResult | null;

/**
 * Build request body for a baseline task (OpenIntuneBaseline)
 * Returns BaselineRequestResult on success, BaselineSkipResult if policy exists, null if template not found/unsupported
 */
async function buildBaselineRequestBody(
  task: HydrationTask,
  context: ExecutionContext
): Promise<BaselineBuildResult> {
  // Use templates from context (passed directly from engine) or fallback to global cache
  const cachedPolicies = context.cachedBaselineTemplates || getCachedTemplates("baseline");
  let template: BaselinePolicy | undefined;

  console.log(`[BatchExecutor:baseline] Looking for "${task.itemName}" in ${cachedPolicies?.length || 0} cached policies (source: ${context.cachedBaselineTemplates ? 'context' : 'global cache'})`);

  if (cachedPolicies && Array.isArray(cachedPolicies)) {
    // Log first few policy names to help debug
    if (cachedPolicies.length > 0) {
      const sampleNames = (cachedPolicies as BaselinePolicy[]).slice(0, 3).map(p => p.name || p.displayName);
      console.log(`[BatchExecutor:baseline] Sample cached names: ${sampleNames.join(', ')}`);
    }

    template = (cachedPolicies as BaselinePolicy[]).find(
      (p) => (p.name || p.displayName) === task.itemName
    );
  }

  if (!template) {
    console.log(`[BatchExecutor:baseline] ✗ No template found for "${task.itemName}"`);
    return null;
  }

  const policyName = (template.name || template.displayName) as string;

  // Use _oibPolicyType from manifest for OIB baselines, fallback to detection
  const oibPolicyType = template._oibPolicyType as string | undefined;

  // Map OIB policy types to batch-compatible types
  let policyType: string;
  if (oibPolicyType) {
    // OIB manifest provides explicit policy type
    switch (oibPolicyType) {
      case "SettingsCatalog":
        policyType = "SettingsCatalog";
        break;
      case "DeviceConfiguration":
      case "UpdatePolicies": // WUfB rings use deviceConfigurations endpoint
        policyType = "DeviceConfiguration";
        break;
      case "DriverUpdateProfiles":
        policyType = "DriverUpdateProfiles";
        break;
      case "V2Compliance":
        policyType = "V2Compliance";
        break;
      default:
        // Fall back to detection for unknown types
        policyType = detectCISPolicyType(template as Record<string, unknown>);
    }
    console.log(`[BatchExecutor] OIB policy "${policyName}" type from manifest: ${oibPolicyType} -> ${policyType}`);
  } else {
    // No OIB type set, use detection (shouldn't happen for OIB)
    policyType = detectCISPolicyType(template as Record<string, unknown>);
    console.log(`[BatchExecutor] OIB policy "${policyName}" type detected: ${policyType}`);
  }

  // Only batch SettingsCatalog, DeviceConfiguration, DriverUpdateProfiles, and V2Compliance
  // Other types require special handling
  if (policyType === "Unsupported" || policyType === "SecurityIntent" || policyType === "V1Compliance") {
    console.log(`[BatchExecutor] Skipping "${policyName}" - unsupported type for batching: ${policyType}`);
    return null;
  }

  // Check if policy already exists (cache-first with API fallback)
  if (await policyExistsInCacheOrApi(policyType, policyName, context)) {
    return { skip: true, reason: `${policyType} "${policyName}" already exists` };
  }

  // Build the appropriate request body
  let body: Record<string, unknown>;
  let endpoint: string;

  switch (policyType) {
    case "SettingsCatalog":
      body = cleanSettingsCatalogPolicy(template as Record<string, unknown>);
      endpoint = CATEGORY_ENDPOINTS.settingsCatalog;
      break;

    case "DeviceConfiguration":
      body = cleanPolicyRecursively(template) as Record<string, unknown>;
      body.description = addHydrationMarker(body.description as string | undefined);
      endpoint = CATEGORY_ENDPOINTS.deviceConfiguration;
      break;

    case "DriverUpdateProfiles":
      body = cleanPolicyRecursively(template) as Record<string, unknown>;
      body.description = addHydrationMarker(body.description as string | undefined);
      endpoint = CATEGORY_ENDPOINTS.driverUpdate;
      break;

    case "V2Compliance":
      body = cleanPolicyRecursively(template) as Record<string, unknown>;
      body.description = addHydrationMarker(body.description as string | undefined);
      endpoint = CATEGORY_ENDPOINTS.v2Compliance;
      break;

    default:
      console.log(`[BatchExecutor] No batch handler for type: ${policyType}`);
      return null;
  }

  return { body, endpoint, policyType };
}

/**
 * Build request body for a CIS baseline task
 * Returns BaselineRequestResult on success, BaselineSkipResult if policy exists, null if template not found/unsupported
 */
async function buildCISBaselineRequestBody(
  task: HydrationTask,
  context: ExecutionContext
): Promise<BaselineBuildResult> {
  // CIS templates are cached with keys like "cisBaseline-cis-windows-11,cis-browser"
  // We need to search all matching cache keys
  let template: CISBaselinePolicy | undefined;

  const allKeys = getAllTemplateCacheKeys();
  const cacheKeys = allKeys.filter(k => k.startsWith("intune-hydration-templates-cisBaseline"));
  console.log(`[BatchExecutor] CIS lookup for "${task.itemName}" - found ${cacheKeys.length} cache keys:`, cacheKeys);

  for (const key of cacheKeys) {
    const cacheKey = key.replace("intune-hydration-templates-", "");
    const cached = getCachedTemplates(cacheKey);
    if (cached && Array.isArray(cached)) {
      template = (cached as CISBaselinePolicy[]).find(
        (p) => (p.name || p.displayName) === task.itemName
      );
      if (template) {
        console.log(`[BatchExecutor] Found template for "${task.itemName}" in cache key: ${cacheKey}`);
        break;
      }
    }
  }

  if (!template) {
    console.log(`[BatchExecutor] No template found for CIS task: "${task.itemName}"`);
    return null;
  }

  const policyName = (template.name || template.displayName) as string;
  const policyType = detectCISPolicyType(template as Record<string, unknown>);

  // Only batch SettingsCatalog, DeviceConfiguration, and V2Compliance
  if (policyType === "Unsupported" || policyType === "SecurityIntent" || policyType === "V1Compliance") {
    return null;
  }

  // Check if policy already exists (cache-first with API fallback)
  if (await policyExistsInCacheOrApi(policyType, policyName, context, "[BatchExecutor] CIS")) {
    return { skip: true, reason: `${policyType} "${policyName}" already exists` };
  }

  // Build the appropriate request body
  let body: Record<string, unknown>;
  let endpoint: string;

  switch (policyType) {
    case "SettingsCatalog":
      body = cleanSettingsCatalogPolicy(template as Record<string, unknown>);
      endpoint = CATEGORY_ENDPOINTS.settingsCatalog;
      break;

    case "DeviceConfiguration":
      body = cleanPolicyRecursively(template) as Record<string, unknown>;
      body.description = addHydrationMarker(body.description as string | undefined);
      endpoint = CATEGORY_ENDPOINTS.deviceConfiguration;
      break;

    case "V2Compliance":
      body = cleanPolicyRecursively(template) as Record<string, unknown>;
      body.description = addHydrationMarker(body.description as string | undefined);
      endpoint = CATEGORY_ENDPOINTS.v2Compliance;
      break;

    default:
      return null;
  }

  return { body, endpoint, policyType };
}

/**
 * Prepare a task for batch execution
 * Returns batch result, skip result, or sequential marker
 */
async function prepareTaskForBatch(
  task: HydrationTask,
  context: ExecutionContext,
  requestId: string
): Promise<BatchPrepareResult> {
  let body: Record<string, unknown> | null = null;
  let endpoint = "";
  let apiVersion: ApiVersion = "beta";

  switch (task.category) {
    case "groups": {
      const result = buildGroupRequestBody(task, context);
      if (result.type === "skip") return { type: "skip", reason: result.reason };
      if (result.type === "error") return { type: "sequential" };
      body = result.body;
      endpoint = CATEGORY_ENDPOINTS.groups;
      apiVersion = "v1.0";
      break;
    }

    case "filters": {
      const result = buildFilterRequestBody(task, context);
      if (result.type === "skip") return { type: "skip", reason: result.reason };
      if (result.type === "error") return { type: "sequential" };
      body = result.body;
      endpoint = CATEGORY_ENDPOINTS.filters;
      break;
    }

    case "compliance": {
      // Force sequential execution for compliance policies - batch endpoint is unreliable
      // and frequently returns 504 Gateway Timeout even when policies are being created
      console.log(`[BatchExecutor] Compliance policy "${task.itemName}" will use sequential execution (batch unreliable)`);
      return { type: "sequential" };
    }

    case "conditionalAccess": {
      // Skip all CA policies if tenant lacks Entra ID Premium P1 license
      if (context.hasConditionalAccessLicense === false) {
        return { type: "skip", reason: "No Entra ID Premium (P1) license" };
      }

      // Check if policy already exists
      if (await policyExistsInCacheOrApi("ConditionalAccess", task.itemName, context)) {
        return { type: "skip", reason: "Already exists" };
      }

      const result = buildConditionalAccessRequestBody(task);
      if (result.type === "skip") return { type: "skip", reason: result.reason };
      if (result.type === "error") return { type: "sequential" };
      body = result.body;
      endpoint = CATEGORY_ENDPOINTS.conditionalAccess;
      apiVersion = "v1.0";
      break;
    }

    case "baseline": {
      const baselineResult = await buildBaselineRequestBody(task, context);
      if (!baselineResult) return { type: "sequential" };
      if ("skip" in baselineResult) return { type: "skip", reason: baselineResult.reason };
      body = baselineResult.body;
      endpoint = baselineResult.endpoint;
      break;
    }

    case "cisBaseline": {
      console.log(`[BatchExecutor] Preparing CIS task: "${task.itemName}"`);
      const cisResult = await buildCISBaselineRequestBody(task, context);
      if (!cisResult) {
        console.log(`[BatchExecutor] CIS task "${task.itemName}" could not be prepared for batch`);
        return { type: "sequential" };
      }
      if ("skip" in cisResult) return { type: "skip", reason: cisResult.reason };
      console.log(`[BatchExecutor] CIS task "${task.itemName}" prepared with endpoint: ${cisResult.endpoint}`);
      body = cisResult.body;
      endpoint = cisResult.endpoint;
      break;
    }

    // For complex categories (appProtection, enrollment),
    // fall back to sequential execution as they require special handling
    default:
      return { type: "sequential" };
  }

  if (!body) return { type: "sequential" };

  return {
    type: "batch",
    data: {
      task,
      apiVersion,
      request: {
        id: requestId,
        method: "POST",
        url: endpoint,
        body,
        headers: { "Content-Type": "application/json" },
      },
    },
  };
}

/**
 * Execute tasks in batches
 * Groups tasks by API version and executes in chunks
 */
export async function executeTasksInBatches(
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  const config = getBatchConfig();
  const results: ExecutionResult[] = [];
  const batchableTasks: PreparedBatchTask[] = [];
  const nonBatchableTasks: HydrationTask[] = [];
  const skippedTasks: { task: HydrationTask; reason: string }[] = [];

  // Build a category summary for logging
  const categoryCounts = tasks.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const categoryNames: Record<string, string> = {
    groups: "Entra Groups", filters: "Device Filters", compliance: "Compliance Policies",
    conditionalAccess: "Conditional Access", appProtection: "App Protection",
    enrollment: "Enrollment Profiles", baseline: "OpenIntuneBaseline",
    cisBaseline: "CIS Baselines", notificationTemplates: "Notification Templates",
  };

  emitStatus(context, `Preparing ${tasks.length} items for batch creation...`, "progress", "create");
  console.log(`[BatchExecutor] Preparing ${tasks.length} tasks for batch execution (batch size: ${config.defaultBatchSize})`);
  console.log(`[BatchExecutor] Task categories:`, categoryCounts);
  console.log(`[BatchExecutor] Context cache: baselineTemplates=${context.cachedBaselineTemplates?.length ?? 'not set'}`);

  // Separate tasks into: batchable, skipped, or needs sequential
  let currentCategory = "";
  let categoryProcessed = 0;
  let categoryTotal = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    // Emit progress when entering a new category
    if (task.category !== currentCategory) {
      currentCategory = task.category;
      categoryTotal = categoryCounts[currentCategory] || 0;
      categoryProcessed = 0;
      const friendlyName = categoryNames[currentCategory] || currentCategory;
      emitStatus(
        context,
        `Preparing ${friendlyName} (${categoryTotal} items)...`,
        "progress",
        "create"
      );
    }

    categoryProcessed++;

    // Emit progress every 25 items within large categories
    if (categoryTotal > 25 && categoryProcessed % 25 === 0) {
      const friendlyName = categoryNames[currentCategory] || currentCategory;
      emitStatus(
        context,
        `Preparing ${friendlyName}: ${categoryProcessed}/${categoryTotal}...`,
        "progress",
        "create"
      );
    }

    console.log(`[BatchExecutor] Preparing task ${i + 1}/${tasks.length}: "${task.itemName}" (${task.category})`);
    const prepared = await prepareTaskForBatch(task, context, `req-${i}`);

    switch (prepared.type) {
      case "batch":
        console.log(`[BatchExecutor] ✓ Task prepared: "${task.itemName}" -> ${prepared.data.request.url}`);
        batchableTasks.push(prepared.data);
        break;
      case "skip":
        console.log(`[BatchExecutor] ○ Task skipped: "${task.itemName}" - ${prepared.reason}`);
        skippedTasks.push({ task, reason: prepared.reason });
        break;
      case "sequential":
        console.log(`[BatchExecutor] ✗ Task needs sequential: "${task.itemName}"`);
        nonBatchableTasks.push(task);
        break;
    }
  }

  // Immediately add skipped tasks to results
  const skipTime = new Date();
  for (const { task, reason } of skippedTasks) {
    // Update task status and error reason before notifying
    task.status = "skipped";
    task.error = reason;  // Set skip reason on task object for UI display
    task.startTime = skipTime;
    task.endTime = skipTime;
    results.push({ task, success: false, skipped: true, error: reason });
    // Notify completion for skipped tasks
    context.onTaskComplete?.(task);
  }

  console.log(`[BatchExecutor] Summary: ${batchableTasks.length} batched, ${skippedTasks.length} skipped, ${nonBatchableTasks.length} sequential`);
  const skipMsg = skippedTasks.length > 0 ? `, ${skippedTasks.length} duplicates skipped` : "";
  const seqMsg = nonBatchableTasks.length > 0 ? `, ${nonBatchableTasks.length} sequential` : "";
  emitStatus(
    context,
    `Preparation complete — sending ${batchableTasks.length} items${skipMsg}${seqMsg}`,
    "info",
    "create"
  );

  // Group batchable tasks by API version
  const v1Tasks = batchableTasks.filter((t) => t.apiVersion === "v1.0");
  const betaTasks = batchableTasks.filter((t) => t.apiVersion === "beta");

  // Execute v1.0 batches
  if (v1Tasks.length > 0) {
    console.log(`[BatchExecutor] Executing ${v1Tasks.length} v1.0 tasks in batches`);
    const v1Results = await executeBatchGroup(v1Tasks, context, "v1.0");
    results.push(...v1Results);
  }

  // Execute beta batches
  if (betaTasks.length > 0) {
    console.log(`[BatchExecutor] Executing ${betaTasks.length} beta tasks in batches`);
    const betaResults = await executeBatchGroup(betaTasks, context, "beta");
    results.push(...betaResults);
  }

  // Execute non-batchable tasks sequentially (using existing engine logic)
  if (nonBatchableTasks.length > 0) {
    console.log(`[BatchExecutor] ${nonBatchableTasks.length} tasks will be executed sequentially`);
    // These tasks need to go back through the sequential executor
    // Mark them as needing sequential execution
    for (const task of nonBatchableTasks) {
      results.push({
        task,
        success: false,
        skipped: false,
        error: "NEEDS_SEQUENTIAL_EXECUTION",
      });
    }
  }

  return results;
}

/**
 * Execute a group of tasks with the same API version in batches
 */
async function executeBatchGroup(
  preparedTasks: PreparedBatchTask[],
  context: ExecutionContext,
  version: ApiVersion
): Promise<ExecutionResult[]> {
  const config = getBatchConfig();
  const results: ExecutionResult[] = [];

  // Determine batch size: use smaller size if group contains cisBaseline or baseline tasks
  const hasThrottleSensitiveTasks = preparedTasks.some(
    (t) => t.task.category === "cisBaseline" || t.task.category === "baseline"
  );
  const initialBatchSize = hasThrottleSensitiveTasks
    ? Math.min(config.categoryBatchSizes?.cisBaseline ?? config.defaultBatchSize, config.defaultBatchSize)
    : config.defaultBatchSize;

  // Adaptive throttle state — tracks across batches to dynamically adjust delay and size
  let currentBatchDelay = config.delayBetweenBatches;
  let currentBatchSize = initialBatchSize;
  let consecutiveUnthrottledBatches = 0;
  const MIN_BATCH_SIZE = 2;

  // Re-chunk remaining tasks dynamically; start with initial sizing
  let remainingTasks = [...preparedTasks];
  const maxRetries = 3;

  if (hasThrottleSensitiveTasks) {
    console.log(`[BatchExecutor] Using reduced batch size ${initialBatchSize} for throttle-sensitive categories`);
  }
  console.log(`[BatchExecutor] Processing ${Math.ceil(remainingTasks.length / currentBatchSize)} batch(es) of ${version} requests (batch size: ${currentBatchSize})`);

  let batchIndex = 0;
  while (remainingTasks.length > 0) {
    // Slice off the next chunk at the current adaptive batch size
    const chunk = remainingTasks.slice(0, currentBatchSize);
    remainingTasks = remainingTasks.slice(currentBatchSize);
    const totalEstimatedBatches = batchIndex + 1 + Math.ceil(remainingTasks.length / currentBatchSize);
    const i = batchIndex;

    // Check for cancellation
    if (context.shouldCancel?.()) {
      console.log(`[BatchExecutor] Execution cancelled`);
      // Cancel current chunk and all remaining tasks
      const allCancelled = [...chunk, ...remainingTasks.map(t => t)];
      for (const { task } of allCancelled) {
        task.status = "skipped";
        task.error = "Cancelled";
        task.endTime = new Date();
        results.push({ task, success: false, skipped: true, error: "Cancelled" });
        context.onTaskComplete?.(task);
      }
      break;
    }

    // Check for pause
    while (context.shouldPause?.()) {
      await sleep(500);
    }

    // Report batch progress to UI
    const batchProgress: BatchProgress = {
      isActive: true,
      currentBatch: i + 1,
      totalBatches: totalEstimatedBatches,
      itemsInBatch: chunk.length,
      apiVersion: version,
      batchStartTime: new Date(),
    };
    context.onBatchProgress?.(batchProgress);

    // Notify task start for all tasks in batch
    for (const { task } of chunk) {
      task.status = "running";
      task.startTime = new Date();
      context.onTaskStart?.(task);
    }

    console.log(`[BatchExecutor] Executing batch ${i + 1}/${totalEstimatedBatches} with ${chunk.length} requests`);

    // Submit this chunk, with retry support for individual 429/5xx responses
    let currentItems = chunk;
    let retryCount = 0;
    let batchThrottleCount = 0;

    while (currentItems.length > 0 && retryCount <= maxRetries) {
      try {
        // Preview mode: simulate successful responses without making API calls
        if (context.isPreview) {
          for (const { task } of currentItems) {
            task.status = "success";
            task.endTime = new Date();
            results.push({ task, success: true, skipped: false });
            context.onTaskComplete?.(task);
          }
          currentItems = [];
          continue;
        }

        const batchResult = await context.client.batch(
          currentItems.map((t) => t.request),
          version
        );

        // Map responses back to tasks
        const responseMap = new Map<string, BatchResponse>();
        for (const response of batchResult.responses) {
          responseMap.set(response.id, response);
        }

        // Collect retryable items for re-submission
        const pendingRetry: PreparedBatchTask[] = [];
        let retryAfterMs = 0;

        for (const item of currentItems) {
          const { task, request } = item;
          const response = responseMap.get(request.id);

          if (!response) {
            task.status = "failed";
            task.error = "No response received";
            task.endTime = new Date();
            results.push({ task, success: false, skipped: false, error: "No response received" });
            context.onTaskError?.(task, new Error("No response received"));
            continue;
          }

          if (isBatchResponseSuccess(response.status)) {
            const createdId = (response.body as Record<string, unknown>)?.id as string | undefined;
            task.status = "success";
            task.endTime = new Date();
            results.push({ task, success: true, skipped: false, createdId });
            context.onTaskComplete?.(task);

            // Update caches
            updateCacheAfterCreate(task, response, context);
          } else if (isBatchResponseConflict(response.status)) {
            task.status = "skipped";
            task.error = "Already exists";  // Set skip reason on task object for UI display
            task.endTime = new Date();
            results.push({ task, success: false, skipped: true, error: "Already exists" });
            context.onTaskComplete?.(task);
          } else if (response.status === 504 && task.category === "compliance") {
            // Special handling for compliance policies with 504 timeout
            const verifiedId = await verifyCompliancePolicyCreated(task.itemName, context);

            if (verifiedId) {
              task.status = "success";
              task.endTime = new Date();
              results.push({ task, success: true, skipped: false, createdId: verifiedId });
              context.onTaskComplete?.(task);
            } else {
              const error = extractBatchError(response);
              task.status = "failed";
              task.error = `${error.message} (verified not created)`;
              task.endTime = new Date();
              results.push({ task, success: false, skipped: false, error: task.error });
              context.onTaskError?.(task, new Error(task.error));
            }
          } else if (isBatchResponseRetryable(response.status) && retryCount < maxRetries) {
            // 429 or 5xx -- queue for retry instead of marking failed
            const headerDelay = getRetryAfterFromBatchResponse(response.headers) || 0;
            retryAfterMs = Math.max(retryAfterMs, headerDelay);
            pendingRetry.push(item);
            if (response.status === 429) {
              batchThrottleCount++;
            }
            console.log(`[BatchExecutor] Response ${response.status} for "${task.itemName}" -- queued for retry`);
          } else {
            const error = extractBatchError(response);
            task.status = "failed";
            task.error = error.message;
            task.endTime = new Date();
            results.push({ task, success: false, skipped: false, error: error.message });
            context.onTaskError?.(task, new Error(error.message));
            // Count throttle failures that exhausted retries
            if (response.status === 429 || isThrottleErrorMessage(error.message)) {
              batchThrottleCount++;
            }
          }
        }

        if (pendingRetry.length > 0) {
          retryCount++;
          const backoff = Math.pow(2, retryCount) * 1000;
          const delay = Math.max(retryAfterMs, backoff);
          console.log(`[BatchExecutor] ${pendingRetry.length} responses need retry (attempt ${retryCount}/${maxRetries}), waiting ${delay}ms`);
          emitStatus(context, `Retrying ${pendingRetry.length} throttled requests (attempt ${retryCount}/${maxRetries})...`, "warning");
          await sleep(delay);
          currentItems = pendingRetry;
        } else {
          // All items handled, exit the retry loop
          currentItems = [];
        }
      } catch (error) {
        // Entire batch HTTP call failed (network error, etc.)
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[BatchExecutor] Batch ${i + 1} failed (attempt ${retryCount}/${maxRetries}):`, errorMessage);

        // Count as throttle event if the HTTP-level error is throttle-related
        if (isThrottleErrorMessage(errorMessage)) {
          batchThrottleCount += currentItems.length;
        }

        if (retryCount <= maxRetries) {
          const retryDelay = Math.pow(2, retryCount) * 1000;
          console.log(`[BatchExecutor] Retrying entire batch in ${retryDelay}ms...`);
          await sleep(retryDelay);
          // currentItems stays the same -- re-submit all
        } else {
          // Max retries exhausted, mark all remaining as failed
          for (const { task } of currentItems) {
            task.status = "failed";
            task.error = errorMessage;
            task.endTime = new Date();
            results.push({ task, success: false, skipped: false, error: errorMessage });
            context.onTaskError?.(task, error instanceof Error ? error : new Error(errorMessage));
          }
          currentItems = [];
        }
      }
    }

    // If we exhausted retries but still have items (shouldn't happen, but safety net)
    if (currentItems.length > 0) {
      for (const { task } of currentItems) {
        if (task.status !== "failed" && task.status !== "success" && task.status !== "skipped") {
          task.status = "failed";
          task.error = "Max retries exhausted";
          task.endTime = new Date();
          results.push({ task, success: false, skipped: false, error: "Max retries exhausted" });
          context.onTaskError?.(task, new Error("Max retries exhausted"));
        }
      }
    }

    // Adaptive throttle: adjust delay and batch size based on 429 counts
    if (batchThrottleCount > 0) {
      consecutiveUnthrottledBatches = 0;
      const throttleRatio = batchThrottleCount / chunk.length;

      // Double the inter-batch delay when any throttling is detected
      currentBatchDelay = Math.min(currentBatchDelay * 2, 30_000);
      console.log(`[BatchExecutor] Throttling detected in batch ${i + 1} — ${batchThrottleCount}/${chunk.length} items throttled, increasing delay to ${currentBatchDelay}ms`);
      emitStatus(context, `Throttling detected — slowing down (delay ${currentBatchDelay}ms)`, "warning");

      // If >50% of items were throttled, also reduce batch size for remaining items
      if (throttleRatio > 0.5 && currentBatchSize > MIN_BATCH_SIZE) {
        currentBatchSize = Math.max(Math.floor(currentBatchSize / 2), MIN_BATCH_SIZE);
        console.log(`[BatchExecutor] >50% throttled — reducing batch size to ${currentBatchSize}`);
        emitStatus(context, `Heavy throttling — reducing batch size to ${currentBatchSize}`, "warning");
      }
    } else {
      consecutiveUnthrottledBatches++;

      // Gradually recover after 2 consecutive unthrottled batches
      if (consecutiveUnthrottledBatches >= 2) {
        if (currentBatchDelay > config.delayBetweenBatches) {
          currentBatchDelay = Math.max(Math.floor(currentBatchDelay / 2), config.delayBetweenBatches);
          console.log(`[BatchExecutor] Throttle recovery — reducing delay to ${currentBatchDelay}ms`);
        }
        if (currentBatchSize < initialBatchSize) {
          currentBatchSize = Math.min(currentBatchSize + Math.floor(initialBatchSize / 4), initialBatchSize);
          console.log(`[BatchExecutor] Throttle recovery — increasing batch size to ${currentBatchSize}`);
        }
      }
    }

    // Delay between batches (except when no remaining tasks)
    if (remainingTasks.length > 0) {
      console.log(`[BatchExecutor] Waiting ${currentBatchDelay}ms before next batch`);
      await sleep(currentBatchDelay);
    }

    batchIndex++;
  }

  return results;
}

/**
 * Check if an error message indicates throttling (429/TooManyRequests).
 * Used as a fallback when the HTTP status code is not directly 429.
 */
function isThrottleErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("429") || lower.includes("toomanyrequests") || lower.includes("throttl");
}

/**
 * Update context caches after successful creation
 */
function updateCacheAfterCreate(
  task: HydrationTask,
  response: BatchResponse,
  context: ExecutionContext
): void {
  const body = response.body as Record<string, unknown> | undefined;

  switch (task.category) {
    case "groups":
      if (context.cachedIntuneGroups && body) {
        context.cachedIntuneGroups.push(body as unknown as DeviceGroup);
      }
      break;

    case "filters":
      if (context.cachedFilters && body) {
        context.cachedFilters.push(body as unknown as DeviceFilter);
      }
      break;

    case "compliance":
      // Add to Compliance cache to prevent duplicates
      if (context.cachedCompliancePolicies && body && body.id && body.displayName) {
        context.cachedCompliancePolicies.push({
          id: body.id as string,
          displayName: body.displayName as string,
          description: body.description as string | undefined,
        });
      }
      break;

    case "baseline":
    case "cisBaseline":
      // Add to Settings Catalog cache if it's a Settings Catalog policy
      if (context.cachedSettingsCatalogPolicies && body && body.id && body.name) {
        context.cachedSettingsCatalogPolicies.push({
          id: body.id as string,
          name: body.name as string,
          description: body.description as string | undefined,
        });
      }
      break;
  }
}

/**
 * Check if a task category supports batch execution
 */
export function isBatchableCategory(category: string): boolean {
  // Compliance re-enabled for batch - using smaller batch size and proper retry handling
  // PowerShell reference implementation uses batch successfully
  return ["groups", "filters", "compliance", "conditionalAccess", "baseline", "cisBaseline"].includes(category);
}

// ============================================================================
// DELETE BATCH OPERATIONS
// ============================================================================

/**
 * Result of preparing a delete task for batch execution
 */
type DeletePrepareResult =
  | { type: "batch"; data: PreparedBatchTask }
  | { type: "skip"; reason: string }
  | { type: "sequential" };

/**
 * Endpoint type for baseline policies (determines delete URL)
 */
type BaselineEndpointType = "settingsCatalog" | "v2Compliance" | "v1Compliance" | "deviceConfiguration" | "driverUpdate";

/**
 * Normalize a name for comparison by:
 * - Converting to lowercase
 * - Removing special characters (colons, quotes, smart quotes, etc.)
 * - Collapsing multiple spaces to single space
 * - Trimming whitespace
 * This helps match policy names that differ only in punctuation
 * (e.g., filename "Network security LAN Manager" vs policy name "Network security: LAN Manager")
 */
function normalizeName(name: string | undefined | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    // Replace colons, all types of quotes (straight, curly/smart) with spaces
    .replace(/[:'""`''""]/g, " ")
    // Remove ellipsis and trailing dots
    .replace(/\.{2,}/g, " ")
    // Remove parentheses content for partial matching (optional)
    // .replace(/\([^)]*\)/g, " ")
    // Collapse multiple spaces to single space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a policy already exists using cache-first strategy with API fallback.
 * Consolidates existence checks for SettingsCatalog, V2Compliance,
 * DeviceConfiguration, and DriverUpdateProfiles.
 */
async function policyExistsInCacheOrApi(
  policyType: string,
  policyName: string,
  context: ExecutionContext,
  logPrefix = "[BatchExecutor]"
): Promise<boolean> {
  const normalizedPolicyName = normalizeName(policyName);
  const lowerName = policyName.toLowerCase();

  if (policyType === "SettingsCatalog") {
    const existing = context.cachedSettingsCatalogPolicies?.find(
      (p) => p.name?.toLowerCase() === lowerName || normalizeName(p.name) === normalizedPolicyName
    );
    if (existing) {
      console.log(`${logPrefix} SettingsCatalog already exists (cache hit), skipping: "${policyName}" (matched: "${existing.name}")`);
      return true;
    }
    // API fallback — skip if name has chars that break OData $filter (e.g. [IHD] prefix)
    if (!hasODataUnsafeChars(policyName) && await settingsCatalogPolicyExists(context.client, policyName)) {
      console.log(`${logPrefix} SettingsCatalog already exists (API fallback), skipping: "${policyName}"`);
      return true;
    }
    return false;
  }

  if (policyType === "V2Compliance") {
    const existingV2 = context.cachedV2CompliancePolicies?.find(
      (p) => p.name?.toLowerCase() === lowerName || normalizeName(p.name) === normalizedPolicyName
    );
    if (existingV2) {
      console.log(`${logPrefix} V2Compliance already exists (V2 cache hit), skipping: "${policyName}" (matched: "${existingV2.name}")`);
      return true;
    }
    // V2 policies sometimes appear in Settings Catalog cache
    const existingSC = context.cachedSettingsCatalogPolicies?.find(
      (p) => p.name?.toLowerCase() === lowerName || normalizeName(p.name) === normalizedPolicyName
    );
    if (existingSC) {
      console.log(`${logPrefix} V2Compliance already exists (SC cache hit), skipping: "${policyName}" (matched: "${existingSC.name}")`);
      return true;
    }
    if (!hasODataUnsafeChars(policyName) && await v2CompliancePolicyExists(context.client, policyName)) {
      console.log(`${logPrefix} V2Compliance already exists (API fallback), skipping: "${policyName}"`);
      return true;
    }
    return false;
  }

  if (policyType === "DeviceConfiguration") {
    const existing = context.cachedDeviceConfigurations?.find(
      (p) => p.displayName?.toLowerCase() === lowerName || normalizeName(p.displayName) === normalizedPolicyName
    );
    if (existing) {
      console.log(`${logPrefix} DeviceConfiguration already exists (cache hit), skipping: "${policyName}" (matched: "${existing.displayName}")`);
      return true;
    }
    if (!hasODataUnsafeChars(policyName) && await deviceConfigurationExists(context.client, policyName)) {
      console.log(`${logPrefix} DeviceConfiguration already exists (API fallback), skipping: "${policyName}"`);
      return true;
    }
    return false;
  }

  if (policyType === "DriverUpdateProfiles") {
    const existing = context.cachedDriverUpdateProfiles?.find(
      (p) => p.displayName?.toLowerCase() === lowerName || normalizeName(p.displayName) === normalizedPolicyName
    );
    if (existing) {
      console.log(`${logPrefix} DriverUpdateProfile already exists (cache hit), skipping: "${policyName}"`);
      return true;
    }
    return false;
  }

  if (policyType === "ConditionalAccess") {
    // CA policies are created with " [Intune Hydration Kit]" suffix
    // Check for both the original name and the suffixed version
    const suffixedLowerName = `${lowerName} [intune hydration kit]`;
    const existing = context.cachedConditionalAccessPolicies?.find(
      (p) => {
        const pLower = p.displayName?.toLowerCase();
        return pLower === lowerName ||
               pLower === suffixedLowerName ||
               normalizeName(p.displayName) === normalizedPolicyName;
      }
    );
    if (existing) {
      console.log(`${logPrefix} ConditionalAccess policy already exists (cache hit), skipping: "${policyName}" (matched: "${existing.displayName}")`);
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Find resource ID for deletion by name
 * For Settings Catalog policies, the task.itemName may be from displayName in the template,
 * but the policy was created with 'name' field. We search by name match.
 */
function findResourceIdForDelete(
  task: HydrationTask,
  context: ExecutionContext
): { id: string; hasMarker: boolean; endpointType?: BaselineEndpointType } | null {
  const nameToFind = task.itemName.toLowerCase();
  const normalizedNameToFind = normalizeName(task.itemName);

  switch (task.category) {
    case "groups": {
      const nameStripped = nameToFind.startsWith("[ihd] ") ? nameToFind.slice(6) : nameToFind;
      const group = context.cachedIntuneGroups?.find((g) => {
        const n = g.displayName.toLowerCase();
        const ns = n.startsWith("[ihd] ") ? n.slice(6) : n;
        return n === nameToFind || ns === nameStripped;
      });
      if (group?.id) {
        return { id: group.id, hasMarker: hasHydrationMarker(group.description) };
      }
      return null;
    }

    case "filters": {
      const filter = context.cachedFilters?.find(
        (f) => f.displayName.toLowerCase() === nameToFind
      );
      if (filter?.id) {
        return { id: filter.id, hasMarker: hasHydrationMarker(filter.description) };
      }
      return null;
    }

    case "baseline":
    case "cisBaseline": {
      // First check Settings Catalog policies with exact match
      let policy = context.cachedSettingsCatalogPolicies?.find(
        (p) => p.name?.toLowerCase() === nameToFind
      );

      if (!policy) {
        // Try normalized match (handles punctuation differences like colons)
        policy = context.cachedSettingsCatalogPolicies?.find(
          (p) => normalizeName(p.name) === normalizedNameToFind
        );
      }

      if (!policy) {
        // Try partial match for Settings Catalog (normalized)
        policy = context.cachedSettingsCatalogPolicies?.find(
          (p) => {
            const normalizedPolicyName = normalizeName(p.name);
            return normalizedPolicyName.includes(normalizedNameToFind) ||
                   normalizedNameToFind.includes(normalizedPolicyName);
          }
        );
      }

      if (policy?.id) {
        const hasMarker = hasHydrationMarker(policy.description);
        console.log(`[BatchExecutor:DELETE] Found Settings Catalog policy "${policy.name}" (ID: ${policy.id}), hasMarker: ${hasMarker}`);
        return { id: policy.id, hasMarker, endpointType: "settingsCatalog" };
      }

      // If not found in Settings Catalog, check V2 Compliance policies (OIB compliance)
      let v2Policy = context.cachedV2CompliancePolicies?.find(
        (p) => p.name?.toLowerCase() === nameToFind || normalizeName(p.name) === normalizedNameToFind
      );

      if (!v2Policy) {
        // Try partial match for V2 Compliance (normalized)
        v2Policy = context.cachedV2CompliancePolicies?.find(
          (p) => {
            const normalizedPolicyName = normalizeName(p.name);
            return normalizedPolicyName.includes(normalizedNameToFind) ||
                   normalizedNameToFind.includes(normalizedPolicyName);
          }
        );
      }

      if (v2Policy?.id) {
        const hasMarker = hasHydrationMarker(v2Policy.description);
        console.log(`[BatchExecutor:DELETE] Found V2 Compliance policy "${v2Policy.name}" (ID: ${v2Policy.id}), hasMarker: ${hasMarker}`);
        return { id: v2Policy.id, hasMarker, endpointType: "v2Compliance" };
      }

      // If not found in V2 Compliance, check V1 Compliance policies (OIB compliance uses deviceCompliancePolicies endpoint)
      let v1Policy = context.cachedCompliancePolicies?.find(
        (p) => p.displayName?.toLowerCase() === nameToFind || normalizeName(p.displayName) === normalizedNameToFind
      );

      if (!v1Policy) {
        // Try partial match for V1 Compliance (normalized)
        v1Policy = context.cachedCompliancePolicies?.find(
          (p) => {
            const normalizedPolicyName = normalizeName(p.displayName);
            return normalizedPolicyName.includes(normalizedNameToFind) ||
                   normalizedNameToFind.includes(normalizedPolicyName);
          }
        );
      }

      if (v1Policy?.id) {
        const hasMarker = hasHydrationMarker(v1Policy.description);
        console.log(`[BatchExecutor:DELETE] Found V1 Compliance policy "${v1Policy.displayName}" (ID: ${v1Policy.id}), hasMarker: ${hasMarker}`);
        return { id: v1Policy.id, hasMarker, endpointType: "v1Compliance" };
      }

      // If not found in V1 Compliance, check Device Configurations (Health Monitoring, etc.)
      let deviceConfig = context.cachedDeviceConfigurations?.find(
        (p) => p.displayName?.toLowerCase() === nameToFind || normalizeName(p.displayName) === normalizedNameToFind
      );

      if (!deviceConfig) {
        // Try partial match for Device Configurations (normalized)
        deviceConfig = context.cachedDeviceConfigurations?.find(
          (p) => {
            const normalizedPolicyName = normalizeName(p.displayName);
            return normalizedPolicyName.includes(normalizedNameToFind) ||
                   normalizedNameToFind.includes(normalizedPolicyName);
          }
        );
      }

      if (deviceConfig?.id) {
        const hasMarker = hasHydrationMarker(deviceConfig.description);
        console.log(`[BatchExecutor:DELETE] Found Device Configuration "${deviceConfig.displayName}" (ID: ${deviceConfig.id}), hasMarker: ${hasMarker}`);
        return { id: deviceConfig.id, hasMarker, endpointType: "deviceConfiguration" };
      }

      // If not found in Device Configurations, check Driver Update Profiles
      let driverProfile = context.cachedDriverUpdateProfiles?.find(
        (p) => p.displayName?.toLowerCase() === nameToFind || normalizeName(p.displayName) === normalizedNameToFind
      );

      if (!driverProfile) {
        // Try partial match for Driver Update Profiles (normalized)
        driverProfile = context.cachedDriverUpdateProfiles?.find(
          (p) => {
            const normalizedPolicyName = normalizeName(p.displayName);
            return normalizedPolicyName.includes(normalizedNameToFind) ||
                   normalizedNameToFind.includes(normalizedPolicyName);
          }
        );
      }

      if (driverProfile?.id) {
        const hasMarker = hasHydrationMarker(driverProfile.description);
        console.log(`[BatchExecutor:DELETE] Found Driver Update Profile "${driverProfile.displayName}" (ID: ${driverProfile.id}), hasMarker: ${hasMarker}`);
        return { id: driverProfile.id, hasMarker, endpointType: "driverUpdate" };
      }

      console.log(`[BatchExecutor:DELETE] Policy "${task.itemName}" not found in Settings Catalog (${context.cachedSettingsCatalogPolicies?.length || 0}), V2 Compliance (${context.cachedV2CompliancePolicies?.length || 0}), V1 Compliance (${context.cachedCompliancePolicies?.length || 0}), Device Configurations (${context.cachedDeviceConfigurations?.length || 0}), or Driver Update Profiles (${context.cachedDriverUpdateProfiles?.length || 0})`);
      return null;
    }

    case "compliance": {
      let compliance = context.cachedCompliancePolicies?.find(
        (c) => c.displayName?.toLowerCase() === nameToFind || normalizeName(c.displayName) === normalizedNameToFind
      );
      if (!compliance) {
        // Try partial match for compliance (normalized)
        compliance = context.cachedCompliancePolicies?.find(
          (c) => {
            const normalizedPolicyName = normalizeName(c.displayName);
            return normalizedPolicyName.includes(normalizedNameToFind) ||
                   normalizedNameToFind.includes(normalizedPolicyName);
          }
        );
      }
      if (compliance?.id) {
        return { id: compliance.id, hasMarker: hasHydrationMarker(compliance.description) };
      }
      return null;
    }

    case "conditionalAccess": {
      // CA policies have the marker in displayName (not description) since CA policies don't support descriptions
      // Support BOTH marker formats:
      //   - Old: "[Intune Hydration Kit]"
      //   - New: "[Imported by Intune Hydration Kit]"
      // IMPORTANT: Only search for policies WITH the marker - do NOT fall back to exact name match
      // because there may be existing policies with the same base name that weren't created by this tool
      const markerShort = "[Intune Hydration Kit]";
      const markerFull = "[Imported by Intune Hydration Kit]";
      const searchNameWithShortMarker = `${nameToFind} ${markerShort}`.toLowerCase();
      const searchNameWithFullMarker = `${nameToFind} ${markerFull}`.toLowerCase();

      const ca = context.cachedConditionalAccessPolicies?.find(
        (c) => c.displayName?.toLowerCase() === searchNameWithShortMarker ||
               c.displayName?.toLowerCase() === searchNameWithFullMarker
      );
      if (ca?.id) {
        // Policy found with marker in displayName - it was created by this tool
        return { id: ca.id, hasMarker: true };
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Get the assignment endpoint for a resource to check if it has active assignments
 * Returns null for resource types that don't have assignments (groups, filters)
 */
function getAssignmentEndpoint(
  category: string,
  resourceId: string,
  endpointType?: BaselineEndpointType
): string | null {
  switch (category) {
    case "groups":
    case "filters":
      // Groups and filters don't have assignments - they ARE the assignment targets
      return null;

    case "conditionalAccess":
      // CA policies don't have assignments in the traditional sense
      return null;

    case "compliance":
      return `/deviceManagement/deviceCompliancePolicies/${resourceId}/assignments`;

    case "baseline":
    case "cisBaseline":
      switch (endpointType) {
        case "settingsCatalog":
          return `/deviceManagement/configurationPolicies/${resourceId}/assignments`;
        case "v2Compliance":
          return `/deviceManagement/compliancePolicies/${resourceId}/assignments`;
        case "v1Compliance":
          return `/deviceManagement/deviceCompliancePolicies/${resourceId}/assignments`;
        case "deviceConfiguration":
          return `/deviceManagement/deviceConfigurations/${resourceId}/assignments`;
        case "driverUpdate":
          return `/deviceManagement/windowsDriverUpdateProfiles/${resourceId}/assignments`;
        default:
          return `/deviceManagement/configurationPolicies/${resourceId}/assignments`;
      }

    case "appProtection":
      // App protection policies have a different assignment structure
      return null;

    case "enrollment":
      return `/deviceManagement/windowsAutopilotDeploymentProfiles/${resourceId}/assignments`;

    default:
      return null;
  }
}

/**
 * Check if a resource has active assignments
 * Returns the assignment count, or 0 if assignments can't be checked
 */
async function checkResourceAssignments(
  context: ExecutionContext,
  category: string,
  resourceId: string,
  endpointType?: BaselineEndpointType
): Promise<number> {
  // Skip assignment checks in preview mode - they're read-only but slow
  if (context.isPreview) {
    return 0;
  }

  const assignmentEndpoint = getAssignmentEndpoint(category, resourceId, endpointType);

  if (!assignmentEndpoint) {
    // Resource type doesn't have assignments
    return 0;
  }

  try {
    const response = await context.client.get<{ value: Array<{ id: string }> }>(assignmentEndpoint);
    return response.value?.length ?? 0;
  } catch (error) {
    // If we can't check assignments, log and continue (don't block deletion)
    console.log(`[BatchExecutor:DELETE] Could not check assignments: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}

/**
 * Get the endpoint for a DELETE request
 */
function getDeleteEndpoint(category: string, resourceId: string, endpointType?: BaselineEndpointType): string {
  switch (category) {
    case "groups":
      return `/groups/${resourceId}`;
    case "filters":
      return `/deviceManagement/assignmentFilters/${resourceId}`;
    case "compliance":
      return `/deviceManagement/deviceCompliancePolicies/${resourceId}`;
    case "conditionalAccess":
      return `/identity/conditionalAccess/policies/${resourceId}`;
    case "baseline":
    case "cisBaseline":
      // Use the endpoint type to determine the correct URL
      if (endpointType === "v2Compliance") {
        return `/deviceManagement/compliancePolicies/${resourceId}`;
      }
      if (endpointType === "v1Compliance") {
        return `/deviceManagement/deviceCompliancePolicies/${resourceId}`;
      }
      if (endpointType === "deviceConfiguration") {
        return `/deviceManagement/deviceConfigurations/${resourceId}`;
      }
      if (endpointType === "driverUpdate") {
        return `/deviceManagement/windowsDriverUpdateProfiles/${resourceId}`;
      }
      return `/deviceManagement/configurationPolicies/${resourceId}`;
    default:
      throw new Error(`Unknown category for delete: ${category}`);
  }
}

/**
 * Prepare a task for batch DELETE execution
 * Now async to support assignment checking
 */
async function prepareTaskForDeleteBatch(
  task: HydrationTask,
  context: ExecutionContext,
  requestId: string
): Promise<DeletePrepareResult> {
  console.log(`[BatchExecutor:DELETE] Preparing "${task.itemName}" (${task.category})`);

  // Find the resource ID
  const resource = findResourceIdForDelete(task, context);

  if (!resource) {
    console.log(`[BatchExecutor:DELETE] ○ Not found: "${task.itemName}"`);
    return { type: "skip", reason: `Not found in tenant: "${task.itemName}" does not exist` };
  }

  // Check for hydration marker
  if (!resource.hasMarker) {
    console.log(`[BatchExecutor:DELETE] ○ No hydration marker: "${task.itemName}"`);
    return { type: "skip", reason: `Not created by Intune Hydration Kit (missing marker in description)` };
  }

  // Check for active assignments - skip deletion if policy is assigned
  const assignmentCount = await checkResourceAssignments(
    context,
    task.category,
    resource.id,
    resource.endpointType
  );
  if (assignmentCount > 0) {
    console.log(`[BatchExecutor:DELETE] ○ Has assignments: "${task.itemName}" (${assignmentCount} assignment(s))`);
    return { type: "skip", reason: `Policy has ${assignmentCount} active assignment(s) - remove assignments before deleting` };
  }

  // Determine API version
  const apiVersion: ApiVersion = task.category === "groups" ? "v1.0" : "beta";

  // Build DELETE request (pass endpointType for baseline/cisBaseline to use correct URL)
  const endpoint = getDeleteEndpoint(task.category, resource.id, resource.endpointType);

  console.log(`[BatchExecutor:DELETE] ✓ Will delete: "${task.itemName}" -> ${endpoint}`);

  return {
    type: "batch",
    data: {
      task,
      apiVersion,
      request: {
        id: requestId,
        method: "DELETE",
        url: endpoint,
        headers: {},
      },
    },
  };
}

/**
 * Execute DELETE tasks in batches
 */
export async function executeDeleteTasksInBatches(
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  const config = getBatchConfig();
  const results: ExecutionResult[] = [];
  const batchableTasks: PreparedBatchTask[] = [];
  const nonBatchableTasks: HydrationTask[] = [];
  const skippedTasks: { task: HydrationTask; reason: string }[] = [];

  console.log(`[BatchExecutor:DELETE] Preparing ${tasks.length} tasks for batch deletion (batch size: ${config.defaultBatchSize})`);

  // Separate tasks into: batchable, skipped, or needs sequential
  // Assignment checks are async, so we await each prepare
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const prepared = await prepareTaskForDeleteBatch(task, context, `del-${i}`);

    switch (prepared.type) {
      case "batch":
        batchableTasks.push(prepared.data);
        break;
      case "skip":
        skippedTasks.push({ task, reason: prepared.reason });
        break;
      case "sequential":
        nonBatchableTasks.push(task);
        break;
    }
  }

  // Immediately add skipped tasks to results
  const skipTime = new Date();
  for (const { task, reason } of skippedTasks) {
    task.status = "skipped";
    task.error = reason;  // Set skip reason on task object for UI display
    task.startTime = skipTime;
    task.endTime = skipTime;
    results.push({ task, success: false, skipped: true, error: reason });
    context.onTaskComplete?.(task);
  }

  console.log(`[BatchExecutor:DELETE] Summary: ${batchableTasks.length} to delete, ${skippedTasks.length} skipped, ${nonBatchableTasks.length} sequential`);

  // Group by API version
  const v1Tasks = batchableTasks.filter((t) => t.apiVersion === "v1.0");
  const betaTasks = batchableTasks.filter((t) => t.apiVersion === "beta");

  // Execute v1.0 deletes
  if (v1Tasks.length > 0) {
    console.log(`[BatchExecutor:DELETE] Executing ${v1Tasks.length} v1.0 deletions`);
    const v1Results = await executeDeleteBatchGroup(v1Tasks, context, "v1.0");
    results.push(...v1Results);
  }

  // Execute beta deletes
  if (betaTasks.length > 0) {
    console.log(`[BatchExecutor:DELETE] Executing ${betaTasks.length} beta deletions`);
    const betaResults = await executeDeleteBatchGroup(betaTasks, context, "beta");
    results.push(...betaResults);
  }

  // Mark non-batchable for sequential execution
  for (const task of nonBatchableTasks) {
    results.push({
      task,
      success: false,
      skipped: false,
      error: "NEEDS_SEQUENTIAL_EXECUTION",
    });
  }

  return results;
}

/**
 * Execute a group of DELETE tasks with the same API version
 */
async function executeDeleteBatchGroup(
  preparedTasks: PreparedBatchTask[],
  context: ExecutionContext,
  version: ApiVersion
): Promise<ExecutionResult[]> {
  const config = getBatchConfig();
  const results: ExecutionResult[] = [];
  const chunks = chunkArray(preparedTasks, config.defaultBatchSize);
  const maxRetries = 3;

  console.log(`[BatchExecutor:DELETE] Processing ${chunks.length} batch(es) of ${version} deletions`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Check for cancellation
    if (context.shouldCancel?.()) {
      console.log(`[BatchExecutor:DELETE] Execution cancelled`);
      for (const { task } of chunk) {
        task.status = "skipped";
        task.error = "Cancelled";  // Set skip reason on task object for UI display
        task.endTime = new Date();
        results.push({ task, success: false, skipped: true, error: "Cancelled" });
        context.onTaskComplete?.(task);
      }
      break;
    }

    // Handle pause
    while (context.shouldPause?.()) {
      await sleep(500);
    }

    // Report batch progress to UI
    const batchProgress: BatchProgress = {
      isActive: true,
      currentBatch: i + 1,
      totalBatches: chunks.length,
      itemsInBatch: chunk.length,
      apiVersion: version,
      batchStartTime: new Date(),
    };
    context.onBatchProgress?.(batchProgress);

    // Notify task start
    for (const { task } of chunk) {
      task.status = "running";
      task.startTime = new Date();
      context.onTaskStart?.(task);
    }

    console.log(`[BatchExecutor:DELETE] Executing batch ${i + 1}/${chunks.length} with ${chunk.length} deletions`);

    // Retry logic for entire batch
    let retryCount = 0;
    let batchSuccess = false;

    while (!batchSuccess && retryCount < maxRetries) {
      try {
        // Preview mode: simulate successful deletions without making API calls
        if (context.isPreview) {
          for (const { task } of chunk) {
            task.status = "success";
            task.endTime = new Date();
            results.push({ task, success: true, skipped: false });
            context.onTaskComplete?.(task);
          }
          batchSuccess = true;
          continue;
        }

        const batchResult = await context.client.batch(
          chunk.map((t) => t.request),
          version
        );

        // Process responses
        const responseMap = new Map<string, BatchResponse>();
        for (const response of batchResult.responses) {
          responseMap.set(response.id, response);
        }

        for (const { task, request } of chunk) {
          const response = responseMap.get(request.id);

          if (!response) {
            task.status = "failed";
            task.error = "No response received";
            task.endTime = new Date();
            results.push({ task, success: false, skipped: false, error: "No response received" });
            context.onTaskError?.(task, new Error("No response received"));
            continue;
          }

          // 204 No Content = success for DELETE, also accept 200-299
          if (response.status >= 200 && response.status < 300) {
            task.status = "success";
            task.endTime = new Date();
            results.push({ task, success: true, skipped: false });
            context.onTaskComplete?.(task);

            // Update cache - remove deleted item
            updateCacheAfterDelete(task, context);
          } else if (response.status === 404) {
            // Already deleted
            task.status = "skipped";
            task.error = "Already deleted";  // Set skip reason on task object for UI display
            task.endTime = new Date();
            results.push({ task, success: false, skipped: true, error: "Already deleted" });
            context.onTaskComplete?.(task);
          } else if (response.status === 504 && task.category === "compliance") {
            // Special handling for compliance policies with 504 timeout
            // The Graph API often returns 504 but the policy was actually deleted
            // Trust the operation - with duplicates, name-based verification doesn't work
            // (deleting one policy still leaves another with the same name)
            console.log(`[BatchExecutor:DELETE] Got 504 for "${task.itemName}" - trusting delete succeeded (duplicates may exist)`);
            task.status = "success";
            task.endTime = new Date();
            results.push({ task, success: true, skipped: false });
            context.onTaskComplete?.(task);

            // Update cache - remove one instance of this policy
            updateCacheAfterDelete(task, context);
          } else {
            const error = extractBatchError(response);
            task.status = "failed";
            task.error = error.message;
            task.endTime = new Date();
            results.push({ task, success: false, skipped: false, error: error.message });
            context.onTaskError?.(task, new Error(error.message));
          }
        }

        batchSuccess = true;
      } catch (error) {
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[BatchExecutor:DELETE] Batch ${i + 1} failed (attempt ${retryCount}/${maxRetries}):`, errorMessage);

        if (retryCount < maxRetries) {
          const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`[BatchExecutor:DELETE] Retrying in ${retryDelay}ms...`);
          await sleep(retryDelay);
        } else {
          // Max retries reached, mark all as failed
          for (const { task } of chunk) {
            task.status = "failed";
            task.error = errorMessage;
            task.endTime = new Date();
            results.push({ task, success: false, skipped: false, error: errorMessage });
            context.onTaskError?.(task, error instanceof Error ? error : new Error(errorMessage));
          }
        }
      }
    }

    // Delay between batches
    if (i < chunks.length - 1) {
      console.log(`[BatchExecutor:DELETE] Waiting ${config.delayBetweenBatches}ms before next batch`);
      await sleep(config.delayBetweenBatches);
    }
  }

  return results;
}

/**
 * Update context caches after successful deletion
 */
function updateCacheAfterDelete(task: HydrationTask, context: ExecutionContext): void {
  const nameToRemove = task.itemName.toLowerCase();

  switch (task.category) {
    case "groups":
      if (context.cachedIntuneGroups) {
        const index = context.cachedIntuneGroups.findIndex(
          (g) => g.displayName.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedIntuneGroups.splice(index, 1);
        }
      }
      break;

    case "filters":
      if (context.cachedFilters) {
        const index = context.cachedFilters.findIndex(
          (f) => f.displayName.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedFilters.splice(index, 1);
        }
      }
      break;

    case "baseline":
    case "cisBaseline":
      // Try Settings Catalog first
      if (context.cachedSettingsCatalogPolicies) {
        const index = context.cachedSettingsCatalogPolicies.findIndex(
          (p) => p.name.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedSettingsCatalogPolicies.splice(index, 1);
          break;
        }
      }
      // If not found in Settings Catalog, try V2 Compliance
      if (context.cachedV2CompliancePolicies) {
        const index = context.cachedV2CompliancePolicies.findIndex(
          (p) => p.name.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedV2CompliancePolicies.splice(index, 1);
          break;
        }
      }
      // If not found in V2 Compliance, try V1 Compliance
      if (context.cachedCompliancePolicies) {
        const index = context.cachedCompliancePolicies.findIndex(
          (p) => p.displayName?.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedCompliancePolicies.splice(index, 1);
          break;
        }
      }
      // If not found in V1 Compliance, try Device Configurations
      if (context.cachedDeviceConfigurations) {
        const index = context.cachedDeviceConfigurations.findIndex(
          (p) => p.displayName?.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedDeviceConfigurations.splice(index, 1);
          break;
        }
      }
      // If not found in Device Configurations, try Driver Update Profiles
      if (context.cachedDriverUpdateProfiles) {
        const index = context.cachedDriverUpdateProfiles.findIndex(
          (p) => p.displayName?.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedDriverUpdateProfiles.splice(index, 1);
        }
      }
      break;

    case "compliance":
      if (context.cachedCompliancePolicies) {
        const index = context.cachedCompliancePolicies.findIndex(
          (c) => c.displayName?.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedCompliancePolicies.splice(index, 1);
        }
      }
      break;

    case "conditionalAccess":
      if (context.cachedConditionalAccessPolicies) {
        const index = context.cachedConditionalAccessPolicies.findIndex(
          (c) => c.displayName?.toLowerCase() === nameToRemove ||
                 c.displayName?.toLowerCase() === `${nameToRemove} [intune hydration kit]`
        );
        if (index !== -1) {
          context.cachedConditionalAccessPolicies.splice(index, 1);
        }
      }
      break;
  }
}

// ============================================================================
// FAST PARALLEL DELETE OPERATIONS (NukeTune-style)
// ============================================================================

/**
 * Configuration for fast parallel deletion
 * Based on NukeTune's proven fast deletion pattern
 * Using conservative settings to avoid 400 errors from overwhelmed backend
 */
const FAST_DELETE_CONFIG = {
  /** Number of concurrent delete requests (NukeTune uses 3) */
  parallelRequests: 3,
  /** Delay between batches of parallel requests (ms) */
  delayBetweenBatches: 500,
};

/**
 * Execute DELETE tasks in parallel for maximum speed
 * Uses Promise.all() to send multiple requests concurrently
 * Based on NukeTune's proven fast deletion pattern
 */
export async function executeDeletesInParallel(
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const { parallelRequests, delayBetweenBatches } = FAST_DELETE_CONFIG;

  console.log(`[FastDelete] Starting parallel deletion of ${tasks.length} tasks (${parallelRequests} concurrent)`);
  emitStatus(context, `Preparing ${tasks.length} items for deletion...`, "progress", "delete");

  // Prepare all tasks first
  const preparedTasks: Array<{
    task: HydrationTask;
    deleteUrl: string | null;
    apiVersion: "v1.0" | "beta";
    skipReason?: string;
  }> = [];

  let checkedCount = 0;
  for (const task of tasks) {
    checkedCount++;
    // Emit progress every 10 items or on last item
    if (checkedCount % 10 === 0 || checkedCount === tasks.length) {
      emitStatus(context, `Checking assignments: ${checkedCount}/${tasks.length} items...`, "progress", "delete");
    }

    const resourceInfo = findResourceIdForDelete(task, context);

    if (!resourceInfo) {
      preparedTasks.push({
        task,
        deleteUrl: null,
        apiVersion: "beta",
        skipReason: "Resource not found in tenant",
      });
      continue;
    }

    if (!resourceInfo.hasMarker) {
      preparedTasks.push({
        task,
        deleteUrl: null,
        apiVersion: "beta",
        skipReason: "Missing hydration marker - not created by this tool",
      });
      continue;
    }

    // Check for active assignments - skip deletion if policy is assigned
    const assignmentCount = await checkResourceAssignments(
      context,
      task.category,
      resourceInfo.id,
      resourceInfo.endpointType
    );
    if (assignmentCount > 0) {
      preparedTasks.push({
        task,
        deleteUrl: null,
        apiVersion: "beta",
        skipReason: `Policy has ${assignmentCount} active assignment(s) - remove assignments before deleting`,
      });
      continue;
    }

    // Build delete URL based on category and endpoint type
    const deleteUrl = buildDeleteUrl(task, resourceInfo);
    // Groups use v1.0 API, everything else uses beta
    const apiVersion: "v1.0" | "beta" = task.category === "groups" ? "v1.0" : "beta";
    preparedTasks.push({ task, deleteUrl, apiVersion });
  }

  // Count by type
  const toDelete = preparedTasks.filter((p) => p.deleteUrl);
  const toSkip = preparedTasks.filter((p) => !p.deleteUrl);

  console.log(`[FastDelete] ${toDelete.length} to delete, ${toSkip.length} to skip`);
  emitStatus(context, `Deleting ${toDelete.length} items (${toSkip.length} skipped)...`, "info", "delete");

  // Process skipped tasks immediately
  const skipTime = new Date();
  for (const { task, skipReason } of toSkip) {
    task.status = "skipped";
    task.error = skipReason;
    task.startTime = skipTime;
    task.endTime = skipTime;
    results.push({ task, success: false, skipped: true, error: skipReason });
    context.onTaskComplete?.(task);
  }

  // Process deletions in parallel batches
  for (let i = 0; i < toDelete.length; i += parallelRequests) {
    // Check for cancellation
    if (context.shouldCancel?.()) {
      console.log(`[FastDelete] Execution cancelled`);
      for (let j = i; j < toDelete.length; j++) {
        const { task } = toDelete[j];
        task.status = "skipped";
        task.error = "Cancelled";
        task.endTime = new Date();
        results.push({ task, success: false, skipped: true, error: "Cancelled" });
        context.onTaskComplete?.(task);
      }
      break;
    }

    const batch = toDelete.slice(i, i + parallelRequests);
    const batchNum = Math.floor(i / parallelRequests) + 1;
    const totalBatches = Math.ceil(toDelete.length / parallelRequests);

    console.log(`[FastDelete] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)`);

    // Execute all deletes in this batch concurrently with retry logic
    const batchResults = await Promise.all(
      batch.map(async ({ task, deleteUrl, apiVersion }) => {
        task.status = "running";
        task.startTime = new Date();
        context.onTaskStart?.(task);

        // Retry logic for transient 400 errors
        const maxRetries = 3;
        let lastError: string | undefined;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            // Preview mode: skip actual API call and cache updates
            if (!context.isPreview) {
              await context.client.delete(deleteUrl!, apiVersion);
              updateCacheAfterDelete(task, context);
            }

            task.status = "success";
            task.endTime = new Date();
            context.onTaskComplete?.(task);

            return { task, success: true, skipped: false };
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);

            // Check if it's a ResourceNotFound error - this means success (resource is gone)
            const isResourceNotFound = lastError.toLowerCase().includes("resourcenotfound");
            if (isResourceNotFound) {
              console.log(`[FastDelete] "${task.itemName}" - ResourceNotFound, treating as success`);
              task.status = "success";
              task.endTime = new Date();
              updateCacheAfterDelete(task, context);
              context.onTaskComplete?.(task);
              return { task, success: true, skipped: false };
            }

            // Check if it's a 429 (throttled) or 400 error (transient backend issue) but NOT ResourceNotFound
            const is429Error = lastError.includes("[429]") || lastError.includes("TooManyRequests");
            const is400Error = lastError.includes("[400]") || lastError.includes("400");
            const isRetryable = (is429Error || is400Error) && attempt < maxRetries - 1;

            if (isRetryable) {
              const retryDelay = is429Error
                ? (attempt + 1) * 3000  // 3s, 6s, 9s for throttling
                : (attempt + 1) * 500;  // 500ms, 1000ms, 1500ms for transient
              console.log(`[FastDelete] Retry ${attempt + 1}/${maxRetries} for "${task.itemName}" in ${retryDelay}ms (${is429Error ? "throttled" : "transient"})`);
              await sleep(retryDelay);
              continue;
            }

            // Final failure
            task.status = "failed";
            task.error = lastError;
            task.endTime = new Date();
            context.onTaskError?.(task, error instanceof Error ? error : new Error(lastError));

            return { task, success: false, skipped: false, error: lastError };
          }
        }

        // Shouldn't reach here, but handle just in case
        task.status = "failed";
        task.error = lastError || "Unknown error after retries";
        task.endTime = new Date();
        return { task, success: false, skipped: false, error: task.error };
      })
    );

    results.push(...batchResults);

    // Check if any results in this batch had throttling errors — add extra cooldown
    const hadThrottling = batchResults.some(
      (r) => r.error?.includes("[429]") || r.error?.includes("TooManyRequests")
    );

    // Update progress
    context.onBatchProgress?.({
      isActive: true,
      currentBatch: batchNum,
      totalBatches: totalBatches,
      itemsInBatch: batch.length,
      apiVersion: "beta",
    });

    // Delay between batches (except for last batch); extra cooldown after throttling
    if (i + parallelRequests < toDelete.length) {
      const batchDelay = hadThrottling ? 5000 : delayBetweenBatches;
      if (hadThrottling) {
        console.log(`[FastDelete] Throttling detected — cooling down for ${batchDelay}ms before next batch`);
      }
      await sleep(batchDelay);
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success && !r.skipped).length;
  const skipCount = results.filter((r) => r.skipped).length;

  console.log(`[FastDelete] Complete: ${successCount} deleted, ${failCount} failed, ${skipCount} skipped`);
  emitStatus(
    context,
    `Deletion complete: ${successCount} deleted, ${failCount} failed, ${skipCount} skipped`,
    failCount > 0 ? "warning" : "success",
    "delete"
  );

  return results;
}

/**
 * Build the delete URL for a task
 */
function buildDeleteUrl(
  task: HydrationTask,
  resourceInfo: { id: string; endpointType?: string }
): string {
  switch (task.category) {
    case "groups":
      return `/groups/${resourceInfo.id}`;

    case "filters":
      return `/deviceManagement/assignmentFilters/${resourceInfo.id}`;

    case "compliance":
      return `/deviceManagement/deviceCompliancePolicies/${resourceInfo.id}`;

    case "conditionalAccess":
      return `/identity/conditionalAccess/policies/${resourceInfo.id}`;

    case "appProtection":
      // App protection policies have different endpoints based on platform
      // This is handled separately in sequential execution
      return `/deviceAppManagement/managedAppPolicies/${resourceInfo.id}`;

    case "enrollment":
      return `/deviceManagement/windowsAutopilotDeploymentProfiles/${resourceInfo.id}`;

    case "baseline":
    case "cisBaseline":
      // Use the endpoint type to determine the correct URL
      switch (resourceInfo.endpointType) {
        case "settingsCatalog":
          return `/deviceManagement/configurationPolicies/${resourceInfo.id}`;
        case "v2Compliance":
          return `/deviceManagement/compliancePolicies/${resourceInfo.id}`;
        case "v1Compliance":
          return `/deviceManagement/deviceCompliancePolicies/${resourceInfo.id}`;
        case "deviceConfiguration":
          return `/deviceManagement/deviceConfigurations/${resourceInfo.id}`;
        case "driverUpdate":
          return `/deviceManagement/windowsDriverUpdateProfiles/${resourceInfo.id}`;
        default:
          // Default to Settings Catalog
          return `/deviceManagement/configurationPolicies/${resourceInfo.id}`;
      }

    default:
      return `/deviceManagement/configurationPolicies/${resourceInfo.id}`;
  }
}
