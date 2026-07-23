"use client";

import { useState, useCallback, useRef } from "react";
import { HydrationTask, HydrationSummary, BatchExecutionStats, BatchProgress } from "@/types/hydration";
import { createGraphClient } from "@/lib/graph/client";
import { buildTaskQueueAsync, executeTasks, ExecutionContext } from "@/lib/hydration/engine";
import { ActivityMessage } from "@/lib/hydration/types";
import { createSummary } from "@/lib/hydration/reporter";
import { useWizardState } from "./useWizardState";
import { getBatchConfig } from "@/lib/config/batchConfig";
import { isBatchableCategory } from "@/lib/hydration/batchExecutor";
import { useSettings } from "./useSettings";

interface ExecutionState {
  tasks: HydrationTask[];
  isRunning: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  isBuildingQueue: boolean;
  startTime: Date | null;
  endTime: Date | null;
  summary: HydrationSummary | null;
  batchProgress: BatchProgress | null;
  /** Activity log showing what's happening behind the scenes */
  activityLog: ActivityMessage[];
}

/**
 * Execution run state shared at module scope.
 *
 * The dashboard page can unmount mid-run (user navigates away) while the async
 * execution loop keeps running. A remount creates a NEW hook instance; if the
 * lock lived in a ref, the new instance would happily start a SECOND concurrent
 * execution against the tenant. Module scope also lets pause/cancel from the
 * new instance reach the still-running loop from the old instance.
 *
 * Modelled as a single status so illegal combinations (e.g. "not running but
 * paused") are unrepresentable; `cancelled` is a one-shot signal consumed by
 * the running loop, independent of pause state.
 */
interface ExecutionRun {
  status: "idle" | "running" | "paused";
  cancelled: boolean;
}

const executionRun: ExecutionRun = {
  status: "idle",
  cancelled: false,
};

/** Test-only: reset the shared run state between tests. */
export function resetExecutionControlForTests(): void {
  executionRun.status = "idle";
  executionRun.cancelled = false;
}

