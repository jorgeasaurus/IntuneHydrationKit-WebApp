/**
 * Run history: compact records of finished runs, so that the user can open a past run's
 * results and download its reports again.
 *
 * History contains tenant data. It is kept in sessionStorage, which is the same place as the
 * MSAL token cache: the history ends with the tab, as the sign-in does. Sign-out clears it
 * (see clearSessionData in lib/auth/authUtils.ts). Each entry carries the homeAccountId and
 * tenantId of the run. Reads return only the entries of the active account and tenant, and
 * remove the entries of any other owner.
 */
import { z } from "@/lib/utils/zod";
import { RUN_HISTORY_STORAGE_KEY } from "@/lib/storageKeys";
import type { ExecutionRunConfiguration } from "@/lib/hydration/executionStateStore";
import {
  CLOUD_ENVIRONMENTS,
  EXECUTION_OUTCOMES,
  NON_SKIPPED_TASK_STATUSES,
  OPERATION_MODES,
  SKIP_KINDS,
  TASK_CATEGORIES,
  type CloudEnvironment,
  type ExecutionOutcome,
  type HydrationSummary,
  type HydrationTask,
} from "@/types/hydration";

/** Maximum number of runs in the history. The oldest run is dropped first. */
export const MAX_RUN_HISTORY_ENTRIES = 20;
/**
 * Maximum serialized size of the history, in UTF-16 code units. sessionStorage has about
 * 5 million code units per origin, shared with the MSAL cache, the latest execution record,
 * and template caches, so history uses about a third of it. Three runs of 990 tasks
 * (about 515,000 code units each with created-object IDs) fit.
 */
export const MAX_RUN_HISTORY_CHARS = 1_600_000;

export interface RunOwner {
  homeAccountId: string;
  tenantId: string;
}

/**
 * Task counts. A preview changes nothing, so its successful tasks count as wouldCreate or
 * wouldDelete and created and deleted stay 0, as in the reports.
 */
export interface RunHistoryCounts {
  total: number;
  created: number;
  deleted: number;
  wouldCreate: number;
  wouldDelete: number;
  skipped: number;
  failed: number;
}

export interface RunHistoryEntry extends RunOwner {
  id: string;
  tenantName?: string;
  /** Cloud of the run. The admin portal links of created objects use it. */
  cloudEnvironment?: CloudEnvironment;
  operationMode: HydrationSummary["operationMode"];
  isPreview: boolean;
  outcome: ExecutionOutcome;
  startTime: Date | null;
  endTime: Date;
  /** Active run time in milliseconds, without paused time. */
  durationMs: number;
  selectedObjectCount: number;
  counts: RunHistoryCounts;
  /** Present for reportable outcomes. Null when the run failed before it finished. */
  summary: HydrationSummary | null;
  fatalError: string | null;
  /** Task evidence that the results view and the reports use. The activity log is not kept. */
  tasks: HydrationTask[];
}

export type RunHistoryWriteResult =
  | { ok: true; dropped: number }
  | { ok: false; reason: "unavailable" | "full" | "tooLarge" };

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: "Expected an ISO date." })
  .transform((value) => new Date(value));
const countSchema = z.number().int().nonnegative();
const summaryStatsSchema = z.object({
  total: countSchema, created: countSchema, deleted: countSchema, skipped: countSchema, failed: countSchema,
});
const countsSchema = summaryStatsSchema.extend({ wouldCreate: countSchema, wouldDelete: countSchema });
const issueSchema = z.object({ task: z.string(), message: z.string(), timestamp: isoDate });

// The task and summary schemas strip fields that they do not know, so a new optional
// field on a task does not invalidate the stored history.
const taskBase = {
  id: z.string().min(1),
  category: z.enum(TASK_CATEGORIES),
  operation: z.enum(OPERATION_MODES),
  itemName: z.string(),
  templatePath: z.string().optional(),
  match: z.object({
    id: z.string(), name: z.string(), matchType: z.enum(["exact", "normalized"]), portalUrl: z.string().optional(),
  }).optional(),
  drift: z.object({
    status: z.enum(["matches", "different", "notChecked"]), differences: z.array(z.string()), reason: z.string().optional(),
  }).optional(),
  createdObject: z.object({ id: z.string().min(1), policyType: z.string().optional() }).optional(),
  error: z.string().optional(),
  warning: z.string().optional(),
  startTime: isoDate.optional(),
  endTime: isoDate.optional(),
};
const taskSchema = z.discriminatedUnion("status", [
  z.object({ ...taskBase, status: z.literal("skipped"), skipKind: z.enum(SKIP_KINDS) }),
  z.object({ ...taskBase, status: z.enum(NON_SKIPPED_TASK_STATUSES) }),
]);

