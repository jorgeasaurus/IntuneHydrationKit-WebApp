import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Zod's JIT probe calls `new Function("")`. A strict Content-Security-Policy without
 * 'unsafe-eval' reports that call as a violation on every page, so the schemas must
 * run in jitless mode. The mode is set in lib/utils/zod.ts.
 */
describe("executionRecord zod configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("parses records without the zod JIT probe (no new Function call)", async () => {
    vi.resetModules();
    const RealFunction = Function;
    const functionConstructor = vi.fn(function (this: unknown, ...args: string[]) {
      return new RealFunction(...args);
    });
    vi.stubGlobal("Function", functionConstructor);

    const { z } = await import("zod");
    const { readExecutionRecord, writeExecutionRecord } = await import("@/lib/hydration/executionRecord");
    const storage = new Map<string, string>();
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    } as unknown as Storage;
    const time = new Date("2026-08-17T01:00:00.000Z");

    writeExecutionRecord(fakeStorage, {
      tenantId: "tenant-1",
      homeAccountId: "home-1",
      operationMode: "create",
      isPreview: false,
      selectedObjectCount: 1,
      outcome: "succeeded",
      fatalError: null,
      startTime: time,
      endTime: time,
      tasks: [
        { id: "t-1", category: "groups", operation: "create", itemName: "Group", status: "success", startTime: time, endTime: time },
      ],
      activityLog: [],
      summary: {
        tenantId: "tenant-1",
        operationMode: "create",
        startTime: time,
        endTime: time,
        duration: 0,
        stats: { total: 1, created: 1, deleted: 0, skipped: 0, failed: 0 },
        categoryBreakdown: { groups: { total: 1, success: 1, skipped: 0, failed: 0 } },
        errors: [],
        warnings: [],
      },
    } as unknown as Parameters<typeof writeExecutionRecord>[1]);
    const record = readExecutionRecord(fakeStorage);

    expect(record?.tasks[0]).toMatchObject({ id: "t-1", status: "success" });
    expect(functionConstructor).not.toHaveBeenCalled();
    expect(z.config().jitless).toBe(true);
  });
});
