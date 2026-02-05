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
 * - ./utils.ts - sleep, escapeODataString, utility functions
 * - ./cleaners.ts - Policy cleaning functions
 * - ./policyCreators.ts - Graph API create/exists functions
 * - ./policyDetection.ts - Policy type detection
 * - ./taskExecutors/ - Category-specific task executors
 * - ./taskQueue.ts - Task queue building functions
 */

import { HydrationTask } from "@/types/hydration";
import { getIntuneGroups } from "@/lib/graph/groups";
import { getAllFilters } from "@/lib/graph/filters";
import { getAllAppProtectionPolicies } from "@/lib/graph/appProtection";
import { getCachedTemplates, BaselinePolicy } from "@/lib/templates/loader";
import { getBatchConfig } from "@/lib/config/batchConfig";
import { executeTasksInBatches, executeDeletesInParallel, isBatchableCategory } from "./batchExecutor";
import { sleep } from "./utils";
import { ExecutionContext, ExecutionResult, ActivityMessage } from "./types";

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
import {
  executeGroupTask,
  executeFilterTask,
  executeComplianceTask,
  executeConditionalAccessTask,
  executeAppProtectionTask,
  executeEnrollmentTask,
  executeBaselineTask,
  executeCISBaselineTask,
} from "./taskExecutors";

