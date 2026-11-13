import { GraphClient } from "./client";
import {
  addHydrationMarker,
  HYDRATION_MARKER,
  HYDRATION_MARKER_LEGACY,
} from "@/lib/utils/hydrationMarker";
import { IntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import { KIT_TEMPLATE_ID_NOTE, Win32AppTemplate } from "@/templates/win32Apps";
import { getAccessToken } from "@/lib/auth/authUtils";
import { utf8ToBase64 } from "@/lib/utils/base64";
import { isAuthSessionError, isRunCancelledError } from "@/lib/utils/retry";

export interface Win32LobApp {
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
/** Error code that /api/win32-upload returns when Azure rejects the signed upload URL. */
const AZURE_STORAGE_AUTHORIZATION_FAILED_CODE = "azureStorageAuthorizationFailed";

/** Azure Storage rejected the signed upload URL. Intune can issue a renewed URL. */
class AzureUploadAuthorizationError extends Error {}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
        scriptContent: utf8ToBase64(detectionScript),
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

async function uploadToAzureStorage(
  uploadUri: string,
  contentFileEndpoint: string,
  content: Blob
): Promise<void> {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/win32-upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "x-intune-content-file-endpoint": contentFileEndpoint,
      "x-intune-upload-url": uploadUri,
    },
    body: content,
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    const message = details?.error || `Azure Storage upload failed: ${response.status} ${response.statusText}`;
    if (details?.code === AZURE_STORAGE_AUTHORIZATION_FAILED_CODE) {
      throw new AzureUploadAuthorizationError(message);
    }
    throw new Error(message);
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
      await uploadToAzureStorage(currentUploadUri, contentFileEndpoint, content);
      return;
    } catch (error) {
      if (!(error instanceof AzureUploadAuthorizationError) || attempt === 3) {
        throw error;
      }

      // A repeated renewUpload only asks Intune for a new signed URL again, so it is safe to retry.
      await client.postAction(`${contentFileEndpoint}/renewUpload`, {}, "beta");
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

/** Upload states that show that Intune accepted a commit request for the file. */
const COMMIT_ACCEPTED_STATES = new Set(["commitFilePending", "commitFileSuccess"]);

/**
 * Commit the uploaded content file. The commit is retried with the normal retry policy.
 * When the commit still fails, for example because a retry arrived after Intune accepted
 * an earlier attempt whose response was lost, the file is read again. When its upload
 * state shows an accepted commit, the commit is treated as done. Otherwise the error
 * of the commit is thrown.
 */
async function commitContentFile(
  client: GraphClient,
  contentFileEndpoint: string,
  fileEncryptionInfo: unknown
): Promise<void> {
  try {
    await client.postAction(`${contentFileEndpoint}/commit`, { fileEncryptionInfo }, "beta");
  } catch (error) {
    if (isRunCancelledError(error) || isAuthSessionError(error)) throw error;
    const uploadState = await client
      .get<ContentFile>(contentFileEndpoint, "beta")
      .then((file) => file.uploadState)
      .catch((readError: unknown) => {
        if (isRunCancelledError(readError)) throw readError;
        return undefined;
      });
    if (uploadState && COMMIT_ACCEPTED_STATES.has(uploadState)) {
      console.warn(
        `[Win32] Commit request failed, but the file upload state is ${uploadState} - treating the commit as accepted`
      );
      return;
    }
    throw error;
  }
}

export async function getWin32LobApps(client: GraphClient): Promise<Win32LobApp[]> {
  return client.getCollection<Win32LobApp>(
    `${APPS_ENDPOINT}?$filter=isof('microsoft.graph.win32LobApp')&$select=id,displayName,description,notes`,
    "beta"
  );
}

/** On an error of createWin32AppFromPackage when the app that it created is still in the tenant. */
export interface IncompleteWin32App {
  incompleteAppId: string;
}

/** ID of the incomplete app that a failed create left in the tenant, or null. */
export function getIncompleteWin32AppId(error: unknown): string | null {
  const id = (error as Partial<IncompleteWin32App> | null)?.incompleteAppId;
  return typeof id === "string" && id.length > 0 ? id : null;
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
    const contentVersion = await client.postNoRetry<ContentVersion>(contentEndpoint, {}, "beta");
    const contentFile = await client.postNoRetry<ContentFile>(
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
    await commitContentFile(client, contentFileEndpoint, packageFile.encryptionInfo);
    await waitForUploadState(client, contentFileEndpoint, "commitFileSuccess");
    await client.patch(
      `${APPS_ENDPOINT}/${app.id}`,
      { "@odata.type": "#microsoft.graph.win32LobApp", committedContentVersion: contentVersion.id },
      "beta"
    );
    return app;
  } catch (error) {
    const removed = await client.delete(`${APPS_ENDPOINT}/${app.id}`, "beta").then(
      () => true,
      () => false
    );
    if (removed) throw error;
    // The app is in the tenant without content. The caller gets its ID, so a later create
    // in this session finds it and does not make a second app.
    const incomplete: IncompleteWin32App = { incompleteAppId: app.id };
    // A cancelled run stays a cancelled run: the engine reads the type of this error.
    if (isRunCancelledError(error)) throw Object.assign(error, incomplete);
    // A later create skips the app as "Already exists", so the error must say that it is there.
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: unknown } | null)?.status;
    throw Object.assign(
      new Error(
        `${message} The incomplete app "${app.displayName ?? template.displayName}" could not be removed. ` +
          "Delete it in Intune or with Delete mode before you create it again.",
        { cause: error }
      ),
      incomplete,
      // Callers classify the failure by the status of the first error.
      typeof status === "number" ? { status } : {}
    );
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
  // The second marker is in the notes: WinGet apps carry the WinGet lines, other kit apps the template ID line.
  const hasKitAppMarker = fields.some(
    (field) =>
      field.includes("imported from winget") ||
      field.includes("wingetpackageidentifier:") ||
      field.includes(KIT_TEMPLATE_ID_NOTE.toLowerCase())
  );
  return hasFullHydrationMarker && hasKitAppMarker;
}

export function getWin32AppDisplayNameVariants(displayName: string): string[] {
  const suffix = " - [IHD]";
  const trimmedName = displayName.trim();
  const baseName = trimmedName.toLowerCase().endsWith(suffix.toLowerCase())
    ? trimmedName.slice(0, -suffix.length).trimEnd()
    : trimmedName.replace(/^\[IHD\]\s+/i, "");

  return [...new Set([`${baseName}${suffix}`, trimmedName, `[IHD] ${baseName}`, baseName])]
    .map((name) => name.toLowerCase());
}

export function isLegacyOwnedWin32App(
  app: Win32LobApp,
  template: Win32AppTemplate
): boolean {
  const fingerprint = template.legacyOwnership;
  if (!fingerprint) return false;

  return (
    app["@odata.type"] === "#microsoft.graph.win32LobApp" &&
    getWin32AppDisplayNameVariants(template.displayName).includes(
      app.displayName.trim().toLowerCase()
    ) &&
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
