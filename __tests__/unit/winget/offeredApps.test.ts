import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getPinnableVersions, parseWinGetVersionCatalog } from "@/lib/winget/versionCatalog";
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
    "%s is offered only when a catalog version can be pinned",
    (_, app) => {
      const entry = catalog.apps.find((candidate) => candidate.templateId === app.templateId);
      expect(entry).toBeDefined();
      expect(app.offered).toBe(getPinnableVersions(entry!).length > 0);
    },
  );

  it("does not offer apps with only user-scope, unscoped, or non-x64 installers", () => {
    expect(NOT_OFFERED_WINGET_APPS.map((app) => app.templateId)).toEqual(
      expect.arrayContaining(["windows-terminal", "claude-code", "claude"]),
    );
    expect(NOT_OFFERED_WINGET_APPS).toHaveLength(10);
  });
});
