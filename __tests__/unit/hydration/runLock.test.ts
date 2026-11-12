import { afterEach, describe, expect, it } from "vitest";

import { installFakeLocks, runLockName } from "@/__tests__/helpers/fakeLocks";
import { getRunLockState, holdRunLock } from "@/lib/hydration/runLock";
import {
  CHECKING_OTHER_TABS_REASON,
  OTHER_TAB_RUN_REASON,
  UNKNOWN_OTHER_TABS_REASON,
  getRunLockBlockReason,
} from "@/lib/hydration/rerun";

describe("run lock", () => {
  let uninstall: (() => void) | null = null;

  afterEach(() => {
    uninstall?.();
    uninstall = null;
  });

  it("is held for the life of a run and free after it", async () => {
    const fake = installFakeLocks();
    uninstall = fake.uninstall;
    expect(await getRunLockState("Tenant-1")).toBe("free");

    const release = holdRunLock("Tenant-1");
    await Promise.resolve();
    expect(fake.held.has(runLockName("tenant-1"))).toBe(true);
    expect(await getRunLockState("tenant-1")).toBe("held");
    expect(await getRunLockState("tenant-2")).toBe("free");

    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await getRunLockState("tenant-1")).toBe("free");
  });

  it("reports unknown when the browser has no Web Locks API", async () => {
    expect("locks" in navigator).toBe(false);
    expect(await getRunLockState("tenant-1")).toBe("unknown");
    expect(() => holdRunLock("tenant-1")()).not.toThrow();
  });
});

describe("getRunLockBlockReason", () => {
  it("blocks every kind while another tab runs the tenant", () => {
    expect(getRunLockBlockReason("resume", "held")).toBe(OTHER_TAB_RUN_REASON);
    expect(getRunLockBlockReason("retry", "held")).toBe(OTHER_TAB_RUN_REASON);
    expect(getRunLockBlockReason("live", "held")).toBe(OTHER_TAB_RUN_REASON);
  });

  it("resumes only when it is known that no other tab runs it (fail closed)", () => {
    expect(getRunLockBlockReason("resume", "free")).toBeNull();
    expect(getRunLockBlockReason("resume", null)).toBe(CHECKING_OTHER_TABS_REASON);
    expect(getRunLockBlockReason("resume", "unknown")).toBe(UNKNOWN_OTHER_TABS_REASON);
  });

  it("does not block a retry or live run when the state is not known yet", () => {
    expect(getRunLockBlockReason("retry", null)).toBeNull();
    expect(getRunLockBlockReason("live", "unknown")).toBeNull();
  });
});
