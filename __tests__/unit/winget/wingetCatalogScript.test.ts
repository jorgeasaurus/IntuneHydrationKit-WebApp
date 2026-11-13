import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseWinGetVersionCatalog } from "@/lib/winget/versionCatalog";

const require = createRequire(import.meta.url);
const catalogScript = require("../../../scripts/winget-catalog.js");
const {
  KEPT_VERSION_COUNT,
  buildAppEntry,
  compareWinGetVersions,
  listVersionFolders,
  manifestPathFor,
  parseInstallerManifest,
  parseWinGetVersion,
  selectVersions,
  serializeCatalog,
  sortVersionsNewestFirst,
  validateAppList,
} = catalogScript;

const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), "utf8");

const APP = {
  templateId: "contoso-tool",
  packageIdentifier: "Contoso.Tool",
  displayName: "Contoso Tool",
  publisher: "Contoso",
};

interface FakeInstaller {
  architecture: string;
  installerType: string;
  nestedInstallerType: string | null;
  scope: string | null;
  url: string;
  sha256: string | null;
}

function installer(version: string, overrides: Partial<FakeInstaller> = {}): FakeInstaller {
  return {
    architecture: "x64",
    installerType: "msi",
    nestedInstallerType: null,
    scope: "machine",
    url: `https://downloads.contoso.example/tool/${version}/tool-x64.msi`,
    sha256: `HASH-${version}`,
    ...overrides,
  };
}

function manifest(version: string, installers: FakeInstaller[] = [installer(version)]) {
  return { version, releaseDate: null, installers };
}

function sign(value: number): number {
  return Math.sign(value);
}

describe("WinGet version comparison", () => {
  it.each([
    ["1.10", "1.9", 1],
    ["1.9", "1.10", -1],
    ["2024.10", "2024.1", 1],
    ["2024.1", "2024.10", -1],
    ["24.09", "24.9", 0],
    ["1.0", "1", 0],
    ["1.0.0.0", "1", 0],
    ["1.2.3.4", "1.2.3", 1],
    ["1.2.3", "1.2.3.4", -1],
    ["10.0", "9.99", 1],
    ["0.102.3101", "0.101.2362.0", 1],
    ["26288.2004.5269.3420", "26276.513.5241.9675", 1],
    ["20240101.1", "2024.1", 1],
    ["v1.2", "1.2", 0],
    ["V2.0", "1.9", 1],
    ["1.1-beta", "1.1", -1],
    ["1.1", "1.1-beta", 1],
    // WinGet quirk: "1.0" loses its trailing 0, so the longer "1.0-beta" is newer.
    ["1.0-beta", "1.0", 1],
    ["1.2a", "1.2b", -1],
    ["1.2A", "1.2a", 0],
    ["1.0-rc.2", "1.0-rc.10", -1],
    ["beta.1", "0.1", -1],
    ["2.0 ", " 2.0", 0],
    ["1..2", "1.0.2", 0],
    ["99999999999999999999", "1", -1],
  ])("compares %j with %j as %i", (a, b, expected) => {
    expect(sign(compareWinGetVersions(a, b))).toBe(expected);
  });

  it("removes characters before a first digit that comes before the first dot", () => {
    expect(parseWinGetVersion("v1.2")).toEqual([
      { number: 1n, suffix: "" },
      { number: 2n, suffix: "" },
    ]);
    expect(parseWinGetVersion("beta.1")).toEqual([
      { number: 0n, suffix: "beta" },
      { number: 1n, suffix: "" },
    ]);
  });

  it("sorts newest first and orders equal versions by their text", () => {
    expect(
      sortVersionsNewestFirst(["1.9", "24.9", "1.10", "24.09", "1.10.0", "2024.1", "1.0-beta"])
    ).toEqual(["2024.1", "24.9", "24.09", "1.10.0", "1.10", "1.9", "1.0-beta"]);
  });
});

describe("manifest paths and app list", () => {
  it.each([
    ["7zip.7zip", "manifests/7/7zip/7zip"],
    ["Google.Chrome", "manifests/g/Google/Chrome"],
    ["Microsoft.Sysinternals.PsTools", "manifests/m/Microsoft/Sysinternals/PsTools"],
    ["Notepad++.Notepad++", "manifests/n/Notepad++/Notepad++"],
  ])("maps %s to %s", (id, expected) => {
    expect(manifestPathFor(id)).toBe(expected);
  });

  it("rejects a package identifier with no publisher segment", () => {
    expect(() => manifestPathFor("Chrome")).toThrow(/Invalid WinGet package identifier/);
  });

  it("rejects duplicate apps and sorts the list by template id", () => {
    expect(() => validateAppList([APP, { ...APP, templateId: "other" }])).toThrow(/Duplicate/);
    expect(
      validateAppList([{ ...APP, templateId: "zz", packageIdentifier: "Z.Z" }, APP]).map(
        (app: { templateId: string }) => app.templateId
      )
    ).toEqual(["contoso-tool", "zz"]);
  });

  it("returns the child folders of a package tree", () => {
    expect(
      listVersionFolders([
        { path: "1.0", type: "tree" },
        { path: "Beta", type: "tree" },
        { path: ".package", type: "blob" },
      ])
    ).toEqual(["1.0", "Beta"]);
  });
});

