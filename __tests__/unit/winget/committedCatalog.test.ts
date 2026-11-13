import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseWinGetVersionCatalog } from "@/lib/winget/versionCatalog";
import { getWin32AppTemplates } from "@/templates/win32Apps";

const require = createRequire(import.meta.url);
const { compareWinGetVersions, manifestPathFor, serializeCatalog } = require("../../../scripts/winget-catalog.js");

const ROOT = path.join(__dirname, "../../..");
const catalogText = readFileSync(path.join(ROOT, "public/winget-versions.json"), "utf8");
const appList: Array<{ templateId: string; packageIdentifier: string; displayName: string; publisher: string }> =
  JSON.parse(readFileSync(path.join(ROOT, "scripts/winget-apps.json"), "utf8"));

describe("committed WinGet version catalog", () => {
  const catalog = parseWinGetVersionCatalog(JSON.parse(catalogText));

  it("passes the loader validation", () => {
    expect(catalog.apps.length).toBeGreaterThan(0);
  });

  it("is in the exact form that the sync script writes", () => {
    expect(serializeCatalog(catalog.apps)).toBe(catalogText);
  });

  it("has one entry for each app in the app list, with the same names", () => {
    expect(catalog.apps.map((app) => app.templateId).sort()).toEqual(
      appList.map((app) => app.templateId).sort()
    );
    for (const app of appList) {
      expect(catalog.apps.find((entry) => entry.templateId === app.templateId)).toMatchObject({
        packageIdentifier: app.packageIdentifier,
        displayName: app.displayName,
        publisher: app.publisher,
        manifestPath: manifestPathFor(app.packageIdentifier),
      });
    }
  });

  it("lists the versions of each app newest first", () => {
    for (const app of catalog.apps) {
      const versions = app.versions.map((version) => version.version);
      for (let i = 1; i < versions.length; i++) {
        expect(compareWinGetVersions(versions[i - 1], versions[i]), `${app.templateId} ${versions[i]}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("includes the WinGet starter apps with their existing ids and manifest paths", () => {
    const starterApps = getWin32AppTemplates().filter((template) =>
      template.notes.includes("Imported from WinGet")
    );
    expect(starterApps.map((template) => template.id).sort()).toEqual([
      "7-zip",
      "google-chrome",
      "mozilla-firefox",
      "visual-studio-code",
    ]);

    for (const template of starterApps) {
      const entry = catalog.apps.find((app) => app.templateId === template.id);
      expect(entry?.packageIdentifier).toBe(template.packageIdentifier);
      expect(template.notes).toContain(`WinGetManifestPath: ${entry?.manifestPath}`);
    }
  });
});
