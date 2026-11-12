import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchConfiguration } from "@/lib/config/batchConfig";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { GroupTemplate } from "@/lib/templates/loader";
import type { HydrationTask } from "@/types/hydration";
import { OUTCOME_UNKNOWN_NOT_FOUND, OUTCOME_UNKNOWN_UNVERIFIED } from "@/lib/graph/client";

const { mockGetCachedTemplates, mockGetBatchConfig, mockSleepWithExecutionControl, mockWaitWhilePaused } =
  vi.hoisted(() => ({
    mockGetCachedTemplates: vi.fn(),
    mockGetBatchConfig: vi.fn(),
    mockSleepWithExecutionControl: vi.fn(),
    mockWaitWhilePaused: vi.fn(),
  }));

vi.mock("@/lib/templates/loader", async () => {
  const actual = await vi.importActual("@/lib/templates/loader");
  return { ...actual, getCachedTemplates: mockGetCachedTemplates };
});

vi.mock("@/lib/config/batchConfig", async () => {
  const actual = await vi.importActual("@/lib/config/batchConfig");
  return { ...actual, getBatchConfig: mockGetBatchConfig };
});

vi.mock("@/lib/hydration/utils", async () => {
  const actual = await vi.importActual("@/lib/hydration/utils");
  return {
    ...actual,
    sleepWithExecutionControl: mockSleepWithExecutionControl,
    waitWhilePaused: mockWaitWhilePaused,
  };
});

import { executeTasksInBatches } from "@/lib/hydration/batchExecutor";

const config: BatchConfiguration = {
  defaultBatchSize: 20,
  delayBetweenBatches: 1000,
  enableBatching: true,
};

const GROUP_NAMES = ["[IHD] Group A", "[IHD] Group B"];

function groupTemplate(displayName: string): GroupTemplate {
  return { displayName, description: "d", membershipRule: '(device.deviceOSType -eq "Windows")' };
}

function task(index: number): HydrationTask {
  return { id: `t-${index}`, category: "groups", operation: "create", itemName: GROUP_NAMES[index], status: "pending" };
}

function httpError(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`[${status}] Graph error`), { status, ...extra });
}

function created(id: string, displayName: string) {
  return { id: `req-${id}`, status: 201, headers: {}, body: { id: `group-${id}`, displayName } };
}

function createContext(client: Record<string, unknown>): ExecutionContext {
  return {
    client: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), getCollection: vi.fn(), ...client } as unknown as ExecutionContext["client"],
    operationMode: "create",
    isPreview: false,
    stopOnFirstError: false,
    cachedIntuneGroups: [],
    onStatusUpdate: vi.fn(),
  };
}

