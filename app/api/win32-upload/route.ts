import { NextResponse } from "next/server";
import { getGraphEndpoint } from "@/lib/graph/endpoints";

/**
 * Relay for Win32 package content.
 *
 * The Intune Azure Storage accounts do not allow cross-origin PUT requests from
 * this site, so the browser cannot write the encrypted package to the signed
 * Azure Blob URL directly. This route receives the package from the browser
 * and writes it to that URL. The caller's Graph token is used only to confirm
 * that the URL is the current Intune upload target for the caller's tenant.
 *
 * Abuse limits are stateless: same-origin check, POST with
 * application/octet-stream only, a body that must equal the encrypted size that
 * the caller declared to Intune for the content file, and an absolute cap below
 * the Vercel request body limit. A real per-caller rate limit needs shared
 * state, for example a Vercel Firewall rate-limit rule on this path or a
 * key-value store keyed on the token tenant ID. This route does not use one.
 */
const BLOCK_SIZE_BYTES = 1024 * 1024;
// Vercel Functions reject request bodies larger than 4.5 MB. The bundled Win32
// packages are approximately 10 KB, so 4 MiB is a large margin.
const MAX_PACKAGE_SIZE_BYTES = 4 * 1024 * 1024;
const PACKAGE_TOO_LARGE_MESSAGE = "The Win32 package exceeds the maximum supported size of 4 MiB.";
const UPLOAD_FAILED_MESSAGE = "Azure Storage upload failed.";
const AZURE_AUTHORIZATION_FAILED_MESSAGE = "Azure Storage rejected the upload signature.";
/** Error code that tells the client to request a renewed upload URI. */
const AZURE_AUTHORIZATION_FAILED_CODE = "azureStorageAuthorizationFailed";
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5000;
const BLOCK_ID_INDEX_WIDTH = 8;
const VALID_UPLOAD_STATES = new Set([
  "azureStorageUriRequestSuccess",
  "azureStorageUriRenewalSuccess",
]);
// Intune app and file IDs are GUIDs and content version IDs are integers. The
// segments do not allow "." so that "." and ".." cannot change the Graph path.
const CONTENT_FILE_ENDPOINT_PATTERN = /^\/deviceAppManagement\/mobileApps\/[A-Za-z0-9-]+\/microsoft\.graph\.win32LobApp\/contentVersions\/[A-Za-z0-9-]+\/files\/[A-Za-z0-9-]+$/;
// The web app supports the Global (commercial) cloud only. Intune in that cloud
// issues upload URLs on the global Azure Blob host.
const AZURE_BLOB_HOST_SUFFIX = ".blob.core.windows.net";

export const runtime = "nodejs";

function isAzureBlobUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(AZURE_BLOB_HOST_SUFFIX);
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
  | { authorized: true; encryptedSize: number }
  | { authorized: false; error: string; status: number };

/** Azure Storage refused the request. The message never contains the signed URL. */
class AzureStorageError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly azureErrorCode: string | null
  ) {
    super(`Azure Storage ${operation} failed with status ${status}.`);
  }

  get isAuthorizationFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** The request body does not agree with the declared package size. */
class PackageSizeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function parseContentLength(value: string | null): number | null | "invalid" {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return "invalid";
  return Number(value);
}

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
    `${getGraphEndpoint()}/beta${contentFileEndpoint}?$select=azureStorageUri,uploadState,sizeEncrypted`,
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
    sizeEncrypted?: number;
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

  const encryptedSize = contentFile.sizeEncrypted;
  if (
    typeof encryptedSize !== "number" ||
    !Number.isSafeInteger(encryptedSize) ||
    encryptedSize <= 0
  ) {
    return {
      authorized: false,
      error: "The Intune content file does not declare a valid encrypted size.",
      status: 403,
    };
  }
  if (encryptedSize > MAX_PACKAGE_SIZE_BYTES) {
    return { authorized: false, error: PACKAGE_TOO_LARGE_MESSAGE, status: 413 };
  }

  return { authorized: true, encryptedSize };
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

function throwIfAzureFailed(operation: string, response: Response): void {
  if (!response.ok) {
    throw new AzureStorageError(operation, response.status, response.headers.get("x-ms-error-code"));
  }
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
  throwIfAzureFailed("block upload", response);
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
  throwIfAzureFailed("block-list commit", response);
}

/**
 * Streams the request body to Azure in blocks. The body must contain exactly
 * `expectedSize` bytes. The relay stops before it forwards a byte past that size.
 */
async function uploadPackageInBlocks(
  uploadUrl: string,
  packageContent: ReadableStream<Uint8Array>,
  expectedSize: number
): Promise<void> {
  const blockIds: string[] = [];
  const reader = packageContent.getReader();
  const blockBuffer = new Uint8Array(BLOCK_SIZE_BYTES);
  let bufferedByteLength = 0;
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    receivedBytes += value.byteLength;
    if (receivedBytes > expectedSize) {
      await reader.cancel().catch(() => undefined);
      throw new PackageSizeError("The Win32 package is larger than its declared size.", 413);
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

  if (receivedBytes !== expectedSize) {
    throw new PackageSizeError("The Win32 package is smaller than its declared size.", 400);
  }

  if (bufferedByteLength > 0) {
    const blockId = createBlockId(blockIds.length);
    blockIds.push(blockId);
    await uploadBlock(uploadUrl, blockId, blockBuffer.subarray(0, bufferedByteLength));
  }

  await commitBlockList(uploadUrl, blockIds);
}

/** Logs a failure without tokens, signed URLs, or upstream response bodies. */
function logUploadFailure(error: unknown): void {
  if (error instanceof AzureStorageError) {
    console.error("[win32-upload] Azure Storage request failed", {
      operation: error.operation,
      status: error.status,
      azureErrorCode: error.azureErrorCode,
    });
    return;
  }
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  console.error("[win32-upload] Upload relay failed", {
    errorName: error instanceof Error ? error.name : typeof error,
    causeCode: typeof cause?.code === "string" ? cause.code : undefined,
  });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/octet-stream") {
    return NextResponse.json(
      { error: "The Win32 package must use the application/octet-stream content type." },
      { status: 415 }
    );
  }

  const uploadUrl = request.headers.get("x-intune-upload-url");
  if (!uploadUrl || !isAzureBlobUploadUrl(uploadUrl)) {
    return NextResponse.json({ error: "Invalid Intune upload URL." }, { status: 400 });
  }

  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength === "invalid") {
    return NextResponse.json({ error: "Invalid Content-Length header." }, { status: 400 });
  }
  if (contentLength !== null && contentLength > MAX_PACKAGE_SIZE_BYTES) {
    return NextResponse.json({ error: PACKAGE_TOO_LARGE_MESSAGE }, { status: 413 });
  }

  if (!request.body || contentLength === 0) {
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
    if (contentLength !== null && contentLength !== authorization.encryptedSize) {
      return NextResponse.json(
        { error: "The Win32 package size does not match the size declared to Intune." },
        { status: 400 }
      );
    }
    await uploadPackageInBlocks(uploadUrl, request.body, authorization.encryptedSize);
  } catch (error) {
    if (error instanceof PackageSizeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logUploadFailure(error);
    if (error instanceof AzureStorageError && error.isAuthorizationFailure) {
      return NextResponse.json(
        { error: AZURE_AUTHORIZATION_FAILED_MESSAGE, code: AZURE_AUTHORIZATION_FAILED_CODE },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: UPLOAD_FAILED_MESSAGE }, { status: 502 });
  }

  return new NextResponse(null, { status: 204 });
}
