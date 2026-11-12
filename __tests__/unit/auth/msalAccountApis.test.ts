import { describe, expect, it } from "vitest";
import { PublicClientApplication } from "@azure/msal-browser";

/**
 * Pins msal-browser behaviour that render code relies on: useWizardState and
 * ExecutionRouteGuard read accounts during render, before initialize() completes.
 * PublicClientApplication always uses StandardController, whose account reads do not
 * call blockAPICallsBeforeInitialize.
 */
describe("msal-browser account APIs before initialize", () => {
  it("return no account in the browser before initialize", () => {
    const pca = new PublicClientApplication({
      auth: { clientId: "00000000-0000-0000-0000-000000000001" },
      cache: { cacheLocation: "sessionStorage" },
    });

    expect(pca.getActiveAccount()).toBeNull();
    expect(pca.getAllAccounts()).toEqual([]);
  });
});
