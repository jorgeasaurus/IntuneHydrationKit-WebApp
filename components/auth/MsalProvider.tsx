"use client";

import { MsalProvider as BaseMsalProvider } from "@azure/msal-react";
import { msalInstance } from "@/lib/auth/msalConfig";

interface MsalProviderProps {
  children: React.ReactNode;
}

/**
 * MSAL authentication provider wrapper
 * Wraps the application with MSAL authentication context
 */
export function MsalProvider({ children }: MsalProviderProps) {
  return <BaseMsalProvider instance={msalInstance}>{children}</BaseMsalProvider>;
}
