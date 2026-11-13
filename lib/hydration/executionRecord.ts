import { z } from "@/lib/utils/zod";
import { EXECUTION_RECORD_STORAGE_KEY } from "@/lib/storageKeys";
import { deriveExecutionOutcome } from "@/lib/hydration/executionOutcome";
import { summaryMatchesExecution } from "@/lib/hydration/reporter";
import { ACTIVITY_MESSAGE_TYPES } from "@/lib/hydration/types";
import { runLicensesSchema, runScopeSchema } from "@/lib/hydration/runScope";
import { autopilotBrandingCustomizationSchema } from "@/lib/win32/autopilotBrandingConfig";
import {
  CLOUD_ENVIRONMENTS,
  OPERATION_MODES,
  NON_SKIPPED_TASK_STATUSES,
  REPORTABLE_EXECUTION_OUTCOMES,
  SKIP_KINDS,
  TASK_CATEGORIES,
} from "@/types/hydration";

const operationModeSchema = z.enum(OPERATION_MODES);
const taskCategorySchema = z.enum(TASK_CATEGORIES);
const skipKindSchema = z.enum(SKIP_KINDS);
const serializedDateSchema = z.string().refine(
  (value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  },
  { message: "Expected a normalized ISO date." },
);
const dateSchema = z
  .union([z.date(), serializedDateSchema])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const taskBaseShape = {
  id: z.string().min(1),
  category: taskCategorySchema,
  operation: operationModeSchema,
  itemName: z.string().min(1),
  templatePath: z.string().optional(),
  match: z.strictObject({
    id: z.string().min(1), name: z.string().min(1),
    matchType: z.enum(["exact", "normalized"]),
    portalUrl: z.string().url().startsWith("https://intune.microsoft.com/").optional(),
  }).optional(),
  drift: z.strictObject({
    status: z.enum(["matches", "different", "notChecked"]),
    differences: z.array(z.string()), reason: z.string().optional(),
  }).optional(),
  update: z.strictObject({
    objectId: z.string().min(1), applied: z.boolean(), differences: z.array(z.string()),
  }).optional(),
  createdObject: z.strictObject({
    id: z.string().min(1),
    policyType: z.string().min(1).optional(),
  }).optional(),
  // Strict: a record with a customization that the schema cannot read exactly is not restored,
  // so a retry can never upload a package with other choices than the first attempt.
  autopilotBranding: autopilotBrandingCustomizationSchema.optional(),
  error: z.string().optional(),
  warning: z.string().optional(),
  startTime: dateSchema.optional(),
  endTime: dateSchema.optional(),
};
const taskSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...taskBaseShape,
    status: z.literal("skipped"),
    skipKind: skipKindSchema,
  }),
  z.strictObject({
    ...taskBaseShape,
    status: z.enum(NON_SKIPPED_TASK_STATUSES),
  }),
]);

const activityMessageSchema = z.strictObject({
  id: z.string().min(1),
  timestamp: dateSchema,
  message: z.string(),
  type: z.enum(ACTIVITY_MESSAGE_TYPES),
  category: z.string().optional(),
});

const issueSchema = z.strictObject({
  task: z.string(),
  message: z.string(),
  timestamp: dateSchema,
});

const categoryBreakdownSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  success: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

