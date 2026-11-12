"use client";

import { createContext, useContext } from "react";

/**
 * Why sign-in is unavailable: a missing Entra configuration or an MSAL initialization failure.
 * `null` while MSAL is starting or ready. MsalProvider sets it.
 */
export const AuthUnavailableContext = createContext<string | null>(null);

/**
 * Returns the reason sign-in is unavailable, or `null`.
 * After an initialization failure msal-react stays in `startup`, so auth-dependent UI must check
 * this instead of waiting for `InteractionStatus.None`.
 */
export function useAuthUnavailableError(): string | null {
  return useContext(AuthUnavailableContext);
}
