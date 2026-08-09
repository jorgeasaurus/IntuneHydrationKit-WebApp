import { GraphClient } from "./client";
import {
  addHydrationMarker,
  HYDRATION_MARKER,
  HYDRATION_MARKER_LEGACY,
} from "@/lib/utils/hydrationMarker";
import { IntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import { Win32AppTemplate } from "@/templates/win32Apps";

interface Win32LobApp {
  "@odata.type"?: string;
  id: string;
  displayName: string;
  description?: string;
  notes?: string;
  publisher?: string;
  owner?: string;
  developer?: string;
  informationUrl?: string;
  privacyInformationUrl?: string;
  fileName?: string;
  size?: number;
  setupFilePath?: string;
  installCommandLine?: string;
  uninstallCommandLine?: string;
  allowAvailableUninstall?: boolean;
}

interface ContentVersion {
  id: string;
}

interface ContentFile {
  id: string;
  azureStorageUri?: string;
  uploadState?: string;
}

const APPS_ENDPOINT = "/deviceAppManagement/mobileApps";
const POLL_INTERVAL_MS = 2000;
const UPLOAD_TIMEOUT_MS = 180000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function encodeUtf8AsBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function buildWin32LobAppPayload(
  template: Win32AppTemplate,
  packageFileName: string,
  detectionScript: string,
  iconBase64?: string
): Record<string, unknown> {
  return {
    "@odata.type": "#microsoft.graph.win32LobApp",
    displayName: template.displayName,
    description: addHydrationMarker(template.description),
    publisher: template.publisher,
    developer: template.developer,
    owner: template.owner,
    notes: template.notes,
    appVersion: template.version,
    informationUrl: null,
    privacyInformationUrl: null,
    fileName: packageFileName,
    setupFilePath: template.setupFilePath,
    installCommandLine: template.installCommandLine,
    uninstallCommandLine: template.uninstallCommandLine,
    minimumSupportedOperatingSystem: template.minimumSupportedOperatingSystem,
    applicableArchitectures: template.applicableArchitectures,
    minimumFreeDiskSpaceInMB: null,
    minimumMemoryInMB: null,
    installExperience: { runAsAccount: "system" },
    deviceRestartBehavior: "suppress",
    allowAvailableUninstall: template.allowAvailableUninstall,
    returnCodes: [
      { returnCode: 0, type: "success" },
      { returnCode: 1707, type: "success" },
      { returnCode: 3010, type: "softReboot" },
      { returnCode: 1641, type: "hardReboot" },
      { returnCode: 1618, type: "retry" },
    ],
    rules: [
      {
        "@odata.type": "#microsoft.graph.win32LobAppPowerShellScriptRule",
        ruleType: "detection",
        scriptContent: encodeUtf8AsBase64(detectionScript),
        enforceSignatureCheck: false,
        runAs32Bit: false,
      },
    ],
    ...(iconBase64
      ? {
          largeIcon: {
            "@odata.type": "#microsoft.graph.mimeContent",
            type: "image/png",
            value: iconBase64,
          },
        }
      : {}),
  };
}

async function waitForUploadState(
  client: GraphClient,
  endpoint: string,
  desiredState: string
): Promise<ContentFile> {
  const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const contentFile = await client.get<ContentFile>(endpoint, "beta");
    if (contentFile.uploadState === desiredState) {
      return contentFile;
    }
    if (contentFile.uploadState?.endsWith("Failed") || contentFile.uploadState?.endsWith("TimedOut")) {
      throw new Error(`Intune reported Win32 content upload state ${contentFile.uploadState}.`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for Win32 content state ${desiredState}.`);
}

async function uploadToAzureStorage(uploadUri: string, content: Blob): Promise<void> {
  const response = await fetch("/api/win32-upload", {
    method: "POST",
    headers: { "x-intune-upload-url": uploadUri },
    body: content,
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(details?.error || `Azure Storage upload failed: ${response.status} ${response.statusText}`);
  }
}

async function uploadWithRenewal(
  client: GraphClient,
  contentFileEndpoint: string,
  uploadUri: string,
  content: Blob
): Promise<void> {
  let currentUploadUri = uploadUri;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await uploadToAzureStorage(currentUploadUri, content);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isAuthorizationFailure = /AuthenticationFailed|\b403\b|authori[sz]ed/i.test(message);
      if (!isAuthorizationFailure || attempt === 3) {
        throw error;
      }

      await client.post(`${contentFileEndpoint}/renewUpload`, {}, "beta");
      const renewedTarget = await waitForUploadState(
        client,
        contentFileEndpoint,
        "azureStorageUriRenewalSuccess"
      );
      if (!renewedTarget.azureStorageUri) {
        throw new Error("Intune did not provide a renewed Azure Storage upload URI.");
      }
      currentUploadUri = renewedTarget.azureStorageUri;
    }
  }
}

export async function getWin32LobApps(client: GraphClient): Promise<Win32LobApp[]> {
  return client.getCollection<Win32LobApp>(
    `${APPS_ENDPOINT}?$filter=isof('microsoft.graph.win32LobApp')&$select=id,displayName,description,notes`,
    "beta"
  );
}

export async function createWin32AppFromPackage(
  client: GraphClient,
  template: Win32AppTemplate,
  packageFile: IntuneWinPackage,
  detectionScript: string,
  iconBase64?: string
): Promise<Win32LobApp> {
  const app = await client.postNoRetry<Win32LobApp>(
    APPS_ENDPOINT,
    buildWin32LobAppPayload(template, template.packageFileName, detectionScript, iconBase64),
    "beta"
  );
  try {
    const contentEndpoint = `${APPS_ENDPOINT}/${app.id}/microsoft.graph.win32LobApp/contentVersions`;
    const contentVersion = await client.post<ContentVersion>(contentEndpoint, {}, "beta");
    const contentFile = await client.post<ContentFile>(
      `${contentEndpoint}/${contentVersion.id}/files`,
      {
        "@odata.type": "#microsoft.graph.mobileAppContentFile",
        name: packageFile.encryptedContentName,
        size: packageFile.unencryptedContentSize,
        sizeEncrypted: packageFile.encryptedContent.size,
        manifest: null,
        isDependency: false,
      },
      "beta"
    );
    const contentFileEndpoint = `${contentEndpoint}/${contentVersion.id}/files/${contentFile.id}`;
    const uploadTarget = await waitForUploadState(client, contentFileEndpoint, "azureStorageUriRequestSuccess");
    if (!uploadTarget.azureStorageUri) {
      throw new Error("Intune did not provide an Azure Storage upload URI.");
    }

    await uploadWithRenewal(
      client,
      contentFileEndpoint,
      uploadTarget.azureStorageUri,
      packageFile.encryptedContent
    );
    await client.post(
      `${contentFileEndpoint}/commit`,
      { fileEncryptionInfo: packageFile.encryptionInfo },
      "beta"
    );
    await waitForUploadState(client, contentFileEndpoint, "commitFileSuccess");
    await client.patch(
      `${APPS_ENDPOINT}/${app.id}`,
      { "@odata.type": "#microsoft.graph.win32LobApp", committedContentVersion: contentVersion.id },
      "beta"
    );
    return app;
  } catch (error) {
    await client.delete(`${APPS_ENDPOINT}/${app.id}`, "beta").catch(() => undefined);
    throw error;
  }
}

export function isOwnedWin32App(app: Win32LobApp): boolean {
  const fields = [app.description, app.notes]
    .filter((field): field is string => Boolean(field))
    .map((field) => field.toLowerCase());
  const hydrationMarkers = [HYDRATION_MARKER, HYDRATION_MARKER_LEGACY]
    .map((marker) => marker.toLowerCase());
  const hasFullHydrationMarker = fields.some((field) =>
    hydrationMarkers.some((marker) => field.includes(marker))
  );
  const hasWinGetMarker = fields.some(
    (field) => field.includes("imported from winget") || field.includes("wingetpackageidentifier:")
  );
  return hasFullHydrationMarker && hasWinGetMarker;
}

export function isLegacyOwnedWin32App(
  app: Win32LobApp,
  template: Win32AppTemplate
): boolean {
  const fingerprint = template.legacyOwnership;
  if (!fingerprint) return false;

  return (
    app["@odata.type"] === "#microsoft.graph.win32LobApp" &&
    app.displayName.toLowerCase() === template.displayName.toLowerCase() &&
    app.description === fingerprint.description &&
    app.notes === fingerprint.notes &&
    app.publisher === fingerprint.publisher &&
    app.owner === fingerprint.owner &&
    app.developer === fingerprint.developer &&
    app.informationUrl === fingerprint.informationUrl &&
    app.privacyInformationUrl === fingerprint.privacyInformationUrl &&
    app.fileName === fingerprint.fileName &&
    app.size === fingerprint.size &&
    app.setupFilePath === fingerprint.setupFilePath &&
    app.installCommandLine === fingerprint.installCommandLine &&
    app.uninstallCommandLine === fingerprint.uninstallCommandLine &&
    app.allowAvailableUninstall === fingerprint.allowAvailableUninstall
  );
}
