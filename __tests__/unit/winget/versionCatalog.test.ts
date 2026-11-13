import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WINGET_VERSION_CATALOG_URL,
  fetchWinGetVersionCatalog,
  findWinGetCatalogApp,
  getVersionArchitectures,
  getVersionInstallerTypes,
  parseWinGetVersionCatalog,
} from "@/lib/winget/versionCatalog";

function validCatalog() {
  return {
    schemaVersion: 1,
    repository: "microsoft/winget-pkgs",
    keptVersionCount: 5,
    apps: [
      {
        templateId: "contoso-tool",
        packageIdentifier: "Contoso.Tool",
        displayName: "Contoso Tool",
        publisher: "Contoso",
        manifestPath: "manifests/c/Contoso/Tool",
        versions: [
          {
            version: "2.0",
            latest: true,
            bestEffort: false,
            releaseDate: "2026-01-31",
            installers: [
              {
                architecture: "x64",
                installerType: "msi",
                nestedInstallerType: null,
                scope: "machine",
                url: "https://downloads.contoso.example/2.0/tool-x64.msi",
              },
              {
                architecture: "arm64",
                installerType: "zip",
                nestedInstallerType: "exe",
                scope: null,
                url: "https://downloads.contoso.example/2.0/tool-arm64.zip",
              },
              {
                architecture: "x64",
                installerType: "exe",
                nestedInstallerType: null,
                scope: "user",
                url: "https://downloads.contoso.example/2.0/tool-x64.exe",
              },
            ],
          },
          {
            version: "1.9",
            latest: false,
            bestEffort: true,
            releaseDate: null,
            installers: [
              {
                architecture: "x86",
                installerType: "msi",
                nestedInstallerType: null,
                scope: "machine",
                url: "https://downloads.contoso.example/1.9/tool-x86.msi",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("parseWinGetVersionCatalog", () => {
  it("accepts a valid catalog", () => {
    const catalog = parseWinGetVersionCatalog(validCatalog());

    expect(catalog.apps[0].versions[0].latest).toBe(true);
    expect(catalog.apps[0].versions[1].bestEffort).toBe(true);
  });

  it.each<[string, (data: ReturnType<typeof validCatalog>) => unknown]>([
    ["is not an object", () => "catalog"],
    ["has another schema version", (data) => ({ ...data, schemaVersion: 2 })],
    ["has another repository", (data) => ({ ...data, repository: "someone/winget-pkgs" })],
    ["has no apps", (data) => ({ ...data, apps: [] })],
    ["has an unknown top-level field", (data) => ({ ...data, generatedAt: "2026-01-01" })],
    [
      "has an unknown app field",
      (data) => ({ ...data, apps: [{ ...data.apps[0], icon: "x.png" }] }),
    ],
    [
      "has an unknown installer field",
      (data) => {
        Object.assign(data.apps[0].versions[0].installers[0], { sha256: "ABC" });
        return data;
      },
    ],
    [
      "has an unknown architecture",
      (data) => {
        (data.apps[0].versions[0].installers[0] as { architecture: string }).architecture = "riscv64";
        return data;
      },
    ],
    [
      "has a version with no installers",
      (data) => {
        data.apps[0].versions[1].installers = [];
        return data;
      },
    ],
    [
      "marks an older version as latest",
      (data) => {
        data.apps[0].versions[1].latest = true;
        data.apps[0].versions[1].bestEffort = false;
        return data;
      },
    ],
    [
      "marks the newest version as best effort",
      (data) => {
        data.apps[0].versions[0].bestEffort = true;
        return data;
      },
    ],
    [
      "has a duplicate version",
      (data) => {
        data.apps[0].versions[1].version = "2.0";
        return data;
      },
    ],
    [
      "has more versions than the kept count",
      (data) => ({ ...data, keptVersionCount: 1 }),
    ],
    [
      "has a duplicate app",
      (data) => ({ ...data, apps: [data.apps[0], { ...data.apps[0], templateId: "copy" }] }),
    ],
    [
      "has an invalid release date",
      (data) => {
        data.apps[0].versions[0].releaseDate = "2026-02-30";
        return data;
      },
    ],
    [
      "has an installer URL that is not HTTP",
      (data) => {
        data.apps[0].versions[0].installers[0].url = "file:///C:/tool.msi";
        return data;
      },
    ],
  ])("rejects a catalog that %s", (_, mutate) => {
    expect(() => parseWinGetVersionCatalog(mutate(validCatalog()))).toThrow(
      /The WinGet version catalog is not valid/
    );
  });
});

describe("catalog helpers", () => {
  it("finds an app by package identifier without case", () => {
    const catalog = parseWinGetVersionCatalog(validCatalog());

    expect(findWinGetCatalogApp(catalog, "contoso.TOOL")?.templateId).toBe("contoso-tool");
    expect(findWinGetCatalogApp(catalog, "Contoso.Other")).toBeUndefined();
  });

  it("lists the unique architectures and installer types of a version", () => {
    const version = parseWinGetVersionCatalog(validCatalog()).apps[0].versions[0];

    expect(getVersionArchitectures(version)).toEqual(["arm64", "x64"]);
    expect(getVersionInstallerTypes(version)).toEqual(["exe", "msi", "zip"]);
  });
});

describe("fetchWinGetVersionCatalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and validates the bundled file", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(validCatalog())));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWinGetVersionCatalog()).resolves.toMatchObject({ schemaVersion: 1 });
    expect(fetchMock).toHaveBeenCalledWith(WINGET_VERSION_CATALOG_URL);
  });

  it("fails when the file does not load or is not valid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(fetchWinGetVersionCatalog()).rejects.toThrow(/did not load \(HTTP 404\)/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1 }))));
    await expect(fetchWinGetVersionCatalog()).rejects.toThrow(/not valid/);
  });
});
