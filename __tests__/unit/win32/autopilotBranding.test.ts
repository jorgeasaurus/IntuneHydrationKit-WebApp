import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isOwnedWin32App } from "@/lib/graph/win32Apps";
import { addHydrationMarker } from "@/lib/utils/hydrationMarker";
import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import { AUTOPILOT_BRANDING_VERSION, AUTOPILOT_BRANDING_WIN32_APP as template } from "@/templates/win32Apps";

const ROOT = join(process.cwd(), "public/win32-apps");

interface BrandingConfiguration {
  Description: string;
  Tasks: Record<string, { Enabled: boolean; Parameters: Record<string, unknown> }>;
}

const configuration = JSON.parse(
  readFileSync(join(ROOT, "autopilot-branding/AutopilotBranding.json"), "utf8")
) as BrandingConfiguration;
const enabledTasks = Object.entries(configuration.Tasks)
  .filter(([, task]) => task.Enabled)
  .map(([name]) => name);

describe("Autopilot Branding template", () => {
  it("enables only the cleanup tasks", () => {
    expect(enabledTasks).toEqual([
      "Disable-ABStartOnFirstLogon",
      "Hide-ABWidgets",
      "Remove-ABProvisionedApps",
      "Disable-ABCopilotPWA",
      "Disable-ABEdgeDesktopShortcut",
      "Update-ABEdge",
      "Remove-ABEdgeBookmarks",
      "Disable-ABNetworkLocationFlyout",
      "Disable-ABAutoInstalledApps",
      "Update-ABApps",
    ]);
  });

  it("applies no branding, identity, language, or app install task", () => {
    for (const name of [
      "Rename-ABComputer", "Set-ABStartLayout", "Set-ABTaskbarLayout", "Set-ABTheme", "Set-ABLockScreen",
      "Set-ABTimeZone", "Set-ABLanguage", "Set-ABLanguageSettings", "Set-ABDefaultApps", "Set-ABRegisteredOwner",
      "Set-ABOEMInfo", "Set-ABEnterpriseEdition", "Install-ABOneDrive", "Install-ABWinGetPackages", "Remove-ABOffice",
      "Remove-ABInstalledPrograms", "Disable-ABOptionalFeatures", "Remove-ABWindowsCapabilities",
    ]) {
      expect(configuration.Tasks[name], name).toMatchObject({ Enabled: false });
    }
    // An enabled task that needs a file would need an asset in the package. The package has none.
    for (const name of enabledTasks) {
      expect(JSON.stringify(configuration.Tasks[name].Parameters), name).not.toContain("Assets");
    }
  });

  it("keeps the work apps that the upstream default removes", () => {
    const removed = configuration.Tasks["Remove-ABProvisionedApps"].Parameters.AppNames as string[];
    for (const app of [
      "MSTeams", "Microsoft.OutlookForWindows", "Microsoft.MSPaint", "Microsoft.MicrosoftOfficeHub",
      "Microsoft.PowerAutomateDesktop", "Microsoft.YourPhone", "Microsoft.M365Companions",
    ]) {
      expect(removed).not.toContain(app);
    }
    expect(removed).toContain("Microsoft.MicrosoftSolitaireCollection");
    expect(configuration.Tasks["Disable-ABAutoInstalledApps"].Parameters).toMatchObject({ DevHome: true, OutlookNew: false });
  });

  it("ships a package whose setup file is the script that the install command runs", async () => {
    const bytes = readFileSync(join(process.cwd(), `public${template.packageUrl}`));
    const packageFile = await readIntuneWinPackage(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    );

    expect(packageFile.setupFile).toBe("AutopilotBranding.ps1");
    expect(template.setupFilePath).toBe(packageFile.setupFile);
    expect(template.installCommandLine).toContain(`.\\${packageFile.setupFile}`);
    // The upload route accepts at most 4 MiB.
    expect(bytes.byteLength).toBeLessThan(4 * 1024 * 1024);
  });

  it("uses the commands and tag file that AutopilotBranding documents", () => {
    const tagFile = "Microsoft\\AutopilotBranding\\AutopilotBranding.ps1.tag";
    expect(template.installCommandLine).toBe("powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\AutopilotBranding.ps1");
    expect(template.uninstallCommandLine).toBe(`cmd.exe /c del %ProgramData%\\${tagFile}`);
    expect(readFileSync(join(ROOT, "autopilot-branding/Detect-AutopilotBranding.ps1"), "utf8")).toContain(tagFile);
    expect(template.uninstallScriptUrl).toBeUndefined();
  });

  it("ships the upstream license and names the source and version", () => {
    expect(readdirSync(join(ROOT, "autopilot-branding")).sort()).toEqual([
      "AutopilotBranding.json",
      "AutopilotBranding.ps1",
      "Detect-AutopilotBranding.ps1",
      "LICENSE-AutopilotBranding.txt",
    ]);
    const license = readFileSync(join(ROOT, "autopilot-branding/LICENSE-AutopilotBranding.txt"), "utf8");
    expect(license).toContain("MIT License");
    expect(license).toContain("Michael Niehaus");
    expect(template.notes).toContain("https://github.com/mtniehaus/AutopilotBranding");
    expect(template.notes).toContain(`AutopilotBrandingVersion: ${AUTOPILOT_BRANDING_VERSION}`);
    expect(configuration.Description).toContain(AUTOPILOT_BRANDING_VERSION);
  });

  it("is recognised as a kit app for delete only with both markers", () => {
    const app = {
      id: "app-id",
      displayName: template.displayName,
      description: addHydrationMarker(template.description),
      notes: template.notes,
    };

    expect(isOwnedWin32App(app)).toBe(true);
    // An administrator's own Autopilot Branding app has neither marker.
    expect(isOwnedWin32App({ ...app, description: template.description })).toBe(false);
    expect(isOwnedWin32App({ ...app, notes: "Autopilot Branding" })).toBe(false);
  });
});
