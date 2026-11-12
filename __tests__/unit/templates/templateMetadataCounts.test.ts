/**
 * TEMPLATE_METADATA has static counts for the categories that are not derived
 * from a manifest. This test fails when a count no longer matches the template
 * files under public/.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getWin32AppTemplates, TEMPLATE_METADATA } from "@/templates";

const PUBLIC_DIR = path.resolve(__dirname, "../../../public");

function countJsonFiles(directory: string, options: { recursive?: boolean; exclude?: string[] } = {}): number {
  const entries = readdirSync(path.join(PUBLIC_DIR, directory), {
    recursive: options.recursive ?? false,
    withFileTypes: true,
  });
  return entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".json") && !options.exclude?.includes(entry.name)
  ).length;
}

describe("TEMPLATE_METADATA counts", () => {
  it.each([
    ["compliance", "IntuneTemplates/Compliance"],
    ["appProtection", "IntuneTemplates/AppProtection"],
    ["enrollment", "IntuneTemplates/Enrollment"],
    ["conditionalAccess", "IntuneTemplates/ConditionalAccess"],
    ["notification", "IntuneTemplates/Notifications"],
  ] as const)("matches the %s template files", (category, directory) => {
    expect(TEMPLATE_METADATA[category].count).toBe(countJsonFiles(directory));
  });

  it("matches the CIS baseline manifest and policy files", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(PUBLIC_DIR, "CISIntuneBaselines/manifest.json"), "utf8")
    ) as { totalFiles: number; files: unknown[] };

    expect(TEMPLATE_METADATA.cisBaseline.count).toBe(manifest.totalFiles);
    expect(manifest.files).toHaveLength(manifest.totalFiles);
    expect(countJsonFiles("CISIntuneBaselines", { recursive: true, exclude: ["manifest.json"] })).toBe(
      manifest.totalFiles
    );
  });

  it("matches the Win32 app templates", () => {
    expect(TEMPLATE_METADATA.win32Apps.count).toBe(getWin32AppTemplates().length);
  });
});
