import { NextResponse } from "next/server";
import { getGraphEndpoint } from "@/lib/graph/endpoints";

const BLOCK_SIZE_BYTES = 6 * 1024 * 1024;
const MAX_PACKAGE_SIZE_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5000;
const BLOCK_ID_INDEX_WIDTH = 8;
const VALID_UPLOAD_STATES = new Set([
  "azureStorageUriRequestSuccess",
  "azureStorageUriRenewalSuccess",
]);
const CONTENT_FILE_ENDPOINT_PATTERN = /^\/deviceAppManagement\/mobileApps\/[A-Za-z0-9._~-]+\/microsoft\.graph\.win32LobApp\/contentVersions\/[A-Za-z0-9._~-]+\/files\/[A-Za-z0-9._~-]+$/;
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

type UploadTargetAuthorization =
  | { authorized: true }
  | { authorized: false; error: string; status: number };

async function authorizeUploadTarget(
  request: Request,
  uploadUrl: string
): Promise<UploadTargetAuthorization> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) {
    return { authorized: false, error: "Microsoft Graph authentication is required.", status: 401 };
  }

  const contentFileEndpoint = request.headers.get("x-intune-content-file-endpoint");
  if (!contentFileEndpoint || !CONTENT_FILE_ENDPOINT_PATTERN.test(contentFileEndpoint)) {
    return { authorized: false, error: "Invalid Intune content file endpoint.", status: 400 };
  }

  const graphResponse = await fetch(
    `${getGraphEndpoint()}/beta${contentFileEndpoint}?$select=azureStorageUri,uploadState`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (graphResponse.status === 401 || graphResponse.status === 403) {
    return {
      authorized: false,
      error: "Microsoft Graph rejected the upload authorization.",
      status: graphResponse.status,
    };
  }
  if (!graphResponse.ok) {
    return { authorized: false, error: "Unable to validate the Intune upload target.", status: 502 };
  }

  const contentFile = await graphResponse.json().catch(() => null) as {
    azureStorageUri?: string;
    uploadState?: string;
  } | null;
  if (
    !contentFile ||
    contentFile.azureStorageUri !== uploadUrl ||
    !contentFile.uploadState ||
    !VALID_UPLOAD_STATES.has(contentFile.uploadState)
  ) {
    return {
      authorized: false,
      error: "The upload URL does not match the current Intune content target.",
      status: 403,
    };
  }

  return { authorized: true };
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

async function uploadBlock(
  uploadUrl: string,
  blockId: string,
  content: Uint8Array<ArrayBuffer>
): Promise<void> {
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
      "Content-Type": "application/xml; charset=UTF-8",
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
        await uploadBlock(uploadUrl, blockId, blockBuffer);
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
    await uploadBlock(uploadUrl, blockId, blockBuffer.subarray(0, bufferedByteLength));
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
    const authorization = await authorizeUploadTarget(request, uploadUrl);
    if (!authorization.authorized) {
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status }
      );
    }
    await uploadPackageInBlocks(uploadUrl, request.body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Azure Storage upload failed." },
      { status: 502 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
