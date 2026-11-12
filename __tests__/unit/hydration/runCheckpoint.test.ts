import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isExecutionCheckpoint,
  readExecutionRecord,
  writeExecutionRecord,
  type ExecutionRecord,
} from "@/lib/hydration/executionRecord";
import {
  beginExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  getExecutionState,
  updateExecutionStateForRun,
  type ExecutionRunConfiguration,
} from "@/lib/hydration/executionStateStore";
import {
  CHECKPOINT_ACTIVITY_LIMIT,
  CHECKPOINT_INTERVAL_MS,
  createCheckpointRecord,
  startRunCheckpoints,
} from "@/lib/hydration/runCheckpoint";
import { EXECUTION_RECORD_STORAGE_KEY } from "@/lib/storageKeys";
import type { HydrationTask } from "@/types/hydration";

const configuration: ExecutionRunConfiguration = {
  tenantId: "tenant-1",
  homeAccountId: "home-1",
  tenantName: "Contoso",
  cloudEnvironment: "global",
  operationMode: "create",
  isPreview: false,
  selectedObjectCount: 3,
  scope: { selectedTargets: ["groups"], selectedCISCategories: [] },
  licenses: { hasConditionalAccessLicense: true, hasPremiumP2License: false, hasWindowsDriverUpdateLicense: true },
};

function createTasks(): HydrationTask[] {
  const start = new Date("2026-08-17T01:00:00.000Z");
  return [
    { id: "t1", category: "groups", operation: "create", itemName: "A", status: "success", startTime: start, endTime: start },
    { id: "t2", category: "groups", operation: "create", itemName: "B", status: "running", startTime: start },
    { id: "t3", category: "groups", operation: "create", itemName: "C", status: "pending" },
  ];
}

function startRun(tasks = createTasks()): number {
  const runId = beginExecution(configuration)!;
  updateExecutionStateForRun(runId, (state) => ({
    ...state,
    phase: "running",
    tasks,
    startTime: new Date("2026-08-17T01:00:00.000Z"),
  }));
  return runId;
}

function updateTask(runId: number, id: string, status: HydrationTask["status"]): void {
  updateExecutionStateForRun(runId, (state) => ({
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === id ? ({ ...task, status, endTime: new Date("2026-08-17T01:00:01.000Z") } as HydrationTask) : task,
    ),
  }));
}

describe("createCheckpointRecord", () => {
  beforeEach(() => forceResetExecutionSessionForTests());

  it("saves nothing without an active run with a queue", () => {
    const at = new Date();
    expect(createCheckpointRecord(getExecutionState(), at)).toBeNull();
    const runId = beginExecution(configuration)!;
    expect(createCheckpointRecord(getExecutionState(), at)).toBeNull(); // building, no tasks yet
    updateExecutionStateForRun(runId, (state) => ({ ...state, phase: "completed", tasks: createTasks() }));
    expect(createCheckpointRecord(getExecutionState(), at)).toBeNull();
  });

  it("keeps the scope and licenses, but no confirmation flag, and only the last activity messages", () => {
    const runId = startRun();
    updateExecutionStateForRun(runId, (state) => ({
      ...state,
      activityLog: Array.from({ length: 60 }, (_, index) => ({
        id: `m${index}`,
        timestamp: new Date("2026-08-17T01:00:00.000Z"),
        message: `Message ${index}`,
        type: "info" as const,
      })),
    }));
    const record = createCheckpointRecord(getExecutionState(), new Date("2026-08-17T01:00:05.000Z"))!;
    expect(record.scope).toEqual(configuration.scope);
    expect(record.licenses).toEqual(configuration.licenses);
    expect(record).not.toHaveProperty("confirmed");
    expect(record.activityLog).toHaveLength(CHECKPOINT_ACTIVITY_LIMIT);
    expect(record.activityLog.at(-1)?.id).toBe("m59");
  });

  it("round-trips through storage as a checkpoint with unfinished tasks", () => {
    startRun();
    writeExecutionRecord(sessionStorage, createCheckpointRecord(getExecutionState(), new Date("2026-08-17T01:00:05.000Z"))!);
    const restored = readExecutionRecord(sessionStorage)!;
    expect(isExecutionCheckpoint(restored)).toBe(true);
    expect(restored.tasks.map((task) => task.status)).toEqual(["success", "running", "pending"]);
    expect(restored.scope).toEqual(configuration.scope);
  });

  it("stays small for a 990-task run", () => {
    const longPath = "WINDOWS/SettingsCatalog/Win - OIB - Device Security - D - Credential Management - v3.6.json";
    const tasks: HydrationTask[] = Array.from({ length: 990 }, (_, index) => {
      const base = {
        id: `task-${index + 1}`,
        category: "cisBaseline" as const,
        operation: "create" as const,
        itemName: `CIS Windows 11 Benchmark - Section ${index} - Policy name of typical length`,
        templatePath: `${longPath}-${index}`,
      };
      if (index < 495) {
        return {
          ...base,
          status: "failed" as const,
          error: "Graph API error 403: Insufficient privileges to complete the operation.",
          startTime: new Date("2026-08-17T01:00:00.000Z"),
          endTime: new Date("2026-08-17T01:00:01.000Z"),
        };
      }
      return { ...base, status: "pending" as const };
    });
    const runId = startRun(tasks);
    updateExecutionStateForRun(runId, (state) => ({
      ...state,
      configuration: {
        ...configuration,
        scope: {
          selectedTargets: ["cisBaseline"],
          selectedCISCategories: ["cis-windows-11"],
          categorySelections: { cisBaseline: { selectedItems: tasks.map((task) => task.templatePath!) } },
        },
      },
      activityLog: Array.from({ length: 100 }, (_, index) => ({
        id: `m${index}`,
        timestamp: new Date("2026-08-17T01:00:00.000Z"),
        message: `Created policy ${index} with a status message of typical length`,
        type: "success" as const,
      })),
    }));

    const started = performance.now();
    writeExecutionRecord(sessionStorage, createCheckpointRecord(getExecutionState(), new Date("2026-08-17T01:00:05.000Z"))!);
    const elapsedMs = performance.now() - started;
    const characters = sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)!.length;
    console.info(`[checkpoint size] 990 tasks: ${characters} characters, write ${elapsedMs.toFixed(1)} ms`);
    // Browsers allow about 5 million characters of sessionStorage per origin. One checkpoint
    // (which replaces the previous one) must use only a small part of it.
    expect(characters).toBeLessThan(600_000);
  });
});