const summarySchema = z.object({
  provenance: z.object({
    runId: z.string(), appVersion: z.string(), baselineVersion: z.string(), baselineSourceSha: z.string(),
  }).optional(),
  tenantId: z.string().min(1),
  tenantName: z.string().optional(),
  operationMode: z.enum(OPERATION_MODES),
  startTime: isoDate,
  endTime: isoDate,
  duration: z.number().nonnegative(),
  pausedDuration: z.number().nonnegative().optional(),
  stats: summaryStatsSchema,
  categoryBreakdown: z.record(z.string(), z.object({
    total: countSchema, success: countSchema, skipped: countSchema, failed: countSchema,
  })),
  errors: z.array(issueSchema),
  warnings: z.array(issueSchema),
  batchStats: z.object({
    batchingEnabled: z.boolean(), batchSize: z.number().int().positive(), batchRequestCount: countSchema,
    batchedTaskCount: countSchema, sequentialTaskCount: countSchema,
  }).optional(),
});

const entrySchema = z.object({
  id: z.string().min(1),
  homeAccountId: z.string().min(1),
  tenantId: z.string().min(1),
  tenantName: z.string().optional(),
  cloudEnvironment: z.enum(CLOUD_ENVIRONMENTS).optional(),
  operationMode: z.enum(OPERATION_MODES),
  isPreview: z.boolean(),
  outcome: z.enum(EXECUTION_OUTCOMES),
  startTime: isoDate.nullable(),
  endTime: isoDate,
  durationMs: z.number().nonnegative(),
  selectedObjectCount: countSchema,
  counts: countsSchema,
  summary: summarySchema.nullable(),
  fatalError: z.string().nullable(),
  tasks: z.array(taskSchema),
});

const storeSchema = z.object({ version: z.literal(1), entries: z.array(z.unknown()) });

/** Return sessionStorage, or null when the browser blocks it. */
export function getRunHistoryStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Keep the task fields that the results view, the portal links, and the reports use.
 * Unknown task fields are dropped.
 */
function compactTask(task: HydrationTask): HydrationTask {
  const compact = {
    id: task.id,
    category: task.category,
    operation: task.operation,
    itemName: task.itemName,
    status: task.status,
    skipKind: task.status === "skipped" ? task.skipKind : undefined,
    templatePath: task.templatePath,
    match: task.match,
    drift: task.drift,
    createdObject: task.createdObject
      ? { id: task.createdObject.id, policyType: task.createdObject.policyType }
      : undefined,
    error: task.error,
    warning: task.warning,
    startTime: task.startTime,
    endTime: task.endTime,
  };
  return compact as HydrationTask;
}

/** Count the tasks the same way for every outcome, with preview successes as "would" counts. */
function countTasks(tasks: HydrationTask[], isPreview: boolean): RunHistoryCounts {
  const successes = (operation: HydrationTask["operation"]) =>
    tasks.filter((task) => task.status === "success" && task.operation === operation).length;
  const created = successes("create");
  const deleted = successes("delete");
  return {
    total: tasks.length,
    created: isPreview ? 0 : created,
    deleted: isPreview ? 0 : deleted,
    wouldCreate: isPreview ? created : 0,
    wouldDelete: isPreview ? deleted : 0,
    skipped: tasks.filter((task) => task.status === "skipped").length,
    failed: tasks.filter((task) => task.status === "failed").length,
  };
}

export interface FinishedRun {
  configuration: ExecutionRunConfiguration;
  tasks: HydrationTask[];
  summary: HydrationSummary | null;
  outcome: ExecutionOutcome;
  fatalError: string | null;
  startTime: Date | null;
  endTime: Date;
  pausedMs: number;
}

