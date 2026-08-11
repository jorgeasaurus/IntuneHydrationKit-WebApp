import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/win32-upload/route";

const uploadUrl = "https://tenant.blob.core.windows.net/package?sig=value";
const contentFileEndpoint = "/deviceAppManagement/mobileApps/app-id/microsoft.graph.win32LobApp/contentVersions/content-id/files/file-id";
const authenticatedHeaders = {
  authorization: "Bearer graph-access-token",
  origin: "http://localhost",
  "x-intune-content-file-endpoint": contentFileEndpoint,
  "x-intune-upload-url": uploadUrl,
};

function createGraphTargetResponse(
  azureStorageUri = uploadUrl,
  uploadState = "azureStorageUriRequestSuccess"
): Response {
  return Response.json({ azureStorageUri, uploadState });
}

describe("POST /api/win32-upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("forwards a package only to the signed Azure Blob URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse())
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const content = new Uint8Array([1, 2, 3]);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: authenticatedHeaders,
      body: content,
    }));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://graph.microsoft.com/beta${contentFileEndpoint}?$select=azureStorageUri,uploadState`,
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
        headers: expect.objectContaining({ "Content-Type": "text/plain; charset=UTF-8" }),
        body: '<?xml version="1.0" encoding="utf-8"?><BlockList><Latest>MDAwMDAwMDA=</Latest></BlockList>',
      })
    );
  });

  it("rejects non-Azure upload URLs without issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: { ...authenticatedHeaders, "x-intune-upload-url": "https://example.com/package" },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects packages over the maximum size before reading or forwarding them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        "content-length": String((8 * 1024 * 1024 * 1024) + 1),
      },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts signed Azure Blob URLs for sovereign clouds", async () => {
    const sovereignUploadUrl = "https://tenant.blob.core.usgovcloudapi.net/package?sig=value";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse(sovereignUploadUrl))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        "x-intune-upload-url": sovereignUploadUrl,
      },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uploads packages larger than 10 MB in Azure blocks", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGraphTargetResponse())
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: authenticatedHeaders,
      body: new Uint8Array((10 * 1024 * 1024) + 1),
    }));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const fullBlock = fetchMock.mock.calls[1][1]?.body as Uint8Array;
    const partialBlock = fetchMock.mock.calls[2][1]?.body as Uint8Array;
    expect(fullBlock).toBeInstanceOf(Uint8Array);
    expect(fullBlock.byteLength).toBe(6 * 1024 * 1024);
    expect(partialBlock.byteLength).toBe((4 * 1024 * 1024) + 1);
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

    const responsePromise = POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: authenticatedHeaders,
      body: new Uint8Array([1, 2, 3]),
    }));
    await vi.runAllTimersAsync();

    await expect(responsePromise).resolves.toMatchObject({ status: 204 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects an upload request without Microsoft Graph authentication", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        origin: authenticatedHeaders.origin,
        "x-intune-content-file-endpoint": contentFileEndpoint,
        "x-intune-upload-url": uploadUrl,
      },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Microsoft Graph authentication is required.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a signed URL that does not match the current Intune content file", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createGraphTargetResponse("https://tenant.blob.core.windows.net/other?sig=value")
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: authenticatedHeaders,
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "The upload URL does not match the current Intune content target.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-origin upload requests before forwarding content", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        origin: "https://untrusted.example",
      },
      body: new Uint8Array([1]),
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
          origin: "https://intune-hydration-kit-web-app-git-dev.example.vercel.app",
          authorization: authenticatedHeaders.authorization,
          "x-intune-content-file-endpoint": contentFileEndpoint,
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
