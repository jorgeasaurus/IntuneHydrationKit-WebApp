"use client";

import { MsalProvider as BaseMsalProvider, useMsal } from "@azure/msal-react";
import { msalInstance, initializeMsal } from "@/lib/auth/msalConfig";
import { loadCloudEnvironmentFromSession, signOut } from "@/lib/auth/authUtils";
import { useEffect, useState } from "react";

interface MsalProviderProps {
  children: React.ReactNode;
}

/** Sign out after 1 hour of inactivity (per security spec) */
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll"] as const;

/**
 * Signs the user out after a period of inactivity.
 * Rendered inside the MSAL context so it can observe the signed-in state.
 */
function SessionTimeoutHandler() {
  const { accounts } = useMsal();
  const isSignedIn = accounts.length > 0;

  useEffect(() => {
    if (!isSignedIn) return;

    const handleTimeout = () => {
      console.warn("[Auth] Session timed out after 1 hour of inactivity. Signing out.");
      signOut().catch((error) =>
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
  }, [isSignedIn]);

  return null;
}

/**
 * MSAL authentication provider wrapper
 * Wraps the application with MSAL authentication context
 * Ensures MSAL is properly initialized before rendering children
 */
export function MsalProvider({ children }: MsalProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  useEffect(() => {
    // Restore (and sanitize) the persisted cloud environment before any token calls
    loadCloudEnvironmentFromSession();

    initializeMsal()
      .then(() => {
        setIsInitialized(true);
      })
      .catch((error) => {
        console.error("[MSAL] Failed to initialize:", error);
        // Surface the failure instead of rendering the app on a broken MSAL instance
        setInitError(error instanceof Error ? error : new Error(String(error)));
        setIsInitialized(true);
      });
  }, []);

  // Show nothing while MSAL is initializing
  // This prevents authentication operations from being called before MSAL is ready
  if (!isInitialized) {
    return null;
  }

  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-2 rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-center">
          <h2 className="text-lg font-semibold">Authentication unavailable</h2>
          <p className="text-sm text-muted-foreground">
            Sign-in could not be initialized. Check the app&apos;s Entra ID configuration
            (client ID, redirect URI) and reload the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <BaseMsalProvider instance={msalInstance}>
      <SessionTimeoutHandler />
      {children}
    </BaseMsalProvider>
  );
}
