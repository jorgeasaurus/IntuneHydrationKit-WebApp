import { beforeEach, describe, expect, it } from "vitest";
import {
  clearHydrationSession,
  readExecutionRecord,
  writeExecutionRecord,
  type ExecutionRecord,
} from "@/lib/hydration/executionRecord";
import { EXECUTION_RECORD_STORAGE_KEY } from "@/lib/storageKeys";

function createRecord(): ExecutionRecord {
  const startTime = new Date("2026-08-17T01:00:00.000Z");
  const endTime = new Date("2026-08-17T01:00:02.000Z");
  return {
    tenantId: "tenant-1",
    homeAccountId: "home-tenant-1",
    tenantName: "Contoso",
    operationMode: "create",
    isPreview: false,
    selectedObjectCount: 1,
    outcome: "succeeded",
    fatalError: null,
    startTime,
    endTime,
    tasks: [
      {
        id: "group-1",
        category: "groups",
        operation: "create",
        itemName: "All Windows Devices",
        status: "success",
        startTime,
        endTime,
      },
    ],
    activityLog: [
      {
        id: "activity-1",
        timestamp: endTime,
        message: "Complete",
        type: "success",
      },
    ],
    summary: {
      tenantId: "tenant-1",
      tenantName: "Contoso",
      operationMode: "create",
      startTime,
      endTime,
      duration: 2000,
      stats: { total: 1, created: 1, deleted: 0, skipped: 0, failed: 0 },
      categoryBreakdown: {
        groups: { total: 1, success: 1, skipped: 0, failed: 0 },
      },
      errors: [],
      warnings: [],
    },
  };
}

