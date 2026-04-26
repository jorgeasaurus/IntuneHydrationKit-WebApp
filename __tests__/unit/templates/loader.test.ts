import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchCompliancePolicies,
  fetchConditionalAccessPolicies,
} from "@/lib/templates/loader";

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

  it("includes Linux compliance templates in the compliance loader", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("Linux-Compliance-Basic.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            displayName: "Linux Compliance",
            name: "Linux Compliance",
            description: "Linux Compliance, non-custom",
            platforms: "linux",
            technologies: "linuxMdm",
          }),
        };
      }

      if (url.includes("Linux-Compliance-Strict.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            displayName: "Linux Compliance - Strict",
            name: "Linux Compliance - Strict",
            description: "Linux Compliance with distro limits and custom compliance",
            platforms: "linux",
            technologies: "linuxMdm",
          }),
        };
      }

      const fileName = url.split("/").pop()?.replace(/\.json$/, "") ?? "Compliance";
      return {
        ok: true,
        statusText: "OK",
        json: async () => ({
          "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
          displayName: fileName,
          description: `${fileName} description`,
        }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const policies = await fetchCompliancePolicies();

    expect(policies).toContainEqual(
      expect.objectContaining({
        displayName: "[IHD] Linux Compliance",
        platforms: "linux",
      })
    );
    expect(policies).toContainEqual(
      expect.objectContaining({
        displayName: "[IHD] Linux Compliance - Strict",
        technologies: "linuxMdm",
      })
    );
  });
});
