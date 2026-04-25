import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchConditionalAccessPolicies } from "@/lib/templates/loader";

describe("template loader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back to the filename when a conditional access template omits top-level displayName", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      const fileName = url.split("/").pop()?.replace(/\.json$/, "");

      if (fileName === "Block all agent identities from accessing resources") {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            conditions: {},
            grantControls: {},
            sessionControls: null,
          }),
        };
      }

      return {
        ok: true,
        statusText: "OK",
        json: async () => ({
          displayName: fileName,
          conditions: {},
          grantControls: {},
          sessionControls: null,
        }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const policies = await fetchConditionalAccessPolicies();

    expect(policies).toContainEqual(
      expect.objectContaining({
        displayName: "[IHD] Block all agent identities from accessing resources",
        state: "disabled",
      })
    );
  });
});
