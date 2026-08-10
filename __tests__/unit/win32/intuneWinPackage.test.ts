import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import { getWin32AppTemplates } from "@/templates/win32Apps";

describe("readIntuneWinPackage", () => {
  it.each(getWin32AppTemplates())("reads the supplied $displayName package metadata and encrypted content", async (template) => {
    const packageBytes = readFileSync(
      join(process.cwd(), `public${template.packageUrl}`)
    );
    const packageFile = await readIntuneWinPackage(
      packageBytes.buffer.slice(
        packageBytes.byteOffset,
        packageBytes.byteOffset + packageBytes.byteLength
      ) as ArrayBuffer
    );

    expect(packageFile.encryptedContentName).toBe("IntunePackage.intunewin");
    expect(packageFile.setupFile).toBe("Install-WinGetPackage.ps1");
    expect(packageFile.encryptedContent.size).toBeGreaterThan(0);
    expect(packageFile.unencryptedContentSize).toBeGreaterThan(0);
    expect(packageFile.encryptionInfo).toMatchObject({
      profileIdentifier: "ProfileVersion1",
      fileDigestAlgorithm: "SHA256",
    });
  });

  it.each(getWin32AppTemplates())("ships only the PowerShell module's WinGet wrapper source files for $displayName", (template) => {
    const wrapperRoot = join(process.cwd(), "public/win32-apps", template.id);
    expect(template.installScriptUrl).toBe(
      `/win32-apps/${template.id}/Install-WinGetPackage.ps1`
    );
    expect(template.uninstallScriptUrl).toBe(
      `/win32-apps/${template.id}/Uninstall-WinGetPackage.ps1`
    );
    expect(readdirSync(wrapperRoot).sort()).toEqual([
      "Detect-WinGetPackage.ps1",
      "Install-WinGetPackage.ps1",
      "Uninstall-WinGetPackage.ps1",
    ]);

    const installScript = readFileSync(join(wrapperRoot, "Install-WinGetPackage.ps1"), "utf8");
    const uninstallScript = readFileSync(join(wrapperRoot, "Uninstall-WinGetPackage.ps1"), "utf8");
    const detectionScript = readFileSync(join(wrapperRoot, "Detect-WinGetPackage.ps1"), "utf8");
    expect(installScript).toContain(`winget install --id ${template.packageIdentifier} --exact --silent --scope machine`);
    expect(uninstallScript).toContain(`winget uninstall --id ${template.packageIdentifier} --exact --scope machine --silent`);
    expect(detectionScript).toContain(`$PackageIdentifier = '${template.packageIdentifier}'`);
    expect(detectionScript).toContain("Test-InstalledApplicationRegistry");
  });
});
