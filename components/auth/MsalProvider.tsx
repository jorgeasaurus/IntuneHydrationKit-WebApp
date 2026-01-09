"use client";

import { MsalProvider as BaseMsalProvider } from "@azure/msal-react";
import { msalInstance, initializeMsal } from "@/lib/auth/msalConfig";
import { useEffect, useState } from "react";

interface MsalProviderProps {
  children: React.ReactNode;
}

/**
 * MSAL authentication provider wrapper
 * Wraps the application with MSAL authentication context
 * Ensures MSAL is properly initialized before rendering children
 */
export function MsalProvider({ children }: MsalProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeMsal()
      .then(() => {
        setIsInitialized(true);
      })
      .catch((error) => {
        console.error("[MSAL] Failed to initialize:", error);
        // Still set initialized to allow the app to render with error handling
        setIsInitialized(true);
      });
  }, []);

  // Show nothing while MSAL is initializing
  // This prevents authentication operations from being called before MSAL is ready
  if (!isInitialized) {
    return null;
  }

  return <BaseMsalProvider instance={msalInstance}>{children}</BaseMsalProvider>;
}
