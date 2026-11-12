/**
 * Cross-tab liveness of hydration runs.
 *
 * A duplicated browser tab gets a copy of sessionStorage, so it can see the checkpoint of a run
 * that the original tab still executes. The tab that runs a hydration holds a shared Web Lock
 * named after the tenant for the life of the run. Another tab checks for that lock before it
 * starts a run that continues a saved run. The browser releases the lock when the run ends or
 * the tab closes or crashes.
 */

/** Liveness of runs for a tenant in other tabs. "unknown": this browser cannot tell. */
export type RunLockState = "held" | "free" | "unknown";

const LOCK_PREFIX = "intune-hydration-run:";

function getLockManager(): LockManager | null {
  if (typeof navigator === "undefined") return null;
  return navigator.locks ?? null;
}

function getLockName(tenantId: string): string {
  return `${LOCK_PREFIX}${tenantId.toLowerCase()}`;
}

/**
 * Hold the run lock of a tenant until the returned function is called.
 * The lock is shared, so a second run in another tab never waits for it.
 * Without Web Locks, nothing is held (the other tabs then see "unknown").
 */
export function holdRunLock(tenantId: string): () => void {
  const locks = getLockManager();
  if (!locks) return () => undefined;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.request(getLockName(tenantId), { mode: "shared" }, () => held).catch((error: unknown) => {
    console.warn("[Run lock] Could not hold the run lock:", error);
  });
  return () => release();
}

/**
 * Whether a run for the tenant is active in a tab. Call it only when this tab has no active
 * run, so a held lock belongs to another tab.
 */
export async function getRunLockState(tenantId: string): Promise<RunLockState> {
  const locks = getLockManager();
  if (!locks) return "unknown";
  try {
    const snapshot = await locks.query();
    const name = getLockName(tenantId);
    return (snapshot.held ?? []).some((lock) => lock.name === name) ? "held" : "free";
  } catch {
    return "unknown";
  }
}

/**
 * Report the run lock state of a tenant now, and again every `intervalMs` while another tab
 * holds it, so the caller sees when that run ends. Returns the function that stops it.
 */
export function watchRunLock(
  tenantId: string,
  onState: (state: RunLockState) => void,
  intervalMs: number,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = (): void => {
    void getRunLockState(tenantId).then((state) => {
      if (stopped) return;
      onState(state);
      if (state === "held") timer = setTimeout(check, intervalMs);
    });
  };
  check();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