describe("batch create resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetBatchConfig.mockReturnValue(config);
    mockSleepWithExecutionControl.mockResolvedValue("completed");
    mockWaitWhilePaused.mockResolvedValue("resumed");
    mockGetCachedTemplates.mockImplementation((category?: string) =>
      category === "groups" ? GROUP_NAMES.map(groupTemplate) : undefined
    );
  });

  describe("outer $batch failure", () => {
    it("retries the whole batch after an outer 429, honours Retry-After and slows the next batches", async () => {
      mockGetBatchConfig.mockReturnValue({ ...config, defaultBatchSize: 1 });
      const batch = vi
        .fn()
        .mockRejectedValueOnce(httpError(429, { retryAfterMs: 5000 }))
        .mockResolvedValueOnce({ responses: [created("0", GROUP_NAMES[0])] })
        .mockResolvedValueOnce({ responses: [{ ...created("1", GROUP_NAMES[1]), id: "req-1" }] });
      const context = createContext({ batch });

      const results = await executeTasksInBatches([task(0), task(1)], context);

      expect(results.map((r) => r.success)).toEqual([true, true]);
      expect(batch).toHaveBeenCalledTimes(3);
      expect(mockSleepWithExecutionControl).toHaveBeenNthCalledWith(1, 5000, context);
      // The throttle state doubles the delay before the next batch.
      expect(mockSleepWithExecutionControl).toHaveBeenNthCalledWith(2, 2000, context);
    });

    it("retries an outer 503 and fails the chunk after MAX_RETRIES retries", async () => {
      const batch = vi.fn().mockRejectedValue(httpError(503));
      const findCreatedObjects = vi.fn();
      const context = createContext({ batch, findCreatedObjects });

      const results = await executeTasksInBatches([task(0), task(1)], context);

      expect(batch).toHaveBeenCalledTimes(4);
      expect(findCreatedObjects).not.toHaveBeenCalled();
      expect(results).toEqual([
        expect.objectContaining({ success: false, skipped: false, error: expect.stringContaining("[503]") }),
        expect.objectContaining({ success: false, skipped: false, error: expect.stringContaining("[503]") }),
      ]);
    });

    it("does not resend after an outer network error; it reads the tenant and keeps found objects", async () => {
      const batch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      const findCreatedObjects = vi.fn().mockResolvedValue([{ id: "group-a", displayName: GROUP_NAMES[0] }, undefined]);
      const context = createContext({ batch, findCreatedObjects });
      const tasks = [task(0), task(1)];

      const results = await executeTasksInBatches(tasks, context);

      expect(batch).toHaveBeenCalledTimes(1);
      expect(findCreatedObjects).toHaveBeenCalledTimes(1);
      expect(findCreatedObjects).toHaveBeenCalledWith(
        "/groups",
        [expect.objectContaining({ displayName: GROUP_NAMES[0] }), expect.objectContaining({ displayName: GROUP_NAMES[1] })],
        "v1.0"
      );
      expect(results[0]).toEqual(expect.objectContaining({ task: tasks[0], success: true, createdId: "group-a" }));
      expect(results[1]).toEqual(
        expect.objectContaining({ task: tasks[1], success: false, error: expect.stringContaining(OUTCOME_UNKNOWN_NOT_FOUND) })
      );
      expect(results[1].error).toContain("Failed to fetch");
      expect(context.cachedIntuneGroups).toEqual([expect.objectContaining({ id: "group-a" })]);
    });

    it("fails with an 'outcome unknown' message when the tenant cannot be read after an outer network error", async () => {
      const batch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      const findCreatedObjects = vi.fn().mockRejectedValue(httpError(403));
      const context = createContext({ batch, findCreatedObjects });

      const results = await executeTasksInBatches([task(0)], context);

      expect(batch).toHaveBeenCalledTimes(1);
      expect(results[0]).toEqual(
        expect.objectContaining({ success: false, error: expect.stringContaining(OUTCOME_UNKNOWN_UNVERIFIED) })
      );
    });

    it("fails the chunk at once on an outer 400 (Graph did not process it)", async () => {
      const batch = vi.fn().mockRejectedValue(httpError(400));
      const findCreatedObjects = vi.fn();
      const context = createContext({ batch, findCreatedObjects });

      const results = await executeTasksInBatches([task(0)], context);

      expect(batch).toHaveBeenCalledTimes(1);
      expect(findCreatedObjects).not.toHaveBeenCalled();
      expect(results[0]).toEqual(expect.objectContaining({ success: false, error: "[400] Graph error" }));
    });
  });

  describe("per-request responses", () => {
    it("does not resend a create after a 504; a found object counts as created", async () => {
      const batch = vi.fn().mockResolvedValue({
        responses: [
          { id: "req-0", status: 504, headers: {}, body: { error: { message: "Gateway timeout" } } },
          { id: "req-1", status: 500, headers: {}, body: { error: { message: "Internal" } } },
        ],
      });
      const findCreatedObjects = vi.fn().mockResolvedValue([{ id: "group-a", displayName: GROUP_NAMES[0] }, undefined]);
      const context = createContext({ batch, findCreatedObjects });

      const results = await executeTasksInBatches([task(0), task(1)], context);

      expect(batch).toHaveBeenCalledTimes(1);
      expect(results).toEqual([
        expect.objectContaining({ success: true, createdId: "group-a" }),
        expect.objectContaining({ success: false, error: expect.stringMatching(/^Internal \(Outcome unknown/) }),
      ]);
    });

    it("resends only the request that got 503 with Retry-After", async () => {
      const batch = vi
        .fn()
        .mockResolvedValueOnce({
          responses: [
            created("0", GROUP_NAMES[0]),
            { id: "req-1", status: 503, headers: { "Retry-After": "3" }, body: { error: { message: "Busy" } } },
          ],
        })
        .mockResolvedValueOnce({ responses: [{ ...created("1", GROUP_NAMES[1]), id: "req-1" }] });
      const context = createContext({ batch });

      const results = await executeTasksInBatches([task(0), task(1)], context);

      expect(results.map((r) => r.success)).toEqual([true, true]);
      expect(batch).toHaveBeenCalledTimes(2);
      expect(batch.mock.calls[1][0]).toEqual([expect.objectContaining({ id: "req-1" })]);
      expect(mockSleepWithExecutionControl).toHaveBeenCalledWith(3000, context);
    });
  });
});
