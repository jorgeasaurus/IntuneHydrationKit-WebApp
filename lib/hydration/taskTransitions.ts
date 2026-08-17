import type { HydrationTask, SkipKind } from "@/types/hydration";

export function markTaskSkipped(
  task: HydrationTask,
  skipKind: SkipKind,
  error?: string,
): asserts task is HydrationTask & { status: "skipped"; skipKind: SkipKind } {
  Object.assign(task, { status: "skipped", skipKind, error });
}
