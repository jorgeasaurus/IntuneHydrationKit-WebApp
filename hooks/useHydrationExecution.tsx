"use client";

import { useState, useCallback, useRef } from "react";
import { HydrationTask, HydrationSummary } from "@/types/hydration";
import { createGraphClient } from "@/lib/graph/client";
import { buildTaskQueueAsync, executeTasks, ExecutionContext } from "@/lib/hydration/engine";
import { createSummary } from "@/lib/hydration/reporter";
import { useWizardState } from "./useWizardState";

interface ExecutionState {
  tasks: HydrationTask[];
  isRunning: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  startTime: Date | null;
  endTime: Date | null;
  summary: HydrationSummary | null;
}

export function useHydrationExecution() {
  const { state } = useWizardState();
  const [executionState, setExecutionState] = useState<ExecutionState>({
    tasks: [],
    isRunning: false,
    isPaused: false,
    isCompleted: false,
    startTime: null,
    endTime: null,
    summary: null,
  });

  const pauseRef = useRef(false);
  const cancelRef = useRef(false);
  const executionLockRef = useRef(false);

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

    // Build task queue with real templates from local IntuneTemplates directory
    const tasks = await buildTaskQueueAsync(
      state.selectedTargets,
      state.operationMode,
      {
        selectedCISCategories: state.selectedCISCategories,
        baselineSelection: state.baselineSelection,
        categorySelections: state.categorySelections,
      }
    );
    const startTime = new Date();

    setExecutionState({
      tasks,
      isRunning: true,
      isPaused: false,
      isCompleted: false,
      startTime,
      endTime: null,
      summary: null,
    });

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

      // Create execution context
      const context: ExecutionContext = {
        client,
        operationMode: state.operationMode,
        stopOnFirstError: false,
        hasPremiumP2License: state.prerequisiteResult?.licenses?.hasPremiumP2License ?? true,
        hasWindowsDriverUpdateLicense: state.prerequisiteResult?.licenses?.hasWindowsDriverUpdateLicense ?? true,
        onTaskStart: updateTask,
        onTaskComplete: updateTask,
        onTaskError: updateTask,
        shouldCancel: () => cancelRef.current,
        shouldPause: () => pauseRef.current,
      };

      // Execute tasks with pause/cancel support
      await executeTasks(tasks, context);

      // Create summary
      const endTime = new Date();
      const summary = createSummary(
        state.tenantConfig.tenantId,
        state.operationMode,
        startTime,
        endTime,
        tasks
      );

      setExecutionState((prev) => ({
        ...prev,
        isRunning: false,
        isCompleted: true,
        endTime,
        summary,
      }));
    } catch (error) {
      console.error("Execution failed:", error);
      setExecutionState((prev) => ({
        ...prev,
        isRunning: false,
        isCompleted: true,
        endTime: new Date(),
      }));
      throw error;
    } finally {
      // Release execution lock
      executionLockRef.current = false;
    }
  }, [state]);

  /**
   * Pause execution
   */
  const pause = useCallback(() => {
    pauseRef.current = true;
    setExecutionState((prev) => ({
      ...prev,
      isPaused: true,
    }));
  }, []);

  /**
   * Resume execution
   */
  const resume = useCallback(() => {
    pauseRef.current = false;
    setExecutionState((prev) => ({
      ...prev,
      isPaused: false,
    }));
  }, []);

  /**
   * Cancel execution
   */
  const cancel = useCallback(() => {
    cancelRef.current = true;
    pauseRef.current = false;
    setExecutionState((prev) => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      isCompleted: true,
      endTime: new Date(),
    }));
  }, []);

  /**
   * Reset execution state
   */
  const reset = useCallback(() => {
    setExecutionState({
      tasks: [],
      isRunning: false,
      isPaused: false,
      isCompleted: false,
      startTime: null,
      endTime: null,
      summary: null,
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
