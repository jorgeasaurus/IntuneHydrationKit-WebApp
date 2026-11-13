import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  getExecutionState,
  getPausedMsAt,
  pauseExecution,
  recordPauseWait,
  resumeExecution,
} from "@/lib/hydration/executionStateStore";
import { createSummary, generateMarkdownReport } from "@/lib/hydration/reporter";
import { sleepWithExecutionControl, waitWhilePaused } from "@/lib/hydration/utils";

const T0 = new Date("2026-08-17T01:00:00.000Z");

function startRun(): number {
  const runId = beginExecution({
    tenantId: "tenant",
    homeAccountId: "home",
    operationMode: "create",
    isPreview: false,
    selectedObjectCount: 1,
  });
  if (runId === null) throw new Error("Run did not start");
  return runId;
}

describe("pause wait recording", () => {
  beforeEach(() => {
    forceResetExecutionSessionForTests();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
    forceResetExecutionSessionForTests();
  });

  it("reports a wait only when the engine really waits", async () => {
    const onPauseWait = vi.fn();
    let paused = false;
    const controls = { shouldPause: () => paused, shouldCancel: () => false, onPauseWait };

    await expect(waitWhilePaused(controls)).resolves.toBe("resumed");
    const sleep = sleepWithExecutionControl(500, controls, 100);
    await vi.advanceTimersByTimeAsync(500);
    await expect(sleep).resolves.toBe("completed");
    expect(onPauseWait).not.toHaveBeenCalled();

    paused = true;
    const wait = waitWhilePaused(controls, 100);
    expect(onPauseWait).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(300);
    paused = false;
    await vi.advanceTimersByTimeAsync(100);
    await expect(wait).resolves.toBe("resumed");
    expect(onPauseWait.mock.calls).toEqual([[true], [false]]);
  });

  it("ends the reported wait when the run is cancelled during it", async () => {
    const onPauseWait = vi.fn();
    let cancelled = false;
    const wait = waitWhilePaused({ shouldPause: () => true, shouldCancel: () => cancelled, onPauseWait }, 100);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(100);
    await expect(wait).resolves.toBe("cancelled");
    expect(onPauseWait.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps the paused phase without a wait, and adds only real wait time", async () => {
    const runId = startRun();
    pauseExecution(runId);
    expect(getExecutionState().phase).toBe("paused");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getExecutionState().pausedMs).toBe(0);

    recordPauseWait(runId, true);
    expect(getExecutionState().pauseStartedAt).toEqual(new Date(T0.getTime() + 10_000));
    await vi.advanceTimersByTimeAsync(4_000);
    // Two parallel requests wait in the same pause.
    recordPauseWait(runId, true);
    await vi.advanceTimersByTimeAsync(1_000);
    recordPauseWait(runId, false);
    expect(getExecutionState().pauseStartedAt).not.toBeNull();
    resumeExecution(runId);
    recordPauseWait(runId, false);

    expect(getExecutionState().phase).toBe("running");
    expect(getExecutionState().pauseStartedAt).toBeNull();
    expect(getExecutionState().pausedMs).toBe(5_000);
  });

  it("closes an open wait at the end time, the same value the summary uses", async () => {
    const runId = startRun();
    pauseExecution(runId);
    await vi.advanceTimersByTimeAsync(2_000);
    recordPauseWait(runId, true);
    await vi.advanceTimersByTimeAsync(3_000);
    const endTime = new Date();
    const pausedMs = getPausedMsAt(endTime);
    expect(pausedMs).toBe(3_000);

    const summary = createSummary("tenant", "create", T0, endTime, [], undefined, undefined, undefined, pausedMs);
    finishExecution(runId, { endTime, summary, outcome: "cancelled", fatalError: null });
    recordPauseWait(runId, false);

    expect(getExecutionState().pausedMs).toBe(3_000);
    expect(getExecutionState().pauseStartedAt).toBeNull();
    expect(summary.duration).toBe(2_000);
    expect(summary.pausedDuration).toBe(3_000);
  });
});

describe("report duration", () => {
  it("states the active duration and the paused time", () => {
    const endTime = new Date(T0.getTime() + 125_000);
    const summary = createSummary("tenant", "create", T0, endTime, [], undefined, undefined, undefined, 65_000);
    const markdown = generateMarkdownReport(summary, [], "succeeded", false);

    expect(summary.duration).toBe(60_000);
    expect(markdown).toContain("**Duration**: 1m 0s (active time; paused for 1m 5s)");
  });

  it("keeps the duration line unchanged for a run without a pause", () => {
    const endTime = new Date(T0.getTime() + 5_000);
    const summary = createSummary("tenant", "create", T0, endTime, []);

    expect(summary).not.toHaveProperty("pausedDuration");
    expect(generateMarkdownReport(summary, [], "succeeded", false)).toContain("**Duration**: 5s\n");
  });
});
