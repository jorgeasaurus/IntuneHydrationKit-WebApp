import type { ActivityMessage } from "@/lib/hydration/types";
import type {
  BatchProgress,
  CloudEnvironment,
  ExecutionOutcome,
  HydrationSummary,
  HydrationTask,
  OperationMode,
} from "@/types/hydration";

export interface ExecutionRunConfiguration {
  tenantId: string;
  homeAccountId: string;
  tenantName?: string;
  /** Cloud of the run. The admin portal links use it. */
  cloudEnvironment?: CloudEnvironment;
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
  /** Total time of closed engine pause waits, in milliseconds. */
  pausedMs: number;
  /** Start of the open engine pause wait, or null when the engine does not wait. */
  pauseStartedAt: Date | null;
}

type TerminalExecutionState = Pick<ExecutionState, "endTime" | "summary" | "outcome" | "fatalError">;

interface ExecutionControl {
  activeRunId: number | null;
  nextRunId: number;
  paused: boolean;
  cancelRequested: boolean;
  discardOnFinish: boolean;
  /** Number of engine waits open at the same time (parallel requests can wait together). */
  pauseWaitDepth: number;
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
  pausedMs: 0,
  pauseStartedAt: null,
};

let executionState = INITIAL_EXECUTION_STATE;
const listeners = new Set<() => void>();
const executionControl: ExecutionControl = {
  activeRunId: null,
  nextRunId: 1,
  paused: false,
  cancelRequested: false,
  discardOnFinish: false,
  pauseWaitDepth: 0,
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
  executionControl.pauseWaitDepth = 0;
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

/** Add an open pause wait to the closed total. */
function closePauseWait(state: ExecutionState, closedAt: Date): ExecutionState {
  if (!state.pauseStartedAt) return state;
  return {
    ...state,
    pausedMs: state.pausedMs + Math.max(0, closedAt.getTime() - state.pauseStartedAt.getTime()),
    pauseStartedAt: null,
  };
}

/**
 * Paused time of the current run up to a time: closed waits plus the open wait.
 * finishExecution closes an open wait at the end time, so a summary that uses this
 * value with the same end time matches the final state.
 */
export function getPausedMsAt(at: Date): number {
  return closePauseWait(executionState, at).pausedMs;
}

/**
 * Record the start (true) or end (false) of a real engine wait while the run is paused.
 * This does not change the phase: "paused" is published when the user pauses the run.
 * Parallel waits are counted, so the interval is open while at least one wait is open.
 *
 * Known limit: when work runs in parallel (for example the Promise.all of
 * executeDeletesInParallel, or parallel reads in a task), one request can start a paused
 * retry wait while another request of the same group is still in flight. The interval
 * then opens before all work has stopped. The other request does not start new work
 * during the pause: when its response arrives, it either completes or also waits. So the
 * error is at most the remaining time of the requests already in flight (usually below a
 * few seconds per pause). Exact accounting would need request tracking in the Graph
 * client and at every parallel call site, which is not worth that complexity.
 */
export function recordPauseWait(runId: number, waiting: boolean): void {
  if (executionControl.activeRunId !== runId) return;
  if (waiting) {
    executionControl.pauseWaitDepth += 1;
    if (executionControl.pauseWaitDepth !== 1) return;
    updateExecutionStateForRun(runId, (current) => ({ ...current, pauseStartedAt: new Date() }));
    return;
  }
  if (executionControl.pauseWaitDepth === 0) return;
  executionControl.pauseWaitDepth -= 1;
  if (executionControl.pauseWaitDepth !== 0) return;
  updateExecutionStateForRun(runId, (current) => closePauseWait(current, new Date()));
}

/**
 * Pause the active run. The engine uses this when the sign-in session is lost, so the
 * user can resume the run with the Resume control.
 */
export function pauseActiveExecution(): boolean {
  return executionControl.activeRunId !== null && pauseExecution(executionControl.activeRunId);
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
  executionControl.pauseWaitDepth = 0;
  if (executionControl.discardOnFinish) {
    executionControl.discardOnFinish = false;
    publishExecutionState(INITIAL_EXECUTION_STATE);
    return;
  }
  updateExecutionStateForRun(runId, (current) => ({
    ...closePauseWait(current, terminalState.endTime ?? new Date()),
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
  executionControl.pauseWaitDepth = 0;
  executionControl.nextRunId = 1;
  publishExecutionState(INITIAL_EXECUTION_STATE);
}
