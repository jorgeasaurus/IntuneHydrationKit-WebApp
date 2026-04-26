import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const msalInstance = {
    getAllAccounts: vi.fn(),
    acquireTokenSilent: vi.fn(),
    acquireTokenPopup: vi.fn(),
    loginPopup: vi.fn(),
    setActiveAccount: vi.fn(),
    logoutPopup: vi.fn(),
  };

  return {
    msalInstance,
    getAuthorityUrl: vi.fn(),
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
}));

import {
  AuthSessionExpiredError,
  getAccessToken,
  getActiveAccount,
  getSelectedCloudEnvironment,
  isAuthenticated,
  loadCloudEnvironmentFromSession,
  setSelectedCloudEnvironment,
  signIn,
  signOut,
} from "@/lib/auth/authUtils";

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
    setSelectedCloudEnvironment("global");
    mocks.getAuthorityUrl.mockImplementation((environment: string, tenantId: string) =>
      `https://authority.example/${environment}/${tenantId}`
    );
    mocks.msalInstance.getAllAccounts.mockReturnValue([]);
  });

  it("stores and restores a valid cloud environment from session storage", () => {
    setSelectedCloudEnvironment("usgov");

    expect(getSelectedCloudEnvironment()).toBe("usgov");
    expect(window.sessionStorage.getItem("cloudEnvironment")).toBe("usgov");

    window.sessionStorage.setItem("cloudEnvironment", "china");

    expect(loadCloudEnvironmentFromSession()).toBe("china");
    expect(getSelectedCloudEnvironment()).toBe("china");
  });

  it("ignores invalid cloud environments from session storage", () => {
    setSelectedCloudEnvironment("germany");
    window.sessionStorage.setItem("cloudEnvironment", "invalid-cloud");

    expect(loadCloudEnvironmentFromSession()).toBe("germany");
  });

  it("returns the first available active account", () => {
    mocks.msalInstance.getAllAccounts.mockReturnValue([account, { ...account, username: "other@contoso.com" }]);

    expect(getActiveAccount()).toEqual(account);
  });

  it("returns null when no active account exists", () => {
    expect(getActiveAccount()).toBeNull();
  });

  it("throws an auth session error when requesting a token without an account", async () => {
    await expect(getAccessToken()).rejects.toBeInstanceOf(AuthSessionExpiredError);
  });

  it("acquires an access token silently using the selected cloud authority", async () => {
    setSelectedCloudEnvironment("usgovdod");
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.acquireTokenSilent.mockResolvedValue({ accessToken: "silent-token" });

    await expect(getAccessToken()).resolves.toBe("silent-token");

    expect(mocks.getAuthorityUrl).toHaveBeenCalledWith("usgovdod", "tenant-id");
    expect(mocks.msalInstance.acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        authority: "https://authority.example/usgovdod/tenant-id",
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

  it("throws a session expired error when popup token acquisition also fails", async () => {
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.acquireTokenSilent.mockRejectedValue(
      new mocks.InteractionRequiredAuthError("interaction required")
    );
    mocks.msalInstance.acquireTokenPopup.mockRejectedValue(new Error("popup blocked"));

    await expect(getAccessToken()).rejects.toMatchObject({
      name: "AuthSessionExpiredError",
      message: "Session expired. Please sign out and sign in again.",
    });
  });

  it("rethrows non-interactive token acquisition errors", async () => {
    const silentError = new Error("network failure");
    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);
    mocks.msalInstance.acquireTokenSilent.mockRejectedValue(silentError);

    await expect(getAccessToken()).rejects.toBe(silentError);
  });

  it("signs in with the requested cloud environment and activates the returned account", async () => {
    mocks.msalInstance.loginPopup.mockResolvedValue({ account });

    await expect(signIn("china")).resolves.toEqual(account);

    expect(getSelectedCloudEnvironment()).toBe("china");
    expect(mocks.getAuthorityUrl).toHaveBeenCalledWith("china", "common");
    expect(mocks.msalInstance.loginPopup).toHaveBeenCalledWith({
      authority: "https://authority.example/china/common",
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

  it("reports authentication state from the active account", () => {
    expect(isAuthenticated()).toBe(false);

    mocks.msalInstance.getAllAccounts.mockReturnValue([account]);

    expect(isAuthenticated()).toBe(true);
  });

  it("uses the default auth session expired message", () => {
    const error = new AuthSessionExpiredError();

    expect(error.name).toBe("AuthSessionExpiredError");
    expect(error.message).toBe("No active account found. Please sign in.");
  });
});
