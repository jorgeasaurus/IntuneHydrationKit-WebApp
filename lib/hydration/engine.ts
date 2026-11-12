/* oxlint-disable react-doctor/async-await-in-loop -- execution loops preserve task order, pause, cancellation, and Graph throttling semantics. */
/**
 * Hydration Execution Engine
 * Manages task queue and executes operations against Microsoft Graph API
 *
 * This is the main orchestrator that:
 * 1. Pre-fetches data caches to avoid repeated API calls
 * 2. Routes tasks to category-specific executors
 * 3. Handles batch vs sequential execution
 * 4. Manages task lifecycle (start, complete, error)
 *
 * Implementation is split across modular files:
 * - ./types.ts - ExecutionContext, ExecutionResult, CISPolicyType
 * - ./utils.ts - sleep, tenant cache access, name matching, utility functions
 * - ./cleaners.ts - Policy cleaning functions
 * - ./policyCreators.ts - Graph API create functions
 * - ./policyDetection.ts - Policy type detection
 * - ./deleteResolver.ts - Delete target resolution and safety checks (all delete paths)
 * - ./taskExecutors/ - Category-specific task executors
 * - ./taskQueue.ts - Task queue building functions
 */

import { HydrationTask, TaskCategory } from "@/types/hydration";
import type { GraphClient } from "@/lib/graph/client";
import { getIntuneGroups } from "@/lib/graph/groups";
import { getAllFilters } from "@/lib/graph/filters";
import { getAllAppProtectionPolicies } from "@/lib/graph/appProtection";
import { getAllNotificationTemplates } from "@/lib/graph/notifications";
import { getCachedTemplates, BaselinePolicy } from "@/lib/templates/loader";
import { getBatchConfig } from "@/lib/config/batchConfig";
import { executeTasksInBatches, executeDeletesInParallel, isBatchableCategory } from "./batchExecutor";
import { getLicenseSkipReason, sleep, sleepWithExecutionControl, waitWhilePaused, TENANT_CACHE_LABELS } from "./utils";
import { ExecutionContext, ExecutionResult, ActivityMessage, TenantCacheKey } from "./types";
import { pauseActiveExecution } from "./executionStateStore";
import { RUN_CANCELLED_MESSAGE, isRunCancelledError } from "@/lib/utils/retry";
import { executeGroupTask } from "./taskExecutors/groupTask";
import { executeFilterTask } from "./taskExecutors/filterTask";
import { executeComplianceTask } from "./taskExecutors/complianceTask";
import { executeConditionalAccessTask } from "./taskExecutors/conditionalAccessTask";
import { executeAppProtectionTask } from "./taskExecutors/appProtectionTask";
import { executeWin32AppTask } from "./taskExecutors/win32AppTask";
import { executeEnrollmentTask } from "./taskExecutors/enrollmentTask";
import { executeNotificationTask } from "./taskExecutors/notificationTask";
import { markTaskSkipped } from "./taskTransitions";
import { executeBaselineTask } from "./taskExecutors/baselineTask";
import { executeCISBaselineTask } from "./taskExecutors/cisBaselineTask";

const TASK_DELAY_MS = 2000;

/**
 * Tenant caches to prefetch, with the task categories that need each cache.
 */
