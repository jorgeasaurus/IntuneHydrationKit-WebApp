import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const msalInstance = {
    getAllAccounts: vi.fn(),
    getActiveAccount: vi.fn(),
    acquireTokenSilent: vi.fn(),
    acquireTokenPopup: vi.fn(),
    loginPopup: vi.fn(),
    setActiveAccount: vi.fn(),
    logoutPopup: vi.fn(),
    clearCache: vi.fn(),
  };

  return {
    msalInstance,
    getAuthorityUrl: vi.fn(),
    initializeMsal: vi.fn(),
    notifySignOut: vi.fn(),
    markLeavingForSignOut: vi.fn(),
    resetExecutionSession: vi.fn(),
    InteractionRequiredAuthError: class extends Error {},
    BrowserAuthError: class extends Error {},
  };
});

vi.mock("@azure/msal-browser", () => ({
  InteractionRequiredAuthError: mocks.InteractionRequiredAuthError,
  BrowserAuthError: mocks.BrowserAuthError,
}));

vi.mock("@/lib/auth/msalConfig", () => ({
  msalInstance: mocks.msalInstance,
  loginRequest: {
    scopes: ["User.Read"],
  },
  getAuthorityUrl: mocks.getAuthorityUrl,
  initializeMsal: mocks.initializeMsal,
}));

vi.mock("@/lib/auth/sessionEvents", () => ({
  notifySignOut: mocks.notifySignOut,
  markLeavingForSignOut: mocks.markLeavingForSignOut,
}));

vi.mock("@/lib/hydration/executionStateStore", () => ({
  resetExecutionSession: mocks.resetExecutionSession,
}));

import {
  AuthSessionExpiredError,
  InteractionRequiredError,
  assertActiveAccountMatches,
  consumeInactivitySignOutNotice,
  getAccessToken,
  getActiveAccount,
  isAuthenticated,
  signIn,
  signOut,
  signOutForInactivity,
} from "@/lib/auth/authUtils";
import { APP_SETTINGS_STORAGE_KEY, EXECUTION_RECORD_STORAGE_KEY } from "@/lib/storageKeys";

const account = {
  homeAccountId: "home-account-id",
  environment: "login.microsoftonline.com",
  tenantId: "tenant-id",
  username: "admin@contoso.com",
  localAccountId: "local-account-id",
  name: "Admin User",
};

