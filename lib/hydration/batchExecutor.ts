/**
 * Batch Executor for Hydration Tasks
 * Executes CREATE operations using Microsoft Graph $batch endpoint
 */

import {
  BatchRequest,
  BatchResponse,
  chunkArray,
  processBatchResponses,
  extractBatchError,
  isBatchResponseSuccess,
  isBatchResponseConflict,
  getRetryAfterFromBatchResponse,
} from "@/lib/graph/batch";
import type { ApiVersion } from "@/lib/graph/batch";
import { getBatchConfig } from "@/lib/config/batchConfig";
import { HydrationTask, BatchProgress } from "@/types/hydration";
import {
  ExecutionContext,
  ExecutionResult,
  detectCISPolicyType,
  cleanSettingsCatalogPolicy,
  cleanPolicyRecursively,
  CISPolicyType,
} from "./engine";
import { addHydrationMarker, hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import {
  getCachedTemplates,
  getAllTemplateCacheKeys,
  GroupTemplate,
  FilterTemplate,
  ComplianceTemplate,
  ConditionalAccessTemplate,
  CISBaselinePolicy,
  BaselinePolicy,
} from "@/lib/templates/loader";
import * as Templates from "@/templates";
import { DeviceGroup, DeviceFilter } from "@/types/graph";

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
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        "/deviceManagement/deviceCompliancePolicies"
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

  // Check if already exists in cache
  console.log(`[BatchExecutor:groups] Checking existence in ${context.cachedIntuneGroups?.length || 0} cached groups`);
  const existingGroup = context.cachedIntuneGroups?.find(
    (g) => g.displayName.toLowerCase() === template!.displayName.toLowerCase()
  );
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
 * Build request body for a compliance task
 */
function buildComplianceRequestBody(task: HydrationTask, context: ExecutionContext): BuildBodyResult {
  const cachedPolicies = getCachedTemplates("compliance");
  let template: ComplianceTemplate | undefined;

  if (cachedPolicies && Array.isArray(cachedPolicies)) {
    template = (cachedPolicies as ComplianceTemplate[]).find((p) => p.displayName === task.itemName);
  }

  if (!template) {
    template = Templates.getCompliancePolicyByName(task.itemName);
  }

  if (!template) return { type: "error", reason: "Template not found" };

  // Check if already exists in cache (prevent duplicates)
  const existingPolicy = context.cachedCompliancePolicies?.find(
    (p) => p.displayName?.toLowerCase() === template!.displayName.toLowerCase()
  );
  if (existingPolicy) {
    return { type: "skip", reason: "Compliance policy already exists" };
  }

  return {
    type: "body",
    body: {
      ...template,
      description: addHydrationMarker(template.description),
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

/**
 * Build request body for a baseline task (OpenIntuneBaseline)
 * Returns null if template not found, already exists, or requires sequential execution
 */
function buildBaselineRequestBody(
  task: HydrationTask,
  context: ExecutionContext
): BaselineRequestResult | null {
  const cachedPolicies = getCachedTemplates("baseline");
  let template: BaselinePolicy | undefined;

  if (cachedPolicies && Array.isArray(cachedPolicies)) {
    template = (cachedPolicies as BaselinePolicy[]).find(
      (p) => (p.name || p.displayName) === task.itemName
    );
  }

  if (!template) return null;

  const policyName = (template.name || template.displayName) as string;
  const policyType = detectCISPolicyType(template as Record<string, unknown>);

  // Only batch SettingsCatalog, DeviceConfiguration, and V2Compliance
  // Other types require special handling
  if (policyType === "Unsupported" || policyType === "SecurityIntent" || policyType === "V1Compliance") {
    return null;
  }

  // Check if already exists in cache
  if (policyType === "SettingsCatalog" || policyType === "V2Compliance") {
    const existingPolicy = context.cachedSettingsCatalogPolicies?.find(
      (p) => p.name?.toLowerCase() === policyName.toLowerCase()
    );
    if (existingPolicy) return null; // Skip - already exists
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
 * Build request body for a CIS baseline task
 * Returns null if template not found, already exists, or requires sequential execution
 */
function buildCISBaselineRequestBody(
  task: HydrationTask,
  context: ExecutionContext
): BaselineRequestResult | null {
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

  // Check if already exists in cache
  if (policyType === "SettingsCatalog" || policyType === "V2Compliance") {
    const existingPolicy = context.cachedSettingsCatalogPolicies?.find(
      (p) => p.name?.toLowerCase() === policyName.toLowerCase()
    );
    if (existingPolicy) return null; // Skip - already exists
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
function prepareTaskForBatch(
  task: HydrationTask,
  context: ExecutionContext,
  requestId: string
): BatchPrepareResult {
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
      const result = buildConditionalAccessRequestBody(task);
      if (result.type === "skip") return { type: "skip", reason: result.reason };
      if (result.type === "error") return { type: "sequential" };
      body = result.body;
      endpoint = CATEGORY_ENDPOINTS.conditionalAccess;
      apiVersion = "v1.0";
      break;
    }

    case "baseline": {
      const baselineResult = buildBaselineRequestBody(task, context);
      if (!baselineResult) return { type: "sequential" };
      body = baselineResult.body;
      endpoint = baselineResult.endpoint;
      break;
    }

    case "cisBaseline": {
      console.log(`[BatchExecutor] Preparing CIS task: "${task.itemName}"`);
      const cisResult = buildCISBaselineRequestBody(task, context);
      if (!cisResult) {
        console.log(`[BatchExecutor] CIS task "${task.itemName}" could not be prepared for batch`);
        return { type: "sequential" };
      }
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

  console.log(`[BatchExecutor] Preparing ${tasks.length} tasks for batch execution (batch size: ${config.defaultBatchSize})`);
  console.log(`[BatchExecutor] Task categories:`, tasks.map(t => t.category).reduce((acc, cat) => {
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>));

  // Separate tasks into: batchable, skipped, or needs sequential
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    console.log(`[BatchExecutor] Preparing task ${i + 1}/${tasks.length}: "${task.itemName}" (${task.category})`);
    const prepared = prepareTaskForBatch(task, context, `req-${i}`);

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
  const chunks = chunkArray(preparedTasks, config.defaultBatchSize);
  const maxRetries = 3;

  console.log(`[BatchExecutor] Processing ${chunks.length} batch(es) of ${version} requests`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Check for cancellation
    if (context.shouldCancel?.()) {
      console.log(`[BatchExecutor] Execution cancelled`);
      for (const { task } of chunk) {
        task.status = "skipped";
        task.error = "Cancelled";  // Set skip reason on task object for UI display
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
      totalBatches: chunks.length,
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

    console.log(`[BatchExecutor] Executing batch ${i + 1}/${chunks.length} with ${chunk.length} requests`);

    // Retry logic for entire batch
    let retryCount = 0;
    let batchSuccess = false;

    while (!batchSuccess && retryCount < maxRetries) {
      try {
        const batchResult = await context.client.batch(
          chunk.map((t) => t.request),
          version
        );

        // Process responses
        const processed = processBatchResponses(batchResult);

        // Map responses back to tasks
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
            // The Graph API often returns 504 but the policy was actually created
            const verifiedId = await verifyCompliancePolicyCreated(task.itemName, context);

            if (verifiedId) {
              // Policy was actually created despite 504 - mark as success
              task.status = "success";
              task.endTime = new Date();
              results.push({ task, success: true, skipped: false, createdId: verifiedId });
              context.onTaskComplete?.(task);
            } else {
              // Policy was not created - mark as failed
              const error = extractBatchError(response);
              task.status = "failed";
              task.error = `${error.message} (verified not created)`;
              task.endTime = new Date();
              results.push({ task, success: false, skipped: false, error: task.error });
              context.onTaskError?.(task, new Error(task.error));
            }
          } else {
            const error = extractBatchError(response);
            task.status = "failed";
            task.error = error.message;
            task.endTime = new Date();
            results.push({ task, success: false, skipped: false, error: error.message });
            context.onTaskError?.(task, new Error(error.message));
          }
        }

        // Handle retryable failures within the batch
        if (processed.retryable.length > 0) {
          console.log(`[BatchExecutor] ${processed.retryable.length} requests need retry`);
          const retryDelay = getRetryAfterFromBatchResponse(processed.retryable[0].headers) || 2000;
          await sleep(retryDelay);
        }

        batchSuccess = true;
      } catch (error) {
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[BatchExecutor] Batch ${i + 1} failed (attempt ${retryCount}/${maxRetries}):`, errorMessage);

        if (retryCount < maxRetries) {
          const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`[BatchExecutor] Retrying in ${retryDelay}ms...`);
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

    // Delay between batches (except for last batch)
    if (i < chunks.length - 1) {
      console.log(`[BatchExecutor] Waiting ${config.delayBetweenBatches}ms before next batch`);
      await sleep(config.delayBetweenBatches);
    }
  }

  return results;
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
 * Find resource ID for deletion by name
 * For Settings Catalog policies, the task.itemName may be from displayName in the template,
 * but the policy was created with 'name' field. We search by name match.
 */
function findResourceIdForDelete(
  task: HydrationTask,
  context: ExecutionContext
): { id: string; hasMarker: boolean } | null {
  const nameToFind = task.itemName.toLowerCase();

  switch (task.category) {
    case "groups": {
      const group = context.cachedIntuneGroups?.find(
        (g) => g.displayName.toLowerCase() === nameToFind
      );
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
      // Settings Catalog policies use 'name' field internally, but task.itemName may be
      // from template's displayName. Search by exact match first, then case-insensitive.
      // The policy was created with 'name: template.name || template.displayName', so
      // we need to match against the name field.
      let policy = context.cachedSettingsCatalogPolicies?.find(
        (p) => p.name?.toLowerCase() === nameToFind
      );

      // If not found by exact name match, the policy might have been created with a slightly
      // different name format. Log available policies for debugging.
      if (!policy) {
        console.log(`[BatchExecutor:DELETE] Policy "${task.itemName}" not found by exact name match.`);
        console.log(`[BatchExecutor:DELETE] Searching ${context.cachedSettingsCatalogPolicies?.length || 0} cached Settings Catalog policies...`);

        // Try partial match (contains) as a fallback - some policies may have extra prefixes/suffixes
        policy = context.cachedSettingsCatalogPolicies?.find(
          (p) => p.name?.toLowerCase().includes(nameToFind) || nameToFind.includes(p.name?.toLowerCase() || "")
        );

        if (policy) {
          console.log(`[BatchExecutor:DELETE] Found partial match: "${policy.name}" for "${task.itemName}"`);
        }
      }

      if (policy?.id) {
        const hasMarker = hasHydrationMarker(policy.description);
        console.log(`[BatchExecutor:DELETE] Found policy "${policy.name}" (ID: ${policy.id}), hasMarker: ${hasMarker}`);
        return { id: policy.id, hasMarker };
      }

      console.log(`[BatchExecutor:DELETE] Policy "${task.itemName}" not found in ${context.cachedSettingsCatalogPolicies?.length || 0} cached Settings Catalog policies`);
      return null;
    }

    case "compliance": {
      const compliance = context.cachedCompliancePolicies?.find(
        (c) => c.displayName?.toLowerCase() === nameToFind
      );
      if (compliance?.id) {
        return { id: compliance.id, hasMarker: hasHydrationMarker(compliance.description) };
      }
      return null;
    }

    case "conditionalAccess": {
      // CA policies have the marker in displayName (not description) since CA policies don't support descriptions
      // The marker format is "[Intune Hydration Kit]" appended to displayName (matches CREATE path)
      // Search for policy with the marker suffix in displayName
      const markerSuffix = "[Intune Hydration Kit]";
      const searchNameWithMarker = `${nameToFind} ${markerSuffix}`.toLowerCase();

      const ca = context.cachedConditionalAccessPolicies?.find(
        (c) => c.displayName?.toLowerCase() === searchNameWithMarker || c.displayName?.toLowerCase() === nameToFind
      );
      if (ca?.id) {
        // For CA policies, marker is in displayName, check for either marker format
        const hasMarker = ca.displayName?.includes("[Intune Hydration Kit]") ||
                          ca.displayName?.includes("[Imported by Intune Hydration Kit]");
        return { id: ca.id, hasMarker: hasMarker ?? false };
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Get the endpoint for a DELETE request
 */
function getDeleteEndpoint(category: string, resourceId: string): string {
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
      return `/deviceManagement/configurationPolicies/${resourceId}`;
    default:
      throw new Error(`Unknown category for delete: ${category}`);
  }
}

/**
 * Prepare a task for batch DELETE execution
 */
function prepareTaskForDeleteBatch(
  task: HydrationTask,
  context: ExecutionContext,
  requestId: string
): DeletePrepareResult {
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

  // Determine API version
  const apiVersion: ApiVersion = task.category === "groups" ? "v1.0" : "beta";

  // Build DELETE request
  const endpoint = getDeleteEndpoint(task.category, resource.id);

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
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const prepared = prepareTaskForDeleteBatch(task, context, `del-${i}`);

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
      if (context.cachedSettingsCatalogPolicies) {
        const index = context.cachedSettingsCatalogPolicies.findIndex(
          (p) => p.name.toLowerCase() === nameToRemove
        );
        if (index !== -1) {
          context.cachedSettingsCatalogPolicies.splice(index, 1);
        }
      }
      break;
  }
}
