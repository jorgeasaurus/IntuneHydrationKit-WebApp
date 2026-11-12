"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getExecutionState,
  subscribeExecutionState,
  type ExecutionState,
} from "@/lib/hydration/executionStateStore";

const WAKE_LOCK_PHASES: ReadonlySet<ExecutionState["phase"]> = new Set(["building", "running", "cancelling"]);

function getPhase(): ExecutionState["phase"] {
  return getExecutionState().phase;
}

function getServerPhase(): ExecutionState["phase"] {
  return "idle";
}

/**
 * Keep the screen on while a run builds its queue, runs, or cancels.
 *
 * The browser releases a screen wake lock when the tab becomes hidden, so the
 * hook requests it again when the tab becomes visible. Browsers without the
 * Screen Wake Lock API, or that refuse the request, keep their usual behavior.
 */
export function useRunWakeLock(): void {
  const phase = useSyncExternalStore(subscribeExecutionState, getPhase, getServerPhase);
  const shouldHoldLock = WAKE_LOCK_PHASES.has(phase);

  useEffect(() => {
    if (!shouldHoldLock || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let requesting = false;
    let disposed = false;

    const acquire = async (): Promise<void> => {
      if (requesting || disposed || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (disposed) {
          await lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // The browser can refuse the lock, for example on low battery. The run continues.
      } finally {
        requesting = false;
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinel && !sentinel.released) {
        sentinel.release().catch(() => {
          // The lock is already gone.
        });
      }
      sentinel = null;
    };
  }, [shouldHoldLock]);
}
