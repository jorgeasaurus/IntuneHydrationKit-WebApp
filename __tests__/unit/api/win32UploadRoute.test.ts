import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/win32-upload/route";

describe("POST /api/win32-upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards a package only to the signed Azure Blob URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const content = new Uint8Array([1, 2, 3]);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: { "x-intune-upload-url": "https://tenant.blob.core.windows.net/package?sig=value" },
      body: content,
    }));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://tenant.blob.core.windows.net/package?sig=value&comp=block&blockid=MDAwMA%3D%3D",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "Content-Type": "application/octet-stream" }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://tenant.blob.core.windows.net/package?sig=value&comp=blocklist",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "Content-Type": "text/plain; charset=UTF-8" }),
        body: '<?xml version="1.0" encoding="utf-8"?><BlockList><Latest>MDAwMA==</Latest></BlockList>',
      })
    );
  });

  it("rejects non-Azure upload URLs without issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/win32-upload", {
      method: "POST",
      headers: { "x-intune-upload-url": "https://example.com/package" },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
