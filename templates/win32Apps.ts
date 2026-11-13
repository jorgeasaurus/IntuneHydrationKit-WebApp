import wingetAppList from "./wingetApps.json";

/** The WinGet package of an app, for the generated wrapper scripts. */
export interface Win32AppWinGetPackage {
  packageIdentifier: string;
  /** Display name without the " - [IHD]" suffix. */
  displayName: string;
  publisher: string;
  /** Folder of the package in microsoft/winget-pkgs. */
  manifestPath: string;
}

export interface Win32AppTemplate {
  id: string;
  packageIdentifier: string;
  displayName: string;
  /**
   * Prebuilt package. Absent for an app whose package the browser builds from generated
   * scripts (the WinGet catalog apps).
   */
  packageUrl?: string;
  packageFileName: string;
  /** Committed detection script. Absent when the script is generated. */
  detectionScriptUrl?: string;
  /** Committed install script. Absent when the script is generated. */
  installScriptUrl?: string;
  /** Absent when the uninstall command line runs no script from the package. */
  uninstallScriptUrl?: string;
  iconUrl?: string;
  /** Label of the package source in the template catalog. Default: "WinGet Package". */
  catalogSubcategory?: string;
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
  /** Present for an app that installs a WinGet package with the wrapper scripts. */
  winget?: Win32AppWinGetPackage;
  /**
   * True for an app that the wizard does not select by default (the WinGet catalog apps).
   * Select All and a category default do not select it; the user selects it one at a time.
   */
  optIn?: boolean;
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
  const { id } = definition;

  return {
    ...createWinGetAppBase(definition),
    packageUrl: `/win32-apps/${id}.intunewin`,
    detectionScriptUrl: `/win32-apps/${id}/Detect-WinGetPackage.ps1`,
    installScriptUrl: `/win32-apps/${id}/Install-WinGetPackage.ps1`,
    uninstallScriptUrl: `/win32-apps/${id}/Uninstall-WinGetPackage.ps1`,
    iconUrl: `/win32-apps/${id}.png`,
  };
}

