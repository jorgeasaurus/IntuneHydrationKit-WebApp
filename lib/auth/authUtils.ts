import { AccountInfo, InteractionRequiredAuthError, BrowserAuthError } from "@azure/msal-browser";
import { msalInstance, loginRequest, getAuthorityUrl } from "./msalConfig";
import { APP_SETTINGS_STORAGE_KEY } from "@/lib/storageKeys";
import { clearHydrationSession } from "@/lib/hydration/executionRecord";
import { resetExecutionSession } from "@/lib/hydration/executionStateStore";

/**
 * Get the active account from MSAL.
 * Honors the account marked active by signIn (msalInstance.setActiveAccount),
 * falling back to the first cached account when none is marked.
 */
export function getActiveAccount(): AccountInfo | null {
  return msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null;
}

/** Require the active account to match the account confirmed in the wizard. */
export function assertActiveAccountMatches(
  tenantId: string,
  homeAccountId: string
): AccountInfo {
  const account = getActiveAccount();
  if (!account || account.tenantId !== tenantId || account.homeAccountId !== homeAccountId) {
    throw new AuthSessionExpiredError(
      "The active account changed. Return to tenant configuration and confirm the active account before continuing."
    );
  }
  return account;
}

/**
 * Acquire an access token silently
 * Falls back to interactive login if silent acquisition fails (timeout, interaction required)
 */
export async function getAccessToken(): Promise<string> {
  const account = getActiveAccount();

  if (!account) {
    throw new AuthSessionExpiredError();
  }

  const authority = getAuthorityUrl(account.tenantId);

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
      authority,
    });
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError || error instanceof BrowserAuthError) {
      // Silent acquisition failed (iframe timeout, expired session, etc.) - try popup
      try {
        const response = await msalInstance.acquireTokenPopup({
          ...loginRequest,
          authority,
        });
        return response.accessToken;
      } catch {
        throw new AuthSessionExpiredError(
          "Session expired. Please sign out and sign in again."
        );
      }
    }
    throw error;
  }
}

/**
 * Custom error class for auth session issues - allows callers to detect and show sign-in UI
 */
export class AuthSessionExpiredError extends Error {
  /** Prevent request retries when the active authentication session is invalid. */
  readonly status = 401;

  constructor(message = "No active account found. Please sign in.") {
    super(message);
    this.name = "AuthSessionExpiredError";
  }
}

/**
 * Sign in the user (global/commercial cloud only).
 */
export async function signIn(): Promise<AccountInfo> {
  const authority = getAuthorityUrl("common");

  const response = await msalInstance.loginPopup({
    ...loginRequest,
    authority,
  });

  if (response.account) {
    msalInstance.setActiveAccount(response.account);
    return response.account;
  }
  throw new Error("Sign in failed: No account returned");
}

/**
 * Clear all app data from sessionStorage (tenant results and template caches)
 * Prevents cross-tenant/cross-user data leakage on shared browsers
 */
function clearSessionData(): void {
  if (typeof window === "undefined") return;

  clearHydrationSession(sessionStorage);
  resetExecutionSession();

  // Clear persisted app settings so the next user on a shared browser starts clean
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
  }
}

/**
 * Sign out the user
 */
export async function signOut(): Promise<void> {
  const account = getActiveAccount();
  try {
    if (account) {
      await msalInstance.logoutPopup({
        account,
      });
    }
  } finally {
    clearSessionData();
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getActiveAccount() !== null;
}
