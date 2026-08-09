import { NextResponse } from "next/server";

const MAX_PACKAGE_SIZE_BYTES = 10 * 1024 * 1024;

function isAzureBlobUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.core.windows.net");
  } catch {
    return false;
  }
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

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(packageContent.byteLength),
      "x-ms-blob-type": "BlockBlob",
    },
    body: packageContent,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Azure Storage upload failed: ${response.status} ${response.statusText}` },
      { status: 502 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
