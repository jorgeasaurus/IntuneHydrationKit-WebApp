export interface Win32AppTemplate {
  id: string;
  packageIdentifier: string;
  displayName: string;
  packageUrl: string;
  packageFileName: string;
  detectionScriptUrl: string;
  installScriptUrl: string;
  uninstallScriptUrl: string;
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
  legacyOwnership?: {
    description: string;
    notes: string;
    publisher: string;
    owner: string;
    developer: string;
    informationUrl: string;
    privacyInformationUrl: string;
    fileName: string;
    size: number;
    setupFilePath: string;
    installCommandLine: string;
    uninstallCommandLine: string;
    allowAvailableUninstall: boolean;
  };
}

interface WinGetStarterAppDefinition {
  id: string;
  packageIdentifier: string;
  displayName: string;
  publisher: string;
  description: string;
  manifestPath: string;
}

function createWinGetStarterApp(
  definition: WinGetStarterAppDefinition,
): Win32AppTemplate {
  const {
    id,
    packageIdentifier,
    displayName,
    publisher,
    description,
    manifestPath,
  } = definition;

  return {
    id,
    packageIdentifier,
    displayName: `${displayName} - [IHD]`,
    packageUrl: `/win32-apps/${id}.intunewin`,
    packageFileName: `${id}.intunewin`,
    detectionScriptUrl: `/win32-apps/${id}/Detect-WinGetPackage.ps1`,
    installScriptUrl: `/win32-apps/${id}/Install-WinGetPackage.ps1`,
    uninstallScriptUrl: `/win32-apps/${id}/Uninstall-WinGetPackage.ps1`,
    iconUrl: `/win32-apps/${id}.png`,
    publisher,
    developer: publisher,
    owner: "",
    version: "latest",
    description,
    notes: [
      "Imported from WinGet",
      `WinGetPackageIdentifier: ${packageIdentifier}`,
      "WinGetPackageVersion: latest",
      `WinGetTemplateId: ${id}`,
      "WinGetManifestRepository: microsoft/winget-pkgs",
      `WinGetManifestPath: ${manifestPath}`,
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
}

export const SEVEN_ZIP_WIN32_APP: Win32AppTemplate = {
  ...createWinGetStarterApp({
    id: "7-zip",
    packageIdentifier: "7zip.7zip",
    displayName: "7-Zip",
    publisher: "Igor Pavlov",
    description: "Starter-pack WinGet template for 7-Zip Win32 packaging.",
    manifestPath: "manifests/7/7zip/7zip",
  }),
  legacyOwnership: {
    description:
      "7-Zip is a file archiver with a high compression ratio. - Imported by Intune Hydration Kit",
    notes: "File archiver utility",
    publisher: "Igor Pavlov",
    owner: "Igor Pavlov",
    developer: "Igor Pavlov",
    informationUrl: "https://www.7-zip.org",
    privacyInformationUrl: "https://www.7-zip.org",
    fileName: "7zip-25.01.intunewin",
    size: 2315712,
    setupFilePath: "Deploy-Application.exe",
    installCommandLine: "Deploy-Application.exe install",
    uninstallCommandLine: "Deploy-Application.exe uninstall",
    allowAvailableUninstall: false,
  },
};

export const GOOGLE_CHROME_WIN32_APP = createWinGetStarterApp({
  id: "google-chrome",
  packageIdentifier: "Google.Chrome",
  displayName: "Google Chrome",
  publisher: "Google LLC",
  description:
    "Starter-pack WinGet template for Google Chrome Win32 packaging.",
  manifestPath: "manifests/g/Google/Chrome",
});

export const MOZILLA_FIREFOX_WIN32_APP = createWinGetStarterApp({
  id: "mozilla-firefox",
  packageIdentifier: "Mozilla.Firefox",
  displayName: "Mozilla Firefox",
  publisher: "Mozilla",
  description:
    "Starter-pack WinGet template for Mozilla Firefox Win32 packaging.",
  manifestPath: "manifests/m/Mozilla/Firefox",
});

export const POWERSHELL_WIN32_APP = createWinGetStarterApp({
  id: "powershell",
  packageIdentifier: "Microsoft.PowerShell",
  displayName: "PowerShell",
  publisher: "Microsoft Corporation",
  description: "Starter-pack WinGet template for PowerShell Win32 packaging.",
  manifestPath: "manifests/m/Microsoft/PowerShell",
});

export const VISUAL_STUDIO_CODE_WIN32_APP = createWinGetStarterApp({
  id: "visual-studio-code",
  packageIdentifier: "Microsoft.VisualStudioCode",
  displayName: "Visual Studio Code",
  publisher: "Microsoft Corporation",
  description:
    "Starter-pack WinGet template for Visual Studio Code Win32 packaging.",
  manifestPath: "manifests/m/Microsoft/VisualStudioCode",
});

const WIN32_APP_TEMPLATES = [
  SEVEN_ZIP_WIN32_APP,
  GOOGLE_CHROME_WIN32_APP,
  MOZILLA_FIREFOX_WIN32_APP,
  POWERSHELL_WIN32_APP,
  VISUAL_STUDIO_CODE_WIN32_APP,
] as const;

export function getWin32AppTemplates(): readonly Win32AppTemplate[] {
  return WIN32_APP_TEMPLATES;
}

export function getWin32AppTemplateByName(
  name: string,
): Win32AppTemplate | undefined {
  return WIN32_APP_TEMPLATES.find((template) => template.displayName === name);
}
