import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import { getWin32AppTemplates } from "@/templates/win32Apps";

describe("readIntuneWinPackage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("describes the required ZIP format when an entry is compressed", async () => {
    const packageBytes = new ArrayBuffer(30);
    const view = new DataView(packageBytes);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, 8, true);

    await expect(readIntuneWinPackage(packageBytes)).rejects.toThrow(
      "The supplied .intunewin package must contain stored (uncompressed) ZIP entries without data descriptors."
    );
  });

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

  it("passes an encrypted-content view directly to Blob without copying the package buffer", async () => {
    const template = getWin32AppTemplates()[0];
    const packageBytes = readFileSync(join(process.cwd(), `public${template.packageUrl}`));
    const packageBuffer = packageBytes.buffer.slice(
      packageBytes.byteOffset,
      packageBytes.byteOffset + packageBytes.byteLength
    ) as ArrayBuffer;
    const blobParts: BlobPart[][] = [];
    const NativeBlob = Blob;

    class CapturingBlob extends NativeBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        blobParts.push(parts ?? []);
        super(parts, options);
      }
    }

    vi.stubGlobal("Blob", CapturingBlob);
    await readIntuneWinPackage(packageBuffer);

    const encryptedContentPart = blobParts[0][0];
    expect(encryptedContentPart).toBeInstanceOf(Uint8Array);
    expect((encryptedContentPart as Uint8Array).buffer).toBe(packageBuffer);
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
    expect(detectionScript).not.toContain("Install-WinGetSystemBootstrap");
    expect(detectionScript).not.toContain("Invoke-WebRequest");
    expect(detectionScript).toContain("$installed = if (-not [string]::IsNullOrWhiteSpace($Winget))");
  });
});
