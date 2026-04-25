import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sleepWithExecutionControl, waitWhilePaused } from "@/lib/hydration/utils";

describe("hydration execution controls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits until pause is released", async () => {
    let isPaused = true;

    const resultPromise = waitWhilePaused(
      {
        shouldPause: () => isPaused,
        shouldCancel: () => false,
      },
      100
    );

    await vi.advanceTimersByTimeAsync(300);

    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    isPaused = false;
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toBe("resumed");
  });

  it("returns cancelled while paused when cancellation is requested", async () => {
    let isCancelled = false;

    const resultPromise = waitWhilePaused(
      {
        shouldPause: () => true,
        shouldCancel: () => isCancelled,
      },
      100
    );

    isCancelled = true;
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toBe("cancelled");
  });

  it("pauses an in-progress delay until execution resumes", async () => {
    let isPaused = false;

    const resultPromise = sleepWithExecutionControl(
      1000,
      {
        shouldPause: () => isPaused,
        shouldCancel: () => false,
      },
      100
    );

    await vi.advanceTimersByTimeAsync(300);
    isPaused = true;
    await vi.advanceTimersByTimeAsync(500);

    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    isPaused = false;
    await vi.advanceTimersByTimeAsync(700);

    await expect(resultPromise).resolves.toBe("completed");
  });
});
