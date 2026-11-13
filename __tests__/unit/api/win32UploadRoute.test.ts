import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/win32-upload/route";

const uploadUrl = "https://tenant.blob.core.windows.net/package?sig=secret-signature";
const contentFileEndpoint = "/deviceAppManagement/mobileApps/app-id/microsoft.graph.win32LobApp/contentVersions/content-id/files/file-id";
const authenticatedHeaders = {
  authorization: "Bearer graph-access-token",
  "content-type": "application/octet-stream",
  origin: "http://localhost",
  "x-intune-content-file-endpoint": contentFileEndpoint,
  "x-intune-upload-url": uploadUrl,
};

function createGraphTargetResponse({
  azureStorageUri = uploadUrl,
  uploadState = "azureStorageUriRequestSuccess",
  sizeEncrypted = 3 as number | null,
} = {}): Response {
  return Response.json({
    azureStorageUri,
    uploadState,
    ...(sizeEncrypted === null ? {} : { sizeEncrypted }),
  });
}

function createUploadRequest(
  body: Uint8Array,
  headers: Record<string, string> = authenticatedHeaders
): Request {
  return new Request("http://localhost/api/win32-upload", {
    method: "POST",
    headers,
    body: body as BodyInit,
  });
}

describe("POST /api/win32-upload", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("forwards a package only to the signed Azure Blob URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse())
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1, 2, 3])));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://graph.microsoft.com/beta${contentFileEndpoint}?$select=azureStorageUri,uploadState,sizeEncrypted`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer graph-access-token",
        },
        cache: "no-store",
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${uploadUrl}&comp=block&blockid=MDAwMDAwMDA%3D`,
      expect.objectContaining({
        method: "PUT",
        redirect: "manual",
        headers: expect.objectContaining({ "Content-Type": "application/octet-stream" }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${uploadUrl}&comp=blocklist`,
      expect.objectContaining({
        method: "PUT",
        redirect: "manual",
        headers: expect.objectContaining({ "Content-Type": "application/xml; charset=UTF-8" }),
        body: '<?xml version="1.0" encoding="utf-8"?><BlockList><Latest>MDAwMDAwMDA=</Latest></BlockList>',
      })
    );
  });

  it("rejects non-Azure upload URLs without issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1]), {
      ...authenticatedHeaders,
      "x-intune-upload-url": "https://example.com/package",
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a body that is not application/octet-stream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1]), {
      ...authenticatedHeaders,
      "content-type": "text/plain",
    }));

    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects packages over the maximum size before reading or forwarding them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1]), {
      ...authenticatedHeaders,
      "content-length": String((4 * 1024 * 1024) + 1),
    }));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed Content-Length header", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1]), {
      ...authenticatedHeaders,
      "content-length": "1e3",
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a Content-Length that differs from the size declared to Intune", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(createGraphTargetResponse({ sizeEncrypted: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1, 2]), {
      ...authenticatedHeaders,
      "content-length": "2",
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops streaming when the body grows past the declared size", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(createGraphTargetResponse({ sizeEncrypted: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1, 2, 3])));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "The Win32 package is larger than its declared size.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not commit a body that is shorter than the declared size", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse({ sizeEncrypted: 5 }))
      .mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1, 2, 3])));

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a content file without a declared encrypted size", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createGraphTargetResponse({ sizeEncrypted: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1, 2, 3])));

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a declared encrypted size over the maximum", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createGraphTargetResponse({ sizeEncrypted: (4 * 1024 * 1024) + 1 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1, 2, 3])));

    expect(response.status).toBe(413);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    "https://tenant.blob.core.usgovcloudapi.net/package?sig=value",
    "https://tenant.blob.core.chinacloudapi.cn/package?sig=value",
    "https://tenant.blob.core.cloudapi.de/package?sig=value",
  ])("rejects sovereign cloud upload URL %s without issuing a request", async (sovereignUploadUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1]), {
      ...authenticatedHeaders,
      "x-intune-upload-url": sovereignUploadUrl,
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads packages larger than one block in Azure blocks", async () => {
    const packageSize = (2 * 1024 * 1024) + 1;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse({ sizeEncrypted: packageSize }))
      .mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array(packageSize)));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const fullBlock = fetchMock.mock.calls[1][1]?.body as Uint8Array;
    const partialBlock = fetchMock.mock.calls[3][1]?.body as Uint8Array;
    expect(fullBlock).toBeInstanceOf(Uint8Array);
    expect(fullBlock.byteLength).toBe(1024 * 1024);
    expect(partialBlock.byteLength).toBe(1);
    expect(partialBlock.buffer).toBe(fullBlock.buffer);
  });

  it("retries a transient Azure block failure before committing", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse())
      .mockResolvedValueOnce(new Response(null, { status: 500, statusText: "Transient" }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const responsePromise = POST(createUploadRequest(new Uint8Array([1, 2, 3])));
    await vi.runAllTimersAsync();

    await expect(responsePromise).resolves.toMatchObject({ status: 204 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns a generic error and does not reflect Azure failure details", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse())
      .mockResolvedValue(new Response("<Error>internal detail</Error>", {
        status: 500,
        statusText: "Server Busy secret-signature",
        headers: { "x-ms-error-code": "ServerBusy" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const responsePromise = POST(createUploadRequest(new Uint8Array([1, 2, 3])));
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Azure Storage upload failed." });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("ServerBusy");
    expect(logged).not.toContain("secret-signature");
    expect(logged).not.toContain("graph-access-token");
  });

  it("marks an Azure authorization failure so the client can renew the upload URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse())
      .mockResolvedValueOnce(new Response(null, {
        status: 403,
        headers: { "x-ms-error-code": "AuthenticationFailed" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1, 2, 3])));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Azure Storage rejected the upload signature.",
      code: "azureStorageAuthorizationFailed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an upload request without Microsoft Graph authentication", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const headers: Record<string, string> = { ...authenticatedHeaders };
    delete headers.authorization;
    const response = await POST(createUploadRequest(new Uint8Array([1]), headers));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Microsoft Graph authentication is required.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "/deviceAppManagement/mobileApps/../microsoft.graph.win32LobApp/contentVersions/1/files/file-id",
    "/deviceAppManagement/mobileApps/app-id/microsoft.graph.win32LobApp/contentVersions/../files/file-id",
    "/deviceAppManagement/mobileApps/app-id/microsoft.graph.win32LobApp/contentVersions/1/files/..",
    "/deviceAppManagement/mobileApps/./microsoft.graph.win32LobApp/contentVersions/1/files/file-id",
    "/deviceAppManagement/mobileApps/app-id/microsoft.graph.win32LobApp/contentVersions/1/files/file-id?$expand=x",
    "/users/me",
  ])("rejects the content file endpoint %s without calling Graph", async (endpoint) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1]), {
      ...authenticatedHeaders,
      "x-intune-content-file-endpoint": endpoint,
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a signed URL that does not match the current Intune content file", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(createGraphTargetResponse({
      azureStorageUri: "https://tenant.blob.core.windows.net/other?sig=value",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1])));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "The upload URL does not match the current Intune content target.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-origin upload requests before forwarding content", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createUploadRequest(new Uint8Array([1]), {
      ...authenticatedHeaders,
      origin: "https://untrusted.example",
    }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the configured public origin when Vercel uses an immutable request host", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_MSAL_REDIRECT_URI",
      "https://intune-hydration-kit-web-app-git-dev.example.vercel.app/"
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request(
      "https://intune-hydration-kit-web-immutable.example.vercel.app/api/win32-upload",
      {
        method: "POST",
        headers: {
          ...authenticatedHeaders,
          origin: "https://intune-hydration-kit-web-app-git-dev.example.vercel.app",
          "x-intune-upload-url": "https://example.com/package",
        },
        body: new Uint8Array([1]),
      }
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Intune upload URL." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
