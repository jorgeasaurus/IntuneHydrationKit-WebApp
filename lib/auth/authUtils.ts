import { AccountInfo, InteractionRequiredAuthError, BrowserAuthError } from "@azure/msal-browser";
import { msalInstance, loginRequest, getAuthorityUrl } from "./msalConfig";
import { CloudEnvironment } from "@/types/hydration";
import { EXECUTION_RESULT_STORAGE_KEYS } from "@/lib/storageKeys";

// Store the selected cloud environment for the session
let selectedCloudEnvironment: CloudEnvironment = "global";

/**
 * Get the currently selected cloud environment
 */
export function getSelectedCloudEnvironment(): CloudEnvironment {
  return selectedCloudEnvironment;
}

/**
 * Set the cloud environment for the session
 */
export function setSelectedCloudEnvironment(environment: CloudEnvironment): void {
  selectedCloudEnvironment = environment;
  // Also store in sessionStorage for persistence across page reloads
  if (typeof window !== "undefined") {
    sessionStorage.setItem("cloudEnvironment", environment);
  }
}

/**
 * Load cloud environment from session storage (call on app init)
 */
export function loadCloudEnvironmentFromSession(): CloudEnvironment {
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem("cloudEnvironment");
    // Web app supports commercial cloud only; sovereign clouds must use the PowerShell module
    if (stored === "global") {
      selectedCloudEnvironment = stored;
    }
  }
  return selectedCloudEnvironment;
}

/**
 * Get the active account from MSAL
 */
export function getActiveAccount(): AccountInfo | null {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    return accounts[0];
  }
  return null;
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

  // Get authority for the selected cloud environment
  const authority = getAuthorityUrl(selectedCloudEnvironment, account.tenantId);

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
  constructor(message = "No active account found. Please sign in.") {
    super(message);
    this.name = "AuthSessionExpiredError";
  }
}

/**
 * Sign in the user with a specific cloud environment
 */
export async function signIn(cloudEnvironment: CloudEnvironment = "global"): Promise<AccountInfo> {
  // Store the selected environment
  setSelectedCloudEnvironment(cloudEnvironment);

  // Get authority URL for the selected cloud environment
  const authority = getAuthorityUrl(cloudEnvironment, "common");

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
 * Clear all app data from sessionStorage (tenant results, cloud selection, template caches)
 * Prevents cross-tenant/cross-user data leakage on shared browsers
 */
function clearSessionData(): void {
  if (typeof window === "undefined") return;

  sessionStorage.removeItem("cloudEnvironment");
  Object.values(EXECUTION_RESULT_STORAGE_KEYS).forEach((key) =>
    sessionStorage.removeItem(key)
  );

  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith("intune-hydration-templates-")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => sessionStorage.removeItem(key));
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