// Re-export types for backwards compatibility
export type { ExecutionContext, ExecutionResult, CISPolicyType, BuildTaskQueueOptions, ActivityMessage } from "./types";
export { cleanSettingsCatalogPolicy, cleanPolicyRecursively } from "./cleaners";
export { detectCISPolicyType } from "./policyDetection";
export {
  buildTaskQueue,
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
        result = await executeComplianceTask(task, context);
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
    emitStatus(context, "Querying existing groups from tenant...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all 'Intune - ' groups...");
    try {
      context.cachedIntuneGroups = await getIntuneGroups(context.client);
      emitStatus(context, `Found ${context.cachedIntuneGroups.length} existing groups`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedIntuneGroups.length} 'Intune - ' groups`);
    } catch (error) {
      emitStatus(context, "Failed to query groups - will check individually", "warning", "prefetch");
      console.error("[Execute Tasks] Failed to pre-fetch groups:", error);
      // Continue execution - individual tasks will handle errors
      context.cachedIntuneGroups = [];
    }
  }

  // Pre-fetch all filters if any filter tasks exist
  const hasFilterTasks = tasks.some((task) => task.category === "filters");
  if (hasFilterTasks && !context.cachedFilters) {
    emitStatus(context, "Querying existing device filters...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all device filters...");
    try {
      context.cachedFilters = await getAllFilters(context.client);
      emitStatus(context, `Found ${context.cachedFilters.length} existing device filters`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedFilters.length} device filters`);
    } catch (error) {
      emitStatus(context, "Failed to query filters - will check individually", "warning", "prefetch");
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
    emitStatus(context, "Querying existing App Protection policies...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all App Protection policies...");
    try {
      context.cachedAppProtectionPolicies = await getAllAppProtectionPolicies(context.client);
      emitStatus(context, `Found ${context.cachedAppProtectionPolicies.length} App Protection policies`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedAppProtectionPolicies.length} App Protection policies`);
    } catch (error) {
      emitStatus(context, "Failed to query App Protection policies", "warning", "prefetch");
      console.error("[Execute Tasks] Failed to pre-fetch App Protection policies:", error);
      // Continue execution - individual tasks will handle errors
      context.cachedAppProtectionPolicies = [];
    }
  }

  // Pre-fetch Conditional Access policies for DELETE mode or CREATE mode with batching
  const hasConditionalAccessTasks = tasks.some((task) => task.category === "conditionalAccess");
  if (hasConditionalAccessTasks && !context.cachedConditionalAccessPolicies) {
    emitStatus(context, "Querying existing Conditional Access policies...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all Conditional Access policies...");
    try {
      const response = await context.client.get<{ value: Array<{ id: string; displayName: string; description?: string; state: string }> }>(
        `/identity/conditionalAccess/policies`
      );
      context.cachedConditionalAccessPolicies = response.value || [];
      emitStatus(context, `Found ${context.cachedConditionalAccessPolicies.length} Conditional Access policies`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedConditionalAccessPolicies.length} Conditional Access policies`);
    } catch (error) {
      emitStatus(context, "Failed to query Conditional Access policies", "warning", "prefetch");
      console.error("[Execute Tasks] Failed to pre-fetch Conditional Access policies:", error);
      context.cachedConditionalAccessPolicies = [];
    }
  }

  // Pre-fetch Compliance policies for batch mode (CREATE or DELETE)
  // This enables duplicate detection and prevents creating duplicates in batch mode
  // Also pre-fetch for DELETE mode with baseline tasks since OIB Compliance policies use V1 Compliance endpoint
  const hasComplianceTasks = tasks.some((task) => task.category === "compliance");
  const hasCISTasks = tasks.some((task) => task.category === "cisBaseline");
  const batchConfig = getBatchConfig();

  const needsV1ComplianceCache =
    (hasComplianceTasks && batchConfig.enableBatching) ||
    ((hasBaselineTasks || hasCISTasks) && (context.operationMode === "delete" || context.operationMode === "preview"));

  if (needsV1ComplianceCache && !context.cachedCompliancePolicies) {
    emitStatus(context, "Querying existing Compliance policies...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all V1 Compliance policies (deviceCompliancePolicies)...");
    try {
      context.cachedCompliancePolicies = await context.client.getCollection<{ id: string; displayName?: string; description?: string }>(
        `/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description`
      );
      emitStatus(context, `Found ${context.cachedCompliancePolicies.length} Compliance policies`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedCompliancePolicies.length} V1 Compliance policies`);
    } catch (error) {
      emitStatus(context, "Failed to query Compliance policies", "warning", "prefetch");
      console.error("[Execute Tasks] Failed to pre-fetch V1 Compliance policies:", error);
      context.cachedCompliancePolicies = [];
    }
  }

  // Pre-fetch Settings Catalog policies for DELETE mode or CREATE mode with batching (baseline and CIS tasks)
  // This avoids calling getCollection for every single operation and enables duplicate detection in batch mode
  const needsSettingsCatalogCache =
    ((context.operationMode === "delete" || context.operationMode === "preview") && (hasBaselineTasks || hasCISTasks)) ||
    (context.operationMode === "create" && batchConfig.enableBatching && (hasBaselineTasks || hasCISTasks));

  if (needsSettingsCatalogCache && !context.cachedSettingsCatalogPolicies) {
    emitStatus(context, "Querying existing Settings Catalog policies...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all Settings Catalog policies for duplicate detection...");
    try {
      context.cachedSettingsCatalogPolicies = await context.client.getCollection<{ id: string; name: string; description?: string }>(
        `/deviceManagement/configurationPolicies?$select=id,name,description`
      );
      emitStatus(context, `Found ${context.cachedSettingsCatalogPolicies.length} Settings Catalog policies`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedSettingsCatalogPolicies.length} Settings Catalog policies`);
    } catch (error) {
      emitStatus(context, "Failed to query Settings Catalog policies", "warning", "prefetch");
      console.error("[Execute Tasks] Failed to pre-fetch Settings Catalog policies:", error);
      context.cachedSettingsCatalogPolicies = [];
    }
  }

  // Pre-fetch V2 Compliance policies for DELETE mode (used by OIB compliance policies)
  if (needsSettingsCatalogCache && !context.cachedV2CompliancePolicies) {
    emitStatus(context, "Querying V2 Compliance policies...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all V2 Compliance policies for delete operations...");
    try {
      context.cachedV2CompliancePolicies = await context.client.getCollection<{ id: string; name: string; description?: string }>(
        `/deviceManagement/compliancePolicies?$select=id,name,description`
      );
      emitStatus(context, `Found ${context.cachedV2CompliancePolicies.length} V2 Compliance policies`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedV2CompliancePolicies.length} V2 Compliance policies`);
    } catch (error) {
      emitStatus(context, "Failed to query V2 Compliance policies", "warning", "prefetch");
      console.error("[Execute Tasks] Failed to pre-fetch V2 Compliance policies:", error);
      context.cachedV2CompliancePolicies = [];
    }
  }

  // Pre-fetch Driver Update Profiles for DELETE/PREVIEW mode or CREATE mode with batching
  const needsDriverUpdateCache =
    ((context.operationMode === "delete" || context.operationMode === "preview") && (hasBaselineTasks || hasCISTasks)) ||
    (context.operationMode === "create" && batchConfig.enableBatching && (hasBaselineTasks || hasCISTasks));

  if (needsDriverUpdateCache && !context.cachedDriverUpdateProfiles) {
    emitStatus(context, "Querying Driver Update profiles...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all Driver Update Profiles...");
    try {
      const response = await context.client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
        `/deviceManagement/windowsDriverUpdateProfiles`
      );
      context.cachedDriverUpdateProfiles = response.value || [];
      emitStatus(context, `Found ${context.cachedDriverUpdateProfiles.length} Driver Update profiles`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedDriverUpdateProfiles.length} Driver Update Profiles`);
    } catch (error) {
      emitStatus(context, "Failed to query Driver Update profiles", "warning", "prefetch");
      console.error("[Execute Tasks] Failed to pre-fetch Driver Update Profiles:", error);
      context.cachedDriverUpdateProfiles = [];
    }
  }

  // Pre-fetch Device Configurations for DELETE mode or CREATE mode with batching (Health Monitoring, etc.)
  // This enables duplicate detection in batch mode and proper deletion/preview
  const needsDeviceConfigCache =
    ((context.operationMode === "delete" || context.operationMode === "preview") && (hasBaselineTasks || hasCISTasks)) ||
    (context.operationMode === "create" && batchConfig.enableBatching && (hasBaselineTasks || hasCISTasks));

  if (needsDeviceConfigCache && !context.cachedDeviceConfigurations) {
    emitStatus(context, "Querying Device Configurations...", "progress", "prefetch");
    console.log("[Execute Tasks] Pre-fetching all Device Configurations...");
    try {
      context.cachedDeviceConfigurations = await context.client.getCollection<{ id: string; displayName?: string; description?: string }>(
        `/deviceManagement/deviceConfigurations?$select=id,displayName,description`
      );
      emitStatus(context, `Found ${context.cachedDeviceConfigurations.length} Device Configurations`, "success", "prefetch");
      console.log(`[Execute Tasks] Pre-fetched ${context.cachedDeviceConfigurations.length} Device Configurations`);
    } catch (error) {
      emitStatus(context, "Failed to query Device Configurations", "warning", "prefetch");
      console.error("[Execute Tasks] Failed to pre-fetch Device Configurations:", error);
      context.cachedDeviceConfigurations = [];
    }
  }

  // Pre-fetch baseline templates from cache for batch operations
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
  const useCreateBatching = batchConfig.enableBatching && context.operationMode === "create";
  const useDeleteBatching = batchConfig.enableBatching && context.operationMode === "delete";
  const usePreviewBatching = batchConfig.enableBatching && context.operationMode === "preview";

  if (useCreateBatching) {
    emitStatus(context, `Starting batch creation (${batchConfig.defaultBatchSize} items per batch)...`, "info", "execute");
    console.log(`[Execute Tasks] Batch CREATE execution enabled (batch size: ${batchConfig.defaultBatchSize})`);

    // Separate batchable from non-batchable tasks
    const batchableTasks = tasks.filter((t) => isBatchableCategory(t.category));
    const nonBatchableTasks = tasks.filter((t) => !isBatchableCategory(t.category));

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
            return results;
          }
        }
      }
    }

    // Execute non-batchable tasks sequentially
    for (const task of nonBatchableTasks) {
      // Check for cancellation before starting task
      if (context.shouldCancel?.()) {
        console.log("[Execute Tasks] Execution cancelled by user");
        task.status = "skipped";
        task.error = "Cancelled by user";
        results.push({ task, success: false, skipped: true, error: "Cancelled by user" });
        continue;
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
      if (nonBatchableTasks.indexOf(task) < nonBatchableTasks.length - 1) {
        await sleep(TASK_DELAY_MS);
      }
    }

    return results;
  }

  if (useDeleteBatching) {
    emitStatus(context, "Starting parallel deletion - checking assignments...", "info", "execute");
    console.log(`[Execute Tasks] Fast parallel DELETE execution enabled (NukeTune-style)`);

    // Separate batchable from non-batchable tasks
    const batchableTasks = tasks.filter((t) => isBatchableCategory(t.category));
    const nonBatchableTasks = tasks.filter((t) => !isBatchableCategory(t.category));

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
          return results;
        }
      }
    }

    // Execute non-batchable tasks sequentially
    for (const task of nonBatchableTasks) {
      // Check for cancellation before starting task
      if (context.shouldCancel?.()) {
        console.log("[Execute Tasks] Execution cancelled by user");
        task.status = "skipped";
        task.error = "Cancelled by user";
        results.push({ task, success: false, skipped: true, error: "Cancelled by user" });
        continue;
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
      if (nonBatchableTasks.indexOf(task) < nonBatchableTasks.length - 1) {
        await sleep(TASK_DELAY_MS);
      }
    }

    return results;
  }

  if (usePreviewBatching) {
    emitStatus(context, "Running preview simulation...", "info", "execute");
    console.log(`[Execute Tasks] Batch PREVIEW execution enabled - fast parallel simulation`);

    // Preview mode doesn't make API calls, so we can process all tasks rapidly
    // Process in batches to allow UI updates and cancellation checks
    const PREVIEW_BATCH_SIZE = 50;

    for (let i = 0; i < tasks.length; i += PREVIEW_BATCH_SIZE) {
      // Check for cancellation before each batch
      if (context.shouldCancel?.()) {
        console.log("[Execute Tasks] Preview cancelled by user");
        for (let j = i; j < tasks.length; j++) {
          tasks[j].status = "skipped";
          tasks[j].error = "Cancelled by user";
          results.push({ task: tasks[j], success: false, skipped: true, error: "Cancelled by user" });
        }
        break;
      }

      // Handle pause
      while (context.shouldPause?.()) {
        console.log("[Execute Tasks] Preview paused, waiting...");
        await sleep(500);
      }

      const batch = tasks.slice(i, i + PREVIEW_BATCH_SIZE);

      // Process batch in parallel (preview tasks are instant)
      const batchResults = await Promise.all(
        batch.map(async (task) => {
          task.status = "running";
          task.startTime = new Date();
          context.onTaskStart?.(task);

          // Preview mode always succeeds instantly
          const result = await executeTask(task, context);

          task.status = result.skipped ? "skipped" : result.success ? "success" : "failed";
          task.error = result.error;
          task.endTime = new Date();

          if (result.success || result.skipped) {
            context.onTaskComplete?.(task);
          }

          return result;
        })
      );

      results.push(...batchResults);

      // Brief yield to allow UI updates between batches
      await sleep(10);
    }

    return results;
  }

  // Sequential execution (batching disabled)
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
