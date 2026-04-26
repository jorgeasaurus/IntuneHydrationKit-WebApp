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

  const pauseRef = useRef(false);
  const cancelRef = useRef(false);
  const executionLockRef = useRef(false);

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
    // Prevent duplicate execution (React Strict Mode protection)
    if (executionLockRef.current) {
      console.log("[Execution Hook] Execution already in progress, ignoring duplicate call");
      return;
    }

    if (!state.tenantConfig || !state.operationMode || state.selectedTargets.length === 0) {
      throw new Error("Invalid wizard state. Please complete the wizard first.");
    }

    // Acquire execution lock
    executionLockRef.current = true;

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
    const tasks = await buildTaskQueueAsync(
      state.selectedTargets,
      state.operationMode,
      {
        selectedCISCategories: state.selectedCISCategories,
        baselineSelection: state.baselineSelection,
        categorySelections: state.categorySelections,
        onProgress: emitQueueProgress,
      }
    );
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

    // Reset control refs
    pauseRef.current = false;
    cancelRef.current = false;

    try {
      // Create Graph client
      const client = createGraphClient(state.tenantConfig.cloudEnvironment);

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
        shouldCancel: () => cancelRef.current,
        shouldPause: () => pauseRef.current,
      };

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
        batchStats
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
    } finally {
      // Release execution lock
      executionLockRef.current = false;
    }
  }, [settings.stopOnFirstError, state]);

  /**
   * Pause execution
   */
  const pause = useCallback(() => {
    pauseRef.current = true;
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
    pauseRef.current = false;
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
    cancelRef.current = true;
    pauseRef.current = false;
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
    pauseRef.current = false;
    cancelRef.current = false;
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