/** Build a history entry from a run that reached a terminal state. */
export function createRunHistoryEntry(run: FinishedRun): RunHistoryEntry {
  const { configuration, summary } = run;
  const wallTime = run.startTime ? run.endTime.getTime() - run.startTime.getTime() : 0;
  return {
    id: summary?.provenance?.runId ??
      `${configuration.tenantId}:${(run.startTime ?? run.endTime).toISOString()}`,
    homeAccountId: configuration.homeAccountId,
    tenantId: configuration.tenantId,
    tenantName: configuration.tenantName,
    cloudEnvironment: configuration.cloudEnvironment,
    operationMode: configuration.operationMode,
    isPreview: configuration.isPreview,
    outcome: run.outcome,
    startTime: run.startTime,
    endTime: run.endTime,
    durationMs: summary ? summary.duration : Math.max(0, wallTime - run.pausedMs),
    selectedObjectCount: configuration.selectedObjectCount,
    counts: countTasks(run.tasks, configuration.isPreview),
    summary,
    fatalError: run.fatalError,
    tasks: run.tasks.map(compactTask),
  };
}

function isOwner(entry: RunOwner, owner: RunOwner): boolean {
  return entry.homeAccountId === owner.homeAccountId && entry.tenantId === owner.tenantId;
}

/** Read every valid entry, newest first. A damaged entry is skipped. */
function readAllEntries(storage: Storage): RunHistoryEntry[] {
  let raw: string | null;
  try {
    raw = storage.getItem(RUN_HISTORY_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const store = storeSchema.safeParse(JSON.parse(raw));
    if (!store.success) return [];
    return store.data.entries
      .map((entry) => entrySchema.safeParse(entry))
      .flatMap((parsed) => (parsed.success ? [parsed.data as RunHistoryEntry] : []))
      .sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
  } catch {
    return [];
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

/**
 * Write entries (newest first). Drops the oldest entries until the history is in the count
 * and size caps and the browser accepts it.
 */
function writeEntries(storage: Storage, entries: RunHistoryEntry[]): RunHistoryWriteResult {
  const kept = entries.slice(0, MAX_RUN_HISTORY_ENTRIES);
  let dropped = entries.length - kept.length;
  const serialized = kept.map((entry) => JSON.stringify(entry));
  const envelope = (parts: string[]) => `{"version":1,"entries":[${parts.join(",")}]}`;
  let size = envelope(serialized).length;
  while (serialized.length > 0 && size > MAX_RUN_HISTORY_CHARS) {
    size -= (serialized.pop()?.length ?? 0) + 1;
    dropped += 1;
  }
  for (;;) {
    try {
      if (serialized.length === 0) {
        storage.removeItem(RUN_HISTORY_STORAGE_KEY);
      } else {
        storage.setItem(RUN_HISTORY_STORAGE_KEY, envelope(serialized));
      }
      return { ok: true, dropped };
    } catch (error) {
      if (!isQuotaError(error)) return { ok: false, reason: "unavailable" };
      if (serialized.length <= 1) return { ok: false, reason: "full" };
      serialized.pop();
      dropped += 1;
    }
  }
}

/**
 * Read the history of the owner, newest first. Entries of any other account or tenant are
 * removed from storage, so another tenant's history never shows.
 */
export function readRunHistory(storage: Storage | null, owner: RunOwner): RunHistoryEntry[] {
  if (!storage) return [];
  const all = readAllEntries(storage);
  const own = all.filter((entry) => isOwner(entry, owner));
  if (own.length !== all.length) writeEntries(storage, own);
  return own;
}

/** Add or replace the entry for a finished run. Removes other owners' entries and applies the caps. */
export function addRunHistoryEntry(storage: Storage | null, entry: RunHistoryEntry): RunHistoryWriteResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  const own = readAllEntries(storage).filter((existing) => isOwner(existing, entry) && existing.id !== entry.id);
  if (JSON.stringify(entry).length > MAX_RUN_HISTORY_CHARS) {
    // Keep the older entries. The run is too large to keep in history.
    writeEntries(storage, own);
    return { ok: false, reason: "tooLarge" };
  }
  // The new entry is first, and writeEntries drops from the end, so a success keeps the entry.
  return writeEntries(storage, [entry, ...own]);
}

export function deleteRunHistoryEntry(storage: Storage | null, owner: RunOwner, id: string): RunHistoryWriteResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  return writeEntries(storage, readRunHistory(storage, owner).filter((entry) => entry.id !== id));
}

/** Remove the whole history. Sign-out calls this. */
export function clearRunHistory(storage: Storage | null): void {
  try {
    storage?.removeItem(RUN_HISTORY_STORAGE_KEY);
  } catch {
    // Storage that the browser blocks holds no history.
  }
}
