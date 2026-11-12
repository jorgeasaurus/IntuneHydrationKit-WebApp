"use client";

import { useCallback, useSyncExternalStore } from "react";
import { HydrationTask, BatchProgress } from "@/types/hydration";
import { createGraphClient } from "@/lib/graph/client";
import { buildTaskQueueAsync, executeTasks, ExecutionContext, getEstimatedTaskCount } from "@/lib/hydration/engine";
import { ActivityMessage } from "@/lib/hydration/types";
import { createSummary } from "@/lib/hydration/reporter";
import { useWizardState } from "./useWizardState";
import { getBatchConfig } from "@/lib/config/batchConfig";
import { createRunTelemetry } from "@/lib/hydration/runTelemetry";
import { createRunProvenance } from "@/lib/hydration/runProvenance";
import { useSettings } from "./useSettings";
import { deriveExecutionOutcome } from "@/lib/hydration/executionOutcome";
import { markTaskSkipped } from "@/lib/hydration/taskTransitions";
import { getWizardRunLicenses, getWizardRunScope } from "@/lib/hydration/runScope";
import { buildRerunTaskQueue, type RerunPlan } from "@/lib/hydration/rerun";
import {
  beginExecution,
  cancelExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  getExecutionState,
  getPausedMsAt,
  pauseExecution,
  recordPauseWait,
  resetExecutionSession,
  resumeExecution,
  shouldCancelExecution,
  shouldPauseExecution,
  subscribeExecutionState,
  updateExecutionStateForRun,
  type ExecutionRunConfiguration,
} from "@/lib/hydration/executionStateStore";

type QueueBuilder = (options: {
  shouldCancel: () => boolean;
  onProgress: (message: string, type?: ActivityMessage["type"]) => void;
}) => Promise<HydrationTask[]>;

let activityIdCounter = 0;

/** Test-only: reset the shared run state between tests. */
export function resetExecutionControlForTests(): void {
  forceResetExecutionSessionForTests();
  activityIdCounter = 0;
}

