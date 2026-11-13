import type { HydrationTask } from "@/types/hydration";
import type { ExecutionContext } from "./types";
import { getCachedTemplates, type BaselinePolicy } from "@/lib/templates/loader";
import { findBaselineTemplateForTask } from "@/lib/templates/baselineLookup";

/**
 * Put the ID of the object that a successful live create made on the task.
 * The dashboard and the saved run record use it for the admin portal link.
 * Preview runs, delete tasks, and tasks without an ID get nothing.
 * Call this before `onTaskComplete`, so that the link shows when the task ends.
 */
export function recordCreatedObject(
  task: HydrationTask,
  createdId: string | undefined,
  context: Pick<ExecutionContext, "isPreview" | "cachedBaselineTemplates">,
): void {
  if (!createdId || context.isPreview || task.operation !== "create" || task.status !== "success") return;
  const policyType = task.category === "baseline" ? getBaselinePolicyType(task, context) : undefined;
  task.createdObject = policyType ? { id: createdId, policyType } : { id: createdId };
}

function getBaselinePolicyType(
  task: HydrationTask,
  context: Pick<ExecutionContext, "cachedBaselineTemplates">,
): string | undefined {
  const templates = context.cachedBaselineTemplates ?? (getCachedTemplates("baseline") as BaselinePolicy[] | null);
  return templates ? findBaselineTemplateForTask(templates, task)?._oibPolicyType || undefined : undefined;
}
