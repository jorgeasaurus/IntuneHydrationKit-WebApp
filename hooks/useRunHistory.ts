"use client";

import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { subscribeSignOut } from "@/lib/auth/sessionEvents";
import {
  clearRunHistoryEntries,
  deleteRunHistoryEntry,
  getRunHistoryStorage,
  readRunHistory,
  type RunHistoryEntry,
} from "@/lib/history/runHistory";

/**
 * Run history of the active account and tenant. The account and the tenant must both match:
 * guest tenant profiles share one homeAccountId.
 */
export function useRunHistory() {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0] ?? null;
  const homeAccountId = account?.homeAccountId ?? null;
  const tenantId = account?.tenantId ?? null;
  const [storage] = useState(getRunHistoryStorage);
  const [version, setVersion] = useState(0);

  useEffect(() => subscribeSignOut(() => setVersion((value) => value + 1)), []);

  const entries = useMemo<RunHistoryEntry[]>(() => {
    void version;
    return homeAccountId && tenantId ? readRunHistory(storage, { homeAccountId, tenantId }) : [];
  }, [homeAccountId, storage, tenantId, version]);

  return {
    entries,
    storageAvailable: storage !== null,
    remove: (id: string): boolean => {
      if (!homeAccountId || !tenantId) return false;
      const result = deleteRunHistoryEntry(storage, { homeAccountId, tenantId }, id);
      setVersion((value) => value + 1);
      return result.ok;
    },
    clear: (): void => {
      clearRunHistoryEntries(storage);
      setVersion((value) => value + 1);
    },
  };
}
