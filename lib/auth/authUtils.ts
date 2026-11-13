import { AccountInfo, InteractionRequiredAuthError, BrowserAuthError } from "@azure/msal-browser";
import {
  msalInstance,
  loginRequest,
  getAuthorityUrl,
  initializeMsal,
  silentRedirectUri,
} from "./msalConfig";
import { markLeavingForSignOut, notifySignOut } from "./sessionEvents";
import { clearHydrationSession } from "@/lib/hydration/executionRecord";
import { resetExecutionSession } from "@/lib/hydration/executionStateStore";
import { clearRunHistory } from "@/lib/history/runHistory";

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
 * Acquire an access token silently.
 * When silent acquisition needs user interaction, try one popup for the active account.
 * Browsers block popups that do not start from a user gesture, so code that runs without a
 * gesture (for example the execution engine) gets an InteractionRequiredError. The caller must
 * stop sending requests and ask the user to sign in again.
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
      redirectUri: silentRedirectUri,
    });
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError || error instanceof BrowserAuthError) {
      try {
        const response = await msalInstance.acquireTokenPopup({
          ...loginRequest,
          account,
          loginHint: account.username,
          authority,
        });
        return response.accessToken;
      } catch (popupError) {
        throw new InteractionRequiredError(undefined, { cause: popupError });
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

  constructor(message = "No active account found. Please sign in.", options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthSessionExpiredError";
  }
}

/**
 * The access token expired and MSAL cannot renew it without user interaction.
 * Every later request fails the same way, so callers must not continue task by task.
 * An active run must pause and prompt the user to sign in again.
 */
export class InteractionRequiredError extends AuthSessionExpiredError {
  constructor(
    message = "Your sign-in session expired. Sign in again to continue.",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "InteractionRequiredError";
  }
}

/**
 * Sign in the user (global/commercial cloud only).
 */
export async function signIn(): Promise<AccountInfo> {
  // Public pages render before MSAL finishes startup, so wait for initialization here.
  await initializeMsal();
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
 * Clear all app data from sessionStorage (tenant results, run history, and template caches) and
 * in-memory session state. Prevents cross-tenant/cross-user data leakage on shared browsers.
 * App settings and scope profiles in localStorage are device preferences without tenant data,
 * so they stay.
 */
function clearSessionData(): void {
  if (typeof window === "undefined") return;

  clearHydrationSession(sessionStorage);
  clearRunHistory(sessionStorage);
  resetExecutionSession();
  notifySignOut();
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

const INACTIVITY_SIGN_OUT_NOTICE_KEY = "auth-inactivity-sign-out:v1";

/**
 * Sign out after inactivity, without a user gesture.
 * A logout popup is blocked in this case, so remove the MSAL tokens and accounts from the
 * local cache only. The Entra ID server session stays, as with any local sign-out.
 * The page then reloads at the home page so that no in-memory state remains.
 */
export async function signOutForInactivity(): Promise<void> {
  // A paused run keeps the "Leave site?" guard on. Lift it before the tokens are removed.
  markLeavingForSignOut();
  try {
    await msalInstance.clearCache();
  } finally {
    clearSessionData();
    sessionStorage.setItem(INACTIVITY_SIGN_OUT_NOTICE_KEY, "1");
    window.location.replace("/");
  }
}

/** Return true once after an inactivity sign-out, so the UI can tell the user. */
export function consumeInactivitySignOutNotice(): boolean {
  if (typeof window === "undefined") return false;
  const signedOut = sessionStorage.getItem(INACTIVITY_SIGN_OUT_NOTICE_KEY) !== null;
  sessionStorage.removeItem(INACTIVITY_SIGN_OUT_NOTICE_KEY);
  return signedOut;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getActiveAccount() !== null;
}
