export interface Win32AppTemplate {
  id: string;
  packageIdentifier: string;
  displayName: string;
  packageUrl: string;
  packageFileName: string;
  detectionScriptUrl: string;
  iconUrl?: string;
  publisher: string;
  developer: string;
  owner: string;
  version: string;
  description: string;
  notes: string;
  setupFilePath: string;
  installCommandLine: string;
  uninstallCommandLine: string;
  minimumSupportedOperatingSystem: { v10_21H1: true };
  applicableArchitectures: "x64";
  allowAvailableUninstall: boolean;
}

export const SEVEN_ZIP_WIN32_APP: Win32AppTemplate = {
  id: "7-zip",
  packageIdentifier: "7zip.7zip",
  displayName: "7-Zip - [IHD]",
  packageUrl: "/win32-apps/7-zip.intunewin",
  packageFileName: "7-zip.intunewin",
  detectionScriptUrl: "/win32-apps/7-zip/Detect-WinGetPackage.ps1",
  iconUrl: "/win32-apps/7-zip.png",
  publisher: "Igor Pavlov",
  developer: "Igor Pavlov",
  owner: "",
  version: "latest",
  description: "Starter-pack WinGet template for 7-Zip Win32 packaging.",
  notes: [
    "Imported from WinGet",
    "WinGetPackageIdentifier: 7zip.7zip",
    "WinGetPackageVersion: latest",
    "WinGetTemplateId: 7-zip",
    "WinGetManifestRepository: microsoft/winget-pkgs",
    "WinGetManifestPath: manifests/7/7zip/7zip",
  ].join("\n"),
  setupFilePath: "Install-WinGetPackage.ps1",
  installCommandLine:
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File .\\Install-WinGetPackage.ps1",
  uninstallCommandLine:
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File .\\Uninstall-WinGetPackage.ps1",
  minimumSupportedOperatingSystem: { v10_21H1: true },
  applicableArchitectures: "x64",
  allowAvailableUninstall: true,
};

const WIN32_APP_TEMPLATES = [SEVEN_ZIP_WIN32_APP] as const;

export function getWin32AppTemplates(): readonly Win32AppTemplate[] {
  return WIN32_APP_TEMPLATES;
}

export function getWin32AppTemplateByName(name: string): Win32AppTemplate | undefined {
  return WIN32_APP_TEMPLATES.find((template) => template.displayName === name);
}