const summarySchema = z.strictObject({
  provenance: z.strictObject({
    runId: z.string().min(1), appVersion: z.string().min(1),
    baselineVersion: z.string().min(1), baselineSourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  }).optional(),
  tenantId: z.string().min(1),
  tenantName: z.string().optional(),
  operationMode: operationModeSchema,
  startTime: dateSchema,
  endTime: dateSchema,
  duration: z.number().nonnegative(),
  pausedDuration: z.number().positive().optional(),
  stats: z.strictObject({
    total: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
    updated: z.number().int().positive().optional(),
    deleted: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  categoryBreakdown: z.record(z.string(), categoryBreakdownSchema),
  errors: z.array(issueSchema),
  warnings: z.array(issueSchema),
  batchStats: z
    .strictObject({
      batchingEnabled: z.boolean(),
      batchSize: z.number().int().positive(),
      batchRequestCount: z.number().int().nonnegative(),
      batchedTaskCount: z.number().int().nonnegative(),
      sequentialTaskCount: z.number().int().nonnegative(),
    })
    .optional(),
});

const recordBase = z.strictObject({
  tenantId: z.string().min(1),
  homeAccountId: z.string().min(1),
  tenantName: z.string().optional(),
  /** Cloud of the run. The admin portal links use it. Records saved before this field was added do not have it. */
  cloudEnvironment: z.enum(CLOUD_ENVIRONMENTS).optional(),
  operationMode: operationModeSchema,
  isPreview: z.boolean(),
  selectedObjectCount: z.number().int().nonnegative(),
  tasks: z.array(taskSchema),
  activityLog: z.array(activityMessageSchema),
  startTime: dateSchema.nullable(),
  /** Paused time of the run. Records saved before this field was added do not have it. */
  pausedMs: z.number().nonnegative().optional(),
  /** Wizard scope of the run, for "Run this for real". Older records do not have it. */
  // A stored scope that the schema cannot read exactly is dropped, so the run stays readable
  // but "Run this for real" is not offered from it (fail closed).
  scope: runScopeSchema.optional().catch(undefined),
  /** Pre-flight license results of the run. Older records do not have it. */
  licenses: runLicensesSchema.optional(),
});

const reportableRecordSchema = recordBase.extend({
  endTime: dateSchema,
  outcome: z.enum(REPORTABLE_EXECUTION_OUTCOMES),
  summary: summarySchema,
  fatalError: z.null(),
});

const failedRecordSchema = recordBase.extend({
  endTime: dateSchema,
  outcome: z.literal("failed"),
  summary: z.null(),
  fatalError: z.string().min(1),
});

/**
 * Progress of a run that has not reached a terminal state. The dashboard writes it during
 * the run. When the page loads and no run is active in memory, a checkpoint record means
 * that the run was interrupted (for example by a refresh or a closed tab).
 */
const checkpointRecordSchema = recordBase.extend({
  endTime: z.null(),
  outcome: z.null(),
  summary: z.null(),
  fatalError: z.null(),
  /** Time of the last checkpoint write. */
  checkpointAt: dateSchema,
});

const executionRecordSchema = z
  .union([reportableRecordSchema, failedRecordSchema, checkpointRecordSchema])
  .superRefine((record, context) => {
    if (
      record.summary &&
      (record.summary.tenantId !== record.tenantId || record.summary.operationMode !== record.operationMode)
    ) {
      context.addIssue({
        code: "custom",
        message: "Summary identity does not match the execution record.",
        path: ["summary"],
      });
    }
    if (record.tasks.some((task) => task.operation !== record.operationMode)) {
      context.addIssue({
        code: "custom",
        message: "Task operation does not match the execution record.",
        path: ["tasks"],
      });
    }
    if (
      record.tasks.some(
        (task) => task.createdObject && (record.isPreview || task.operation !== "create" || task.status !== "success"),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Only successful live create tasks can have a created object.",
        path: ["tasks"],
      });
    }
    const isCheckpoint = record.outcome === null;
    if (!isCheckpoint && record.tasks.some((task) => task.status === "pending" || task.status === "running")) {
      context.addIssue({
        code: "custom",
        message: "Terminal execution records cannot contain unfinished tasks.",
        path: ["tasks"],
      });
    }
    const outcomeMatchesTasks =
      isCheckpoint ||
      record.outcome === "failed" ||
      deriveExecutionOutcome(record.tasks) === record.outcome ||
      (record.outcome === "cancelled" && record.tasks.length === 0);
    if (!outcomeMatchesTasks) {
      context.addIssue({
        code: "custom",
        message: "Outcome does not match the terminal task states.",
        path: ["outcome"],
      });
    }
    const lastKnownTime = record.endTime ?? (isCheckpoint ? record.checkpointAt : null);
    if (
      record.pausedMs &&
      (record.startTime === null ||
        lastKnownTime === null ||
        record.pausedMs > lastKnownTime.getTime() - record.startTime.getTime())
    ) {
      context.addIssue({
        code: "custom",
        message: "Paused time is longer than the run.",
        path: ["pausedMs"],
      });
    }
    if (record.summary) {
      const summaryMatches =
        record.startTime !== null &&
        record.endTime !== null &&
        summaryMatchesExecution(record.summary, {
          tenantId: record.tenantId,
          tenantName: record.tenantName,
          operationMode: record.operationMode,
          startTime: record.startTime,
          endTime: record.endTime,
          tasks: record.tasks,
          pausedMs: record.pausedMs,
        });
      const batchStats = record.summary.batchStats;
      const batchStatsMatch =
        !batchStats ||
        (batchStats.batchedTaskCount <= record.tasks.length &&
          batchStats.sequentialTaskCount <= record.tasks.length &&
          (batchStats.batchRequestCount > 0 || batchStats.batchedTaskCount === 0) &&
          (!record.isPreview || (batchStats.batchRequestCount === 0 && batchStats.batchedTaskCount === 0)));
      if (!summaryMatches || !batchStatsMatch) {
        context.addIssue({
          code: "custom",
          message: "Summary does not match the execution record.",
          path: ["summary"],
        });
      }
    }
  });

export type ExecutionRecord = z.infer<typeof executionRecordSchema>;
export type ExecutionCheckpointRecord = Extract<ExecutionRecord, { outcome: null }>;
export type TerminalExecutionRecord = Exclude<ExecutionRecord, ExecutionCheckpointRecord>;

/** True when the record is a checkpoint of a run that did not reach a terminal state. */
export function isExecutionCheckpoint(record: ExecutionRecord): record is ExecutionCheckpointRecord {
  return record.outcome === null;
}

export function readExecutionRecord(storage: Storage): ExecutionRecord | null {
  const value = storage.getItem(EXECUTION_RECORD_STORAGE_KEY);
  if (!value) return null;
  try {
    const parsed = executionRecordSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeExecutionRecord(storage: Storage, record: ExecutionRecord): void {
  const validated = executionRecordSchema.parse(record);
  storage.setItem(EXECUTION_RECORD_STORAGE_KEY, JSON.stringify(validated));
}

export function clearExecutionRecord(storage: Storage): void {
  storage.removeItem(EXECUTION_RECORD_STORAGE_KEY);
}

export function clearHydrationSession(storage: Storage): void {
  clearExecutionRecord(storage);
  const templateKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("intune-hydration-templates-")) templateKeys.push(key);
  }
  templateKeys.forEach((key) => storage.removeItem(key));
}
