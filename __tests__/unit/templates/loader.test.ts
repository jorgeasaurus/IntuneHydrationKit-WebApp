import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cacheTemplates,
  clearCategoryCache,
  fetchAppProtectionPolicies,
  fetchBaselinePolicies,
  fetchBaselinePolicyByManifestFile,
  fetchCompliancePolicies,
  fetchCISBaselinePolicyByManifestFile,
  fetchCISBaselinePoliciesByCategories,
  fetchConditionalAccessPolicies,
  fetchDynamicGroups,
  fetchEnrollmentProfiles,
  fetchFilters,
  getAllTemplateCacheKeys,
  getCachedTemplates,
  fetchNotificationTemplates,
  fetchStaticGroups,
} from "@/lib/templates/loader";

describe("template loader", () => {
  const toArrayBuffer = (value: unknown): ArrayBuffer =>
    new TextEncoder().encode(JSON.stringify(value)).buffer;
  const toUtf16LeArrayBuffer = (value: unknown): ArrayBuffer => {
    const text = JSON.stringify(value);
    const buffer = new ArrayBuffer(text.length * 2);
    const view = new DataView(buffer);

    for (let index = 0; index < text.length; index += 1) {
      view.setUint16(index * 2, text.charCodeAt(index), true);
    }

    return buffer;
  };

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

  it("continues loading dynamic groups when individual template fetches fail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("Autopilot-Groups.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            groups: [{ displayName: "Autopilot Devices", description: "Autopilot" }],
          }),
        };
      }

      if (url.includes("Manufacturer-Groups.json")) {
        return {
          ok: false,
          statusText: "Forbidden",
        };
      }

      if (url.includes("OS-Groups.json")) {
        throw new Error("network failure");
      }

      return {
        ok: true,
        statusText: "OK",
        json: async () => ({ groups: undefined }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDynamicGroups()).resolves.toEqual([
      {
        displayName: "[IHD] Autopilot Devices",
        description: "Autopilot Imported by Intune Hydration Kit",
      },
    ]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns no static groups when the payload is missing a groups array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        statusText: "OK",
        json: async () => ({ groups: { displayName: "not-an-array" } }),
      }))
    );

    await expect(fetchStaticGroups()).resolves.toEqual([]);
  });

  it("skips failed and malformed filter templates while keeping valid ones", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("Android-Filters.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            filters: [
              {
                displayName: "Android Corporate",
                description: "Android filter",
                platform: "android",
                rule: '(device.osVersion -contains "14")',
              },
            ],
          }),
        };
      }

      if (url.includes("Windows-Manufacturer-Filters.json")) {
        return {
          ok: false,
          statusText: "Not Found",
        };
      }

      if (url.includes("Windows-VM-Filters.json")) {
        throw new Error("timeout");
      }

      return {
        ok: true,
        statusText: "OK",
        json: async () => ({ filters: null }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFilters()).resolves.toEqual([
      {
        displayName: "[IHD] Android Corporate",
        description: "Android filter Imported by Intune Hydration Kit",
        platform: "android",
        rule: '(device.osVersion -contains "14")',
      },
    ]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("keeps only valid app protection templates", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("Android-App-Protection.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            "@odata.type": "#microsoft.graph.androidManagedAppProtection",
            displayName: "Android MAM",
            description: "Android app protection",
          }),
        };
      }

      if (url.includes("iOS-App-Protection.json")) {
        return {
          ok: false,
          statusText: "Unauthorized",
        };
      }

      if (url.includes("Android - Baseline - BYOD - App Protection.json")) {
        throw new Error("bad gateway");
      }

      return {
        ok: true,
        statusText: "OK",
        json: async () => ({ displayName: "Missing odata type" }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAppProtectionPolicies()).resolves.toEqual([
      {
        "@odata.type": "#microsoft.graph.androidManagedAppProtection",
        displayName: "[IHD] Android MAM",
        description: "Android app protection Imported by Intune Hydration Kit",
      },
    ]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("falls back to in-memory cache when sessionStorage quota is exceeded", () => {
    const quotaError = new DOMException("Quota exceeded", "QuotaExceededError");

    vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw quotaError;
    });

    cacheTemplates("quota-test", [{ displayName: "Cached Policy" }]);

    expect(getCachedTemplates("quota-test")).toEqual([
      { displayName: "Cached Policy" },
    ]);
    expect(getAllTemplateCacheKeys()).toContain("intune-hydration-templates-quota-test");

    clearCategoryCache("quota-test");
    expect(getCachedTemplates("quota-test")).toBeNull();
  });

  it("invalidates expired or version-mismatched session cache entries", () => {
    sessionStorage.setItem(
      "intune-hydration-templates-expired-test",
      JSON.stringify({
        templates: [{ displayName: "Old Policy" }],
        timestamp: Date.now() - (2 * 60 * 60 * 1000),
        version: 19,
      })
    );

    sessionStorage.setItem(
      "intune-hydration-templates-version-test",
      JSON.stringify({
        templates: [{ displayName: "Wrong Version Policy" }],
        timestamp: Date.now(),
        version: 18,
      })
    );

    expect(getCachedTemplates("expired-test")).toBeNull();
    expect(sessionStorage.getItem("intune-hydration-templates-expired-test")).toBeNull();

    expect(getCachedTemplates("version-test")).toBeNull();
    expect(sessionStorage.getItem("intune-hydration-templates-version-test")).toBeNull();
  });

  it("transforms OIB manifest files using the policy name and manifest metadata", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      statusText: "OK",
      arrayBuffer: async () =>
        toArrayBuffer({
          name: "Windows hardening",
          displayName: "Ignored display name",
          description: "Baseline policy",
          settings: [{ id: "setting-1" }],
        }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    const policy = await fetchBaselinePolicyByManifestFile({
      path: "Windows/Edge Policy.json",
      platform: "windows",
      policyType: "settingsCatalog",
      displayName: "Manifest fallback",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/IntuneTemplates/OpenIntuneBaseline/Windows/Edge%20Policy.json"
    );
    expect(policy).toEqual(
      expect.objectContaining({
        name: "[IHD] Windows hardening",
        displayName: "[IHD] Windows hardening",
        description: expect.stringContaining("Imported by Intune Hydration Kit"),
        _oibPlatform: "windows",
        _oibPolicyType: "settingsCatalog",
        _oibFilePath: "Windows/Edge Policy.json",
      })
    );
  });

  it("parses UTF-16 LE OIB policies without a BOM", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        statusText: "OK",
        arrayBuffer: async () =>
          toUtf16LeArrayBuffer({
            displayName: "UTF16 policy",
            description: "UTF16 description",
          }),
      }))
    );

    await expect(
      fetchBaselinePolicyByManifestFile({
        path: "Windows/Utf16 Policy.json",
        platform: "windows",
        policyType: "settingsCatalog",
        displayName: "Manifest name",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        displayName: "[IHD] UTF16 policy",
        description: "UTF16 description Imported by Intune Hydration Kit",
      })
    );
  });

  it("returns no baseline policies when the OIB manifest fetch falls back", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        statusText: "Not Found",
      }))
    );

    await expect(fetchBaselinePolicies()).resolves.toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("skips OIB manifest files that fail to load or parse into objects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/manifest.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            totalFiles: 3,
            files: [
              {
                path: "Windows/Valid Policy.json",
                platform: "windows",
                policyType: "settingsCatalog",
                displayName: "Valid manifest policy",
              },
              {
                path: "Windows/String Policy.json",
                platform: "windows",
                policyType: "settingsCatalog",
                displayName: "String manifest policy",
              },
              {
                path: "Windows/Missing Policy.json",
                platform: "windows",
                policyType: "settingsCatalog",
                displayName: "Missing manifest policy",
              },
            ],
          }),
        };
      }

      if (url.includes("Valid%20Policy.json")) {
        return {
          ok: true,
          statusText: "OK",
          arrayBuffer: async () =>
            toArrayBuffer({
              displayName: "Valid policy",
              description: "Valid OIB policy",
            }),
        };
      }

      if (url.includes("String%20Policy.json")) {
        return {
          ok: true,
          statusText: "OK",
          arrayBuffer: async () => toArrayBuffer("not-an-object"),
        };
      }

      return {
        ok: false,
        statusText: "Not Found",
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBaselinePolicies()).resolves.toEqual([
      expect.objectContaining({
        displayName: "[IHD] Valid policy",
        _oibFilePath: "Windows/Valid Policy.json",
      }),
    ]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("transforms CIS manifest files using the manifest display name fallback", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      statusText: "OK",
      arrayBuffer: async () =>
        toArrayBuffer({
          "@odata.type": "#microsoft.graph.deviceManagementConfigurationPolicy",
          description: "",
        }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    const policy = await fetchCISBaselinePolicyByManifestFile({
      path: "8.0 - Windows 11 Benchmarks/Windows 11 - Edge - Machine/Policy.json",
      category: "8.0 - Windows 11 Benchmarks",
      subcategory: "Windows 11 - Edge - Machine",
      displayName: "CIS Edge Policy",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/CISIntuneBaselines/8.0%20-%20Windows%2011%20Benchmarks/Windows%2011%20-%20Edge%20-%20Machine/Policy.json"
    );
    expect(policy).toEqual(
      expect.objectContaining({
        displayName: "[IHD] CIS Edge Policy",
        name: "[IHD] CIS Edge Policy",
        description: "Imported by Intune Hydration Kit",
        _cisCategory: "8.0 - Windows 11 Benchmarks",
        _cisSubcategory: "Windows 11 - Edge - Machine",
        _cisFilePath: "8.0 - Windows 11 Benchmarks/Windows 11 - Edge - Machine/Policy.json",
      })
    );
  });

  it("returns null for CIS manifest files that parse into non-object JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        statusText: "OK",
        arrayBuffer: async () => toArrayBuffer("scalar-json"),
      }))
    );

    await expect(
      fetchCISBaselinePolicyByManifestFile({
        path: "8.0 - Windows 11 Benchmarks/Windows 11 - Edge - Machine/String.json",
        category: "8.0 - Windows 11 Benchmarks",
        subcategory: "Windows 11 - Edge - Machine",
        displayName: "CIS string policy",
      })
    ).resolves.toBeNull();
  });

  it("prefixes enrollment profile name fields and preserves the matching key", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("Windows-Autopilot-Device-Preparation-UserDriven.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            name: "Device prep profile",
          }),
        };
      }

      if (url.includes("Windows-Autopilot-Profile.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            displayName: "Autopilot profile",
            description: "Primary profile",
          }),
        };
      }

      return {
        ok: false,
        statusText: "Not Found",
      };
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", fetchMock);

    const profiles = await fetchEnrollmentProfiles();

    expect(profiles).toContainEqual(
      expect.objectContaining({
        displayName: "[IHD] Autopilot profile",
        description: expect.stringContaining("Imported by Intune Hydration Kit"),
      })
    );
    expect(profiles).toContainEqual(
      expect.objectContaining({
        name: "[IHD] Device prep profile",
        description: "Imported by Intune Hydration Kit",
      })
    );
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("skips notification templates that do not define a display name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        statusText: "OK",
        json: async () => ({
          description: "Missing name",
        }),
      }))
    );

    await expect(fetchNotificationTemplates()).resolves.toEqual([]);
  });

  it("filters CIS manifest loads to the selected categories", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/manifest.json")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            version: "1",
            generatedAt: "2024-01-01T00:00:00Z",
            totalFiles: 2,
            categories: [
              {
                id: "windows",
                folder: "8.0 - Windows 11 Benchmarks",
                name: "Windows 11 Benchmarks",
                description: "Windows",
                count: 1,
                subcategories: [{ name: "Windows 11 - Edge - Machine", count: 1 }],
              },
              {
                id: "linux",
                folder: "5.0 - Linux Benchmarks",
                name: "Linux Benchmarks",
                description: "Linux",
                count: 1,
                subcategories: [{ name: "Linux Compliance", count: 1 }],
              },
            ],
            files: [
              {
                path: "8.0 - Windows 11 Benchmarks/Windows 11 - Edge - Machine/Policy.json",
                category: "8.0 - Windows 11 Benchmarks",
                subcategory: "Windows 11 - Edge - Machine",
                displayName: "Windows policy",
              },
              {
                path: "5.0 - Linux Benchmarks/Linux Compliance/Policy.json",
                category: "5.0 - Linux Benchmarks",
                subcategory: "Linux Compliance",
                displayName: "Linux policy",
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        statusText: "OK",
        arrayBuffer: async () =>
          toArrayBuffer({
            displayName: "Ignored source display name",
            description: "Selected category policy",
          }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const policies = await fetchCISBaselinePoliciesByCategories(["windows"]);

    expect(policies).toHaveLength(1);
    expect(policies[0]).toEqual(
      expect.objectContaining({
        displayName: "[IHD] Ignored source display name",
        _cisCategory: "8.0 - Windows 11 Benchmarks",
      })
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/CISIntuneBaselines/5.0%20-%20Linux%20Benchmarks/Linux%20Compliance/Policy.json"
    );
  });

  it("does not fetch CIS policy files when no selected category ids match the manifest", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      statusText: "OK",
      json: async () => ({
        version: "1",
        generatedAt: "2024-01-01T00:00:00Z",
        totalFiles: 1,
        categories: [
          {
            id: "windows",
            folder: "8.0 - Windows 11 Benchmarks",
            name: "Windows 11 Benchmarks",
            description: "Windows",
            count: 1,
            subcategories: [{ name: "Windows 11 - Edge - Machine", count: 1 }],
          },
        ],
        files: [
          {
            path: "8.0 - Windows 11 Benchmarks/Windows 11 - Edge - Machine/Policy.json",
            category: "8.0 - Windows 11 Benchmarks",
            subcategory: "Windows 11 - Edge - Machine",
            displayName: "Windows policy",
          },
        ],
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCISBaselinePoliciesByCategories(["android"])).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("removes expired in-memory cache entries after a quota fallback", () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(2 * 60 * 60 * 1000);

    vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    cacheTemplates("memory-expired", [{ displayName: "Old cached item" }]);

    expect(getCachedTemplates("memory-expired")).toBeNull();
    expect(getAllTemplateCacheKeys()).not.toContain(
      "intune-hydration-templates-memory-expired"
    );
  });

  it("returns null when cached template JSON cannot be parsed", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    sessionStorage.setItem("intune-hydration-templates-invalid-json", "{");

    expect(getCachedTemplates("invalid-json")).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns an empty cache key list when sessionStorage keys cannot be read", () => {
    vi.spyOn(Object, "keys").mockImplementation((value: object) => {
      if (value === sessionStorage) {
        throw new Error("unavailable");
      }

      return Reflect.ownKeys(value).filter((key): key is string => typeof key === "string");
    });

    expect(getAllTemplateCacheKeys()).toEqual([]);
  });

  it("returns no CIS baseline policies when the manifest cannot be fetched", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("manifest unavailable");
      })
    );

    await expect(fetchCISBaselinePoliciesByCategories(["windows"])).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });
});
