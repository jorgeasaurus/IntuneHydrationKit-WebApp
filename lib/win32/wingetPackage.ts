/**
 * Build the package of a WinGet Win32 app in the browser.
 *
 * The content is the same three files as the prebuilt starter packages: Detect-, Install-, and
 * Uninstall-WinGetPackage.ps1 at the root of the content ZIP, with Install-WinGetPackage.ps1 as
 * the setup file. The scripts come from lib/win32/wingetScripts.ts. No installer is in the
 * package: the wrapper runs winget on the device.
 */

import { createIntuneWinPackage, MAX_WIN32_UPLOAD_BYTES } from "@/lib/win32/intuneWinWriter";
import { writeStoredZip } from "@/lib/win32/storedZip";
import {
  getWinGetScripts,
  WINGET_DETECTION_SCRIPT_NAME,
  WINGET_INSTALL_SCRIPT_NAME,
  WINGET_UNINSTALL_SCRIPT_NAME,
} from "@/lib/win32/wingetScripts";
import { requireWinGetPackage } from "@/lib/win32/wingetVersionTemplate";
import type { Win32AppTemplate } from "@/templates/win32Apps";

export interface WinGetPackageBuild {
  packageBytes: Uint8Array<ArrayBuffer>;
  /** The detection script for the Intune detection rule. */
  detectionScript: string;
}

/** Build the package and the detection script of a WinGet app for a version (undefined is latest). */
export async function buildWinGetPackage(
  template: Win32AppTemplate,
  version: string | undefined,
): Promise<WinGetPackageBuild> {
  const winget = requireWinGetPackage(template);
  if (template.setupFilePath !== WINGET_INSTALL_SCRIPT_NAME) {
    throw new Error(`The setup file of ${template.displayName} must be ${WINGET_INSTALL_SCRIPT_NAME}.`);
  }
  const scripts = getWinGetScripts(winget, version);
  const encoder = new TextEncoder();
  // Same entry order as the prebuilt packages.
  const contentZip = writeStoredZip([
    { name: WINGET_DETECTION_SCRIPT_NAME, content: encoder.encode(scripts.detection) },
    { name: WINGET_INSTALL_SCRIPT_NAME, content: encoder.encode(scripts.install) },
    { name: WINGET_UNINSTALL_SCRIPT_NAME, content: encoder.encode(scripts.uninstall) },
  ]);
  const packageBytes = await createIntuneWinPackage(contentZip, {
    name: winget.displayName,
    setupFile: WINGET_INSTALL_SCRIPT_NAME,
  });
  if (packageBytes.length > MAX_WIN32_UPLOAD_BYTES) {
    throw new Error(`The ${winget.displayName} package is larger than the 4 MiB upload limit.`);
  }
  return { packageBytes, detectionScript: scripts.detection };
}
