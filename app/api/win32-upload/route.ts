import { NextResponse } from "next/server";

const MAX_PACKAGE_SIZE_BYTES = 10 * 1024 * 1024;
const BLOCK_SIZE_BYTES = 6 * 1024 * 1024;

export const runtime = "nodejs";

function isAzureBlobUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.core.windows.net");
  } catch {
    return false;
  }
}

function appendAzureQuery(uploadUrl: string, query: string): string {
  return `${uploadUrl}${uploadUrl.includes("?") ? "&" : "?"}${query}`;
}

function createBlockId(index: number): string {
  return Buffer.from(String(index).padStart(4, "0"), "ascii").toString("base64");
}

async function uploadBlock(uploadUrl: string, blockId: string, content: ArrayBuffer): Promise<void> {
  const response = await fetch(
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
  const response = await fetch(appendAzureQuery(uploadUrl, "comp=blocklist"), {
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
  if (packageContent.byteLength === 0 || packageContent.byteLength > MAX_PACKAGE_SIZE_BYTES) {
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
