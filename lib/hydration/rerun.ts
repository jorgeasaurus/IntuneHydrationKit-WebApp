/**
 * Continue from an earlier run without the wizard: retry failed tasks, resume an
 * interrupted run, or run a preview for real.
 *
 * Every kind starts a new run through the normal engine path. The queue is built from the
 * templates again (never from stored request bodies), and the engine does a fresh tenant
 * prefetch, the same existence checks, and the same delete resolver and safety checks.
 */

import { isExecutionCheckpoint, type ExecutionRecord } from "@/lib/hydration/executionRecord";
import type { ExecutionRunConfiguration, ExecutionState } from "@/lib/hydration/executionStateStore";
import type { RunScope } from "@/lib/hydration/runScope";
import type { RunLockState } from "@/lib/hydration/runLock";
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

/** Number of tasks (retry, resume) or estimated objects (live) of the new run. */
export function getRerunObjectCount(kind: RerunKind, source: RerunSource): number {
  if (kind === "retry") return getRetryTasks(source.tasks).length;
  if (kind === "resume") return getResumeTasks(source.tasks).length;
  const scope = getLiveRunScope(source);
  return scope ? getEstimatedTaskCount(scope.selectedTargets, scope.categorySelections) : 0;
}

/**
 * What the dashboard does with the saved record when it loads.
 * - "restore": show the record of the signed-in account (a completed or an interrupted run).
 * - "foreignInterrupted": keep an interrupted run of another account, without its details.
 * - "ignore": a checkpoint of the run that is still in memory; the live state is shown.
 * - "clear": remove a completed run of another account.
 */
export function getSavedRecordAction(
  record: ExecutionRecord | null,
  active: { homeAccountId: string; tenantId: string },
  runInMemory: boolean,
): "restore" | "foreignInterrupted" | "ignore" | "clear" | "none" {
  if (!record) return "none";
  const owned = record.homeAccountId === active.homeAccountId && record.tenantId === active.tenantId;
  if (isExecutionCheckpoint(record)) {
    if (runInMemory) return "ignore";
    return owned ? "restore" : "foreignInterrupted";
  }
  return owned ? "restore" : "clear";
}

const ACTIVE_RUN_REASON = "A run is active. Wait until it completes before you start another run.";

export const OTHER_TAB_RUN_REASON =
  "Another browser tab is running a hydration for this tenant. Wait until that run completes, or close that tab, before you continue here.";
export const CHECKING_OTHER_TABS_REASON = "Checking that no other browser tab is running this run...";
export const UNKNOWN_OTHER_TABS_REASON =
  "This browser cannot confirm that no other tab is still running this run, so it cannot be resumed here. Discard it, or start a new hydration.";

/**
 * Reason why the run lock state blocks a new run, or null.
 * A run in another tab blocks every kind. An interrupted run is resumed only when it is known
 * that no other tab runs it (fail closed): a duplicated tab has a copy of its checkpoint.
 */
export function getRunLockBlockReason(kind: RerunKind, lockState: RunLockState | null): string | null {
  if (lockState === "held") return OTHER_TAB_RUN_REASON;
  if (kind !== "resume") return null;
  if (lockState === null) return CHECKING_OTHER_TABS_REASON;
  return lockState === "unknown" ? UNKNOWN_OTHER_TABS_REASON : null;
}

/**
 * The run that a new run can continue from (the restored record, or the completed live run),
 * and the reason why no new run can start now.
 */
export function getRerunAvailability({
  restoredRecord,
  liveRun,
  phase,
  active,
  lockState,
}: {
  restoredRecord: ExecutionRecord | null;
  liveRun: { configuration: ExecutionRunConfiguration | null; tasks: HydrationTask[] };
  phase: ExecutionState["phase"];
  active: ActiveAccount;
  /** Run lock state of the source tenant in other tabs, or null before the first check. */
  lockState: RunLockState | null;
}): { source: RerunSource | null; disabledReason: string | null; isInterrupted: boolean } {
  const isInterrupted = Boolean(restoredRecord && isExecutionCheckpoint(restoredRecord));
  const source: RerunSource | null =
    restoredRecord ??
    (phase === "completed" && liveRun.configuration ? { ...liveRun.configuration, tasks: liveRun.tasks } : null);
  const isRunActive = phase !== "idle" && phase !== "completed";
  const disabledReason = !source
    ? null
    : isRunActive
      ? ACTIVE_RUN_REASON
      : (getRerunBlockReason(source, active) ?? getRunLockBlockReason(isInterrupted ? "resume" : "retry", lockState));
  return { source, disabledReason, isInterrupted };
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
  // A create without a selection leaves out the opt-in Win32 apps, so the Win32 apps of the
  // source run are selected by name: an opt-in app that the first run created stays available.
  const win32AppNames = sourceTasks.filter((task) => task.category === "win32Apps").map((task) => task.itemName);
  const templateTasks = await buildTaskQueueAsync(categories, operationMode, {
    shouldCancel: options.shouldCancel,
    ...(win32AppNames.length > 0 ? { categorySelections: { win32Apps: { selectedItems: win32AppNames } } } : {}),
  });
  const templateKeys = new Set(templateTasks.map((task) => getTaskKey(task.category, task)));

  const now = new Date();
  const tasks = sourceTasks.map((sourceTask, index): HydrationTask => {
    const task: HydrationTask = {
      id: `task-${index + 1}`,
      category: sourceTask.category,
      operation: operationMode,
      itemName: sourceTask.itemName,
      ...(sourceTask.templatePath ? { templatePath: sourceTask.templatePath } : {}),
      // The same app customization, so the retry uploads a package with the same configuration.
      ...(operationMode === "create" && sourceTask.autopilotBranding
        ? { autopilotBranding: sourceTask.autopilotBranding }
        : {}),
      // The same pinned WinGet version, so the retry installs the same version.
      ...(operationMode === "create" && sourceTask.wingetVersion !== undefined
        ? { wingetVersion: sourceTask.wingetVersion }
        : {}),
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
