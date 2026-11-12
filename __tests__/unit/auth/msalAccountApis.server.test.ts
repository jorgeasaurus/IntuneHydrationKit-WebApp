// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PublicClientApplication } from "@azure/msal-browser";

/** Server render: without `window`, StandardController uses a default cache and returns no account. */
describe("msal-browser account APIs on the server", () => {
  it("return no account without window", () => {
    expect(typeof window).toBe("undefined");
    const pca = new PublicClientApplication({
      auth: { clientId: "00000000-0000-0000-0000-000000000001" },
    });

    expect(pca.getActiveAccount()).toBeNull();
    expect(pca.getAllAccounts()).toEqual([]);
  });
});
