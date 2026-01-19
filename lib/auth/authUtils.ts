import { AccountInfo, InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance, loginRequest, getAuthorityUrl } from "./msalConfig";
import { CloudEnvironment } from "@/types/hydration";

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
    if (stored && ["global", "usgov", "usgovdod", "germany", "china"].includes(stored)) {
      selectedCloudEnvironment = stored as CloudEnvironment;
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
 * Falls back to interactive login if silent acquisition fails
 */
export async function getAccessToken(): Promise<string> {
  const account = getActiveAccount();

  if (!account) {
    throw new Error("No active account found. Please sign in.");
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
    if (error instanceof InteractionRequiredAuthError) {
      // Fallback to interactive login
      const response = await msalInstance.acquireTokenPopup({
        ...loginRequest,
        authority,
      });
      return response.accessToken;
    }
    throw error;
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
 * Sign out the user
 */
export async function signOut(): Promise<void> {
  const account = getActiveAccount();
  if (account) {
    await msalInstance.logoutPopup({
      account,
    });
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getActiveAccount() !== null;
}
