"use client";

import { MsalProvider as BaseMsalProvider, useMsal } from "@azure/msal-react";
import {
  getMsalConfigurationError,
  initializeMsal,
  msalInstance,
} from "@/lib/auth/msalConfig";
import { consumeInactivitySignOutNotice, signOutForInactivity } from "@/lib/auth/authUtils";
import {
  getExecutionState,
  subscribeExecutionState,
  type ExecutionState,
} from "@/lib/hydration/executionStateStore";
import { useEffect, useState, useSyncExternalStore } from "react";

interface MsalProviderProps {
  children: React.ReactNode;
}

/** Sign out after 1 hour of inactivity (per security spec) */
export const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll"] as const;
const ACTIVE_RUN_PHASES: ReadonlySet<ExecutionState["phase"]> = new Set([
  "building",
  "running",
  "paused",
  "cancelling",
]);

function getExecutionPhase(): ExecutionState["phase"] {
  return getExecutionState().phase;
}

function getServerExecutionPhase(): ExecutionState["phase"] {
  return "idle";
}

/**
 * Signs the user out after a period of inactivity.
 * A run that is building, running, paused, or cancelling counts as activity: the timer stops
 * while the run is active and starts again from zero when the run ends.
 */
function SessionTimeoutHandler() {
  const { accounts } = useMsal();
  const isSignedIn = accounts.length > 0;
  const phase = useSyncExternalStore(subscribeExecutionState, getExecutionPhase, getServerExecutionPhase);
  const isRunActive = ACTIVE_RUN_PHASES.has(phase);

  useEffect(() => {
    if (!isSignedIn || isRunActive) return;

    const handleTimeout = () => {
      console.warn("[Auth] Session timed out after 1 hour of inactivity. Signing out.");
      signOutForInactivity().catch((error) =>
        console.error("[Auth] Sign-out after inactivity failed:", error)
      );
    };

    let timeoutId = window.setTimeout(handleTimeout, SESSION_TIMEOUT_MS);

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleTimeout, SESSION_TIMEOUT_MS);
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      window.clearTimeout(timeoutId);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isSignedIn, isRunActive]);

  return null;
}

/** Tells the user that the app signed them out after inactivity. */
function InactivitySignOutNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Read in an effect: the notice is in sessionStorage, which the server cannot read.
    if (consumeInactivitySignOutNotice()) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-lg border border-amber-500/40 bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="flex-1 space-y-1">
        <p className="text-sm font-semibold">Signed out due to inactivity</p>
        <p className="text-sm text-muted-foreground">
          No activity occurred for 1 hour, so the app signed you out. Sign in again to continue.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="rounded-md px-2 py-1 text-sm font-medium hover:bg-muted"
        aria-label="Dismiss sign-out notice"
      >
        Dismiss
      </button>
    </div>
  );
}

/** Shows why sign-in is not available. The page content stays visible. */
function AuthUnavailableNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md space-y-1 rounded-lg border border-red-500/40 bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <p className="text-sm font-semibold">Authentication unavailable</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * MSAL authentication provider wrapper.
 * Children render on the server and before MSAL initialization completes. msal-react reports
 * `inProgress: startup` until initialization ends, and auth-dependent UI (for example
 * ProtectedRoute) waits for that. signIn waits for initialization before it opens a popup.
 */
export function MsalProvider({ children }: MsalProviderProps) {
  const configurationError = getMsalConfigurationError();
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (configurationError) {
      console.error("[MSAL] Failed to initialize:", new Error(configurationError));
      return;
    }

    initializeMsal().catch((error) => {
      console.error("[MSAL] Failed to initialize:", error);
      setInitError(error instanceof Error ? error.message : String(error));
    });
  }, [configurationError]);

  const authError = configurationError ?? initError;

  return (
    <BaseMsalProvider instance={msalInstance}>
      <SessionTimeoutHandler />
      <InactivitySignOutNotice />
      {children}
      {authError ? <AuthUnavailableNotice message={authError} /> : null}
    </BaseMsalProvider>
  );
}
