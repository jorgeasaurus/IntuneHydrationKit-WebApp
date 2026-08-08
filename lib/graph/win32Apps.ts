import { GraphClient } from "./client";
import { addHydrationMarker, hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import { IntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import { Win32AppTemplate } from "@/templates/win32Apps";

interface Win32LobApp {
  id: string;
  displayName: string;
  description?: string;
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

function buildWin32LobAppPayload(template: Win32AppTemplate, packageFileName: string): Record<string, unknown> {
  return {
    "@odata.type": "#microsoft.graph.win32LobApp",
    displayName: template.displayName,
    description: addHydrationMarker(template.description),
    publisher: template.publisher,
    developer: template.publisher,
    owner: template.publisher,
    notes: template.notes,
    appVersion: template.version,
    informationUrl: template.informationUrl,
    privacyInformationUrl: template.privacyInformationUrl,
    fileName: packageFileName,
    setupFilePath: template.setupFilePath,
    installCommandLine: template.installCommandLine,
    uninstallCommandLine: template.uninstallCommandLine,
    minimumSupportedOperatingSystem: template.minimumSupportedOperatingSystem,
    applicableArchitectures: template.applicableArchitectures,
    installExperience: { runAsAccount: "system" },
    deviceRestartBehavior: "suppress",
    returnCodes: [
      { returnCode: 0, type: "success" },
      { returnCode: 1707, type: "success" },
      { returnCode: 3010, type: "softReboot" },
      { returnCode: 1641, type: "hardReboot" },
      { returnCode: 1618, type: "retry" },
    ],
    rules: [
      {
        "@odata.type": "#microsoft.graph.win32LobAppFileSystemRule",
        ruleType: "detection",
        ...template.detectionRule,
        operator: "notConfigured",
      },
    ],
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
  const response = await fetch(uploadUri, {
    method: "PUT",
    headers: { "x-ms-blob-type": "BlockBlob" },
    body: content,
  });
  if (!response.ok) {
    throw new Error(`Azure Storage upload failed: ${response.status} ${response.statusText}`);
  }
}

export async function getWin32LobApps(client: GraphClient): Promise<Win32LobApp[]> {
  return client.getCollection<Win32LobApp>(
    `${APPS_ENDPOINT}?$filter=isof('microsoft.graph.win32LobApp')&$select=id,displayName,description`,
    "beta"
  );
}

export async function createWin32AppFromPackage(
  client: GraphClient,
  template: Win32AppTemplate,
  packageFile: IntuneWinPackage
): Promise<Win32LobApp> {
  const app = await client.postNoRetry<Win32LobApp>(
    APPS_ENDPOINT,
    buildWin32LobAppPayload(template, template.packageFileName),
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
        isDependency: false,
      },
      "beta"
    );
    const contentFileEndpoint = `${contentEndpoint}/${contentVersion.id}/files/${contentFile.id}`;
    const uploadTarget = await waitForUploadState(client, contentFileEndpoint, "azureStorageUriRequestSuccess");
    if (!uploadTarget.azureStorageUri) {
      throw new Error("Intune did not provide an Azure Storage upload URI.");
    }

    await uploadToAzureStorage(uploadTarget.azureStorageUri, packageFile.encryptedContent);
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
  return hasHydrationMarker(app.description);
}
