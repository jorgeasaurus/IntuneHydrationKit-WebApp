"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  addRunHistoryEntry,
  clearPendingRunHistoryId,
  createRunHistoryEntry,
  getRunHistoryStorage,
  markPendingRunHistoryId,
  readPendingRunHistoryId,
  type FinishedRun,
  type RunHistoryWriteResult,
} from "@/lib/history/runHistory";
import type { ExecutionRecord } from "@/lib/hydration/executionRecord";
import type { ExecutionState } from "@/lib/hydration/executionStateStore";

type LiveRun = Pick<
  ExecutionState,
  "configuration" | "tasks" | "summary" | "outcome" | "fatalError" | "startTime" | "endTime" | "pausedMs"
> & { isCompleted: boolean };

/**
 * Runs that need no further write in this page session: runs that history accepted, and runs
 * that are larger than the history cap (the cap does not change, so a retry cannot work).
 * The execution state outlives the dashboard page, so without this a return to /dashboard
 * would add a run again after the user deleted it.
 */
const settledRunIds = new Set<string>();
/** Runs whose storage warning this page session showed. */
const warnedRunIds = new Set<string>();

/** Test-only: forget the runs of this page session. */
export function resetRunHistoryRecorderForTests(): void {
  settledRunIds.clear();
  warnedRunIds.clear();
}

const FAILURE_MESSAGES: Record<Extract<RunHistoryWriteResult, { ok: false }>["reason"], string> = {
  unavailable: "Run history is not available because this browser blocks session storage.",
  full: "Browser storage is full, so this run is not in Run history. Download the reports now.",
  tooLarge: "This run is too large for Run history. Download the reports now.",
};

function getLiveFinishedRun(live: LiveRun): FinishedRun | null {
  const { configuration, outcome, endTime, fatalError, summary, startTime } = live;
  if (!live.isCompleted || !outcome || !endTime || !configuration) return null;
  if (outcome === "failed" ? !fatalError : !summary || !startTime) return null;
  return {
    configuration,
    tasks: live.tasks,
    summary: outcome === "failed" ? null : summary,
    outcome,
    fatalError: outcome === "failed" ? fatalError : null,
    startTime,
    endTime,
    pausedMs: live.pausedMs,
  };
}

function getRestoredFinishedRun(record: ExecutionRecord): FinishedRun {
  return {
    configuration: {
      tenantId: record.tenantId,
      homeAccountId: record.homeAccountId,
      tenantName: record.tenantName,
      cloudEnvironment: record.cloudEnvironment,
      operationMode: record.operationMode,
      isPreview: record.isPreview,
      selectedObjectCount: record.selectedObjectCount,
    },
    tasks: record.tasks,
    summary: record.summary,
    outcome: record.outcome,
    fatalError: record.fatalError,
    startTime: record.startTime,
    endTime: record.endTime,
    pausedMs: record.pausedMs ?? 0,
  };
}

/**
 * Add a finished run to Run history once.
 *
 * - A live run is added when it reaches a terminal state.
 * - A run that the dashboard restored after a page refresh is added only when history refused
 *   it before (blocked or full storage). A run that history stored is never added again, so a
 *   run that the user deleted from history does not come back.
 *
 * The dashboard restores only a record of the active account and tenant, so the restored run
 * has the same scope as a live run. A refused run shows one warning, also across a refresh.
 */
export function useRunHistoryRecorder(live: LiveRun, restoredRecord: ExecutionRecord | null): void {
  const { configuration, tasks, summary, outcome, fatalError, startTime, endTime, pausedMs, isCompleted } = live;

  useEffect(() => {
    const restored = restoredRecord !== null;
    const run = restoredRecord
      ? getRestoredFinishedRun(restoredRecord)
      : getLiveFinishedRun({ configuration, tasks, summary, outcome, fatalError, startTime, endTime, pausedMs, isCompleted });
    if (!run) return;
    const entry = createRunHistoryEntry(run);
    if (settledRunIds.has(entry.id)) return;

    const storage = getRunHistoryStorage();
    const pendingId = readPendingRunHistoryId(storage);
    if (restored && pendingId !== entry.id) return;

    const result = addRunHistoryEntry(storage, entry);
    if (result.ok || result.reason === "tooLarge") {
      settledRunIds.add(entry.id);
      if (pendingId === entry.id) clearPendingRunHistoryId(storage);
    } else {
      markPendingRunHistoryId(storage, entry.id);
    }
    if (result.ok) return;

    // A pending mark for this run means that an earlier page session showed the warning.
    if (warnedRunIds.has(entry.id) || pendingId === entry.id) return;
    warnedRunIds.add(entry.id);
    toast.warning(FAILURE_MESSAGES[result.reason]);
  }, [configuration, endTime, fatalError, isCompleted, outcome, pausedMs, restoredRecord, startTime, summary, tasks]);
}
