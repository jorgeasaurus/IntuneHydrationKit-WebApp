import type { RunHistoryEntry } from "@/lib/history/runHistory";

/** Mode label for a run: create, delete, or a preview of one of them. */
export function getRunModeLabel(entry: Pick<RunHistoryEntry, "operationMode" | "isPreview">): string {
  const operation = entry.operationMode === "delete" ? "Delete" : "Create";
  return entry.isPreview ? `Preview (${operation.toLowerCase()})` : operation;
}

export function formatRunDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const OUTCOME_LABELS: Record<RunHistoryEntry["outcome"], string> = {
  succeeded: "Succeeded",
  completedWithIssues: "Completed with issues",
  cancelled: "Cancelled",
  failed: "Run failed",
};

export function getRunOutcomeLabel(outcome: RunHistoryEntry["outcome"]): string {
  return OUTCOME_LABELS[outcome];
}
