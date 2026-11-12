/**
 * A small in-memory Web Locks API for tests. `held` holds names that a run holds; a test can
 * add a name to act as another tab that runs the same tenant.
 */
export function installFakeLocks(): { held: Map<string, number>; uninstall: () => void } {
  const held = new Map<string, number>();
  const locks = {
    async request(name: string, _options: LockOptions, callback: () => Promise<unknown>): Promise<unknown> {
      held.set(name, (held.get(name) ?? 0) + 1);
      try {
        return await callback();
      } finally {
        const count = (held.get(name) ?? 1) - 1;
        if (count > 0) held.set(name, count);
        else held.delete(name);
      }
    },
    async query(): Promise<LockManagerSnapshot> {
      return { held: [...held.keys()].map((name) => ({ name, mode: "shared" as const })), pending: [] };
    },
  };
  Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
  return {
    held,
    uninstall: () => {
      Reflect.deleteProperty(navigator, "locks");
    },
  };
}

/** Lock name of the runs of a tenant, as lib/hydration/runLock.ts names it. */
export function runLockName(tenantId: string): string {
  return `intune-hydration-run:${tenantId.toLowerCase()}`;
}