describe("authUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.getAuthorityUrl.mockImplementation((tenantId: string) =>
      `https://authority.example/global/${tenantId}`
    );
    mocks.msalInstance.getAllAccounts.mockReturnValue([]);
    mocks.msalInstance.getActiveAccount.mockReturnValue(null);
    mocks.msalInstance.clearCache.mockResolvedValue(undefined);
    mocks.initializeMsal.mockResolvedValue(undefined);
  });

  it("prefers the MSAL active account over the first cached account", () => {
    const activeAccount = { ...account, username: "active@contoso.com" };
    mocks.msalInstance.getActiveAccount.mockReturnValue(activeAccount);
    mocks.msalInstance.getAllAccounts.mockReturnValue([account, activeAccount]);

    expect(getActiveAccount()).toEqual(activeAccount);
  });

  it("falls back to the first cached account when no account is marked active", () => {
    mocks.msalInstance.getAllAccounts.mockReturnValue([account, { ...account, username: "other@contoso.com" }]);

    expect(getActiveAccount()).toEqual(account);
  });

  it("returns null when no active account exists", () => {
    expect(getActiveAccount()).toBeNull();
  });

  it("rejects an active account that differs from the confirmed account", () => {
    mocks.msalInstance.getActiveAccount.mockReturnValue(account);

    expect(() => assertActiveAccountMatches("other-tenant", account.homeAccountId)).toThrow(
      "The active account changed"
    );
  });

  it("accepts the confirmed active account", () => {
    mocks.msalInstance.getActiveAccount.mockReturnValue(account);

    expect(assertActiveAccountMatches(account.tenantId, account.homeAccountId)).toEqual(account);
  });

  it("throws an auth session error when requesting a token without an account", async () => {
    await expect(getAccessToken()).rejects.toBeInstanceOf(AuthSessionExpiredError);
  });

  it("acquires an access token silently using the global cloud authority", async () => {
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.acquireTokenSilent.mockResolvedValue({ accessToken: "silent-token" });

    await expect(getAccessToken()).resolves.toBe("silent-token");

    expect(mocks.getAuthorityUrl).toHaveBeenCalledWith("tenant-id");
    expect(mocks.msalInstance.acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        authority: "https://authority.example/global/tenant-id",
        scopes: ["User.Read"],
      })
    );
  });

  it("falls back to popup token acquisition after an interaction required error", async () => {
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.acquireTokenSilent.mockRejectedValue(
      new mocks.InteractionRequiredAuthError("interaction required")
    );
    mocks.msalInstance.acquireTokenPopup.mockResolvedValue({ accessToken: "popup-token" });

    await expect(getAccessToken()).resolves.toBe("popup-token");

    expect(mocks.msalInstance.acquireTokenPopup).toHaveBeenCalledWith({
      account,
      loginHint: account.username,
      authority: "https://authority.example/global/tenant-id",
      scopes: ["User.Read"],
    });
  });

  it("falls back to popup token acquisition after a browser auth error", async () => {
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.acquireTokenSilent.mockRejectedValue(
      new mocks.BrowserAuthError("monitor window timeout")
    );
    mocks.msalInstance.acquireTokenPopup.mockResolvedValue({ accessToken: "popup-token" });

    await expect(getAccessToken()).resolves.toBe("popup-token");
  });

  it("throws one typed interaction-required error when the popup is blocked", async () => {
    const popupError = new Error("popup blocked");
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.acquireTokenSilent.mockRejectedValue(
      new mocks.InteractionRequiredAuthError("interaction required")
    );
    mocks.msalInstance.acquireTokenPopup.mockRejectedValue(popupError);

    const error = await getAccessToken().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InteractionRequiredError);
    expect(error).toBeInstanceOf(AuthSessionExpiredError);
    expect(error).toMatchObject({
      name: "InteractionRequiredError",
      status: 401,
      cause: popupError,
    });
  });

  it("rethrows non-interactive token acquisition errors", async () => {
    const silentError = new Error("network failure");
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.acquireTokenSilent.mockRejectedValue(silentError);

    await expect(getAccessToken()).rejects.toBe(silentError);
  });

  it("signs in through the common Global authority and activates the returned account", async () => {
    mocks.msalInstance.loginPopup.mockResolvedValue({ account });

    await expect(signIn()).resolves.toEqual(account);

    expect(mocks.initializeMsal).toHaveBeenCalled();
    expect(mocks.getAuthorityUrl).toHaveBeenCalledWith("common");
    expect(mocks.msalInstance.loginPopup).toHaveBeenCalledWith({
      authority: "https://authority.example/global/common",
      scopes: ["User.Read"],
    });
    expect(mocks.msalInstance.setActiveAccount).toHaveBeenCalledWith(account);
  });

  it("throws when sign in completes without an account", async () => {
    mocks.msalInstance.loginPopup.mockResolvedValue({ account: null });

    await expect(signIn()).rejects.toThrow("Sign in failed: No account returned");
  });

  it("logs out the active account when present", async () => {
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);

    await signOut();

    expect(mocks.msalInstance.logoutPopup).toHaveBeenCalledWith({ account });
  });

  it("skips logout when no active account exists", async () => {
    await signOut();

    expect(mocks.msalInstance.logoutPopup).not.toHaveBeenCalled();
  });

  it("clears session data, notifies listeners, and keeps device settings when logout fails", async () => {
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.logoutPopup.mockRejectedValue(new Error("popup blocked"));
    window.sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, "{}");
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem });

    await expect(signOut()).rejects.toThrow("popup blocked");

    expect(window.sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull();
    expect(mocks.resetExecutionSession).toHaveBeenCalled();
    expect(mocks.notifySignOut).toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalledWith(APP_SETTINGS_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  describe("signOutForInactivity", () => {
    const replace = vi.fn();
    const originalLocation = window.location;

    beforeEach(() => {
      replace.mockClear();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...originalLocation, replace },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    });

    it("clears the local MSAL cache without a popup and reloads the home page", async () => {
      window.sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, "{}");

      await signOutForInactivity();

      expect(mocks.msalInstance.clearCache).toHaveBeenCalledWith();
      expect(mocks.markLeavingForSignOut).toHaveBeenCalled();
      expect(mocks.msalInstance.logoutPopup).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull();
      expect(mocks.notifySignOut).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith("/");
      expect(consumeInactivitySignOutNotice()).toBe(true);
      expect(consumeInactivitySignOutNotice()).toBe(false);
    });

    it("still clears app session data when the MSAL cache clear fails", async () => {
      mocks.msalInstance.clearCache.mockRejectedValue(new Error("storage failure"));

      await expect(signOutForInactivity()).rejects.toThrow("storage failure");

      expect(mocks.resetExecutionSession).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith("/");
    });
  });

  it("reports authentication state from the active account", () => {
    expect(isAuthenticated()).toBe(false);

    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);

    expect(isAuthenticated()).toBe(true);
  });

  it("uses the default auth session expired message", () => {
    const error = new AuthSessionExpiredError();

    expect(error.name).toBe("AuthSessionExpiredError");
    expect(error.message).toBe("No active account found. Please sign in.");
    expect(error.status).toBe(401);
  });
});
