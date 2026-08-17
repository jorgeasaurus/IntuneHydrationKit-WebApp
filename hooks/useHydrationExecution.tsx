"use client";

import { useCallback, useSyncExternalStore } from "react";
import { HydrationTask, BatchExecutionStats, BatchProgress } from "@/types/hydration";
import { createGraphClient } from "@/lib/graph/client";
import { buildTaskQueueAsync, executeTasks, ExecutionContext, getEstimatedTaskCount } from "@/lib/hydration/engine";
import { ActivityMessage } from "@/lib/hydration/types";
import { createSummary } from "@/lib/hydration/reporter";
import { useWizardState } from "./useWizardState";
import { getBatchConfig } from "@/lib/config/batchConfig";
import { isBatchableCategory } from "@/lib/hydration/batchExecutor";
import { useSettings } from "./useSettings";
import { deriveExecutionOutcome } from "@/lib/hydration/executionOutcome";
import { markTaskSkipped } from "@/lib/hydration/taskTransitions";
import {
  beginExecution,
  cancelExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  getExecutionState,
  pauseExecution,
  resetExecutionSession,
  resumeExecution,
  shouldCancelExecution,
  shouldPauseExecution,
  subscribeExecutionState,
  updateExecutionStateForRun,
} from "@/lib/hydration/executionStateStore";

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
   * Start execution
   */
  const startExecution = useCallback(async () => {
    const { tenantConfig, operationMode } = state;
    if (!tenantConfig || !operationMode || state.selectedTargets.length === 0) {
      throw new Error("Invalid wizard state. Please complete the wizard first.");
    }

    const runId = beginExecution({
      tenantId: tenantConfig.tenantId,
      homeAccountId: tenantConfig.homeAccountId,
      tenantName: tenantConfig.tenantName,
      operationMode,
      isPreview: state.isPreview,
      selectedObjectCount: getEstimatedTaskCount(state.selectedTargets, state.categorySelections),
    });
    if (runId === null) {
      console.log("[Execution Hook] Execution already in progress, ignoring duplicate call");
      return;
    }
    const startTime = new Date();
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
          tenantConfig.tenantId,
          operationMode,
          startTime,
          endTime,
          tasks,
          undefined,
          tenantConfig.tenantName,
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
      tasks = await buildTaskQueueAsync(state.selectedTargets, operationMode, {
        selectedCISCategories: state.selectedCISCategories,
        baselineSelection: state.baselineSelection,
        categorySelections: state.categorySelections,
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
        tenantId: tenantConfig.tenantId,
        homeAccountId: tenantConfig.homeAccountId,
      });

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
        tenantId: tenantConfig.tenantId,
        operationMode,
        isPreview: state.isPreview,
        stopOnFirstError: settings.stopOnFirstError,
        hasConditionalAccessLicense: state.prerequisiteResult?.licenses?.hasConditionalAccessLicense ?? true,
        hasPremiumP2License: state.prerequisiteResult?.licenses?.hasPremiumP2License ?? true,
        hasWindowsDriverUpdateLicense: state.prerequisiteResult?.licenses?.hasWindowsDriverUpdateLicense ?? true,
        onTaskStart: updateTask,
        onTaskComplete: updateTask,
        onTaskError: updateTask,
        onBatchProgress: updateBatchProgress,
        onStatusUpdate: updateStatus,
        shouldCancel: () => shouldCancelExecution(runId),
        shouldPause: () => shouldPauseExecution(runId),
      };

      // Execute tasks with pause/cancel support
      await executeTasks(tasks, context);
      if (
        shouldCancelExecution(runId) &&
        tasks.some((task) => task.status === "pending" || task.status === "running")
      ) {
        terminalState = createCancelledTerminalState();
        return;
      }

      // Create summary with batch stats
      const endTime = new Date();
      const batchConfig = getBatchConfig();
      const usedBatching =
        batchConfig.enableBatching && operationMode === "create" && !settings.stopOnFirstError;

      // Calculate batch stats
      let batchStats: BatchExecutionStats | undefined;
      if (usedBatching) {
        const batchableTasks = tasks.filter((t) => isBatchableCategory(t.category));
        const sequentialTasks = tasks.filter((t) => !isBatchableCategory(t.category));
        batchStats = {
          batchingEnabled: true,
          batchSize: batchConfig.defaultBatchSize,
          batchRequestCount: Math.ceil(batchableTasks.length / batchConfig.defaultBatchSize),
          batchedTaskCount: batchableTasks.length,
          sequentialTaskCount: sequentialTasks.length,
        };
      }

      const summary = createSummary(
        tenantConfig.tenantId,
        operationMode,
        startTime,
        endTime,
        tasks,
        batchStats,
        tenantConfig.tenantName,
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
  }, [appendActivityMessage, settings.stopOnFirstError, state]);

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
    pause,
    resume,
    cancel,
    reset,
  };
}
