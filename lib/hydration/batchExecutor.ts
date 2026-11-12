/* oxlint-disable react-doctor/async-await-in-loop -- batch execution loops preserve retry, pause, cancellation, and cooldown semantics. */
/**
 * Batch Executor for Hydration Tasks
 * Executes CREATE operations using Microsoft Graph $batch endpoint
 */

import {
  BatchRequest,
  BatchResponse,
  BatchResult,
  extractBatchError,
  isBatchResponseSuccess,
  isBatchResponseConflict,
  isBatchResponseOutcomeUnknown,
  isBatchResponseRetryable,
  getRetryAfterFromBatchResponse,
} from "@/lib/graph/batch";
import type { ApiVersion } from "@/lib/graph/batch";
import { FoundObject, OUTCOME_UNKNOWN_NOT_FOUND, OUTCOME_UNKNOWN_UNVERIFIED, addErrorNote } from "@/lib/graph/client";
import {
  MAX_RETRIES,
  getErrorRetryAfterMs,
  getRetryDelayMs,
  isOutcomeUnknownError,
  isRunCancelledError,
} from "@/lib/utils/retry";
import { getBatchConfig } from "@/lib/config/batchConfig";
import { HydrationTask, BatchProgress } from "@/types/hydration";
import { ExecutionContext, ExecutionResult, CISPolicyType, ActivityMessage, TenantCacheKey } from "./types";
import { DeleteTarget, deleteResolutionResult, resolveDeleteTarget, sendDeleteRequest } from "./deleteResolver";
import { detectCISPolicyType } from "./policyDetection";
import { cleanSettingsCatalogPolicy, cleanPolicyRecursively } from "./cleaners";
import { findBaselineMatch, recordBaselineMatch } from "./baselineEvidence";
import { resolveOIBOrganizationId } from "./templatePlaceholders";
import {
  sleepWithExecutionControl,
  waitWhilePaused,
  normalizeName,
  findByNamePrecedence,
  findBaselineTemplate,
  findCISBaselineTemplate,
  getLicenseSkipReason,
  getOIBPolicyType,
} from "./utils";
import { addHydrationMarker } from "@/lib/utils/hydrationMarker";
import {
  buildCISGroupPolicyConfigurationPayload,
  buildCISSecurityIntentPayload,
} from "./policyCreators";
import {
  getCachedTemplates,
  GroupTemplate,
  FilterTemplate,
  ConditionalAccessTemplate,
} from "@/lib/templates/loader";
import {
  CONDITIONAL_ACCESS_POLICIES_ENDPOINT,
  buildConditionalAccessCreatePlan,
  findHydrationConditionalAccessPolicy,
} from "@/lib/graph/conditionalAccess";
import {
  getPrivatePreviewFeatureName,
  getPrivatePreviewSkipReason,
  logConditionalAccessBatchRequestFailureDiagnostics,
  logConditionalAccessCreateFailureDiagnostics,
  shouldLogConditionalAccessCreateFailure,
} from "./conditionalAccessBatch";
import { DeviceGroup, DeviceFilter } from "@/types/graph";
import { markTaskSkipped } from "./taskTransitions";
import { recordCreatedObject } from "./createdObject";
import { getTaskCategoryLabel } from "./categoryLabels";

function markPreparedTasksCancelled(
  items: Array<{ task: HydrationTask }>,
  results: ExecutionResult[],
  context: ExecutionContext
): void {
  const cancelledAt = new Date();

  for (const { task } of items) {
    if (task.status !== "pending" && task.status !== "running") continue;
    task.startTime ??= cancelledAt;
    task.endTime = cancelledAt;
    markTaskSkipped(task, "cancelled", "Cancelled");
    results.push({ task, success: false, skipped: true, skipKind: "cancelled", error: "Cancelled" });
    context.onTaskComplete?.(task);
  }
}

function markPendingTasksCancelled(
  tasks: HydrationTask[],
  results: ExecutionResult[],
  context: ExecutionContext
): void {
  const pendingTasks: Array<{ task: HydrationTask }> = [];
  for (const task of tasks) {
    if (task.status === "pending") pendingTasks.push({ task });
  }
  markPreparedTasksCancelled(pendingTasks, results, context);
}

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
  | { type: "skip"; reason: string; skipKind: "noOp" | "blocked" }
  | { type: "sequential" };

/**
 * Endpoint mapping for each task category
 */
const CATEGORY_ENDPOINTS: Record<string, string> = {
  groups: "/groups",
  filters: "/deviceManagement/assignmentFilters",
  compliance: "/deviceManagement/deviceCompliancePolicies",
  conditionalAccess: CONDITIONAL_ACCESS_POLICIES_ENDPOINT,
  appProtection_ios: "/deviceAppManagement/iosManagedAppProtections",
  appProtection_android: "/deviceAppManagement/androidManagedAppProtections",
  enrollment_autopilot: "/deviceManagement/windowsAutopilotDeploymentProfiles",
  enrollment_esp: "/deviceManagement/deviceEnrollmentConfigurations",
  settingsCatalog: "/deviceManagement/configurationPolicies",
  deviceConfiguration: "/deviceManagement/deviceConfigurations",
  groupPolicyConfiguration: "/deviceManagement/groupPolicyConfigurations",
  securityIntent: "/deviceManagement/intents",
  driverUpdate: "/deviceManagement/windowsDriverUpdateProfiles",
  v2Compliance: "/deviceManagement/compliancePolicies",
};


