import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAccessToken } = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth/authUtils", () => ({
  getAccessToken: mockGetAccessToken,
}));

import {
  createWin32AppFromPackage,
  isLegacyOwnedWin32App,
  isOwnedWin32App,
} from "@/lib/graph/win32Apps";
import { SEVEN_ZIP_WIN32_APP } from "@/templates/win32Apps";

describe("createWin32AppFromPackage", () => {
  beforeEach(() => {
    mockGetAccessToken.mockResolvedValue("graph-access-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates, uploads, commits, and publishes the supplied Win32 content", async () => {
    const detectionScript = "Write-Output '7zip.7zip is installed'";
    const postNoRetry = vi
      .fn()
      .mockResolvedValueOnce({ id: "app-id" })
      .mockResolvedValueOnce({ id: "content-id" })
      .mockResolvedValueOnce({ id: "file-id" });
    const post = vi.fn().mockResolvedValue({});
    const get = vi
      .fn()
      .mockResolvedValueOnce({ uploadState: "azureStorageUriRequestSuccess", azureStorageUri: "https://upload.example/package" })
      .mockResolvedValueOnce({ uploadState: "commitFileSuccess" });
    const patch = vi.fn().mockResolvedValue({});
    const deleteApp = vi.fn().mockResolvedValue(undefined);
    const client = { postNoRetry, post, get, patch, delete: deleteApp };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const app = await createWin32AppFromPackage(
      client as never,
      SEVEN_ZIP_WIN32_APP,
      {
        encryptedContent: new Blob(["encrypted-content"]),
        encryptedContentName: "IntunePackage.intunewin",
        setupFile: "Install-WinGetPackage.ps1",
        unencryptedContentSize: 42,
        encryptionInfo: {
          encryptionKey: "key",
          macKey: "mac-key",
          initializationVector: "iv",
          mac: "mac",
          profileIdentifier: "ProfileVersion1",
          fileDigest: "digest",
          fileDigestAlgorithm: "SHA256",
        },
      },
      detectionScript,
      "aWNvbg=="
    );

    expect(app.id).toBe("app-id");
    expect(postNoRetry).toHaveBeenCalledWith(
      "/deviceAppManagement/mobileApps",
      expect.objectContaining({
        displayName: "7-Zip - [IHD]",
        fileName: "7-zip.intunewin",
        setupFilePath: "Install-WinGetPackage.ps1",
        installCommandLine: "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File .\\Install-WinGetPackage.ps1",
        uninstallCommandLine: "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File .\\Uninstall-WinGetPackage.ps1",
        allowAvailableUninstall: true,
        minimumFreeDiskSpaceInMB: null,
        minimumMemoryInMB: null,
        notes: expect.stringContaining("WinGetPackageIdentifier: 7zip.7zip"),
        largeIcon: {
          "@odata.type": "#microsoft.graph.mimeContent",
          type: "image/png",
          value: "aWNvbg==",
        },
        rules: [
          expect.objectContaining({
            "@odata.type": "#microsoft.graph.win32LobAppPowerShellScriptRule",
            ruleType: "detection",
            enforceSignatureCheck: false,
            runAs32Bit: false,
          }),
        ],
      }),
      "beta"
    );
    const appPayload = postNoRetry.mock.calls[0]?.[1] as { rules: Array<{ scriptContent: string }> };
    expect(Buffer.from(appPayload.rules[0].scriptContent, "base64").toString("utf8")).toBe(detectionScript);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/win32-upload",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer graph-access-token",
          "x-intune-content-file-endpoint": "/deviceAppManagement/mobileApps/app-id/microsoft.graph.win32LobApp/contentVersions/content-id/files/file-id",
          "x-intune-upload-url": "https://upload.example/package",
        },
      })
    );
    expect(postNoRetry).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/contentVersions/content-id/files"),
      expect.objectContaining({
        name: "IntunePackage.intunewin",
        size: 42,
        sizeEncrypted: 17,
        manifest: null,
        isDependency: false,
      }),
      "beta"
    );
    expect(post).toHaveBeenLastCalledWith(
      expect.stringContaining("/files/file-id/commit"),
      expect.objectContaining({ fileEncryptionInfo: expect.objectContaining({ profileIdentifier: "ProfileVersion1" }) }),
      "beta"
    );
    expect(patch).toHaveBeenCalledWith(
      "/deviceAppManagement/mobileApps/app-id",
      expect.objectContaining({ committedContentVersion: "content-id" }),
      "beta"
    );
    expect(deleteApp).not.toHaveBeenCalled();
  });

  it("requires both hydration and WinGet ownership markers", () => {
    expect(isOwnedWin32App({
      id: "owned",
      displayName: "7-Zip - [IHD]",
      description: "Imported by Intune Hydration Kit",
      notes: "Imported from WinGet\nWinGetPackageIdentifier: 7zip.7zip",
    })).toBe(true);
    expect(isOwnedWin32App({
      id: "generic-hydration",
      displayName: "7-Zip - [IHD]",
      description: "Imported by Intune Hydration Kit",
      notes: "Different workload",
    })).toBe(false);
    expect(isOwnedWin32App({
      id: "external-winget",
      displayName: "7-Zip",
      description: "Third-party app",
      notes: "Imported from WinGet",
    })).toBe(false);
    expect(isOwnedWin32App({
      id: "case-insensitive",
      displayName: "7-Zip - [IHD]",
      description: "imported by intune hydration kit",
      notes: "imported from winget",
    })).toBe(true);
    expect(isOwnedWin32App({
      id: "name-prefix-only",
      displayName: "7-Zip - [IHD]",
      description: "[IHD] app",
      notes: "Imported from WinGet",
    })).toBe(false);
  });

  it("recognizes only the exact legacy 7-Zip proof package fingerprint", () => {
    const legacyApp = {
      "@odata.type": "#microsoft.graph.win32LobApp",
      id: "legacy-7zip",
      displayName: "7-Zip - [IHD]",
      description: "7-Zip is a file archiver with a high compression ratio. - Imported by Intune Hydration Kit",
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
    };

    expect(isLegacyOwnedWin32App(legacyApp, SEVEN_ZIP_WIN32_APP)).toBe(true);
    expect(isLegacyOwnedWin32App(
      { ...legacyApp, displayName: "[IHD] 7-Zip" },
      SEVEN_ZIP_WIN32_APP
    )).toBe(true);
    expect(isLegacyOwnedWin32App(
      { ...legacyApp, displayName: "Renamed 7-Zip" },
      SEVEN_ZIP_WIN32_APP
    )).toBe(false);
    expect(isLegacyOwnedWin32App(
      { ...legacyApp, setupFilePath: "unrelated-installer.exe" },
      SEVEN_ZIP_WIN32_APP
    )).toBe(false);
  });

  it("renews an expired Azure upload URL before committing content", async () => {
    const postNoRetry = vi
      .fn()
      .mockResolvedValueOnce({ id: "app-id" })
      .mockResolvedValueOnce({ id: "content-id" })
      .mockResolvedValueOnce({ id: "file-id" });
    const post = vi.fn().mockResolvedValue({});
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        uploadState: "azureStorageUriRequestSuccess",
        azureStorageUri: "https://upload.example/expired",
      })
      .mockResolvedValueOnce({
        uploadState: "azureStorageUriRenewalSuccess",
        azureStorageUri: "https://upload.example/renewed",
      })
      .mockResolvedValueOnce({ uploadState: "commitFileSuccess" });
    const client = {
      postNoRetry,
      post,
      get,
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: "Azure Storage block upload failed: 403 Forbidden" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      ))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await createWin32AppFromPackage(
      client as never,
      SEVEN_ZIP_WIN32_APP,
      {
        encryptedContent: new Blob(["encrypted-content"]),
        encryptedContentName: "IntunePackage.intunewin",
        setupFile: "Install-WinGetPackage.ps1",
        unencryptedContentSize: 42,
        encryptionInfo: {
          encryptionKey: "key",
          macKey: "mac-key",
          initializationVector: "iv",
          mac: "mac",
          profileIdentifier: "ProfileVersion1",
          fileDigest: "digest",
          fileDigestAlgorithm: "SHA256",
        },
      },
      "detected"
    );

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining("/files/file-id/renewUpload"),
      {},
      "beta"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/win32-upload",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer graph-access-token",
          "x-intune-content-file-endpoint": "/deviceAppManagement/mobileApps/app-id/microsoft.graph.win32LobApp/contentVersions/content-id/files/file-id",
          "x-intune-upload-url": "https://upload.example/renewed",
        },
      })
    );
  });

  it("removes the uncommitted app when content publishing fails", async () => {
    const postNoRetry = vi
      .fn()
      .mockResolvedValueOnce({ id: "app-id" })
      .mockRejectedValueOnce(new Error("content version unavailable"));
    const post = vi.fn();
    const deleteApp = vi.fn().mockResolvedValue(undefined);
    const client = { postNoRetry, post, delete: deleteApp };

    await expect(createWin32AppFromPackage(
      client as never,
      SEVEN_ZIP_WIN32_APP,
      {
        encryptedContent: new Blob(["encrypted-content"]),
        encryptedContentName: "IntunePackage.intunewin",
        setupFile: "Install-WinGetPackage.ps1",
        unencryptedContentSize: 42,
        encryptionInfo: {
          encryptionKey: "key",
          macKey: "mac-key",
          initializationVector: "iv",
          mac: "mac",
          profileIdentifier: "ProfileVersion1",
          fileDigest: "digest",
          fileDigestAlgorithm: "SHA256",
        },
      },
      "Write-Output 'detected'"
    )).rejects.toThrow("content version unavailable");

    expect(deleteApp).toHaveBeenCalledWith("/deviceAppManagement/mobileApps/app-id", "beta");
  });
});