export function useHydrationExecution() {
  const { state } = useWizardState();
  const { settings } = useSettings();
  const [executionState, setExecutionState] = useState<ExecutionState>({
    tasks: [],
    isRunning: false,
    isPaused: false,
    isCompleted: false,
    isBuildingQueue: false,
    startTime: null,
    endTime: null,
    summary: null,
    batchProgress: null,
    activityLog: [],
  });

  // Counter for generating unique activity message IDs
  const activityIdCounter = useRef(0);

  const appendActivityMessage = useCallback(
    (message: string, type: ActivityMessage["type"], category = "control") => {
      const activityMessage: ActivityMessage = {
        id: `activity-${activityIdCounter.current++}`,
        timestamp: new Date(),
        message,
        type,
        category,
      };

      setExecutionState((prev) => ({
        ...prev,
        activityLog: [...prev.activityLog.slice(-99), activityMessage],
      }));
    },
    []
  );

  /**
   * Start execution
   */
  const startExecution = useCallback(async () => {
    // Prevent duplicate execution (React Strict Mode + dashboard remounts)
    if (executionRun.status !== "idle") {
      console.log("[Execution Hook] Execution already in progress, ignoring duplicate call");
      appendActivityMessage(
        "An execution is already in progress. Duplicate start ignored.",
        "warning"
      );
      return;
    }

    if (!state.tenantConfig || !state.operationMode || state.selectedTargets.length === 0) {
      throw new Error("Invalid wizard state. Please complete the wizard first.");
    }

    // Acquire the run. It is released exactly once in the finally below, no
    // matter where the run fails (queue build, empty queue, or task
    // execution) - scattered release sites are how deadlocks happen.
    executionRun.status = "running";
    try {
      // Signal that we're building the task queue
      const emitQueueProgress = (message: string, type: ActivityMessage["type"] = "progress") => {
        const msg: ActivityMessage = {
          id: `queue-${activityIdCounter.current++}`,
          timestamp: new Date(),
          message,
          type,
          category: "queue",
        };
        setExecutionState((prev) => ({
          ...prev,
          activityLog: [...prev.activityLog.slice(-99), msg],
        }));
      };

      setExecutionState((prev) => ({
        ...prev,
        isBuildingQueue: true,
        activityLog: [],
      }));

      emitQueueProgress("Building task queue...");

      // Build task queue with real templates from local IntuneTemplates directory
      let tasks: HydrationTask[];
      try {
        tasks = await buildTaskQueueAsync(
          state.selectedTargets,
          state.operationMode,
          {
            selectedCISCategories: state.selectedCISCategories,
            baselineSelection: state.baselineSelection,
            categorySelections: state.categorySelections,
            onProgress: emitQueueProgress,
          }
        );
      } catch (error) {
        setExecutionState((prev) => ({
          ...prev,
          isBuildingQueue: false,
        }));
        throw error;
      }
      if (tasks.length === 0) {
        emitQueueProgress(
          "No tasks were queued. Check that templates are available and your selections are valid.",
          "error"
        );
        setExecutionState((prev) => ({
          ...prev,
          isBuildingQueue: false,
        }));
        throw new Error(
          "Task queue is empty. No tasks were queued for execution — templates may have failed to load."
        );
      }

      const startTime = new Date();

      emitQueueProgress(`Task queue ready: ${tasks.length} tasks queued`, "success");

      setExecutionState((prev) => ({
        ...prev,
        tasks,
        isRunning: true,
        isPaused: false,
        isCompleted: false,
        isBuildingQueue: false,
        startTime,
        endTime: null,
        summary: null,
        batchProgress: null,
      }));

      // Start the run uncancelled (status was set to "running" on acquisition)
      executionRun.cancelled = false;

      // Create Graph client
      const client = createGraphClient();

      // Task update callback for all task events
      const updateTask = (task: HydrationTask) => {
        setExecutionState((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === task.id ? task : t)),
        }));
      };

      // Batch progress callback
      const updateBatchProgress = (progress: BatchProgress) => {
        setExecutionState((prev) => ({
          ...prev,
          batchProgress: progress,
        }));
      };

      // Status update callback for activity log
      const updateStatus = (message: ActivityMessage) => {
        // Generate unique ID if not provided
        const msgWithId: ActivityMessage = {
          ...message,
          id: message.id || `activity-${activityIdCounter.current++}`,
        };
        setExecutionState((prev) => ({
          ...prev,
          // Keep last 100 messages to prevent memory issues
          activityLog: [...prev.activityLog.slice(-99), msgWithId],
        }));
      };

      // Create execution context
      const context: ExecutionContext = {
        client,
        tenantId: state.tenantConfig.tenantId,
        operationMode: state.operationMode,
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
        shouldCancel: () => executionRun.cancelled,
        shouldPause: () => executionRun.status === "paused",
      };

      try {
        // Execute tasks with pause/cancel support
        await executeTasks(tasks, context);

        // Create summary with batch stats
        const endTime = new Date();
        const batchConfig = getBatchConfig();
        const usedBatching = batchConfig.enableBatching && state.operationMode === "create";

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
          state.tenantConfig.tenantId,
          state.operationMode,
          startTime,
          endTime,
          tasks,
          batchStats,
          state.tenantConfig.tenantName
        );

        setExecutionState((prev) => ({
          ...prev,
          isRunning: false,
          isCompleted: true,
          endTime,
          summary,
          batchProgress: prev.batchProgress ? { ...prev.batchProgress, isActive: false } : null,
        }));
      } catch (error) {
        console.error("Execution failed:", error);
        setExecutionState((prev) => ({
          ...prev,
          isRunning: false,
          isCompleted: true,
          endTime: new Date(),
          batchProgress: prev.batchProgress ? { ...prev.batchProgress, isActive: false } : null,
        }));
        throw error;
      }
    } finally {
      // Release the run
      executionRun.status = "idle";
    }
  }, [appendActivityMessage, settings.stopOnFirstError, state]);

  /**
   * Pause execution
   */
  const pause = useCallback(() => {
    if (executionRun.status !== "running") return;
    executionRun.status = "paused";
    appendActivityMessage("Pause requested. Execution will stop after the current in-flight work completes.", "warning");
    setExecutionState((prev) => ({
      ...prev,
      isPaused: true,
    }));
  }, [appendActivityMessage]);

  /**
   * Resume execution
   */
  const resume = useCallback(() => {
    if (executionRun.status !== "paused") return;
    executionRun.status = "running";
    appendActivityMessage("Execution resumed.", "info");
    setExecutionState((prev) => ({
      ...prev,
      isPaused: false,
    }));
  }, [appendActivityMessage]);

  /**
   * Cancel execution
   */
  const cancel = useCallback(() => {
    executionRun.cancelled = true;
    // Unpause so the running loop can observe the cancellation and exit
    if (executionRun.status === "paused") {
      executionRun.status = "running";
    }
    appendActivityMessage("Cancellation requested. Remaining work will be skipped.", "warning");
    setExecutionState((prev) => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      isCompleted: true,
      endTime: new Date(),
    }));
  }, [appendActivityMessage]);

  /**
   * Reset execution state
   */
  const reset = useCallback(() => {
    setExecutionState({
      tasks: [],
      isRunning: false,
      isPaused: false,
      isCompleted: false,
      isBuildingQueue: false,
      startTime: null,
      endTime: null,
      summary: null,
      batchProgress: null,
      activityLog: [],
    });
    executionRun.cancelled = false;
  }, []);

  return {
    ...executionState,
    startExecution,
    pause,
    resume,
    cancel,
    reset,
  };
}