/**
 * Build result type for request body builders
 */
type BuildBodyResult =
  | { type: "body"; body: Record<string, unknown>; apiVersion?: ApiVersion; endpoint?: string }
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
    console.log(`[BatchExecutor:groups] ✗ No template found for "${task.itemName}"`);
    return { type: "error", reason: "Template not found" };
  }

  // Check if already exists in cache - match with or without [IHD] prefix.
  // Without a loaded cache, the sequential executor fails the task with the prefetch error.
  if (!context.cachedIntuneGroups) return { type: "error", reason: "Group cache is not loaded" };
  console.log(`[BatchExecutor:groups] Checking existence in ${context.cachedIntuneGroups.length} cached groups`);
  const templateName = template!.displayName.toLowerCase();
  const templateNameStripped = templateName.startsWith("[ihd] ") ? templateName.slice(6) : templateName;
  const existingGroup = context.cachedIntuneGroups.find((g) => {
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

  if (!template) return { type: "error", reason: "Template not found" };

  // Check if already exists in cache.
  // Without a loaded cache, the sequential executor fails the task with the prefetch error.
  if (!context.cachedFilters) return { type: "error", reason: "Filter cache is not loaded" };
  const existingFilter = context.cachedFilters.find(
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

  if (!template) return { type: "error", reason: "Template not found" };

  // CA policies must be created in disabled state
  const plan = buildConditionalAccessCreatePlan(template as Record<string, unknown>);
  return {
    type: "body",
    body: plan.payload,
    endpoint: plan.endpoint,
    apiVersion: plan.apiVersion,
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
  let template = findBaselineTemplate(task, context);
  if (!template) {
    console.log(`[BatchExecutor:baseline] ✗ No template found for "${task.itemName}"`);
    return null;
  }

  template = resolveOIBOrganizationId(template, context.tenantId);

  const policyName = (template.name || template.displayName) as string;

  // Use _oibPolicyType from the manifest, fall back to detection for unknown folders
  const policyType = getOIBPolicyType(template) ?? detectCISPolicyType(template as Record<string, unknown>);
  console.log(`[BatchExecutor] OIB policy "${policyName}" type: ${template._oibPolicyType || "(none)"} -> ${policyType}`);

  // Only batch SettingsCatalog, DeviceConfiguration, GroupPolicyConfiguration,
  // DriverUpdateProfiles, and V2Compliance.
  // App Protection baselines need the dedicated sequential create path.
  if (
    policyType === "Unsupported" ||
    policyType === "V1Compliance" ||
    policyType === "AppProtection"
  ) {
    console.log(`[BatchExecutor] Skipping "${policyName}" - unsupported type for batching: ${policyType}`);
    return null;
  }

  // Check if policy already exists in the prefetched tenant cache
  const exists = await policyExistsInCache(policyType as PolicyExistsPolicyType, policyName, context, "[BatchExecutor]", { task, template });
  if (exists === undefined) return null;
  if (exists) {
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

    case "GroupPolicyConfiguration":
      body = buildCISGroupPolicyConfigurationPayload(template as Record<string, unknown>);
      endpoint = CATEGORY_ENDPOINTS.groupPolicyConfiguration;
      break;

    case "SecurityIntent":
      body = buildCISSecurityIntentPayload(template as Record<string, unknown>);
      endpoint = CATEGORY_ENDPOINTS.securityIntent;
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
  const template = findCISBaselineTemplate(task);
  if (!template) {
    console.log(`[BatchExecutor] No template found for CIS task: "${task.templatePath || task.itemName}"`);
    return null;
  }

  const policyName = (template.name || template.displayName) as string;
  const policyType = detectCISPolicyType(template as Record<string, unknown>);

  // Only batch SettingsCatalog, DeviceConfiguration, GroupPolicyConfiguration,
  // SecurityIntent, and V2Compliance
  if (policyType === "Unsupported" || policyType === "V1Compliance") {
    return null;
  }

  // Check if policy already exists in the prefetched tenant cache
  const exists = await policyExistsInCache(policyType as PolicyExistsPolicyType, policyName, context, "[BatchExecutor] CIS");
  if (exists === undefined) return null;
  if (exists) {
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

    case "GroupPolicyConfiguration":
      body = buildCISGroupPolicyConfigurationPayload(template as Record<string, unknown>);
      endpoint = CATEGORY_ENDPOINTS.groupPolicyConfiguration;
      break;

    case "SecurityIntent":
      body = buildCISSecurityIntentPayload(template as Record<string, unknown>);
      endpoint = CATEGORY_ENDPOINTS.securityIntent;
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

  const licenseSkipReason = getLicenseSkipReason(task, context);
  if (licenseSkipReason) {
    return { type: "skip", reason: licenseSkipReason, skipKind: "blocked" };
  }

  switch (task.category) {
    case "groups": {
      const result = buildGroupRequestBody(task, context);
      if (result.type === "skip") return { type: "skip", reason: result.reason, skipKind: "noOp" };
      if (result.type === "error") return { type: "sequential" };
      body = result.body;
      endpoint = CATEGORY_ENDPOINTS.groups;
      apiVersion = "v1.0";
      break;
    }

    case "filters": {
      const result = buildFilterRequestBody(task, context);
      if (result.type === "skip") return { type: "skip", reason: result.reason, skipKind: "noOp" };
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
      // Check if policy already exists in the prefetched tenant cache
      const exists = await policyExistsInCache("ConditionalAccess", task.itemName, context);
      if (exists === undefined) return { type: "sequential" };
      if (exists) {
        return { type: "skip", reason: "Already exists", skipKind: "noOp" };
      }

      const result = buildConditionalAccessRequestBody(task);
      if (result.type === "skip") return { type: "skip", reason: result.reason, skipKind: "blocked" };
      if (result.type === "error") return { type: "sequential" };
      body = result.body;
      endpoint = result.endpoint || CATEGORY_ENDPOINTS.conditionalAccess;
      apiVersion = result.apiVersion || "v1.0";
      break;
    }

    case "baseline": {
      const baselineResult = await buildBaselineRequestBody(task, context);
      if (!baselineResult) return { type: "sequential" };
      if ("skip" in baselineResult) return { type: "skip", reason: baselineResult.reason, skipKind: "noOp" };
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
      if ("skip" in cisResult) return { type: "skip", reason: cisResult.reason, skipKind: "noOp" };
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
  const skippedTasks: { task: HydrationTask; reason: string; skipKind: "noOp" | "blocked" }[] = [];

  // Build a category summary for logging
  const categoryCounts = tasks.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  emitStatus(context, `Preparing ${tasks.length} items for batch creation...`, "progress", "create");
  console.log(`[BatchExecutor] Preparing ${tasks.length} tasks for batch execution (batch size: ${config.defaultBatchSize})`);
  console.log(`[BatchExecutor] Task categories:`, categoryCounts);
  console.log(`[BatchExecutor] Context cache: baselineTemplates=${context.cachedBaselineTemplates?.length ?? 'not set'}`);

  // Separate tasks into: batchable, skipped, or needs sequential
  let currentCategory = "";
  let categoryProcessed = 0;
  let categoryTotal = 0;

  for (let i = 0; i < tasks.length; i++) {
    if ((await waitWhilePaused(context)) === "cancelled") {
      markPendingTasksCancelled(tasks, results, context);
      return results;
    }
    const task = tasks[i];

    // Emit progress when entering a new category
    if (task.category !== currentCategory) {
      currentCategory = task.category;
      categoryTotal = categoryCounts[currentCategory] || 0;
      categoryProcessed = 0;
      const friendlyName = getTaskCategoryLabel(currentCategory);
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
      const friendlyName = getTaskCategoryLabel(currentCategory);
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
        skippedTasks.push({ task, reason: prepared.reason, skipKind: prepared.skipKind });
        break;
      case "sequential":
        console.log(`[BatchExecutor] ✗ Task needs sequential: "${task.itemName}"`);
        nonBatchableTasks.push(task);
        break;
    }
  }

  // Immediately add skipped tasks to results
  const skipTime = new Date();
  for (const { task, reason, skipKind } of skippedTasks) {
    // Update task status and error reason before notifying
    markTaskSkipped(task, skipKind, reason); // Set skip reason on task object for UI display
    task.startTime = skipTime;
    task.endTime = skipTime;
    results.push({ task, success: false, skipped: true, skipKind, error: reason });
    // Notify completion for skipped tasks
    context.onTaskComplete?.(task);
  }

  console.log(`[BatchExecutor] Summary: ${batchableTasks.length} batched, ${skippedTasks.length} skipped, ${nonBatchableTasks.length} sequential`);
  const skipMsg = skippedTasks.length > 0 ? `, ${skippedTasks.length} duplicates skipped` : "";
  const seqMsg = nonBatchableTasks.length > 0 ? `, ${nonBatchableTasks.length} sequential` : "";
  emitStatus(
    context,
    `Preparation complete - sending ${batchableTasks.length} items${skipMsg}${seqMsg}`,
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

  const initialBatchSize = preparedTasks.reduce(
    (batchSize, preparedTask) => Math.min(
      batchSize,
      config.categoryBatchSizes?.[preparedTask.task.category] ?? config.defaultBatchSize
    ),
    config.defaultBatchSize
  );
  const usesCategoryBatchSize = initialBatchSize < config.defaultBatchSize;

  // Adaptive throttle state - tracks across batches to dynamically adjust delay and size
  let currentBatchDelay = config.delayBetweenBatches;
  let currentBatchSize = initialBatchSize;
  let consecutiveUnthrottledBatches = 0;
  const MIN_BATCH_SIZE = 2;

  // Re-chunk remaining tasks dynamically; start with initial sizing
  let remainingTasks = [...preparedTasks];

  if (usesCategoryBatchSize) {
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
      markPreparedTasksCancelled([...chunk, ...remainingTasks], results, context);
      break;
    }

    // Check for pause
    const pauseResult = await waitWhilePaused(context);
    if (pauseResult === "cancelled") {
      console.log(`[BatchExecutor] Execution cancelled while paused`);
      markPreparedTasksCancelled([...chunk, ...remainingTasks], results, context);
      break;
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

    // Submit this chunk. Only requests that Graph proved it did not process are sent again.
    let currentItems = chunk;
    // The outer $batch request and the requests inside it have separate retry budgets,
    // so throttling of the outer request does not use up the retries of the inner ones.
    let outerRetryCount = 0;
    let retryCount = 0;
    let batchThrottleCount = 0;

    while (currentItems.length > 0) {
      // Preview mode: simulate successful responses without making API calls
      if (context.isPreview) {
        for (const { task } of currentItems) {
          task.status = "success";
          task.endTime = new Date();
          results.push({ task, success: true, skipped: false });
          context.onTaskComplete?.(task);
        }
        currentItems = [];
        break;
      }

      let batchResult: BatchResult;
      try {
        batchResult = await context.client.batch(
          currentItems.map((t) => t.request),
          version
        );
      } catch (error) {
        if (isRunCancelledError(error)) {
          markPreparedTasksCancelled([...currentItems, ...remainingTasks], results, context);
          remainingTasks = [];
          currentItems = [];
          break;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const status = (error as { status?: unknown }).status;

        // A 429 or 503 for the outer request means that Graph processed none of the
        // requests in it, so the whole batch can be sent again.
        const notProcessed = status === 429 || status === 503;
        if (notProcessed) {
          batchThrottleCount += currentItems.length;
          if (outerRetryCount < MAX_RETRIES) {
            const delay = getRetryDelayMs(outerRetryCount, getErrorRetryAfterMs(error));
            outerRetryCount++;
            console.warn(`[BatchExecutor] Batch ${i + 1} request got ${status}; retry ${outerRetryCount}/${MAX_RETRIES} in ${delay}ms`);
            emitStatus(
              context,
              `Graph throttled the batch request (HTTP ${status}). Sending ${currentItems.length} items again in ${Math.ceil(delay / 1000)}s (attempt ${outerRetryCount}/${MAX_RETRIES})...`,
              "warning"
            );
            if ((await sleepWithExecutionControl(delay, context)) === "cancelled") {
              markPreparedTasksCancelled([...currentItems, ...remainingTasks], results, context);
              remainingTasks = [];
              currentItems = [];
              break;
            }
            continue;
          }
        }

        console.error(`[BatchExecutor] Batch ${i + 1} request failed:`, errorMessage);
        logConditionalAccessBatchRequestFailureDiagnostics(currentItems, errorMessage, version);

        if (!notProcessed && isOutcomeUnknownError(error)) {
          // The outcome is unknown (network error, timeout, 5xx). Graph can have created
          // some objects, so read the tenant instead of sending the creates again.
          const outcome = await resolveUnknownCreateOutcomes(
            currentItems.map((item) => ({ item, error })),
            context,
            version,
            results
          );
          if (outcome === "cancelled") {
            markPreparedTasksCancelled(remainingTasks, results, context);
            remainingTasks = [];
          }
        } else {
          // Graph rejected the request, or throttling continued after the retries.
          const message = notProcessed
            ? `${errorMessage} (Graph did not accept the batch request after ${MAX_RETRIES} retries. The items were not created.)`
            : errorMessage;
          for (const item of currentItems) {
            failPreparedTask(item, message, results, context);
          }
        }
        currentItems = [];
        break;
      }

      // Map responses back to tasks
      const responseMap = new Map<string, BatchResponse>();
      for (const response of batchResult.responses) {
        responseMap.set(response.id, response);
      }

      const pendingRetry: PreparedBatchTask[] = [];
      const unknownOutcomes: UnknownCreateOutcome[] = [];
      let retryAfterMs: number | undefined;

      for (const item of currentItems) {
        const { task, request } = item;
        const response = responseMap.get(request.id);

        if (!response) {
          unknownOutcomes.push({ item, error: new Error("No response received") });
          continue;
        }

        if (isBatchResponseSuccess(response.status)) {
          const createdId = (response.body as Record<string, unknown>)?.id as string | undefined;
          task.status = "success";
          task.endTime = new Date();
          recordCreatedObject(task, createdId, context);
          results.push({ task, success: true, skipped: false, createdId });
          context.onTaskComplete?.(task);

          // Update caches
          updateCacheAfterCreate(item, response, context);
        } else if (isBatchResponseConflict(response.status)) {
          markTaskSkipped(task, "noOp", "Already exists"); // Set skip reason on task object for UI display
          task.endTime = new Date();
          results.push({ task, success: false, skipped: true, skipKind: "noOp", error: "Already exists" });
          context.onTaskComplete?.(task);
        } else if (isBatchResponseRetryable(response) && retryCount < MAX_RETRIES) {
          // 429, or 503 with Retry-After: Graph did not process the request
          const headerDelay = getRetryAfterFromBatchResponse(response.headers);
          if (headerDelay !== undefined) {
            retryAfterMs = Math.max(retryAfterMs ?? 0, headerDelay);
          }
          pendingRetry.push(item);
          if (response.status === 429) {
            batchThrottleCount++;
          }
          console.log(`[BatchExecutor] Response ${response.status} for "${task.itemName}" -- queued for retry`);
        } else if (isBatchResponseOutcomeUnknown(response)) {
          // Other 5xx: Graph can have created the object. Read the tenant before any resend.
          const error = extractBatchError(response);
          if (shouldLogConditionalAccessCreateFailure(item, response, error)) {
            logConditionalAccessCreateFailureDiagnostics(item, response, error, version);
          }
          unknownOutcomes.push({ item, error: new Error(error.message) });
        } else {
          const error = extractBatchError(response);
          if (shouldLogConditionalAccessCreateFailure(item, response, error)) {
            logConditionalAccessCreateFailureDiagnostics(item, response, error, version);
          }
          const privatePreviewFeatureName = getPrivatePreviewFeatureName(error);
          if (privatePreviewFeatureName) {
            const skipReason = getPrivatePreviewSkipReason(privatePreviewFeatureName);
            markTaskSkipped(task, "blocked", skipReason);
            task.endTime = new Date();
            results.push({ task, success: false, skipped: true, skipKind: "blocked", error: skipReason });
            context.onTaskComplete?.(task);
            continue;
          }
          failPreparedTask(item, error.message, results, context);
          // Count throttle failures that exhausted retries
          if (response.status === 429 || isThrottleErrorMessage(error.message)) {
            batchThrottleCount++;
          }
        }
      }

      if (unknownOutcomes.length > 0) {
        const outcome = await resolveUnknownCreateOutcomes(unknownOutcomes, context, version, results);
        if (outcome === "cancelled") {
          markPreparedTasksCancelled([...pendingRetry, ...remainingTasks], results, context);
          remainingTasks = [];
          currentItems = [];
          break;
        }
      }

      if (pendingRetry.length > 0) {
        const delay = getRetryDelayMs(retryCount, retryAfterMs);
        retryCount++;
        console.log(`[BatchExecutor] ${pendingRetry.length} responses need retry (attempt ${retryCount}/${MAX_RETRIES}), waiting ${delay}ms`);
        emitStatus(context, `Retrying ${pendingRetry.length} throttled requests (attempt ${retryCount}/${MAX_RETRIES})...`, "warning");
        const waitResult = await sleepWithExecutionControl(delay, context);
        if (waitResult === "cancelled") {
          console.log(`[BatchExecutor] Execution cancelled during retry backoff`);
          markPreparedTasksCancelled([...pendingRetry, ...remainingTasks], results, context);
          remainingTasks = [];
          currentItems = [];
          break;
        }
        currentItems = pendingRetry;
      } else {
        // All items handled, exit the retry loop
        currentItems = [];
      }
    }

    if (context.shouldCancel?.()) {
      markPreparedTasksCancelled(remainingTasks, results, context);
      break;
    }

    // Adaptive throttle: adjust delay and batch size based on 429 counts
    if (batchThrottleCount > 0) {
      consecutiveUnthrottledBatches = 0;
      const throttleRatio = batchThrottleCount / chunk.length;

      // Double the inter-batch delay when any throttling is detected
      currentBatchDelay = Math.min(currentBatchDelay * 2, 30_000);
      console.log(`[BatchExecutor] Throttling detected in batch ${i + 1} - ${batchThrottleCount}/${chunk.length} items throttled, increasing delay to ${currentBatchDelay}ms`);
      emitStatus(context, `Throttling detected - slowing down (delay ${currentBatchDelay}ms)`, "warning");

      // If >50% of items were throttled, also reduce batch size for remaining items
      if (throttleRatio > 0.5 && currentBatchSize > MIN_BATCH_SIZE) {
        currentBatchSize = Math.max(Math.floor(currentBatchSize / 2), MIN_BATCH_SIZE);
        console.log(`[BatchExecutor] >50% throttled - reducing batch size to ${currentBatchSize}`);
        emitStatus(context, `Heavy throttling - reducing batch size to ${currentBatchSize}`, "warning");
      }
    } else {
      consecutiveUnthrottledBatches++;

      // Gradually recover after 2 consecutive unthrottled batches
      if (consecutiveUnthrottledBatches >= 2) {
        if (currentBatchDelay > config.delayBetweenBatches) {
          currentBatchDelay = Math.max(Math.floor(currentBatchDelay / 2), config.delayBetweenBatches);
          console.log(`[BatchExecutor] Throttle recovery - reducing delay to ${currentBatchDelay}ms`);
        }
        if (currentBatchSize < initialBatchSize) {
          currentBatchSize = Math.min(currentBatchSize + Math.floor(initialBatchSize / 4), initialBatchSize);
          console.log(`[BatchExecutor] Throttle recovery - increasing batch size to ${currentBatchSize}`);
        }
      }
    }

    // Delay between batches (except when no remaining tasks)
    if (remainingTasks.length > 0) {
      console.log(`[BatchExecutor] Waiting ${currentBatchDelay}ms before next batch`);
      const waitResult = await sleepWithExecutionControl(currentBatchDelay, context);
      if (waitResult === "cancelled") {
        console.log(`[BatchExecutor] Execution cancelled during inter-batch delay`);
        markPreparedTasksCancelled(remainingTasks, results, context);
        break;
      }
    }

    batchIndex++;
  }

  return results;
}

function failPreparedTask(
  { task }: PreparedBatchTask,
  message: string,
  results: ExecutionResult[],
  context: ExecutionContext
): void {
  task.status = "failed";
  task.error = message;
  task.endTime = new Date();
  results.push({ task, success: false, skipped: false, error: message });
  context.onTaskError?.(task, new Error(message));
}

/** A create request whose outcome is not known, with the error that it got. */
interface UnknownCreateOutcome {
  item: PreparedBatchTask;
  error: unknown;
}

/**
 * Find out which creates with an unknown outcome made an object. The tenant collection
 * of each endpoint is read once, and objects are matched by the name in the request body.
 * A found object is a success with its ID. A create that is not found, or that cannot be
 * verified, fails with an "Outcome unknown" message. Nothing is sent again, so this
 * never makes a second copy of an object.
 */
async function resolveUnknownCreateOutcomes(
  entries: UnknownCreateOutcome[],
  context: ExecutionContext,
  version: ApiVersion,
  results: ExecutionResult[]
): Promise<"completed" | "cancelled"> {
  const byEndpoint = new Map<string, UnknownCreateOutcome[]>();
  for (const entry of entries) {
    const group = byEndpoint.get(entry.item.request.url) ?? [];
    group.push(entry);
    byEndpoint.set(entry.item.request.url, group);
  }

  const groups = [...byEndpoint.entries()];
  for (let index = 0; index < groups.length; index++) {
    const [endpoint, group] = groups[index];
    emitStatus(context, `Checking the tenant for ${group.length} items with an unknown create result...`, "warning", "create");
    let found: Array<FoundObject | undefined> | undefined;
    try {
      found = await context.client.findCreatedObjects(endpoint, group.map(({ item }) => item.request.body), version);
    } catch (readError) {
      if (isRunCancelledError(readError)) {
        markPreparedTasksCancelled(groups.slice(index).flatMap(([, rest]) => rest.map(({ item }) => item)), results, context);
        return "cancelled";
      }
      console.warn(`[BatchExecutor] Could not read ${endpoint} to verify creates:`, readError);
    }

    group.forEach(({ item, error }, entryIndex) => {
      const object = found?.[entryIndex];
      if (object) {
        console.log(`[BatchExecutor] "${item.task.itemName}" was created despite the error (ID: ${object.id})`);
        item.task.status = "success";
        item.task.endTime = new Date();
        recordCreatedObject(item.task, object.id, context);
        results.push({ task: item.task, success: true, skipped: false, createdId: object.id });
        context.onTaskComplete?.(item.task);
        updateCacheAfterCreate(item, { id: item.request.id, status: 201, body: object }, context);
        return;
      }
      const note = found ? OUTCOME_UNKNOWN_NOT_FOUND : OUTCOME_UNKNOWN_UNVERIFIED;
      failPreparedTask(item, addErrorNote(error, note).message, results, context);
    });
  }
  return "completed";
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
 * Update context caches after successful creation.
 * The cache is chosen from the endpoint that created the object.
 */
function updateCacheAfterCreate(
  { task, request }: PreparedBatchTask,
  response: BatchResponse,
  context: ExecutionContext
): void {
  const created = response.body as Record<string, unknown> | undefined;
  const sent = (request.body ?? {}) as Record<string, unknown>;
  const id = created?.id as string | undefined;
  if (!id) return;
  const name = (created?.name ?? sent.name ?? created?.displayName ?? sent.displayName) as string | undefined;
  const displayName = (created?.displayName ?? sent.displayName ?? name) as string | undefined;
  const description = (created?.description ?? sent.description) as string | undefined;

  if (task.category === "groups") {
    context.cachedIntuneGroups?.push(created as unknown as DeviceGroup);
    return;
  }
  if (task.category === "filters") {
    context.cachedFilters?.push(created as unknown as DeviceFilter);
    return;
  }
  if (task.category === "conditionalAccess") {
    context.cachedConditionalAccessPolicies?.push({ id, displayName });
    return;
  }

  switch (request.url) {
    case CATEGORY_ENDPOINTS.compliance:
      context.cachedCompliancePolicies?.push({ id, displayName, description });
      break;
    case CATEGORY_ENDPOINTS.settingsCatalog:
      if (name) context.cachedSettingsCatalogPolicies?.push({ id, name, description });
      break;
    case CATEGORY_ENDPOINTS.v2Compliance:
      if (name) context.cachedV2CompliancePolicies?.push({ id, name, description });
      break;
    case CATEGORY_ENDPOINTS.deviceConfiguration:
      context.cachedDeviceConfigurations?.push({ id, displayName, description });
      break;
    case CATEGORY_ENDPOINTS.driverUpdate:
      if (displayName) context.cachedDriverUpdateProfiles?.push({ id, displayName, description });
      break;
    case CATEGORY_ENDPOINTS.groupPolicyConfiguration:
      context.cachedGroupPolicyConfigurations?.push({ id, displayName, description });
      break;
    case CATEGORY_ENDPOINTS.securityIntent:
      context.cachedSecurityIntents?.push({ id, displayName, description });
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

type PolicyExistsPolicyType =
  | "SettingsCatalog"
  | "V2Compliance"
  | "DeviceConfiguration"
  | "GroupPolicyConfiguration"
  | "SecurityIntent"
  | "DriverUpdateProfiles"
  | "ConditionalAccess";

const POLICY_EXISTS_CACHE_KEYS: Record<PolicyExistsPolicyType, TenantCacheKey> = {
  SettingsCatalog: "cachedSettingsCatalogPolicies",
  V2Compliance: "cachedV2CompliancePolicies",
  DeviceConfiguration: "cachedDeviceConfigurations",
  GroupPolicyConfiguration: "cachedGroupPolicyConfigurations",
  SecurityIntent: "cachedSecurityIntents",
  DriverUpdateProfiles: "cachedDriverUpdateProfiles",
  ConditionalAccess: "cachedConditionalAccessPolicies",
};

/**
 * Check if a policy already exists in the prefetched tenant cache.
 * Cache matching uses exact > normalized precedence (no partial matching)
 * via findByNamePrecedence with allowPartialMatch=false.
 *
 * Returns undefined when the required cache was not loaded. The caller then sends
 * the task to the sequential executor, which fails it with the prefetch error.
 */
async function policyExistsInCache(
  policyType: PolicyExistsPolicyType,
  policyName: string,
  context: ExecutionContext,
  logPrefix = "[BatchExecutor]",
  evidence?: { task: HydrationTask; template: Record<string, unknown> }
): Promise<boolean | undefined> {
  if (!context[POLICY_EXISTS_CACHE_KEYS[policyType]]) {
    console.warn(`${logPrefix} ${policyType} cache is not loaded - "${policyName}" goes to sequential execution`);
    return undefined;
  }

  const lowerName = policyName.toLowerCase();
  const normalizedPolicyName = normalizeName(policyName);
  const byName = <T extends { name?: string; displayName?: string }>(items: T[] | undefined, getName: (item: T) => string | undefined) =>
    findByNamePrecedence(items, lowerName, normalizedPolicyName, getName, false);

  let existing: { id: string; name?: string; displayName?: string } | undefined;
  switch (policyType) {
    case "SettingsCatalog":
      existing = evidence
        ? findBaselineMatch(policyType, policyName, context.cachedSettingsCatalogPolicies)
        : byName(context.cachedSettingsCatalogPolicies, (p) => p.name);
      break;
    case "V2Compliance":
      // V2 policies sometimes appear in the Settings Catalog cache too
      existing =
        byName(context.cachedV2CompliancePolicies, (p) => p.name) ??
        byName(context.cachedSettingsCatalogPolicies, (p) => p.name);
      break;
    case "DeviceConfiguration":
      existing = evidence
        ? findBaselineMatch(policyType, policyName, context.cachedDeviceConfigurations)
        : byName(context.cachedDeviceConfigurations, (p) => p.displayName);
      break;
    case "GroupPolicyConfiguration":
      existing = byName(context.cachedGroupPolicyConfigurations, (p) => p.displayName);
      break;
    case "SecurityIntent":
      existing = byName(context.cachedSecurityIntents, (p) => p.displayName);
      break;
    case "DriverUpdateProfiles":
      existing = evidence
        ? findBaselineMatch(policyType, policyName, context.cachedDriverUpdateProfiles)
        : byName(context.cachedDriverUpdateProfiles, (p) => p.displayName);
      break;
    case "ConditionalAccess":
      // CA policies are created with " [Intune Hydration Kit]" suffix - check
      // both the original and the suffixed name in addition to standard matching
      existing =
        byName(context.cachedConditionalAccessPolicies, (p) => p.displayName) ??
        context.cachedConditionalAccessPolicies?.find((p) => {
          const policyLower = p.displayName?.toLowerCase();
          return (
            policyLower === `${lowerName} [intune hydration kit]` ||
            policyLower === `${lowerName} [imported by intune hydration kit]`
          );
        }) ??
        // A kit policy can carry the other marker format ("[IHD] X" and "X [Imported by ...]").
        (context.cachedConditionalAccessPolicies
          ? (findHydrationConditionalAccessPolicy(context.cachedConditionalAccessPolicies, policyName) ?? undefined)
          : undefined);
      break;
  }

  if (!existing) return false;
  if (evidence) await recordBaselineMatch(evidence.task, evidence.template, existing, policyType, context.client);
  console.log(`${logPrefix} ${policyType} already exists (cache hit), skipping: "${policyName}" (matched: "${existing.name ?? existing.displayName}")`);
  return true;
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
 *
 * Every task is resolved and checked by resolveDeleteTarget, the same function that
 * the sequential executors use, so both paths give the same outcome for a task.
 */
export async function executeDeletesInParallel(
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const { parallelRequests, delayBetweenBatches } = FAST_DELETE_CONFIG;

  console.log(`[FastDelete] Starting parallel deletion of ${tasks.length} tasks (${parallelRequests} concurrent)`);
  emitStatus(context, `Preparing ${tasks.length} items for deletion...`, "progress", "delete");

  // Resolve and check all tasks first
  const toDelete: Array<{ task: HydrationTask; target: DeleteTarget }> = [];
  const notDeleted: ExecutionResult[] = [];

  let checkedCount = 0;
  for (const task of tasks) {
    if ((await waitWhilePaused(context)) === "cancelled") {
      markPendingTasksCancelled(tasks, results, context);
      return results;
    }
    checkedCount++;
    // Emit progress every 10 items or on last item
    if (checkedCount % 10 === 0 || checkedCount === tasks.length) {
      emitStatus(context, `Checking assignments: ${checkedCount}/${tasks.length} items...`, "progress", "delete");
    }

    if (task.category === "conditionalAccess") {
      // Conditional Access deletion must read the policy state again on the sequential path.
      notDeleted.push({
        task,
        success: false,
        skipped: true,
        skipKind: "blocked",
        error: "Conditional Access deletion must use the sequential safety check",
      });
      continue;
    }

    let resolution: Awaited<ReturnType<typeof resolveDeleteTarget>>;
    try {
      resolution = await resolveDeleteTarget(task, context);
    } catch (error) {
      if (!isRunCancelledError(error)) throw error;
      markPendingTasksCancelled(tasks, results, context);
      return results;
    }
    if (context.shouldCancel?.()) {
      markPendingTasksCancelled(tasks, results, context);
      return results;
    }
    if (resolution.action === "delete") {
      toDelete.push({ task, target: resolution.target });
    } else {
      notDeleted.push(deleteResolutionResult(task, resolution, context.isPreview));
    }
  }

  console.log(`[FastDelete] ${toDelete.length} to delete, ${notDeleted.length} not deleted`);
  emitStatus(context, `Deleting ${toDelete.length} items (${notDeleted.length} not deleted)...`, "info", "delete");

  // Record skipped tasks and failed safety checks immediately
  const checkTime = new Date();
  for (const result of notDeleted) {
    const { task } = result;
    task.startTime = checkTime;
    task.endTime = checkTime;
    if (result.skipped) {
      markTaskSkipped(task, result.skipKind, result.error);
      context.onTaskComplete?.(task);
    } else {
      task.status = "failed";
      task.error = result.error;
      context.onTaskError?.(task, new Error(result.error));
    }
    results.push(result);
  }

  // Process deletions in parallel batches
  for (let i = 0; i < toDelete.length; i += parallelRequests) {
    // Check for cancellation
    if (context.shouldCancel?.()) {
      console.log(`[FastDelete] Execution cancelled`);
      markPreparedTasksCancelled(toDelete.slice(i), results, context);
      break;
    }

    const pauseResult = await waitWhilePaused(context);
    if (pauseResult === "cancelled") {
      console.log(`[FastDelete] Execution cancelled while paused`);
      markPreparedTasksCancelled(toDelete.slice(i), results, context);
      break;
    }

    const batch = toDelete.slice(i, i + parallelRequests);
    const batchNum = Math.floor(i / parallelRequests) + 1;
    const totalBatches = Math.ceil(toDelete.length / parallelRequests);

    console.log(`[FastDelete] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)`);

    // Execute all deletes in this batch concurrently with retry logic
    const batchResults = await Promise.all(
      batch.map(async ({ task, target }): Promise<ExecutionResult> => {
        task.status = "running";
        task.startTime = new Date();
        context.onTaskStart?.(task);

        // Preview mode: the checks passed, so the object would be deleted. No API call.
        const outcome = context.isPreview
          ? ({ status: "deleted" } as const)
          : await sendDeleteRequest(task, target, context);

        switch (outcome.status) {
          case "deleted":
            task.status = "success";
            task.endTime = new Date();
            context.onTaskComplete?.(task);
            return { task, success: true, skipped: false };
          case "cancelled":
            markTaskSkipped(task, "cancelled", "Cancelled");
            task.endTime = new Date();
            context.onTaskComplete?.(task);
            return { task, success: false, skipped: true, skipKind: "cancelled", error: "Cancelled" };
          case "failed":
            task.status = "failed";
            task.error = outcome.error.message;
            task.endTime = new Date();
            context.onTaskError?.(task, outcome.error);
            return { task, success: false, skipped: false, error: outcome.error.message };
        }
      })
    );

    results.push(...batchResults);

    // Check if any results in this batch had throttling errors - add extra cooldown
    const hadThrottling = batchResults.some(
      (r) =>
        Boolean(r.error && /\[429\]|TooManyRequests/.test(r.error))
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
        console.log(`[FastDelete] Throttling detected - cooling down for ${batchDelay}ms before next batch`);
      }
      const waitResult = await sleepWithExecutionControl(batchDelay, context);
      if (waitResult === "cancelled") {
        console.log(`[FastDelete] Execution cancelled during inter-batch delay`);
        markPreparedTasksCancelled(toDelete.slice(i + parallelRequests), results, context);
        break;
      }
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
