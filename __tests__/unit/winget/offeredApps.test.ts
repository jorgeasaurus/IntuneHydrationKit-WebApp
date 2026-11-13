import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isOfferableApp, parseWinGetVersionCatalog } from "@/lib/winget/versionCatalog";
import { NOT_OFFERED_WINGET_APPS, WINGET_CATALOG_APP_LIST } from "@/templates/win32Apps";

const catalog = parseWinGetVersionCatalog(
  JSON.parse(readFileSync(path.join(process.cwd(), "public/winget-versions.json"), "utf8")),
);

/**
 * The "offered" flags in templates/wingetApps.json are static, so the counts and the template
 * list are static. When a catalog sync changes which apps have a machine-scope x64 installer,
 * this test fails and the flags (and the counts) must be updated in the sync pull request.
 */
describe("offered WinGet catalog apps", () => {
  it.each(WINGET_CATALOG_APP_LIST.map((app) => [app.templateId, app] as const))(
    "%s is offered only when its newest catalog version can be installed machine-wide on x64",
    (_, app) => {
      const entry = catalog.apps.find((candidate) => candidate.templateId === app.templateId);
      expect(entry).toBeDefined();
      expect(app.offered).toBe(isOfferableApp(entry!));
    },
  );

  it("does not offer apps with only user-scope, unscoped, or non-x64 installers", () => {
    expect(NOT_OFFERED_WINGET_APPS.map((app) => app.templateId)).toEqual(
      expect.arrayContaining(["windows-terminal", "claude-code", "claude"]),
    );
    expect(NOT_OFFERED_WINGET_APPS).toHaveLength(10);
  });
});

describe("isOfferableApp", () => {
  const machineX64 = { architecture: "x64", installerType: "msi", nestedInstallerType: null, scope: "machine", url: "https://example.com/a.msi" } as const;
  const userX64 = { ...machineX64, scope: "user" } as const;
  const version = (name: string, latest: boolean, installers: ReadonlyArray<typeof machineX64 | typeof userX64>) => ({
    version: name, latest, bestEffort: !latest, releaseDate: null, installers: [...installers],
  });
  const app = (versions: ReturnType<typeof version>[]) => ({
    templateId: "example", packageIdentifier: "Example.App", displayName: "Example", publisher: "Example",
    manifestPath: "manifests/e/Example/App", versions,
  });

  it("does not offer an app whose newest version has no machine-scope x64 installer, even when an older one has", () => {
    // "Latest" would install 2.0 with --scope machine and fail.
    expect(isOfferableApp(app([version("2.0", true, [userX64]), version("1.0", false, [machineX64])]))).toBe(false);
    expect(isOfferableApp(app([version("2.0", true, [machineX64]), version("1.0", false, [userX64])]))).toBe(true);
    expect(isOfferableApp(app([]))).toBe(false);
  });
});
