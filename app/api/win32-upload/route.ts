import { NextResponse } from "next/server";

const BLOCK_SIZE_BYTES = 6 * 1024 * 1024;
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5000;
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init);
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
  return Buffer.from(String(index).padStart(4, "0"), "ascii").toString("base64");
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

async function uploadPackageInBlocks(uploadUrl: string, packageContent: ArrayBuffer): Promise<void> {
  const blockIds: string[] = [];
  for (let offset = 0; offset < packageContent.byteLength; offset += BLOCK_SIZE_BYTES) {
    const blockId = createBlockId(blockIds.length);
    blockIds.push(blockId);
    await uploadBlock(uploadUrl, blockId, packageContent.slice(offset, offset + BLOCK_SIZE_BYTES));
  }

  await commitBlockList(uploadUrl, blockIds);
}

export async function POST(request: Request) {
  const uploadUrl = request.headers.get("x-intune-upload-url");
  if (!uploadUrl || !isAzureBlobUploadUrl(uploadUrl)) {
    return NextResponse.json({ error: "Invalid Intune upload URL." }, { status: 400 });
  }

  const packageContent = await request.arrayBuffer();
  if (packageContent.byteLength === 0) {
    return NextResponse.json({ error: "The Win32 package size is not supported." }, { status: 413 });
  }

  try {
    await uploadPackageInBlocks(uploadUrl, packageContent);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Azure Storage upload failed." },
      { status: 502 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
