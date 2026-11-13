import { getExecutionOutcomeLabel } from "@/lib/hydration/executionOutcome";
import type { ExecutionOutcome, HydrationTask } from "@/types/hydration";

/** Minimum time between two live progress announcements. */
export const ANNOUNCEMENT_INTERVAL_MS = 5000;

/** Minimum number of completed tasks between two progress announcements. */
const MIN_PROGRESS_STEP = 10;

export interface AnnouncementCursor {
  completed: number;
  failedIds: ReadonlySet<string>;
}

export const INITIAL_ANNOUNCEMENT_CURSOR: AnnouncementCursor = {
  completed: 0,
  failedIds: new Set(),
};

function isFinished(task: HydrationTask): boolean {
  return task.status === "success" || task.status === "failed" || task.status === "skipped";
}

/**
 * Number of completed tasks between progress announcements. Large runs
 * announce about every tenth of the queue so the screen reader is not flooded.
 */
export function getProgressStep(total: number): number {
  return Math.max(MIN_PROGRESS_STEP, Math.ceil(total / 10));
}

/**
 * Builds the next live-region message for a running execution.
 * Returns null when nothing new is worth announcing.
 */
export function buildProgressAnnouncement(
  tasks: readonly HydrationTask[],
  cursor: AnnouncementCursor,
): { message: string; cursor: AnnouncementCursor } | null {
  let completed = 0;
  const newFailures: HydrationTask[] = [];
  const failedIds = new Set(cursor.failedIds);

  for (const task of tasks) {
    if (isFinished(task)) completed += 1;
    if (task.status === "failed" && !failedIds.has(task.id)) {
      failedIds.add(task.id);
      newFailures.push(task);
    }
  }

  const progressDue = completed - cursor.completed >= getProgressStep(tasks.length);
  if (newFailures.length === 0 && !progressDue) {
    return null;
  }

  const parts: string[] = [];
  if (newFailures.length === 1) {
    parts.push(`Failed: ${newFailures[0].itemName}.`);
  } else if (newFailures.length > 1) {
    parts.push(
      `${newFailures.length} tasks failed. Latest: ${newFailures[newFailures.length - 1].itemName}.`,
    );
  }
  parts.push(`${completed} of ${tasks.length} tasks complete.`);

  return { message: parts.join(" "), cursor: { completed, failedIds } };
}

/** Builds the final live-region message for a completed execution. */
export function buildOutcomeAnnouncement(
  tasks: readonly HydrationTask[],
  outcome: ExecutionOutcome | null,
): string {
  const succeeded = tasks.filter((task) => task.status === "success").length;
  const failed = tasks.filter((task) => task.status === "failed").length;
  const label = getExecutionOutcomeLabel(outcome, succeeded);
  return failed > 0 ? `Run finished: ${label}. ${failed} failed.` : `Run finished: ${label}.`;
}
