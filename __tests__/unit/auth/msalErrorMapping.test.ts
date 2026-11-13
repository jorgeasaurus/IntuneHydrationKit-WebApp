import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserAuthError,
  BrowserAuthErrorCodes,
  InteractionRequiredAuthError,
  ServerError,
} from "@azure/msal-browser";

/**
 * Pins how getAccessToken maps the errors that msal-browser v5 throws. The other auth tests
 * use stand-in error classes; this file uses the real ones, so a change in the MSAL error
 * hierarchy fails here.
 */
const msalInstance = vi.hoisted(() => ({
  getActiveAccount: vi.fn(),
  getAllAccounts: vi.fn(),
  acquireTokenSilent: vi.fn(),
  acquireTokenPopup: vi.fn(),
}));

vi.mock("@/lib/auth/msalConfig", () => ({
  msalInstance,
  loginRequest: { scopes: ["User.Read"] },
  getAuthorityUrl: (tenantId: string) => `https://login.microsoftonline.com/${tenantId}`,
  initializeMsal: vi.fn(),
}));

import {
  getAccessToken,
  InteractionRequiredError,
  isSignInReplaced,
} from "@/lib/auth/authUtils";

const account = {
  homeAccountId: "home-id",
  localAccountId: "local-id",
  environment: "login.microsoftonline.com",
  tenantId: "tenant-id",
  username: "admin@contoso.com",
};

describe("getAccessToken with msal-browser v5 errors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    msalInstance.getActiveAccount.mockReturnValue(account);
  });

  it("asks for a popup when the hidden-iframe renewal times out at the redirect bridge", async () => {
    msalInstance.acquireTokenSilent.mockRejectedValue(
      new BrowserAuthError(BrowserAuthErrorCodes.timedOut, "", "redirect_bridge_timeout")
    );
    msalInstance.acquireTokenPopup.mockResolvedValue({ accessToken: "popup-token" });

    await expect(getAccessToken()).resolves.toBe("popup-token");
  });

  it("raises InteractionRequiredError when the popup is blocked outside a user gesture", async () => {
    const popupError = new BrowserAuthError(BrowserAuthErrorCodes.popupWindowError, "");
    msalInstance.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError("login_required", "")
    );
    msalInstance.acquireTokenPopup.mockRejectedValue(popupError);

    const error = await getAccessToken().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InteractionRequiredError);
    expect((error as Error).cause).toBe(popupError);
  });

  it("rethrows server errors that do not need interaction", async () => {
    const serverError = new ServerError("invalid_request", "", "bad request");
    msalInstance.acquireTokenSilent.mockRejectedValue(serverError);

    await expect(getAccessToken()).rejects.toBe(serverError);
    expect(msalInstance.acquireTokenPopup).not.toHaveBeenCalled();
  });
});

describe("isSignInReplaced", () => {
  it("is true only for the error MSAL gives a sign-in that a newer click cancelled", () => {
    expect(
      isSignInReplaced(
        new BrowserAuthError(BrowserAuthErrorCodes.interactionInProgressCancelled, "")
      )
    ).toBe(true);
    expect(
      isSignInReplaced(new BrowserAuthError(BrowserAuthErrorCodes.interactionInProgress, ""))
    ).toBe(false);
    expect(isSignInReplaced(new Error("interaction_in_progress_cancelled"))).toBe(false);
  });
});