/** The fields that every WinGet app has, with the "latest" version. */
function createWinGetAppBase(definition: WinGetStarterAppDefinition): Win32AppTemplate {
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
    packageFileName: `${id}.intunewin`,
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
    winget: { packageIdentifier, displayName, publisher, manifestPath },
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

export const VISUAL_STUDIO_CODE_WIN32_APP = createWinGetStarterApp({
  id: "visual-studio-code",
  packageIdentifier: "Microsoft.VisualStudioCode",
  displayName: "Visual Studio Code",
  publisher: "Microsoft Corporation",
  description:
    "Starter-pack WinGet template for Visual Studio Code Win32 packaging.",
  manifestPath: "manifests/m/Microsoft/VisualStudioCode",
});

/** AutopilotBranding module version in public/win32-apps/autopilot-branding.intunewin. */
export const AUTOPILOT_BRANDING_VERSION = "4.0.7";
/** Marker in the app notes that identifies a kit Win32 app that does not come from WinGet. */
export const KIT_TEMPLATE_ID_NOTE = "IntuneHydrationKitTemplateId:";

/**
 * Autopilot Branding by Michael Niehaus (https://github.com/mtniehaus/AutopilotBranding, MIT License),
 * with the kit's cleanup-only configuration: public/win32-apps/autopilot-branding/AutopilotBranding.json.
 * The package is built by scripts/build-autopilot-branding.ps1. The install and uninstall commands and
 * the tag file are the ones that AutopilotBranding documents, so an administrator can replace the app
 * content with a package from the AutopilotBranding builder.
 * The wizard can customize the apps to remove and the cleanup tasks (lib/win32/autopilotBrandingConfig.ts).
 * Then the browser builds the package from public/win32-apps/autopilot-branding/content.zip, and the
 * description and notes describe the customized configuration.
 */
export const AUTOPILOT_BRANDING_WIN32_APP: Win32AppTemplate = {
  id: "autopilot-branding",
  packageIdentifier: "mtniehaus.AutopilotBranding",
  displayName: "Autopilot Branding (Cleanup) - [IHD]",
  packageUrl: "/win32-apps/autopilot-branding.intunewin",
  packageFileName: "autopilot-branding.intunewin",
  detectionScriptUrl: "/win32-apps/autopilot-branding/Detect-AutopilotBranding.ps1",
  installScriptUrl: "/win32-apps/autopilot-branding/AutopilotBranding.ps1",
  catalogSubcategory: "Autopilot script package",
  publisher: "Michael Niehaus",
  developer: "Michael Niehaus",
  owner: "",
  version: AUTOPILOT_BRANDING_VERSION,
  description:
    "Autopilot Branding by Michael Niehaus, with a cleanup-only configuration. During Windows Autopilot (OOBE) it removes consumer in-box apps, hides Widgets, blocks the Copilot app and Dev Home from being installed, removes OEM Edge bookmarks and the Edge desktop shortcut, and updates Edge and the in-box apps. It sets no wallpaper, theme, Start layout, OEM information, language, or time zone, and installs no apps. On a device that has completed OOBE it makes no change. Assign it as a required app that blocks the Enrollment Status Page.",
  notes: [
    `${KIT_TEMPLATE_ID_NOTE} autopilot-branding`,
    "Source: https://github.com/mtniehaus/AutopilotBranding",
    `AutopilotBrandingVersion: ${AUTOPILOT_BRANDING_VERSION}`,
    "License: MIT (c) Michael Niehaus",
    "Configuration: Intune Hydration Kit cleanup-only",
    "To apply your own branding, build a package at https://mtniehaus.github.io/AutopilotBranding/ and replace the app content. The commands and the detection rule stay the same.",
  ].join("\n"),
  setupFilePath: "AutopilotBranding.ps1",
  installCommandLine:
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\AutopilotBranding.ps1",
  uninstallCommandLine:
    "cmd.exe /c del %ProgramData%\\Microsoft\\AutopilotBranding\\AutopilotBranding.ps1.tag",
  minimumSupportedOperatingSystem: { v10_21H1: true },
  applicableArchitectures: "x64",
  allowAvailableUninstall: false,
};

const STARTER_WIN32_APPS = [
  SEVEN_ZIP_WIN32_APP,
  GOOGLE_CHROME_WIN32_APP,
  MOZILLA_FIREFOX_WIN32_APP,
  VISUAL_STUDIO_CODE_WIN32_APP,
] as const;

/** An app of the WinGet version catalog app list (templates/wingetApps.json). */
export interface WinGetCatalogAppListEntry {
  templateId: string;
  packageIdentifier: string;
  displayName: string;
  publisher: string;
  description: string;
  /**
   * False when no catalog version has a machine-scope x64 installer. The wrapper installs with
   * "--scope machine" and the app is x64 only, so the kit does not offer such an app.
   */
  offered: boolean;
}

export const WINGET_CATALOG_APP_LIST: readonly WinGetCatalogAppListEntry[] = wingetAppList;

/** Why an app of the catalog app list is not offered. */
export const WINGET_NOT_OFFERED_REASON =
  "No version in the WinGet catalog has a machine-scope x64 installer, and the kit installs with --scope machine on x64.";

/** Folder of a package in microsoft/winget-pkgs ("Notepad++.Notepad++" gives "manifests/n/Notepad++/Notepad++"). */
export function getWinGetManifestPath(packageIdentifier: string): string {
  return ["manifests", packageIdentifier[0].toLowerCase(), ...packageIdentifier.split(".")].join("/");
}

const STARTER_IDS = new Set<string>(STARTER_WIN32_APPS.map((template) => template.id));

/**
 * The offered WinGet catalog apps other than the starter apps. The browser builds their package
 * from generated scripts, so they have no prebuilt package, committed scripts, or icon.
 * They are opt-in: the wizard does not select them by default.
 */
export const WINGET_CATALOG_WIN32_APPS: readonly Win32AppTemplate[] = WINGET_CATALOG_APP_LIST.filter(
  (app) => app.offered && !STARTER_IDS.has(app.templateId),
).map((app) => ({
  ...createWinGetAppBase({
    id: app.templateId,
    packageIdentifier: app.packageIdentifier,
    displayName: app.displayName,
    publisher: app.publisher,
    description: app.description,
    manifestPath: getWinGetManifestPath(app.packageIdentifier),
  }),
  catalogSubcategory: "WinGet catalog app",
  optIn: true,
}));

/** Catalog apps that the kit does not offer, with the reason. Shown in the catalog and the wizard. */
export const NOT_OFFERED_WINGET_APPS: readonly WinGetCatalogAppListEntry[] = WINGET_CATALOG_APP_LIST.filter(
  (app) => !app.offered,
);

const WIN32_APP_TEMPLATES: readonly Win32AppTemplate[] = [
  ...STARTER_WIN32_APPS,
  AUTOPILOT_BRANDING_WIN32_APP,
  ...WINGET_CATALOG_WIN32_APPS,
];

export function getWin32AppTemplates(): readonly Win32AppTemplate[] {
  return WIN32_APP_TEMPLATES;
}

export function getWin32AppTemplateByName(
  name: string,
): Win32AppTemplate | undefined {
  return WIN32_APP_TEMPLATES.find((template) => template.displayName === name);
}
