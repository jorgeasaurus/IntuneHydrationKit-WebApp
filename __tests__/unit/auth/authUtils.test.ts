import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const msalInstance = {
    getAllAccounts: vi.fn(),
    getActiveAccount: vi.fn(),
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
  CLOUD_ENVIRONMENTS: {
    global: {
      authority: "https://login.microsoftonline.com",
      graphEndpoint: "https://graph.microsoft.com",
    },
    usgov: {
      authority: "https://login.microsoftonline.us",
      graphEndpoint: "https://graph.microsoft.us",
    },
    usgovdod: {
      authority: "https://login.microsoftonline.us",
      graphEndpoint: "https://dod-graph.microsoft.us",
    },
    germany: {
      authority: "https://login.microsoftonline.de",
      graphEndpoint: "https://graph.microsoft.de",
    },
    china: {
      authority: "https://login.chinacloudapi.cn",
      graphEndpoint: "https://microsoftgraph.chinacloudapi.cn",
    },
  },
  getAuthorityUrl: mocks.getAuthorityUrl,
}));

import {
  AuthSessionExpiredError,
  getAccessToken,
  getActiveAccount,
  isAuthenticated,
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
    mocks.getAuthorityUrl.mockImplementation((tenantId: string) =>
      `https://authority.example/global/${tenantId}`
    );
    mocks.msalInstance.getAllAccounts.mockReturnValue([]);
    mocks.msalInstance.getActiveAccount.mockReturnValue(null);
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

  it("signs in with the global cloud environment and activates the returned account", async () => {
    mocks.msalInstance.loginPopup.mockResolvedValue({ account });

    await expect(signIn()).resolves.toEqual(account);

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
