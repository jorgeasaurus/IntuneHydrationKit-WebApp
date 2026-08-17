import type { ActivityMessage } from "@/lib/hydration/types";
import type {
  BatchProgress,
  ExecutionOutcome,
  HydrationSummary,
  HydrationTask,
  OperationMode,
} from "@/types/hydration";

export interface ExecutionRunConfiguration {
  tenantId: string;
  homeAccountId: string;
  tenantName?: string;
  operationMode: OperationMode;
  isPreview: boolean;
  selectedObjectCount: number;
}

export interface ExecutionState {
  runId: number | null;
  configuration: ExecutionRunConfiguration | null;
  tasks: HydrationTask[];
  phase: "idle" | "building" | "running" | "paused" | "cancelling" | "completed";
  startTime: Date | null;
  endTime: Date | null;
  summary: HydrationSummary | null;
  outcome: ExecutionOutcome | null;
  fatalError: string | null;
  batchProgress: BatchProgress | null;
  activityLog: ActivityMessage[];
}

type TerminalExecutionState = Pick<ExecutionState, "endTime" | "summary" | "outcome" | "fatalError">;

interface ExecutionControl {
  activeRunId: number | null;
  nextRunId: number;
  paused: boolean;
  cancelRequested: boolean;
  discardOnFinish: boolean;
}

const INITIAL_EXECUTION_STATE: ExecutionState = {
  runId: null,
  configuration: null,
  tasks: [],
  phase: "idle",
  startTime: null,
  endTime: null,
  summary: null,
  outcome: null,
  fatalError: null,
  batchProgress: null,
  activityLog: [],
};

let executionState = INITIAL_EXECUTION_STATE;
const listeners = new Set<() => void>();
const executionControl: ExecutionControl = {
  activeRunId: null,
  nextRunId: 1,
  paused: false,
  cancelRequested: false,
  discardOnFinish: false,
};

function publishExecutionState(nextState: ExecutionState): void {
  executionState = nextState;
  listeners.forEach((listener) => listener());
}

export function getExecutionState(): ExecutionState {
  return executionState;
}

export function subscribeExecutionState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateExecutionStateForRun(runId: number, update: (previous: ExecutionState) => ExecutionState): void {
  if (executionState.runId !== runId) return;
  publishExecutionState(update(executionState));
}

export function beginExecution(configuration: ExecutionRunConfiguration): number | null {
  if (executionControl.activeRunId !== null) return null;
  const runId = executionControl.nextRunId++;
  executionControl.activeRunId = runId;
  executionControl.paused = false;
  executionControl.cancelRequested = false;
  executionControl.discardOnFinish = false;
  publishExecutionState({
    ...INITIAL_EXECUTION_STATE,
    runId,
    configuration,
    phase: "building",
  });
  return runId;
}

export function shouldCancelExecution(runId: number): boolean {
  return executionControl.activeRunId !== runId || executionControl.cancelRequested;
}

export function shouldPauseExecution(runId: number): boolean {
  return executionControl.activeRunId === runId && executionControl.paused;
}

export function pauseExecution(runId: number): boolean {
  if (executionControl.activeRunId !== runId || executionControl.paused || executionControl.cancelRequested) {
    return false;
  }
  executionControl.paused = true;
  updateExecutionStateForRun(runId, (current) => ({
    ...current,
    phase: "paused",
  }));
  return true;
}

export function resumeExecution(runId: number): boolean {
  if (executionControl.activeRunId !== runId || !executionControl.paused || executionControl.cancelRequested) {
    return false;
  }
  executionControl.paused = false;
  updateExecutionStateForRun(runId, (current) => ({
    ...current,
    phase: "running",
  }));
  return true;
}

export function cancelExecution(runId: number): boolean {
  if (executionControl.activeRunId !== runId || executionControl.cancelRequested) {
    return false;
  }
  executionControl.cancelRequested = true;
  executionControl.paused = false;
  updateExecutionStateForRun(runId, (current) => ({
    ...current,
    phase: "cancelling",
  }));
  return true;
}

export function finishExecution(runId: number, terminalState: TerminalExecutionState): void {
  if (executionControl.activeRunId !== runId) return;
  executionControl.activeRunId = null;
  executionControl.paused = false;
  executionControl.cancelRequested = false;
  if (executionControl.discardOnFinish) {
    executionControl.discardOnFinish = false;
    publishExecutionState(INITIAL_EXECUTION_STATE);
    return;
  }
  updateExecutionStateForRun(runId, (current) => ({
    ...current,
    phase: "completed",
    ...terminalState,
    batchProgress: current.batchProgress ? { ...current.batchProgress, isActive: false } : null,
  }));
}

export function resetExecutionSession(): void {
  if (executionControl.activeRunId !== null) {
    executionControl.cancelRequested = true;
    executionControl.paused = false;
    executionControl.discardOnFinish = true;
    publishExecutionState({
      ...INITIAL_EXECUTION_STATE,
      phase: "cancelling",
    });
    return;
  }
  publishExecutionState(INITIAL_EXECUTION_STATE);
}

export function forceResetExecutionSessionForTests(): void {
  executionControl.activeRunId = null;
  executionControl.paused = false;
  executionControl.cancelRequested = false;
  executionControl.discardOnFinish = false;
  executionControl.nextRunId = 1;
  publishExecutionState(INITIAL_EXECUTION_STATE);
}
