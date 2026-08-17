import { beforeEach, describe, expect, it } from "vitest";
import {
  clearHydrationSession,
  readExecutionRecord,
  writeExecutionRecord,
  type ExecutionRecord,
} from "@/lib/hydration/executionRecord";

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
