import type { Win32AppTemplate, Win32AppWinGetPackage } from "@/templates/win32Apps";

/** The WinGet package of a template. Throws for an app that is not a WinGet app. */
export function requireWinGetPackage(template: Win32AppTemplate): Win32AppWinGetPackage {
  if (!template.winget) {
    throw new Error(`${template.displayName} is not a WinGet app, so it cannot have a WinGet version.`);
  }
  return template.winget;
}

/**
 * The app template for a version. `version` undefined gives the template without change (latest).
 * A pinned version sets the app version and the WinGetPackageVersion line of the notes. The
 * display name does not change, so there is one app per package in the tenant.
 */
export function getWinGetVersionTemplate(template: Win32AppTemplate, version: string | undefined): Win32AppTemplate {
  requireWinGetPackage(template);
  if (version === undefined) return template;
  const notes = template.notes
    .split("\n")
    .map((line) => (line === "WinGetPackageVersion: latest" ? `WinGetPackageVersion: ${version}` : line))
    .join("\n");
  if (notes === template.notes) {
    throw new Error(`The notes of ${template.displayName} have no WinGetPackageVersion line.`);
  }
  return { ...template, version, notes };
}
