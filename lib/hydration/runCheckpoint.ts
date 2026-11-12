/**
 * Save the progress of the active run, so that a refresh or a closed tab does not lose it.
 *
 * The final record is written when the run completes. Before that, this module writes a
 * checkpoint record: at most once per interval while tasks change, and once more when the
 * page is hidden or unloaded. A checkpoint keeps the tasks (without request bodies) and
 * only the last activity messages, so a write stays small.
 */

import {
  getExecutionState,
  subscribeExecutionState,
  type ExecutionState,
} from "@/lib/hydration/executionStateStore";
import {
  isExecutionCheckpoint,
  writeExecutionRecord,
  type ExecutionCheckpointRecord,
  type ExecutionRecord,
  type TerminalExecutionRecord,
} from "@/lib/hydration/executionRecord";
import { deriveExecutionOutcome } from "@/lib/hydration/executionOutcome";
import { createSummary } from "@/lib/hydration/reporter";

/** Minimum time between two checkpoint writes. */
export const CHECKPOINT_INTERVAL_MS = 3000;
/** Number of activity messages that a checkpoint keeps. */
export const CHECKPOINT_ACTIVITY_LIMIT = 20;

const ACTIVE_PHASES = new Set<ExecutionState["phase"]>(["running", "paused", "cancelling"]);

/**
 * Checkpoint record of an active run, or null when there is nothing to save
 * (no run, the queue is not built yet, or the run is not active any more).
 */
export function createCheckpointRecord(state: ExecutionState, at: Date): ExecutionCheckpointRecord | null {
  const { configuration } = state;
  if (!configuration || !ACTIVE_PHASES.has(state.phase) || state.tasks.length === 0) return null;
  return {
    tenantId: configuration.tenantId,
    homeAccountId: configuration.homeAccountId,
    tenantName: configuration.tenantName,
    cloudEnvironment: configuration.cloudEnvironment,
    operationMode: configuration.operationMode,
    isPreview: configuration.isPreview,
    selectedObjectCount: configuration.selectedObjectCount,
    scope: configuration.scope,
    licenses: configuration.licenses,
    tasks: state.tasks,
    activityLog: state.activityLog.slice(-CHECKPOINT_ACTIVITY_LIMIT),
    startTime: state.startTime,
    endTime: null,
    pausedMs: state.pausedMs,
    outcome: null,
    summary: null,
    fatalError: null,
    checkpointAt: at,
  };
}

interface CheckpointOptions {
  storage: Storage;
  intervalMs?: number;
  /** Event target for the page hide and unload events. */
  eventTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
}

/**
 * Write checkpoints of the active run until the returned function is called.
 * The write reads the store state at write time, so a delayed write never replaces the
 * final record of a completed run.
 */
export function startRunCheckpoints({
  storage,
  intervalMs = CHECKPOINT_INTERVAL_MS,
  eventTarget,
}: CheckpointOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWriteAt = 0;
  let lastTasks: ExecutionState["tasks"] | null = null;

  const write = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const state = getExecutionState();
    const record = createCheckpointRecord(state, new Date());
    if (!record) return;
    lastWriteAt = Date.now();
    lastTasks = state.tasks;
    try {
      writeExecutionRecord(storage, record);
    } catch (error) {
      // A full storage quota must not stop the run. The run continues without a checkpoint.
      console.warn("[Run checkpoint] Could not save the run progress:", error);
    }
  };

  const onStateChange = (): void => {
    const state = getExecutionState();
    if (state.tasks === lastTasks || !createCheckpointRecord(state, new Date())) return;
    if (timer) return;
    timer = setTimeout(write, Math.max(0, lastWriteAt + intervalMs - Date.now()));
  };

  const unsubscribe = subscribeExecutionState(onStateChange);
  eventTarget?.addEventListener("pagehide", write);
  eventTarget?.addEventListener("beforeunload", write);
  return () => {
    unsubscribe();
    eventTarget?.removeEventListener("pagehide", write);
    eventTarget?.removeEventListener("beforeunload", write);
    if (timer) clearTimeout(timer);
  };
}

/**
 * A checkpoint whose tasks all finished (for example a refresh after the last task, or after a
 * cancel marked the rest skipped) is a finished run, not an interrupted one. This returns its
 * terminal record, with the last saved time as the end time, or null when tasks did not finish.
 */
export function completeFinishedCheckpoint(record: ExecutionCheckpointRecord): TerminalExecutionRecord | null {
  if (record.startTime === null || record.tasks.length === 0) return null;
  if (record.tasks.some((task) => task.status === "pending" || task.status === "running")) return null;
  const { checkpointAt, ...rest } = record;
  const summary = createSummary(
    record.tenantId,
    record.operationMode,
    record.startTime,
    checkpointAt,
    record.tasks,
    undefined,
    record.tenantName,
    undefined,
    record.pausedMs ?? 0,
  );
  return {
    ...rest,
    activityLog: [
      ...record.activityLog,
      {
        id: `checkpoint-complete-${checkpointAt.getTime()}`,
        timestamp: checkpointAt,
        message: "Every task finished before the page was closed or refreshed. The end time is the last saved time.",
        type: "info",
        category: "control",
      },
    ],
    endTime: checkpointAt,
    outcome: deriveExecutionOutcome(record.tasks),
    summary,
    fatalError: null,
  } as TerminalExecutionRecord;
}

/**
 * The saved record to show. A finished checkpoint is saved again as a terminal record, so the
 * dashboard shows the results view and can offer to retry failed tasks.
 */
export function prepareRestoredRecord(record: ExecutionRecord, storage: Storage): ExecutionRecord {
  if (!isExecutionCheckpoint(record)) return record;
  const finished = completeFinishedCheckpoint(record);
  if (!finished) return record;
  try {
    writeExecutionRecord(storage, finished);
    return finished;
  } catch (error) {
    console.warn("[Run checkpoint] Could not save the finished run:", error);
    return record;
  }
}
