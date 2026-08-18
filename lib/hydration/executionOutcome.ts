import type { ExecutionOutcome, HydrationTask, SkipKind, TaskStatus } from "@/types/hydration";

export type TaskEvidenceOutcome = Exclude<TaskStatus, "skipped"> | SkipKind;

export function getTaskEvidenceOutcome(task: HydrationTask): TaskEvidenceOutcome {
  return task.status === "skipped" ? task.skipKind : task.status;
}

export function isExpectedNoOpSkip(task: HydrationTask): boolean {
  return task.status === "skipped" && task.skipKind === "noOp";
}

export function getExecutionOutcomeLabel(outcome: ExecutionOutcome | null, successCount: number): string {
  switch (outcome) {
    case "succeeded":
      return `${successCount} succeeded`;
    case "completedWithIssues":
      return "Completed with issues";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Run failed";
    default:
      return `${successCount} succeeded`;
  }
}

export function deriveExecutionOutcome(tasks: HydrationTask[]): ExecutionOutcome {
  if (tasks.some((task) => task.status === "skipped" && task.skipKind === "cancelled")) {
    return "cancelled";
  }

  const hasIssues = tasks.some(
    (task) =>
      task.status === "failed" ||
      task.status === "pending" ||
      task.status === "running" ||
      Boolean(task.warning) ||
      (task.status === "skipped" && !isExpectedNoOpSkip(task)),
  );

  return hasIssues ? "completedWithIssues" : "succeeded";
}
