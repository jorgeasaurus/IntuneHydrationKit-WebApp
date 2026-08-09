import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/win32-upload/route";

const sameOriginHeaders = { origin: "http://localhost" };

describe("POST /api/win32-upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("forwards a package only to the signed Azure Blob URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const content = new Uint8Array([1, 2, 3]);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        ...sameOriginHeaders,
        "x-intune-upload-url": "https://tenant.blob.core.windows.net/package?sig=value",
      },
      body: content,
    }));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://tenant.blob.core.windows.net/package?sig=value&comp=block&blockid=MDAwMDAwMDA%3D",
      expect.objectContaining({
        method: "PUT",
        redirect: "manual",
        headers: expect.objectContaining({ "Content-Type": "application/octet-stream" }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://tenant.blob.core.windows.net/package?sig=value&comp=blocklist",
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
      headers: { ...sameOriginHeaders, "x-intune-upload-url": "https://example.com/package" },
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
        ...sameOriginHeaders,
        "content-length": String((8 * 1024 * 1024 * 1024) + 1),
        "x-intune-upload-url": "https://tenant.blob.core.windows.net/package?sig=value",
      },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts signed Azure Blob URLs for sovereign clouds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        ...sameOriginHeaders,
        "x-intune-upload-url": "https://tenant.blob.core.usgovcloudapi.net/package?sig=value",
      },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uploads packages larger than 10 MB in Azure blocks", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        ...sameOriginHeaders,
        "x-intune-upload-url": "https://tenant.blob.core.windows.net/package?sig=value",
      },
      body: new Uint8Array((10 * 1024 * 1024) + 1),
    }));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a transient Azure block failure before committing", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500, statusText: "Transient" }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const responsePromise = POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        ...sameOriginHeaders,
        "x-intune-upload-url": "https://tenant.blob.core.windows.net/package?sig=value",
      },
      body: new Uint8Array([1, 2, 3]),
    }));
    await vi.runAllTimersAsync();

    await expect(responsePromise).resolves.toMatchObject({ status: 204 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects cross-origin upload requests before forwarding content", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: {
        origin: "https://untrusted.example",
        "x-intune-upload-url": "https://tenant.blob.core.windows.net/package?sig=value",
      },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
