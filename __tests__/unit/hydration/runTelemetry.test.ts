import { describe, expect, it } from "vitest";
import { createRunTelemetry } from "@/lib/hydration/runTelemetry";
import type { BatchRequest } from "@/lib/graph/batch";
import type { HydrationTask } from "@/types/hydration";

describe("run telemetry", () => {
  it("counts each retry but counts its tasks once", () => {
    const run = createRunTelemetry(20, true);
    const requests: BatchRequest[] = [
      { id: "1", method: "POST", url: "/groups" },
      { id: "2", method: "POST", url: "/groups" },
    ];
    run.onBatchDispatch(requests);
    run.onBatchDispatch([requests[1]]);
    expect(run.snapshot()).toMatchObject({ batchRequestCount: 2, batchedTaskCount: 2, sequentialTaskCount: 0 });
  });

  it("does not infer mutation requests from preview or sequential tasks", () => {
    const run = createRunTelemetry(20, true);
    const task: HydrationTask = { id: "1", category: "baseline", operation: "create", itemName: "Baseline", status: "pending" };
    run.onSequentialTask(task);
    run.onSequentialTask(task);
    expect(run.snapshot()).toMatchObject({ batchRequestCount: 0, batchedTaskCount: 0, sequentialTaskCount: 1 });
    expect(createRunTelemetry(20, true).snapshot().batchRequestCount).toBe(0);
  });
});