describe("installer manifest parsing", () => {
  it("applies root values to each installer and keeps the version text", () => {
    const parsed = parseInstallerManifest(fixture("root-defaults.installer.yaml"), {
      packageIdentifier: "Contoso.Tool",
      version: "24.10",
    });

    expect(parsed).toEqual({
      version: "24.10",
      releaseDate: "2026-03-14",
      installers: [
        {
          architecture: "x64",
          installerType: "wix",
          nestedInstallerType: null,
          scope: "machine",
          url: "https://downloads.contoso.example/tool/24.10/tool-x64.msi",
          sha256: "A".repeat(64),
        },
        {
          architecture: "arm64",
          installerType: "wix",
          nestedInstallerType: null,
          scope: "machine",
          url: "https://downloads.contoso.example/tool/24.10/tool-arm64.msi",
          sha256: "B".repeat(64),
        },
        {
          architecture: "x86",
          installerType: "exe",
          nestedInstallerType: null,
          scope: "user",
          url: "https://downloads.contoso.example/tool/24.10/tool-x86.exe",
          sha256: null,
        },
      ],
    });
  });

  it("reads per-installer values and uses the newest installer release date", () => {
    const parsed = parseInstallerManifest(fixture("per-installer.installer.yaml"), {
      packageIdentifier: "contoso.tool",
      version: "1.2.3.4",
    });

    expect(parsed.releaseDate).toBe("2025-01-05");
    expect(parsed.installers.map((entry: FakeInstaller) => [entry.architecture, entry.installerType, entry.nestedInstallerType, entry.scope])).toEqual([
      ["x64", "zip", "portable", null],
      ["neutral", "msix", null, null],
    ]);
  });

  it("rejects a manifest for another version, an unknown architecture, and a non-installer manifest", () => {
    expect(() =>
      parseInstallerManifest(fixture("root-defaults.installer.yaml"), {
        packageIdentifier: "Contoso.Tool",
        version: "24.1",
      })
    ).toThrow(/PackageVersion is "24.10"/);
    expect(() =>
      parseInstallerManifest(fixture("unknown-architecture.installer.yaml"), {
        packageIdentifier: "Contoso.Tool",
        version: "2.0",
      })
    ).toThrow(/unknown Architecture "riscv64"/);
    expect(() =>
      parseInstallerManifest(fixture("wrong-type.installer.yaml"), {
        packageIdentifier: "Contoso.Tool",
        version: "2.0",
      })
    ).toThrow(/ManifestType is "defaultLocale"/);
    expect(() =>
      parseInstallerManifest("Installers: [", { packageIdentifier: "Contoso.Tool", version: "2.0" })
    ).toThrow(/not valid YAML/);
  });

  it("ignores a release date that is not a calendar date", () => {
    const text = fixture("root-defaults.installer.yaml").replace("2026-03-14", "2026-02-30");
    expect(
      parseInstallerManifest(text, { packageIdentifier: "Contoso.Tool", version: "24.10" }).releaseDate
    ).toBeNull();
  });
});