const TENANT_CACHE_PREFETCHES: Array<{
  key: TenantCacheKey;
  categories: TaskCategory[];
  load: (client: GraphClient) => Promise<unknown[]>;
}> = [
  { key: "cachedIntuneGroups", categories: ["groups"], load: getIntuneGroups },
  { key: "cachedFilters", categories: ["filters"], load: getAllFilters },
  // Baseline tasks can include App Protection policies (for example Android/iOS BYOD)
  { key: "cachedAppProtectionPolicies", categories: ["appProtection", "baseline"], load: getAllAppProtectionPolicies },
  {
    key: "cachedConditionalAccessPolicies",
    categories: ["conditionalAccess"],
    load: (client) => client.getCollection("/identity/conditionalAccess/policies?$select=id,displayName,state"),
  },
  { key: "cachedNotificationTemplates", categories: ["notification"], load: getAllNotificationTemplates },
  {
    key: "cachedCompliancePolicies",
    categories: ["compliance", "baseline", "cisBaseline"],
    load: (client) => client.getCollection("/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description"),
  },
  {
    key: "cachedSettingsCatalogPolicies",
    categories: ["baseline", "cisBaseline"],
    load: (client) => client.getCollection("/deviceManagement/configurationPolicies?$select=id,name,description"),
  },
  {
    key: "cachedV2CompliancePolicies",
    categories: ["compliance", "baseline", "cisBaseline"],
    load: (client) => client.getCollection("/deviceManagement/compliancePolicies?$select=id,name,description"),
  },
  {
    key: "cachedDriverUpdateProfiles",
    categories: ["baseline", "cisBaseline"],
    load: (client) => client.getCollection("/deviceManagement/windowsDriverUpdateProfiles?$select=id,displayName,description"),
  },
  {
    key: "cachedDeviceConfigurations",
    categories: ["baseline", "cisBaseline"],
    load: (client) => client.getCollection("/deviceManagement/deviceConfigurations?$select=id,displayName,description"),
  },
  {
    key: "cachedGroupPolicyConfigurations",
    categories: ["baseline", "cisBaseline"],
    load: (client) => client.getCollection("/deviceManagement/groupPolicyConfigurations?$select=id,displayName,description"),
  },
  {
    key: "cachedSecurityIntents",
    categories: ["baseline", "cisBaseline"],
    load: (client) => client.getCollection("/deviceManagement/intents?$select=id,displayName,description"),
  },
];

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
    id: `status-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date(),
    message,
    type,
    category,
  });
}

function markTaskCancelled(
  task: HydrationTask,
  results: ExecutionResult[]
): void {
  const cancelledAt = new Date();
  task.startTime ??= cancelledAt;
  task.endTime = cancelledAt;
  markTaskSkipped(task, "cancelled", "Cancelled by user");
  results.push({ task, success: false, skipped: true, skipKind: "cancelled", error: "Cancelled by user" });
}

/** Status message when the sign-in session is lost during a run. */
export const SESSION_EXPIRED_MESSAGE = "Session expired — click Resume to sign in again and continue.";

/**
 * Pause the run after the sign-in session was lost, and wait for the user.
 * The in-flight tasks go back to "pending" and are not marked failed. Resume is a user
 * click, so the sign-in popup is allowed then. Each lost session needs a new Resume,
 * so a run that cannot get a token does not loop.
 */
async function pauseForSignIn(
  error: Error,
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<"retry" | "stop" | "cancelled"> {
  if (context.shouldCancel?.()) return "cancelled";

  pauseActiveExecution();
  if (!context.shouldPause?.()) {
    // The run cannot pause (no pause control), so the request fails as before.
    console.warn("[Execute Tasks] Sign-in session lost and the run cannot pause:", error.message);
    return "stop";
  }

  const inFlight = tasks.filter((task) => task.status === "running");
  for (const task of inFlight) {
    task.status = "pending";
    context.onTaskStart?.(task);
  }
  console.warn("[Execute Tasks] Sign-in session lost - run paused:", error.message);
  emitStatus(context, SESSION_EXPIRED_MESSAGE, "warning", "control");

  if ((await waitWhilePaused(context)) === "cancelled") return "cancelled";

  for (const task of inFlight) {
    if (task.status !== "pending") continue;
    task.status = "running";
    context.onTaskStart?.(task);
  }
  emitStatus(context, "Resumed. Signing in again and sending the request...", "info", "control");
  return "retry";
}

/**
 * Attach the run controls to the Graph client: retry waits that act on cancel and
 * pause, and the sign-in recovery. Returns the function that removes them.
 */
function attachRunControls(tasks: HydrationTask[], context: ExecutionContext): () => void {
  const { client } = context;
  // Test doubles of the client do not always have the method.
  if (typeof client.setExecutionControls !== "function") return () => undefined;

  // Parallel requests that lose the session at the same time share one pause.
  let recovery: Promise<"retry" | "stop" | "cancelled"> | null = null;
  client.setExecutionControls({
    wait: (ms) => sleepWithExecutionControl(ms, context),
    onAuthSessionLost: (error) => {
      recovery ??= pauseForSignIn(error, tasks, context).finally(() => {
        recovery = null;
      });
      return recovery;
    },
  });
  return () => client.setExecutionControls(undefined);
}

function cancelledResult(task: HydrationTask, context: ExecutionContext): ExecutionResult {
  task.endTime = new Date();
  markTaskSkipped(task, "cancelled", RUN_CANCELLED_MESSAGE);
  context.onTaskComplete?.(task);
  return { task, success: false, skipped: true, skipKind: "cancelled", error: RUN_CANCELLED_MESSAGE };
}

function cancelRemainingTasks(
  tasks: HydrationTask[],
  startIndex: number,
  results: ExecutionResult[]
): void {
  for (let i = startIndex; i < tasks.length; i++) {
    markTaskCancelled(tasks[i], results);
  }
}

function blockRemainingTasksAfterFailure(
  tasks: HydrationTask[],
  results: ExecutionResult[],
  context: ExecutionContext,
): void {
  const stoppedAt = new Date();
  const reason = "Not run because execution stopped after an earlier failure.";
  const recordedTaskIds = new Set(results.map((result) => result.task.id));
  for (const task of tasks) {
    if (recordedTaskIds.has(task.id)) continue;
    if (task.status !== "pending" && task.status !== "running") continue;
    task.startTime ??= stoppedAt;
    task.endTime = stoppedAt;
    markTaskSkipped(task, "blocked", reason);
    results.push({ task, success: false, skipped: true, skipKind: "blocked", error: reason });
    context.onTaskComplete?.(task);
  }
}

// Re-export types for backwards compatibility
export type { ExecutionContext, ExecutionResult, CISPolicyType, BuildTaskQueueOptions, ActivityMessage } from "./types";
export { cleanSettingsCatalogPolicy, cleanPolicyRecursively } from "./cleaners";
export { detectCISPolicyType } from "./policyDetection";
export {
  buildTaskQueueAsync,
  getEstimatedTaskCount,
  getEstimatedCategoryCount,
} from "./taskQueue";

/**
 * Execute a single task - dispatches to the appropriate category executor
 */
async function executeTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // Update task status to running
  task.status = "running";
  task.startTime = new Date();
  context.onTaskStart?.(task);

  // Give React time to render the "running" state before task completes
  await sleep(100);

  try {
    let result: ExecutionResult;

    // The same license check as the batch path. Create only: a delete task goes to the
    // delete resolver, so that existing kit objects can be removed after a license change.
    const licenseSkipReason = getLicenseSkipReason(task, context);
    if (licenseSkipReason) {
      markTaskSkipped(task, "blocked", licenseSkipReason);
      task.endTime = new Date();
      context.onTaskComplete?.(task);
      return {
        task,
        success: true,
        skipped: true,
        skipKind: "blocked",
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
        result = await executeComplianceTask(task, context);
        break;
      case "conditionalAccess":
        result = await executeConditionalAccessTask(task, context);
        break;
      case "appProtection":
        result = await executeAppProtectionTask(task, context);
        break;
      case "win32Apps":
        result = await executeWin32AppTask(task, context);
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
      case "notification":
        result = await executeNotificationTask(task, context);
        break;
      default:
        result = {
          task,
          success: false,
          skipped: false,
          error: `Unknown task category: ${task.category}`,
        };
    }

    // An executor that catches errors returns the cancel error as a failure.
    if (!result.success && !result.skipped && result.error === RUN_CANCELLED_MESSAGE && context.shouldCancel?.()) {
      return cancelledResult(task, context);
    }

    // Update task with result
    if (result.skipped) {
      markTaskSkipped(task, result.skipKind, result.error);
    } else {
      task.status = result.success ? "success" : "failed";
    }
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
    if (isRunCancelledError(error)) {
      return cancelledResult(task, context);
    }
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

async function executeSequentialTasks(
  tasks: HydrationTask[],
  context: ExecutionContext,
  results: ExecutionResult[],
  cancelAllRemaining = false
): Promise<void> {
  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
    const task = tasks[taskIndex];

    if (context.shouldCancel?.()) {
      console.log("[Execute Tasks] Execution cancelled by user");
      if (cancelAllRemaining) {
        cancelRemainingTasks(tasks, taskIndex, results);
        break;
      }
      markTaskCancelled(task, results);
      continue;
    }

    const pauseResult = await waitWhilePaused(context);
    if (pauseResult === "cancelled") {
      console.log("[Execute Tasks] Execution cancelled while paused");
      if (cancelAllRemaining) {
        cancelRemainingTasks(tasks, taskIndex, results);
        break;
      }
      markTaskCancelled(task, results);
      continue;
    }

    context.onSequentialTask?.(task);
    const result = await executeTask(task, context);
    results.push(result);

    if (context.stopOnFirstError && !result.success && !result.skipped) {
      blockRemainingTasksAfterFailure(tasks.slice(taskIndex + 1), results, context);
      break;
    }

    if (taskIndex < tasks.length - 1) {
      await sleepWithExecutionControl(TASK_DELAY_MS, context);
    }
  }
}

/**
 * Execute a queue of tasks sequentially with delays
 */
export async function executeTasks(
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  const detachRunControls = attachRunControls(tasks, context);
  try {
    return await runTasks(tasks, context);
  } finally {
    detachRunControls();
  }
}

async function runTasks(
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const stopForExecutionControl = async (): Promise<boolean> => {
    if ((await waitWhilePaused(context)) !== "cancelled") return false;
    cancelRemainingTasks(tasks, 0, results);
    emitStatus(
      context,
      "Cancellation requested. No new tenant checks or tasks will start.",
      "warning",
      "control"
    );
    return true;
  };

  emitStatus(context, `Checking tenant for existing resources (${tasks.length} items selected)...`, "info", "prefetch");
  if (await stopForExecutionControl()) return results;

  // Pre-fetch every tenant cache that a selected category needs, in every mode.
  // Create-mode existence checks use only these caches. When a prefetch fails, the
  // cache stays unset and the reason is recorded, so tasks that need it fail
  // instead of creating objects without a duplicate check.
  const taskCategories = new Set(tasks.map((task) => task.category));
  const batchConfig = getBatchConfig();
  const hasBaselineTasks = taskCategories.has("baseline");

  for (const prefetch of TENANT_CACHE_PREFETCHES) {
    if (await stopForExecutionControl()) return results;
    if (context[prefetch.key] || !prefetch.categories.some((category) => taskCategories.has(category))) {
      continue;
    }

    const label = TENANT_CACHE_LABELS[prefetch.key];
    emitStatus(context, `Querying existing ${label}...`, "progress", "prefetch");
    try {
      const items = await prefetch.load(context.client);
      (context as Record<TenantCacheKey, unknown[] | undefined>)[prefetch.key] = items;
      emitStatus(context, `Found ${items.length} existing ${label}`, "success", "prefetch");
    } catch (error) {
      if (isRunCancelledError(error) && (await stopForExecutionControl())) return results;
      const reason = error instanceof Error ? error.message : String(error);
      context.prefetchErrors = { ...context.prefetchErrors, [prefetch.key]: reason };
      emitStatus(
        context,
        `Failed to query existing ${label}: ${reason}. Tasks that need this list will fail and will not create objects.`,
        "error",
        "prefetch"
      );
      console.error(`[Execute Tasks] Failed to pre-fetch ${label}:`, error);
    }
  }

  // Pre-fetch baseline templates from cache for batch operations
  if (await stopForExecutionControl()) return results;
  // This ensures templates are passed directly to batch executor without relying on global cache
  if (batchConfig.enableBatching && hasBaselineTasks && !context.cachedBaselineTemplates) {
    console.log("[Execute Tasks] Loading baseline templates for batch operations...");
    const cachedBaseline = getCachedTemplates("baseline");
    if (cachedBaseline && Array.isArray(cachedBaseline)) {
      context.cachedBaselineTemplates = cachedBaseline as BaselinePolicy[];
      console.log(`[Execute Tasks] Loaded ${context.cachedBaselineTemplates.length} baseline templates for batching`);
    } else {
      console.warn("[Execute Tasks] Baseline cache is empty - templates will fall back to sequential execution");
      context.cachedBaselineTemplates = [];
    }
  }

  // Check if batch execution is enabled and applicable
  if (await stopForExecutionControl()) return results;
  // Preview mode now uses batching with guards in batchExecutor.ts that skip actual API calls
  const useCreateBatching =
    batchConfig.enableBatching && context.operationMode === "create" && !context.stopOnFirstError;
  const useDeleteBatching =
    batchConfig.enableBatching && context.operationMode === "delete" && !context.stopOnFirstError;

  emitStatus(context, "Tenant check complete - starting execution...", "success", "prefetch");

  if (useCreateBatching) {
    emitStatus(context, `Starting batch creation (${batchConfig.defaultBatchSize} items per batch)...`, "info", "execute");
    console.log(`[Execute Tasks] Batch CREATE execution enabled (batch size: ${batchConfig.defaultBatchSize})`);

    // Separate batchable from non-batchable tasks
    const batchableTasks = tasks.filter((task) => isBatchableCategory(task.category));
    const nonBatchableTasks = tasks.filter((task) => !isBatchableCategory(task.category));

    console.log(`[Execute Tasks] ${batchableTasks.length} batchable tasks, ${nonBatchableTasks.length} require sequential execution`);

    // Execute batchable tasks first
    if (batchableTasks.length > 0) {
      const batchResults = await executeTasksInBatches(batchableTasks, context);

      // Process batch results - some may need sequential fallback
      for (const result of batchResults) {
        if (result.error === "NEEDS_SEQUENTIAL_EXECUTION") {
          // This task couldn't be batched, add to sequential queue
          nonBatchableTasks.push(result.task);
        } else {
          results.push(result);

          // Stop on first error if configured
          if (context.stopOnFirstError && !result.success && !result.skipped) {
            console.log("[Execute Tasks] Stopping on first error");
            result.task.status = "failed";
            result.task.error ??= result.error;
            result.task.endTime ??= new Date();
            blockRemainingTasksAfterFailure(tasks, results, context);
            return results;
          }
        }
      }
    }

    await executeSequentialTasks(nonBatchableTasks, context, results);

    return results;
  }

  if (useDeleteBatching) {
    emitStatus(context, "Starting parallel deletion - checking assignments...", "info", "execute");
    console.log(`[Execute Tasks] Fast parallel DELETE execution enabled`);

    // Separate batchable from non-batchable tasks
    const batchableTasks = tasks.filter(
      (task) => task.category !== "conditionalAccess" && isBatchableCategory(task.category)
    );
    const nonBatchableTasks = tasks.filter(
      (task) => task.category === "conditionalAccess" || !isBatchableCategory(task.category)
    );

    console.log(`[Execute Tasks] ${batchableTasks.length} parallel delete tasks, ${nonBatchableTasks.length} require sequential execution`);

    // Execute batchable DELETE tasks using fast parallel approach
    if (batchableTasks.length > 0) {
      const parallelResults = await executeDeletesInParallel(batchableTasks, context);

      // Process results
      for (const result of parallelResults) {
        results.push(result);

        // Stop on first error if configured
        if (context.stopOnFirstError && !result.success && !result.skipped) {
          console.log("[Execute Tasks] Stopping on first error");
          result.task.status = "failed";
          result.task.error ??= result.error;
          result.task.endTime ??= new Date();
          blockRemainingTasksAfterFailure(tasks, results, context);
          return results;
        }
      }
    }

    await executeSequentialTasks(nonBatchableTasks, context, results);

    return results;
  }

  // Sequential execution (batching disabled or preview mode)
  if (context.isPreview) {
    emitStatus(context, `Running preview (${context.operationMode} mode) - no changes will be made...`, "info", "execute");
    console.log(`[Execute Tasks] Preview mode - sequential execution, no Graph mutations`);
  }

  await executeSequentialTasks(tasks, context, results, true);

  return results;
}