describe("startRunCheckpoints", () => {
  let stop: () => void;
  const target = new EventTarget() as unknown as Window;

  beforeEach(() => {
    vi.useFakeTimers();
    forceResetExecutionSessionForTests();
    sessionStorage.clear();
    stop = startRunCheckpoints({ storage: sessionStorage, eventTarget: target });
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  function savedStatuses(): string[] | null {
    const record = readExecutionRecord(sessionStorage);
    return record ? record.tasks.map((task) => task.status) : null;
  }

  it("writes once when the queue is ready, then at most once per interval", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const runId = startRun();
    vi.advanceTimersByTime(0);
    expect(setItem).toHaveBeenCalledTimes(1);

    updateTask(runId, "t2", "success");
    updateTask(runId, "t3", "running");
    vi.advanceTimersByTime(CHECKPOINT_INTERVAL_MS - 1);
    expect(setItem).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(savedStatuses()).toEqual(["success", "success", "running"]);
    setItem.mockRestore();
  });

  it("writes at once when the page is hidden", () => {
    const runId = startRun();
    vi.advanceTimersByTime(0);
    updateTask(runId, "t2", "success");
    target.dispatchEvent(new Event("pagehide"));
    expect(savedStatuses()).toEqual(["success", "success", "pending"]);
  });

  it("never replaces the final record of a completed run", () => {
    const runId = startRun();
    vi.advanceTimersByTime(0);
    updateTask(runId, "t2", "success");
    finishExecution(runId, { endTime: new Date(), summary: null, outcome: "failed", fatalError: "Stopped" });
    const finalRecord = { marker: "final" };
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, JSON.stringify(finalRecord));
    vi.advanceTimersByTime(CHECKPOINT_INTERVAL_MS * 2);
    target.dispatchEvent(new Event("pagehide"));
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBe(JSON.stringify(finalRecord));
  });

  it("does not stop the run when the storage quota is full", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startRun();
    expect(() => vi.advanceTimersByTime(0)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    setItem.mockRestore();
    warn.mockRestore();
  });
});

describe("execution record compatibility", () => {
  const start = new Date("2026-08-17T01:00:00.000Z");
  const end = new Date("2026-08-17T01:00:02.000Z");
  const checkpoint = (): ExecutionRecord => ({
    tenantId: "tenant-1",
    homeAccountId: "home-1",
    operationMode: "create",
    isPreview: false,
    selectedObjectCount: 1,
    tasks: [{ id: "t1", category: "groups", operation: "create", itemName: "A", status: "pending" }],
    activityLog: [],
    startTime: start,
    endTime: null,
    outcome: null,
    summary: null,
    fatalError: null,
    checkpointAt: end,
  });

  beforeEach(() => sessionStorage.clear());

  it("still loads a failed record saved before scope, licenses, and checkpoints were added", () => {
    sessionStorage.setItem(
      EXECUTION_RECORD_STORAGE_KEY,
      JSON.stringify({
        tenantId: "tenant-1",
        homeAccountId: "home-1",
        operationMode: "create",
        isPreview: false,
        selectedObjectCount: 1,
        tasks: [],
        activityLog: [],
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        outcome: "failed",
        summary: null,
        fatalError: "Token expired",
      }),
    );
    const record = readExecutionRecord(sessionStorage);
    expect(record).not.toBeNull();
    expect(isExecutionCheckpoint(record!)).toBe(false);
  });

  it("rejects a terminal record with unfinished tasks", () => {
    const record = { ...checkpoint(), endTime: end, outcome: "failed", fatalError: "x" };
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, JSON.stringify(record));
    expect(readExecutionRecord(sessionStorage)).toBeNull();
  });

  it("rejects a checkpoint with an end time or without a checkpoint time", () => {
    expect(() => writeExecutionRecord(sessionStorage, { ...checkpoint(), endTime: end } as unknown as ExecutionRecord)).toThrow();
    const { checkpointAt: _omitted, ...withoutTime } = checkpoint() as Extract<ExecutionRecord, { outcome: null }>;
    expect(() => writeExecutionRecord(sessionStorage, withoutTime as unknown as ExecutionRecord)).toThrow();
  });

  it("rejects a checkpoint whose paused time is longer than the saved run", () => {
    expect(() => writeExecutionRecord(sessionStorage, { ...checkpoint(), pausedMs: 5000 })).toThrow();
  });
});
