import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";

describe("readIntuneWinPackage", () => {
  it("reads the supplied 7-Zip package metadata and encrypted content", async () => {
    const packageBytes = readFileSync(
      join(process.cwd(), "public/win32-apps/7-zip.intunewin")
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

  it("ships only the PowerShell module's WinGet wrapper source files", () => {
    const wrapperRoot = join(process.cwd(), "public/win32-apps/7-zip");
    expect(readdirSync(wrapperRoot).sort()).toEqual([
      "Detect-WinGetPackage.ps1",
      "Install-WinGetPackage.ps1",
      "Uninstall-WinGetPackage.ps1",
    ]);

    const installScript = readFileSync(join(wrapperRoot, "Install-WinGetPackage.ps1"), "utf8");
    const uninstallScript = readFileSync(join(wrapperRoot, "Uninstall-WinGetPackage.ps1"), "utf8");
    const detectionScript = readFileSync(join(wrapperRoot, "Detect-WinGetPackage.ps1"), "utf8");
    expect(installScript).toContain("winget install --id 7zip.7zip --exact --silent --scope machine");
    expect(uninstallScript).toContain("winget uninstall --id 7zip.7zip --exact --scope machine --silent");
    expect(detectionScript).toContain("$PackageIdentifier = '7zip.7zip'");
    expect(detectionScript).toContain("Test-InstalledApplicationRegistry");
  });
});
