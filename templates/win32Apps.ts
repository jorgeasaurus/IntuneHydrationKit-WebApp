export interface Win32FileSystemDetectionRule {
  path: string;
  fileOrFolderName: string;
  check32BitOn64System: boolean;
  operationType: "exists";
}

export interface Win32AppTemplate {
  id: string;
  displayName: string;
  packageUrl: string;
  packageFileName: string;
  publisher: string;
  version: string;
  description: string;
  notes: string;
  informationUrl: string;
  privacyInformationUrl: string;
  setupFilePath: string;
  installCommandLine: string;
  uninstallCommandLine: string;
  minimumSupportedOperatingSystem: { v10_21H1: true };
  applicableArchitectures: "x64";
  detectionRule: Win32FileSystemDetectionRule;
}

export const SEVEN_ZIP_WIN32_APP: Win32AppTemplate = {
  id: "7-zip-25.01",
  displayName: "7-Zip - [IHD]",
  packageUrl: "/win32-apps/7zip-25.01.intunewin",
  packageFileName: "7zip-25.01.intunewin",
  publisher: "Igor Pavlov",
  version: "25.01",
  description: "7-Zip is a file archiver with a high compression ratio.",
  notes: "File archiver utility",
  informationUrl: "https://www.7-zip.org",
  privacyInformationUrl: "https://www.7-zip.org",
  setupFilePath: "Deploy-Application.exe",
  installCommandLine: "Deploy-Application.exe install",
  uninstallCommandLine: "Deploy-Application.exe uninstall",
  minimumSupportedOperatingSystem: { v10_21H1: true },
  applicableArchitectures: "x64",
  detectionRule: {
    path: "C:\\Program Files\\7-Zip",
    fileOrFolderName: "7z.exe",
    check32BitOn64System: false,
    operationType: "exists",
  },
};

const WIN32_APP_TEMPLATES = [SEVEN_ZIP_WIN32_APP] as const;

export function getWin32AppTemplates(): readonly Win32AppTemplate[] {
  return WIN32_APP_TEMPLATES;
}

export function getWin32AppTemplateByName(name: string): Win32AppTemplate | undefined {
  return WIN32_APP_TEMPLATES.find((template) => template.displayName === name);
}
