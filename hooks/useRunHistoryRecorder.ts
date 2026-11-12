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
 * Runs that this page session already added. The execution state outlives the dashboard
 * page, so without this a return to /dashboard would add a run again after the user deleted it.
 */
const recordedRunIds = new Set<string>();

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
    if (recordedRunIds.has(entry.id)) return;
    recordedRunIds.add(entry.id);
    const result = addRunHistoryEntry(getRunHistoryStorage(), entry);
    if (!result.ok) toast.warning(FAILURE_MESSAGES[result.reason]);
  }, [configuration, endTime, fatalError, isCompleted, outcome, pausedMs, startTime, summary, tasks]);
}
