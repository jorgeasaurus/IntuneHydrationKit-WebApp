"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  addRunHistoryEntry,
  createRunHistoryEntry,
  getRunHistoryStorage,
  type RunHistoryWriteResult,
} from "@/lib/history/runHistory";
import type { ExecutionState } from "@/lib/hydration/executionStateStore";

type RecorderInput = Pick<
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
/**
 * Runs that history could not accept because storage was blocked or full. A later dashboard
 * visit tries again, but the warning shows once per run.
 */
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

/** Add the live run to Run history once, when it reaches a terminal state. */
export function useRunHistoryRecorder({
  configuration,
  tasks,
  summary,
  outcome,
  fatalError,
  startTime,
  endTime,
  pausedMs,
  isCompleted,
}: RecorderInput): void {
  useEffect(() => {
    if (!isCompleted || !outcome || !endTime || !configuration) return;
    if (outcome === "failed" ? !fatalError : !summary || !startTime) return;
    const entry = createRunHistoryEntry({
      configuration,
      tasks,
      summary: outcome === "failed" ? null : summary,
      outcome,
      fatalError: outcome === "failed" ? fatalError : null,
      startTime,
      endTime,
      pausedMs,
    });
    if (settledRunIds.has(entry.id)) return;
    const result = addRunHistoryEntry(getRunHistoryStorage(), entry);
    if (result.ok || result.reason === "tooLarge") settledRunIds.add(entry.id);
    if (result.ok) {
      warnedRunIds.delete(entry.id);
      return;
    }
    if (warnedRunIds.has(entry.id)) return;
    warnedRunIds.add(entry.id);
    toast.warning(FAILURE_MESSAGES[result.reason]);
  }, [configuration, endTime, fatalError, isCompleted, outcome, pausedMs, startTime, summary, tasks]);
}
