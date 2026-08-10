import { NextResponse } from "next/server";

const BLOCK_SIZE_BYTES = 6 * 1024 * 1024;
const MAX_PACKAGE_SIZE_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5000;
const BLOCK_ID_INDEX_WIDTH = 8;
const AZURE_BLOB_HOST_SUFFIXES = [
  ".blob.core.windows.net",
  ".blob.core.usgovcloudapi.net",
  ".blob.core.chinacloudapi.cn",
  ".blob.core.cloudapi.de",
] as const;

export const runtime = "nodejs";

function isAzureBlobUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && AZURE_BLOB_HOST_SUFFIXES.some(
      (suffix) => url.hostname.endsWith(suffix)
    );
  } catch {
    return false;
  }
}

function hasSameOrigin(request: Request): boolean {
  try {
    const requestOrigin = request.headers.get("origin");
    if (!requestOrigin) return false;

    const allowedOrigins = new Set([new URL(request.url).origin]);
    const configuredRedirectUri = process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI;
    if (configuredRedirectUri) {
      allowedOrigins.add(new URL(configuredRedirectUri).origin);
    }

    return allowedOrigins.has(requestOrigin);
  } catch {
    return false;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, redirect: "manual" });
      if (response.ok) return response;
      lastResponse = response;
      if (response.status === 401 || response.status === 403 || attempt === MAX_UPLOAD_ATTEMPTS) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === MAX_UPLOAD_ATTEMPTS) throw error;
    }

    await sleep(RETRY_BASE_DELAY_MS * attempt);
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("Azure Storage request failed.");
}

function appendAzureQuery(uploadUrl: string, query: string): string {
  return `${uploadUrl}${uploadUrl.includes("?") ? "&" : "?"}${query}`;
}

function createBlockId(index: number): string {
  return Buffer.from(String(index).padStart(BLOCK_ID_INDEX_WIDTH, "0"), "ascii").toString("base64");
}

async function uploadBlock(uploadUrl: string, blockId: string, content: ArrayBuffer): Promise<void> {
  const response = await fetchWithRetry(
    appendAzureQuery(uploadUrl, `comp=block&blockid=${encodeURIComponent(blockId)}`),
    {
      method: "PUT",
      headers: {
        "Content-Length": String(content.byteLength),
        "Content-Type": "application/octet-stream",
      },
      body: content,
    }
  );

  if (!response.ok) {
    throw new Error(`Azure Storage block upload failed: ${response.status} ${response.statusText}`);
  }
}

async function commitBlockList(uploadUrl: string, blockIds: string[]): Promise<void> {
  const content = `<?xml version="1.0" encoding="utf-8"?><BlockList>${blockIds
    .map((blockId) => `<Latest>${blockId}</Latest>`)
    .join("")}</BlockList>`;
  const response = await fetchWithRetry(appendAzureQuery(uploadUrl, "comp=blocklist"), {
    method: "PUT",
    headers: {
      "Content-Length": String(Buffer.byteLength(content)),
      "Content-Type": "text/plain; charset=UTF-8",
    },
    body: content,
  });

  if (!response.ok) {
    throw new Error(`Azure Storage block-list commit failed: ${response.status} ${response.statusText}`);
  }
}

async function uploadPackageInBlocks(uploadUrl: string, packageContent: ReadableStream<Uint8Array>): Promise<void> {
  const blockIds: string[] = [];
  const reader = packageContent.getReader();
  const blockBuffer = new Uint8Array(BLOCK_SIZE_BYTES);
  let bufferedByteLength = 0;
  let uploadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    uploadedBytes += value.byteLength;
    if (uploadedBytes > MAX_PACKAGE_SIZE_BYTES) {
      throw new Error("The Win32 package exceeds the maximum supported size of 8 GB.");
    }

    let valueOffset = 0;
    while (valueOffset < value.byteLength) {
      const copyLength = Math.min(
        BLOCK_SIZE_BYTES - bufferedByteLength,
        value.byteLength - valueOffset
      );
      blockBuffer.set(value.subarray(valueOffset, valueOffset + copyLength), bufferedByteLength);
      bufferedByteLength += copyLength;
      valueOffset += copyLength;

      if (bufferedByteLength === BLOCK_SIZE_BYTES) {
        const blockId = createBlockId(blockIds.length);
        blockIds.push(blockId);
        await uploadBlock(uploadUrl, blockId, blockBuffer.slice().buffer);
        bufferedByteLength = 0;
      }
    }
  }

  if (uploadedBytes === 0) {
    throw new Error("The Win32 package is empty.");
  }

  if (bufferedByteLength > 0) {
    const blockId = createBlockId(blockIds.length);
    blockIds.push(blockId);
    await uploadBlock(uploadUrl, blockId, blockBuffer.slice(0, bufferedByteLength).buffer);
  }

  await commitBlockList(uploadUrl, blockIds);
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const uploadUrl = request.headers.get("x-intune-upload-url");
  if (!uploadUrl || !isAzureBlobUploadUrl(uploadUrl)) {
    return NextResponse.json({ error: "Invalid Intune upload URL." }, { status: 400 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_PACKAGE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "The Win32 package exceeds the maximum supported size of 8 GB." },
      { status: 413 }
    );
  }

  if (!request.body) {
    return NextResponse.json({ error: "The Win32 package is empty." }, { status: 400 });
  }

  try {
    await uploadPackageInBlocks(uploadUrl, request.body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Azure Storage upload failed." },
      { status: 502 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