describe("version selection", () => {
  const versions = ["1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.10"];
  const reachable = async () => true;

  it(`keeps the newest ${KEPT_VERSION_COUNT} versions`, async () => {
    const { selected } = await selectVersions({
      versions,
      readManifest: async (version: string) => manifest(version),
      checkUrl: reachable,
    });

    expect(selected.map((entry: { version: string }) => entry.version)).toEqual([
      "1.10",
      "1.6",
      "1.5",
      "1.4",
      "1.3",
    ]);
  });

  it("skips sub-package folders without counting them as candidates", async () => {
    const { selected, skipped } = await selectVersions({
      // "Insiders" stands for a sub-package folder; it sorts as a version and has no manifest.
      versions: ["2.0", "1.5.Insiders", "1.0"],
      readManifest: async (version: string) => (version === "1.5.Insiders" ? null : manifest(version)),
      checkUrl: reachable,
      keep: 5,
      maxCandidates: 2,
    });

    expect(selected.map((entry: { version: string }) => entry.version)).toEqual(["2.0", "1.0"]);
    expect(skipped).toEqual([{ version: "1.5.Insiders", reason: "not a version folder (no installer manifest)" }]);
  });

  it("drops unreachable installers and versions, and fills in with older versions", async () => {
    const dead = new Set([
      "https://downloads.contoso.example/tool/1.10/tool-x64.msi",
      "https://downloads.contoso.example/tool/1.6/tool-arm64.msi",
    ]);
    const { selected, skipped } = await selectVersions({
      versions,
      readManifest: async (version: string) =>
        manifest(version, [
          installer(version),
          installer(version, {
            architecture: "arm64",
            url: `https://downloads.contoso.example/tool/${version}/tool-arm64.msi`,
          }),
        ]),
      checkUrl: async (url: string) => !dead.has(url),
      keep: 3,
    });

    expect(selected.map((entry: { version: string }) => entry.version)).toEqual(["1.10", "1.6", "1.5"]);
    expect(selected[0].installers.map((entry: FakeInstaller) => entry.architecture)).toEqual(["arm64"]);
    expect(selected[1].installers.map((entry: FakeInstaller) => entry.architecture)).toEqual(["x64"]);
    expect(skipped).toEqual([]);

    const allDead = await selectVersions({
      versions: ["2.0", "1.0"],
      readManifest: async (version: string) => manifest(version),
      checkUrl: async (url: string) => !url.includes("/2.0/"),
    });
    expect(allDead.selected.map((entry: { version: string }) => entry.version)).toEqual(["1.0"]);
    expect(allDead.skipped).toEqual([{ version: "2.0", reason: "installer URLs do not resolve" }]);
  });

  it("drops an older installer whose URL a newer version uses with another hash", async () => {
    const sharedUrl = "https://downloads.contoso.example/tool/latest/tool-x64.msi";
    const { selected, skipped } = await selectVersions({
      versions: ["3.0", "2.0", "1.0"],
      readManifest: async (version: string) =>
        manifest(version, [installer(version, { url: sharedUrl, sha256: version === "1.0" ? "HASH-2.0" : `HASH-${version}` })]),
      checkUrl: reachable,
    });

    expect(selected.map((entry: { version: string }) => entry.version)).toEqual(["3.0"]);
    expect(skipped.map((entry: { version: string }) => entry.version)).toEqual(["2.0", "1.0"]);
    expect(skipped[0].reason).toBe("installer files replaced by a newer version");
  });

  it("stops after the candidate limit", async () => {
    const read: string[] = [];
    const { selected } = await selectVersions({
      versions,
      readManifest: async (version: string) => {
        read.push(version);
        return manifest(version);
      },
      checkUrl: async () => false,
      maxCandidates: 4,
    });

    expect(selected).toEqual([]);
    expect(read).toEqual(["1.10", "1.6", "1.5", "1.4"]);
  });
});

describe("catalog output", () => {
  function buildCatalogText(order: "forward" | "reverse") {
    const manifests = [
      manifest("2.0", [
        installer("2.0", { architecture: "x86", url: "https://downloads.contoso.example/b.msi" }),
        installer("2.0", { url: "https://downloads.contoso.example/a.msi" }),
        installer("2.0", { url: "https://downloads.contoso.example/a.msi" }),
      ]),
      { ...manifest("1.10"), releaseDate: "2025-06-01" },
      manifest("1.9"),
    ];
    const apps = [
      buildAppEntry(APP, order === "forward" ? manifests : manifests.slice().reverse()),
      buildAppEntry(
        { templateId: "alpha-app", packageIdentifier: "Alpha.App", displayName: "Alpha", publisher: "Alpha" },
        [manifest("5")]
      ),
    ];
    return serializeCatalog(order === "forward" ? apps : apps.slice().reverse());
  }

  it("marks the newest version latest and every other version best effort", () => {
    const entry = buildAppEntry(APP, [manifest("1.9"), manifest("1.10"), manifest("2.0")]);

    expect(entry.manifestPath).toBe("manifests/c/Contoso/Tool");
    expect(
      entry.versions.map((version: { version: string; latest: boolean; bestEffort: boolean }) => [
        version.version,
        version.latest,
        version.bestEffort,
      ])
    ).toEqual([
      ["2.0", true, false],
      ["1.10", false, true],
      ["1.9", false, true],
    ]);
  });

  it("gives byte-identical output for the same data in any order", () => {
    const text = buildCatalogText("forward");

    expect(buildCatalogText("reverse")).toBe(text);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).not.toMatch(/sha256|generatedAt|timestamp/i);
  });

  it("sorts apps and de-duplicates installers", () => {
    const catalog = JSON.parse(buildCatalogText("forward"));

    expect(catalog.apps.map((app: { templateId: string }) => app.templateId)).toEqual([
      "alpha-app",
      "contoso-tool",
    ]);
    expect(catalog.apps[1].versions[0].installers).toEqual([
      {
        architecture: "x64",
        installerType: "msi",
        nestedInstallerType: null,
        scope: "machine",
        url: "https://downloads.contoso.example/a.msi",
      },
      {
        architecture: "x86",
        installerType: "msi",
        nestedInstallerType: null,
        scope: "machine",
        url: "https://downloads.contoso.example/b.msi",
      },
    ]);
  });

  it("writes a catalog that the loader accepts", () => {
    const catalog = parseWinGetVersionCatalog(JSON.parse(buildCatalogText("forward")));

    expect(catalog.keptVersionCount).toBe(KEPT_VERSION_COUNT);
    expect(catalog.apps[1].versions[1].releaseDate).toBe("2025-06-01");
  });

  it("refuses an app with no usable version", () => {
    expect(() => buildAppEntry(APP, [])).toThrow(/no version has a usable installer/);
  });
});
