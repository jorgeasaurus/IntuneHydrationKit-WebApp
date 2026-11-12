/**
 * Continue from an earlier run without the wizard: retry failed tasks, resume an
 * interrupted run, or run a preview for real.
 *
 * Every kind starts a new run through the normal engine path. The queue is built from the
 * templates again (never from stored request bodies), and the engine does a fresh tenant
 * prefetch, the same existence checks, and the same delete resolver and safety checks.
 */

import type { ExecutionRunConfiguration } from "@/lib/hydration/executionStateStore";
import type { RunScope } from "@/lib/hydration/runScope";
import { buildTaskQueueAsync, getEstimatedTaskCount } from "@/lib/hydration/engine";
import type { ActivityMessage } from "@/lib/hydration/types";
import type { CloudEnvironment, HydrationTask, OperationMode } from "@/types/hydration";

export type RerunKind = "retry" | "resume" | "live";

/** The earlier run that a new run continues from. */
export interface RerunSource {
  tenantId: string;
  homeAccountId: string;
  tenantName?: string;
  cloudEnvironment?: CloudEnvironment;
  operationMode: OperationMode;
  isPreview: boolean;
  tasks: HydrationTask[];
  scope?: ExecutionRunConfiguration["scope"];
  licenses?: ExecutionRunConfiguration["licenses"];
}

/** A new run that continues from an earlier run. */
export interface RerunPlan {
  kind: RerunKind;
  configuration: ExecutionRunConfiguration;
  /** Tasks of the earlier run to run again. Empty for "live", which builds the queue from the scope. */
  sourceTasks: HydrationTask[];
}

export interface ActiveAccount {
  homeAccountId: string | null;
  tenantId: string | null;
}

/** Error text of a retry task whose template is no longer available. */
export const TEMPLATE_UNAVAILABLE_MESSAGE =
  "The template for this item is no longer available in this version of the kit. The task was not run.";

/** Failed tasks of a run. Skipped and cancelled tasks are not retried. */
export function getRetryTasks(tasks: readonly HydrationTask[]): HydrationTask[] {
  return tasks.filter((task) => task.status === "failed");
}

/**
 * Unfinished tasks of an interrupted run: pending tasks and the tasks that were running.
 * The outcome of a running task is not known, so it goes through the normal checks again:
 * a create is skipped when the object now exists, and the delete resolver checks a delete again.
 */
export function getResumeTasks(tasks: readonly HydrationTask[]): HydrationTask[] {
  return tasks.filter((task) => task.status === "pending" || task.status === "running");
}

/**
 * Reason why the signed-in account cannot continue the run, or null when it can.
 * The account and the tenant must both be the same as in the earlier run.
 */
export function getRerunBlockReason(
  source: Pick<RerunSource, "homeAccountId" | "tenantId">,
  active: ActiveAccount,
): string | null {
  if (!active.homeAccountId || !active.tenantId) {
    return "Sign in to continue this run.";
  }
  if (source.homeAccountId !== active.homeAccountId || source.tenantId !== active.tenantId) {
    return "You are signed in with a different account or tenant than the one that started this run. Sign in with the same account and tenant to continue it.";
  }
  return null;
}

/** The scope that "Run this for real" uses, or null when the preview cannot run for real. */
export function getLiveRunScope(source: RerunSource): RunScope | null {
  return source.isPreview && source.scope ? source.scope : null;
}

/** Create the plan of a new run that continues from the earlier run. */
export function createRerunPlan(kind: RerunKind, source: RerunSource): RerunPlan {
  const base = {
    tenantId: source.tenantId,
    homeAccountId: source.homeAccountId,
    tenantName: source.tenantName,
    cloudEnvironment: source.cloudEnvironment,
    operationMode: source.operationMode,
    licenses: source.licenses,
  };

  if (kind === "live") {
    const scope = getLiveRunScope(source);
    if (!scope) throw new Error("Only a preview with a saved scope can run for real.");
    return {
      kind,
      sourceTasks: [],
      configuration: {
        ...base,
        isPreview: false,
        scope,
        selectedObjectCount: getEstimatedTaskCount(scope.selectedTargets, scope.categorySelections),
      },
    };
  }

  const sourceTasks = kind === "retry" ? getRetryTasks(source.tasks) : getResumeTasks(source.tasks);
  if (sourceTasks.length === 0) {
    throw new Error(kind === "retry" ? "The run has no failed tasks." : "The run has no unfinished tasks.");
  }
  return {
    kind,
    sourceTasks,
    // A retry or resume has no wizard scope: its queue is a part of the earlier run only.
    configuration: { ...base, isPreview: source.isPreview, selectedObjectCount: sourceTasks.length },
  };
}

function getTaskKey(category: string, task: Pick<HydrationTask, "templatePath" | "itemName">): string {
  return `${category}|${(task.templatePath || task.itemName).toLowerCase()}`;
}

interface RerunQueueOptions {
  shouldCancel?: () => boolean;
  onProgress?: (message: string, type?: ActivityMessage["type"]) => void;
}

/**
 * Build the queue of a retry or resume run from templates.
 *
 * The normal queue builder loads (and caches) the templates of every category of the
 * earlier tasks. The executors read those cached templates, so each task is built from
 * the current template, not from a stored request body. Each earlier task then gets a
 * new pending task with the same category, operation, item name, and template path.
 *
 * When a create task has no template any more, it is added as a failed task with a clear
 * error, so it is reported and not dropped. A delete task without a template is queued by
 * name, as the queue builder does for a direct delete selection: the delete resolver then
 * deletes only an object with the hydration marker (and only a disabled Conditional Access policy).
 */
export async function buildRerunTaskQueue(
  sourceTasks: readonly HydrationTask[],
  operationMode: OperationMode,
  options: RerunQueueOptions = {},
): Promise<HydrationTask[]> {
  const categories = [...new Set(sourceTasks.map((task) => task.category))];
  options.onProgress?.(`Loading templates for ${categories.length} categor${categories.length === 1 ? "y" : "ies"}...`);
  const templateTasks = await buildTaskQueueAsync(categories, operationMode, { shouldCancel: options.shouldCancel });
  const templateKeys = new Set(templateTasks.map((task) => getTaskKey(task.category, task)));

  const now = new Date();
  const tasks = sourceTasks.map((sourceTask, index): HydrationTask => {
    const task: HydrationTask = {
      id: `task-${index + 1}`,
      category: sourceTask.category,
      operation: operationMode,
      itemName: sourceTask.itemName,
      ...(sourceTask.templatePath ? { templatePath: sourceTask.templatePath } : {}),
      status: "pending",
    };
    if (operationMode === "create" && !templateKeys.has(getTaskKey(task.category, task))) {
      return { ...task, status: "failed", error: TEMPLATE_UNAVAILABLE_MESSAGE, startTime: now, endTime: now };
    }
    return task;
  });

  const unavailable = tasks.filter((task) => task.status === "failed").length;
  if (unavailable > 0) {
    options.onProgress?.(`${unavailable} task(s) have no template any more and are reported as failed`, "warning");
  }
  return tasks;
}
