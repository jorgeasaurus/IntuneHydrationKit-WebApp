import { z } from "zod";
import { EXECUTION_RECORD_STORAGE_KEY } from "@/lib/storageKeys";
import { deriveExecutionOutcome } from "@/lib/hydration/executionOutcome";
import { summaryMatchesExecution } from "@/lib/hydration/reporter";
import { ACTIVITY_MESSAGE_TYPES } from "@/lib/hydration/types";
import {
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
  tenantId: z.string().min(1),
  tenantName: z.string().optional(),
  operationMode: operationModeSchema,
  startTime: dateSchema,
  endTime: dateSchema,
  duration: z.number().nonnegative(),
  stats: z.strictObject({
    total: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
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
  operationMode: operationModeSchema,
  isPreview: z.boolean(),
  selectedObjectCount: z.number().int().nonnegative(),
  tasks: z.array(taskSchema),
  activityLog: z.array(activityMessageSchema),
  startTime: dateSchema.nullable(),
  endTime: dateSchema,
});

const reportableRecordSchema = recordBase.extend({
  outcome: z.enum(REPORTABLE_EXECUTION_OUTCOMES),
  summary: summarySchema,
  fatalError: z.null(),
});

const failedRecordSchema = recordBase.extend({
  outcome: z.literal("failed"),
  summary: z.null(),
  fatalError: z.string().min(1),
});

const executionRecordSchema = z.union([reportableRecordSchema, failedRecordSchema]).superRefine((record, context) => {
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
  if (record.tasks.some((task) => task.status === "pending" || task.status === "running")) {
    context.addIssue({
      code: "custom",
      message: "Terminal execution records cannot contain unfinished tasks.",
      path: ["tasks"],
    });
  }
  const outcomeMatchesTasks =
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
  if (record.summary) {
    const summaryMatches =
      record.startTime !== null &&
      summaryMatchesExecution(record.summary, {
        tenantId: record.tenantId,
        tenantName: record.tenantName,
        operationMode: record.operationMode,
        startTime: record.startTime,
        endTime: record.endTime,
        tasks: record.tasks,
      });
    const batchStats = record.summary.batchStats;
    const batchStatsMatch =
      !batchStats ||
      (record.operationMode === "create" &&
        batchStats.batchingEnabled &&
        batchStats.batchedTaskCount + batchStats.sequentialTaskCount === record.tasks.length &&
        batchStats.batchRequestCount === Math.ceil(batchStats.batchedTaskCount / batchStats.batchSize));
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