describe("execution record storage", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores all stored dates", () => {
    writeExecutionRecord(sessionStorage, createRecord());
    const record = readExecutionRecord(sessionStorage);
    expect(record?.endTime).toBeInstanceOf(Date);
    expect(record?.summary?.startTime).toBeInstanceOf(Date);
    expect(record?.tasks[0].endTime).toBeInstanceOf(Date);
    expect(record?.activityLog[0].timestamp).toBeInstanceOf(Date);
  });

  it("preserves matching evidence, drift, source versions, and retry counts", () => {
    const record = createRecord();
    if (!record.summary) throw new Error("Expected a reportable record.");
    record.tasks[0].match = { id: "existing-id", name: "Existing object", matchType: "normalized", portalUrl: "https://intune.microsoft.com/#view/policy" };
    record.tasks[0].drift = { status: "different", differences: ["settings[0].value"] };
    record.outcome = "completedWithIssues";
    record.summary.provenance = { runId: "run-id", appVersion: "2.6.52", baselineVersion: "4.0", baselineSourceSha: "a".repeat(40) };
    record.summary.batchStats = { batchingEnabled: true, batchSize: 20, batchRequestCount: 3, batchedTaskCount: 1, sequentialTaskCount: 0 };
    writeExecutionRecord(sessionStorage, record);
    expect(readExecutionRecord(sessionStorage)).toEqual(record);
    record.isPreview = true;
    expect(() => writeExecutionRecord(sessionStorage, record)).toThrow();
  });

  it("round-trips the cloud and the created objects of the tasks", () => {
    const record = createRecord();
    record.cloudEnvironment = "global";
    record.tasks[0].createdObject = { id: "group-object-id" };
    writeExecutionRecord(sessionStorage, record);
    expect(readExecutionRecord(sessionStorage)).toEqual(record);

    record.tasks[0] = { ...record.tasks[0], category: "baseline", createdObject: { id: "policy-id", policyType: "SettingsCatalog" } };
    record.summary = { ...record.summary!, categoryBreakdown: { baseline: { total: 1, success: 1, skipped: 0, failed: 0 } } };
    writeExecutionRecord(sessionStorage, record);
    expect(readExecutionRecord(sessionStorage)?.tasks[0].createdObject).toEqual({ id: "policy-id", policyType: "SettingsCatalog" });
  });

  it("loads an older record that has no cloud and no created objects", () => {
    const olderRecord = createRecord();
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, JSON.stringify(olderRecord));
    const record = readExecutionRecord(sessionStorage);
    expect(record).not.toBeNull();
    expect(record?.cloudEnvironment).toBeUndefined();
    expect(record?.tasks[0].createdObject).toBeUndefined();
  });

  it("rejects a created object on a preview or failed task, and unknown fields in it", () => {
    const preview = createRecord();
    preview.isPreview = true;
    preview.tasks[0].createdObject = { id: "group-object-id" };
    expect(() => writeExecutionRecord(sessionStorage, preview)).toThrow(/Only successful live create tasks/);

    const extraField = createRecord();
    extraField.tasks[0].createdObject = { id: "group-object-id", href: "https://example.com" } as never;
    expect(() => writeExecutionRecord(sessionStorage, extraField)).toThrow();

    const emptyId = createRecord();
    emptyId.tasks[0].createdObject = { id: "" };
    expect(() => writeExecutionRecord(sessionStorage, emptyId)).toThrow();

    const failed = createRecord();
    failed.outcome = "completedWithIssues";
    failed.tasks[0] = { ...failed.tasks[0], status: "failed", error: "Bad request", createdObject: { id: "group-object-id" } };
    expect(() => writeExecutionRecord(sessionStorage, failed)).toThrow(/Only successful live create tasks/);
  });

  it("stores the paused time and restores it with the active duration", () => {
    const record = createRecord();
    if (!record.summary) throw new Error("Expected a reportable record.");
    record.pausedMs = 1500;
    record.summary.duration = 500;
    record.summary.pausedDuration = 1500;
    writeExecutionRecord(sessionStorage, record);
    expect(readExecutionRecord(sessionStorage)).toEqual(record);
  });

  it("loads an older record that has no paused time", () => {
    const olderRecord = createRecord();
    expect(olderRecord).not.toHaveProperty("pausedMs");
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, JSON.stringify(olderRecord));
    const record = readExecutionRecord(sessionStorage);
    expect(record?.summary?.duration).toBe(2000);
    expect(record?.pausedMs).toBeUndefined();
  });

  it("rejects paused time that does not match the summary or is longer than the run", () => {
    const mismatch = createRecord();
    mismatch.pausedMs = 1500;
    expect(() => writeExecutionRecord(sessionStorage, mismatch)).toThrow();

    const tooLong = createRecord();
    if (!tooLong.summary) throw new Error("Expected a reportable record.");
    tooLong.pausedMs = 3000;
    tooLong.summary.duration = 0;
    tooLong.summary.pausedDuration = 3000;
    expect(() => writeExecutionRecord(sessionStorage, tooLong)).toThrow();
  });

  it("accepts equivalent category summaries with a different key order", () => {
    const record = createRecord();
    if (!record.summary) throw new Error("Expected a reportable record.");
    record.selectedObjectCount = 2;
    record.tasks.push({
      id: "filter-1",
      category: "filters",
      operation: "create",
      itemName: "Windows devices",
      status: "success",
      startTime: record.startTime ?? undefined,
      endTime: record.endTime,
    });
    record.summary.stats.total = 2;
    record.summary.stats.created = 2;
    record.summary.categoryBreakdown = {
      filters: { total: 1, success: 1, skipped: 0, failed: 0 },
      groups: { total: 1, success: 1, skipped: 0, failed: 0 },
    };

    writeExecutionRecord(sessionStorage, record);

    expect(readExecutionRecord(sessionStorage)?.summary?.stats.total).toBe(2);
  });

  it("rejects invalid data and clears only hydration session data", () => {
    sessionStorage.setItem("hydration-execution:v1", "not-json");
    sessionStorage.setItem("intune-hydration-templates-groups", "cached");
    sessionStorage.setItem("unrelated", "keep");
    expect(readExecutionRecord(sessionStorage)).toBeNull();
    clearHydrationSession(sessionStorage);
    expect(sessionStorage.getItem("hydration-execution:v1")).toBeNull();
    expect(
      sessionStorage.getItem("intune-hydration-templates-groups"),
    ).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it.each([
    [
      "missing owner",
      (record: Record<string, unknown>) => delete record.homeAccountId,
    ],
    [
      "invalid operation",
      (record: Record<string, unknown>) => {
        record.operationMode = "update";
      },
    ],
    [
      "invalid date",
      (record: Record<string, unknown>) => {
        record.endTime = "not-a-date";
      },
    ],
    [
      "null date",
      (record: Record<string, unknown>) => {
        record.endTime = null;
      },
    ],
    [
      "boolean date",
      (record: Record<string, unknown>) => {
        record.endTime = false;
      },
    ],
    [
      "numeric date",
      (record: Record<string, unknown>) => {
        record.endTime = 0;
      },
    ],
    [
      "normalized invalid calendar date",
      (record: Record<string, unknown>) => {
        record.endTime = "2026-02-30T01:00:00.000Z";
      },
    ],
  ])("rejects a record with %s", (_label, mutate) => {
    const record = structuredClone(createRecord()) as unknown as Record<
      string,
      unknown
    >;
    mutate(record);
    sessionStorage.setItem("hydration-execution:v1", JSON.stringify(record));
    expect(readExecutionRecord(sessionStorage)).toBeNull();
  });

  it("rejects a failed outcome that contains a summary", () => {
    const record = structuredClone(createRecord()) as unknown as Record<
      string,
      unknown
    >;
    record.outcome = "failed";
    record.fatalError = "Graph failed";
    sessionStorage.setItem("hydration-execution:v1", JSON.stringify(record));
    expect(readExecutionRecord(sessionStorage)).toBeNull();
  });

  it("stores cancellation before the queue creates task rows", () => {
    const record = createRecord();
    record.tasks = [];
    record.outcome = "cancelled";
    if (!record.summary) throw new Error("Expected a reportable record.");
    record.summary.stats = {
      total: 0,
      created: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
    };
    record.summary.categoryBreakdown = {};
    record.summary.errors = [];
    record.summary.warnings = [];

    writeExecutionRecord(sessionStorage, record);

    expect(readExecutionRecord(sessionStorage)?.outcome).toBe("cancelled");
  });

  it.each(["failed", "blocked", "warning", "pending", "running"])(
    "rejects a succeeded outcome with a %s task state",
    (state) => {
      const record = structuredClone(createRecord()) as unknown as Record<
        string,
        unknown
      >;
      const task = (record.tasks as Array<Record<string, unknown>>)[0];
      if (state === "blocked") {
        task.status = "skipped";
        task.skipKind = "blocked";
      } else if (state === "warning") {
        task.warning = "Review this item.";
      } else {
        task.status = state;
      }
      sessionStorage.setItem("hydration-execution:v1", JSON.stringify(record));
      expect(readExecutionRecord(sessionStorage)).toBeNull();
    },
  );

  it("rejects unfinished tasks in a completed-with-issues record", () => {
    const record = createRecord();
    record.outcome = "completedWithIssues";
    record.tasks[0].status = "pending";

    expect(() => writeExecutionRecord(sessionStorage, record)).toThrow();
  });

  it.each([
    ["total", (summary: Record<string, unknown>) => ((summary.stats as Record<string, number>).total = 2)],
    ["action count", (summary: Record<string, unknown>) => ((summary.stats as Record<string, number>).created = 0)],
    ["skipped count", (summary: Record<string, unknown>) => ((summary.stats as Record<string, number>).skipped = 1)],
    ["failed count", (summary: Record<string, unknown>) => ((summary.stats as Record<string, number>).failed = 1)],
    ["category breakdown", (summary: Record<string, unknown>) => {
      const groups = (summary.categoryBreakdown as Record<string, Record<string, number>>).groups;
      groups.success = 0;
    }],
    ["timestamp", (summary: Record<string, unknown>) => {
      summary.endTime = new Date("2026-08-17T01:00:03.000Z");
    }],
    ["duration", (summary: Record<string, unknown>) => {
      summary.duration = 3000;
    }],
    ["errors", (summary: Record<string, unknown>) => {
      summary.errors = [{
        task: "Unrelated task",
        message: "Unrelated error",
        timestamp: new Date("2026-08-17T01:00:02.000Z"),
      }];
    }],
    ["warnings", (summary: Record<string, unknown>) => {
      summary.warnings = [{
        task: "Unrelated task",
        message: "Unrelated warning",
        timestamp: new Date("2026-08-17T01:00:02.000Z"),
      }];
    }],
    ["batch statistics", (summary: Record<string, unknown>) => {
      summary.batchStats = {
        batchingEnabled: true,
        batchSize: 20,
        batchRequestCount: 1,
        batchedTaskCount: 2,
        sequentialTaskCount: 0,
      };
    }],
  ])("rejects a record with a mismatched summary %s", (_label, mutate) => {
    const record = structuredClone(createRecord()) as unknown as Record<
      string,
      unknown
    >;
    mutate(record.summary as Record<string, unknown>);
    sessionStorage.setItem("hydration-execution:v1", JSON.stringify(record));
    expect(readExecutionRecord(sessionStorage)).toBeNull();
  });
});