export function useHydrationExecution() {
  const { state } = useWizardState();
  const { settings } = useSettings();
  const executionState = useSyncExternalStore(subscribeExecutionState, getExecutionState, getExecutionState);

  const appendActivityMessage = useCallback(
    (runId: number, message: string, type: ActivityMessage["type"], category = "control") => {
      const activityMessage: ActivityMessage = {
        id: `activity-${activityIdCounter++}`,
        timestamp: new Date(),
        message,
        type,
        category,
      };

      updateExecutionStateForRun(runId, (prev) => ({
        ...prev,
        activityLog: [...prev.activityLog.slice(-99), activityMessage],
      }));
    },
    [],
  );

  /**
   * Run a new execution: build its queue, then run the queue through the engine.
   * Wizard runs and runs that continue an earlier run use this same path.
   */
  const runExecution = useCallback(async (
    configuration: ExecutionRunConfiguration,
    buildQueue: QueueBuilder,
    options: { updateExisting?: boolean } = {},
  ) => {
    const { operationMode } = configuration;
    const runId = beginExecution(configuration);
    if (runId === null) {
      console.log("[Execution Hook] Execution already in progress, ignoring duplicate call");
      return;
    }
    const startTime = new Date();
    const provenance = createRunProvenance();
    const batchConfig = getBatchConfig();
    const telemetry = createRunTelemetry(batchConfig.defaultBatchSize, batchConfig.enableBatching);
    updateExecutionStateForRun(runId, (current) => ({
      ...current,
      startTime,
    }));
    let terminalState: Parameters<typeof finishExecution>[1] | null = null;
    let tasks: HydrationTask[] = [];
    const createCancelledTerminalState = (): Parameters<typeof finishExecution>[1] => {
      const endTime = new Date();
      for (const task of tasks) {
        if (task.status !== "pending" && task.status !== "running") continue;
        task.startTime ??= endTime;
        task.endTime = endTime;
        markTaskSkipped(task, "cancelled", "Cancelled");
      }
      updateExecutionStateForRun(runId, (current) => ({
        ...current,
        tasks,
      }));
      return {
        endTime,
        summary: createSummary(
          configuration.tenantId,
          operationMode,
          startTime,
          endTime,
          tasks,
          telemetry.snapshot(),
          configuration.tenantName,
          provenance,
          getPausedMsAt(endTime),
        ),
        outcome: "cancelled",
        fatalError: null,
      };
    };
    try {
      // Signal that we're building the task queue
      const emitQueueProgress = (message: string, type: ActivityMessage["type"] = "progress") => {
        const msg: ActivityMessage = {
          id: `queue-${activityIdCounter++}`,
          timestamp: new Date(),
          message,
          type,
          category: "queue",
        };
        updateExecutionStateForRun(runId, (prev) => ({
          ...prev,
          activityLog: [...prev.activityLog.slice(-99), msg],
        }));
      };

      emitQueueProgress("Building task queue...");

      // Build task queue with real templates from local IntuneTemplates directory
      tasks = await buildQueue({
        shouldCancel: () => shouldCancelExecution(runId),
        onProgress: emitQueueProgress,
      });
      if (shouldCancelExecution(runId)) {
        terminalState = createCancelledTerminalState();
        return;
      }
      if (tasks.length === 0) {
        emitQueueProgress(
          "No tasks were queued. Check that templates are available and your selections are valid.",
          "error",
        );
        throw new Error("Task queue is empty. No tasks were queued for execution — templates may have failed to load.");
      }

      emitQueueProgress(`Task queue ready: ${tasks.length} tasks queued`, "success");

      updateExecutionStateForRun(runId, (prev) => ({
        ...prev,
        tasks,
        phase: "running",
        startTime,
        endTime: null,
        summary: null,
        outcome: null,
        fatalError: null,
        batchProgress: null,
      }));

      // Create Graph client
      const client = createGraphClient({
        tenantId: configuration.tenantId,
        homeAccountId: configuration.homeAccountId,
      }, telemetry.onBatchDispatch);

      // Task update callback for all task events
      const updateTask = (task: HydrationTask) => {
        updateExecutionStateForRun(runId, (prev) => ({
          ...prev,
          tasks: prev.tasks.map((currentTask) => (currentTask.id === task.id ? { ...task } : currentTask)),
        }));
      };

      // Batch progress callback
      const updateBatchProgress = (progress: BatchProgress) => {
        updateExecutionStateForRun(runId, (prev) => ({
          ...prev,
          batchProgress: progress,
        }));
      };

      // Status update callback for activity log
      const updateStatus = (message: ActivityMessage) => {
        // Generate unique ID if not provided
        const msgWithId: ActivityMessage = {
          ...message,
          id: message.id || `activity-${activityIdCounter++}`,
        };
        updateExecutionStateForRun(runId, (prev) => ({
          ...prev,
          // Keep last 100 messages to prevent memory issues
          activityLog: [...prev.activityLog.slice(-99), msgWithId],
        }));
      };

      // Create execution context
      const context: ExecutionContext = {
        client,
        tenantId: configuration.tenantId,
        operationMode,
        isPreview: configuration.isPreview,
        stopOnFirstError: settings.stopOnFirstError,
        // Only the wizard can pass true, after its own confirmation. A retry, resume, or live
        // run of a preview never carries the choice forward: it skips existing objects.
        updateExisting: operationMode === "create" && options.updateExisting === true,
        hasConditionalAccessLicense: configuration.licenses?.hasConditionalAccessLicense ?? true,
        hasPremiumP2License: configuration.licenses?.hasPremiumP2License ?? true,
        hasWindowsDriverUpdateLicense: configuration.licenses?.hasWindowsDriverUpdateLicense ?? true,
        onSequentialTask: telemetry.onSequentialTask,
        onTaskStart: updateTask,
        onTaskComplete: updateTask,
        onTaskError: updateTask,
        onBatchProgress: updateBatchProgress,
        onStatusUpdate: updateStatus,
        shouldCancel: () => shouldCancelExecution(runId),
        shouldPause: () => shouldPauseExecution(runId),
        onPauseWait: (waiting) => recordPauseWait(runId, waiting),
      };

      // Execute tasks with pause/cancel support. A retry can queue a task that is already
      // failed (its template is no longer available); the engine runs only pending tasks.
      await executeTasks(
        tasks.filter((task) => task.status === "pending"),
        context,
      );
      if (
        shouldCancelExecution(runId) &&
        tasks.some((task) => task.status === "pending" || task.status === "running")
      ) {
        terminalState = createCancelledTerminalState();
        return;
      }

      // Create summary with batch stats
      const endTime = new Date();
      const summary = createSummary(
        configuration.tenantId,
        operationMode,
        startTime,
        endTime,
        tasks,
        telemetry.snapshot(),
        configuration.tenantName,
        provenance,
        getPausedMsAt(endTime),
      );
      const outcome = deriveExecutionOutcome(tasks);

      if (shouldCancelExecution(runId) && outcome !== "cancelled") {
        appendActivityMessage(runId, "Cancellation arrived after all work completed.", "info", "control");
      }

      terminalState = {
        endTime,
        summary,
        outcome,
        fatalError: null,
      };
    } catch (error) {
      if (shouldCancelExecution(runId)) {
        terminalState = createCancelledTerminalState();
        return;
      }
      const fatalError = error instanceof Error ? error.message : "Execution failed unexpectedly.";
      const endTime = new Date();
      for (const task of tasks) {
        if (task.status !== "pending" && task.status !== "running") continue;
        task.startTime ??= endTime;
        task.endTime = endTime;
        markTaskSkipped(task, "blocked", "Not run because execution failed.");
      }
      updateExecutionStateForRun(runId, (current) => ({
        ...current,
        tasks,
      }));
      console.error("Execution failed:", error);
      appendActivityMessage(runId, fatalError, "error", "execution");
      terminalState = {
        endTime,
        summary: null,
        outcome: "failed",
        fatalError,
      };
      throw error;
    } finally {
      if (terminalState) {
        finishExecution(runId, terminalState);
      }
    }
  }, [appendActivityMessage, settings.stopOnFirstError]);

  /**
   * Start execution from the confirmed wizard.
   */
  const startExecution = useCallback(async () => {
    const { tenantConfig, operationMode } = state;
    if (!tenantConfig || !operationMode || state.selectedTargets.length === 0) {
      throw new Error("Invalid wizard state. Please complete the wizard first.");
    }
    const scope = getWizardRunScope(state);
    const configuration: ExecutionRunConfiguration = {
      tenantId: tenantConfig.tenantId,
      homeAccountId: tenantConfig.homeAccountId,
      tenantName: tenantConfig.tenantName,
      cloudEnvironment: tenantConfig.cloudEnvironment,
      operationMode,
      isPreview: state.isPreview,
      selectedObjectCount: getEstimatedTaskCount(state.selectedTargets, state.categorySelections),
      scope,
      licenses: getWizardRunLicenses(state),
    };
    // The queue uses the wizard state directly. The stored scope is only for a later live run.
    await runExecution(configuration, ({ shouldCancel, onProgress }) =>
      buildTaskQueueAsync(state.selectedTargets, operationMode, {
        selectedCISCategories: state.selectedCISCategories,
        baselineSelection: state.baselineSelection,
        categorySelections: state.categorySelections,
        shouldCancel,
        onProgress,
      }),
      { updateExisting: state.updateExisting === true },
    );
  }, [runExecution, state]);

  /**
   * Start a new run that continues from an earlier run (retry, resume, or a preview run for real).
   * It uses the same engine path as a wizard run.
   */
  const startRerun = useCallback(
    async (plan: RerunPlan) => {
      const { configuration } = plan;
      const scope = configuration.scope;
      await runExecution(configuration, ({ shouldCancel, onProgress }) => {
        if (plan.kind === "live") {
          if (!scope) throw new Error("The run has no saved scope.");
          return buildTaskQueueAsync(scope.selectedTargets, configuration.operationMode, {
            selectedCISCategories: scope.selectedCISCategories,
            baselineSelection: scope.baselineSelection,
            categorySelections: scope.categorySelections,
            shouldCancel,
            onProgress,
          });
        }
        return buildRerunTaskQueue(plan.sourceTasks, configuration.operationMode, { shouldCancel, onProgress });
      });
    },
    [runExecution],
  );

  /**
   * Pause execution
   */
  const pause = useCallback(() => {
    const runId = executionState.runId;
    if (runId === null || !pauseExecution(runId)) return;
    appendActivityMessage(
      runId,
      "Pause requested. Execution will stop after the current in-flight work completes.",
      "warning",
    );
  }, [appendActivityMessage, executionState.runId]);

  /**
   * Resume execution
   */
  const resume = useCallback(() => {
    const runId = executionState.runId;
    if (runId === null || !resumeExecution(runId)) return;
    appendActivityMessage(runId, "Execution resumed.", "info");
  }, [appendActivityMessage, executionState.runId]);

  /**
   * Cancel execution
   */
  const cancel = useCallback(() => {
    const runId = executionState.runId;
    if (runId === null || !cancelExecution(runId)) return;
    appendActivityMessage(runId, "Cancellation requested. Remaining work will be skipped.", "warning");
  }, [appendActivityMessage, executionState.runId]);

  /**
   * Reset execution state
   */
  const reset = useCallback(() => {
    resetExecutionSession();
  }, []);

  return {
    ...executionState,
    isRunning:
      executionState.phase === "running" || executionState.phase === "paused" || executionState.phase === "cancelling",
    isPaused: executionState.phase === "paused",
    isCancelling: executionState.phase === "cancelling",
    isCompleted: executionState.phase === "completed",
    isBuildingQueue: executionState.phase === "building",
    startExecution,
    startRerun,
    pause,
    resume,
    cancel,
    reset,
  };
}
