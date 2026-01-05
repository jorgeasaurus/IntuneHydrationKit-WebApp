import { AccountInfo, InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance, loginRequest } from "./msalConfig";

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

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Fallback to interactive login
      const response = await msalInstance.acquireTokenPopup(loginRequest);
      return response.accessToken;
    }
    throw error;
  }
}

/**
 * Sign in the user
 */
export async function signIn(): Promise<AccountInfo> {
  const response = await msalInstance.loginPopup(loginRequest);
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
