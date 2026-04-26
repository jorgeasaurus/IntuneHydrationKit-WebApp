import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  containsSecretPlaceholders,
  escapeODataString,
  hasODataUnsafeChars,
  isActualSecretField,
  sleepWithExecutionControl,
  waitWhilePaused,
} from "@/lib/hydration/utils";

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

  it("cancels immediately when a controlled sleep starts after cancellation", async () => {
    await expect(
      sleepWithExecutionControl(
        1000,
        {
          shouldPause: () => false,
          shouldCancel: () => true,
        },
        100
      )
    ).resolves.toBe("cancelled");
  });
});

describe("hydration utility helpers", () => {
  it("escapes OData strings and detects OData-unsafe characters", () => {
    expect(escapeODataString("O'Brien")).toBe("O''Brien");
    expect(hasODataUnsafeChars("[IHD] Baseline: Windows")).toBe(true);
    expect(hasODataUnsafeChars("Baseline Windows")).toBe(false);
  });

  it("detects placeholder secrets in nested password settings", () => {
    expect(
      containsSecretPlaceholders({
        settings: [
          {
            settingDefinitionId: "vpn_password",
            simpleSettingValue: {
              value: "<YOUR VPN PASSWORD>",
            },
          },
        ],
      })
    ).toBe(true);

    expect(
      containsSecretPlaceholders({
        settingDefinitionId: "vpn_password",
        value: "production-password",
      })
    ).toBe(false);

    expect(containsSecretPlaceholders(["safe", { nested: "CHANGE_ME" }])).toBe(true);
    expect(containsSecretPlaceholders(null)).toBe(false);
  });

  it("distinguishes actual secret fields from password-related policy settings", () => {
    expect(isActualSecretField("wifi_profile_networkPassword")).toBe(true);
    expect(isActualSecretField("vpnConnection_sharedKey")).toBe(true);
    expect(isActualSecretField("device_passwordRequired")).toBe(false);
    expect(isActualSecretField("networkPasswordEncryptionStore")).toBe(false);
  });
});
