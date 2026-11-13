import { afterEach, describe, expect, it } from "vitest";

import { installFakeLocks, runLockName } from "@/__tests__/helpers/fakeLocks";
import { claimRunLock, getRunLockState, holdRunLock } from "@/lib/hydration/runLock";
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

  it("grants a claim to one of two tabs that confirm at the same time", async () => {
    const fake = installFakeLocks();
    uninstall = fake.uninstall;

    const [first, second] = await Promise.all([claimRunLock("tenant-1"), claimRunLock("Tenant-1")]);
    expect([first.state, second.state].sort()).toEqual(["claimed", "held"]);
    expect(await getRunLockState("tenant-1")).toBe("held");

    const claimed = first.state === "claimed" ? first : second;
    if (claimed.state !== "claimed") throw new Error("no claim was granted");
    claimed.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await getRunLockState("tenant-1")).toBe("free");
    expect((await claimRunLock("tenant-1")).state).toBe("claimed");
  });

  it("refuses a claim while a run in another tab holds the lock", async () => {
    const fake = installFakeLocks();
    uninstall = fake.uninstall;
    const release = holdRunLock("tenant-1");
    await Promise.resolve();

    expect((await claimRunLock("tenant-1")).state).toBe("held");
    release();
  });

  it("cannot claim when the browser has no Web Locks API", async () => {
    expect((await claimRunLock("tenant-1")).state).toBe("unknown");
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
