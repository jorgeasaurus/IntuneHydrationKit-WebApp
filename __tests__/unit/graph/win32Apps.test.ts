import { afterEach, describe, expect, it, vi } from "vitest";

import { createWin32AppFromPackage } from "@/lib/graph/win32Apps";
import { SEVEN_ZIP_WIN32_APP } from "@/templates/win32Apps";

describe("createWin32AppFromPackage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates, uploads, commits, and publishes the supplied Win32 content", async () => {
    const postNoRetry = vi.fn().mockResolvedValue({ id: "app-id" });
    const post = vi
      .fn()
      .mockResolvedValueOnce({ id: "content-id" })
      .mockResolvedValueOnce({ id: "file-id" })
      .mockResolvedValueOnce({});
    const get = vi
      .fn()
      .mockResolvedValueOnce({ uploadState: "azureStorageUriRequestSuccess", azureStorageUri: "https://upload.example/package" })
      .mockResolvedValueOnce({ uploadState: "commitFileSuccess" });
    const patch = vi.fn().mockResolvedValue({});
    const deleteApp = vi.fn().mockResolvedValue(undefined);
    const client = { postNoRetry, post, get, patch, delete: deleteApp };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const app = await createWin32AppFromPackage(client as never, SEVEN_ZIP_WIN32_APP, {
      encryptedContent: new Blob(["encrypted-content"]),
      encryptedContentName: "IntunePackage.intunewin",
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
    });

    expect(app.id).toBe("app-id");
    expect(postNoRetry).toHaveBeenCalledWith(
      "/deviceAppManagement/mobileApps",
      expect.objectContaining({
        displayName: "7-Zip - [IHD]",
        fileName: "7zip-25.01.intunewin",
        setupFilePath: "Deploy-Application.exe",
      }),
      "beta"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://upload.example/package",
      expect.objectContaining({ method: "PUT" })
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

  it("removes the uncommitted app when content publishing fails", async () => {
    const postNoRetry = vi.fn().mockResolvedValue({ id: "app-id" });
    const post = vi.fn().mockRejectedValueOnce(new Error("content version unavailable"));
    const deleteApp = vi.fn().mockResolvedValue(undefined);
    const client = { postNoRetry, post, delete: deleteApp };

    await expect(createWin32AppFromPackage(client as never, SEVEN_ZIP_WIN32_APP, {
      encryptedContent: new Blob(["encrypted-content"]),
      encryptedContentName: "IntunePackage.intunewin",
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
    })).rejects.toThrow("content version unavailable");

    expect(deleteApp).toHaveBeenCalledWith("/deviceAppManagement/mobileApps/app-id", "beta");
  });
});
