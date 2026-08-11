export interface IntuneWinEncryptionInfo {
  encryptionKey: string;
  macKey: string;
  initializationVector: string;
  mac: string;
  profileIdentifier: string;
  fileDigest: string;
  fileDigestAlgorithm: string;
}

export interface IntuneWinPackage {
  encryptedContent: Blob;
  encryptedContentName: string;
  setupFile: string;
  unencryptedContentSize: number;
  encryptionInfo: IntuneWinEncryptionInfo;
}

interface ZipEntry {
  name: string;
  content: Uint8Array;
}

const LOCAL_FILE_HEADER = 0x04034b50;
const textDecoder = new TextDecoder();

function readStoredZipEntries(packageBytes: ArrayBuffer): ZipEntry[] {
  const view = new DataView(packageBytes);
  const bytes = new Uint8Array(packageBytes);
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= view.byteLength && view.getUint32(offset, true) === LOCAL_FILE_HEADER) {
    const flags = view.getUint16(offset + 6, true);
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);

    if ((flags & 0x08) !== 0 || compressionMethod !== 0) {
      throw new Error(
        "The supplied .intunewin package must contain stored (uncompressed) ZIP entries without data descriptors."
      );
    }

    const contentStart = offset + 30 + nameLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    if (contentEnd > view.byteLength) {
      throw new Error("The supplied .intunewin package is truncated.");
    }

    entries.push({
      name: textDecoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength)),
      content: bytes.slice(contentStart, contentEnd),
    });
    offset = contentEnd;
  }

  return entries;
}

function requiredXmlValue(document: XMLDocument, tagName: string): string {
  const value = document.querySelector(tagName)?.textContent?.trim();
  if (!value) {
    throw new Error(`The supplied .intunewin package is missing ${tagName} metadata.`);
  }
  return value;
}

function requiredPositiveInteger(document: XMLDocument, tagName: string): number {
  const value = Number(requiredXmlValue(document, tagName));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`The supplied .intunewin package has invalid ${tagName} metadata.`);
  }
  return value;
}

function isBlob(file: Blob | ArrayBuffer): file is Blob {
  return "arrayBuffer" in file && typeof file.arrayBuffer === "function";
}

export async function readIntuneWinPackage(file: Blob | ArrayBuffer): Promise<IntuneWinPackage> {
  const packageBytes = isBlob(file) ? await file.arrayBuffer() : file;
  const entries = readStoredZipEntries(packageBytes);
  const detectionEntry = entries.find((entry) => entry.name.endsWith("/Detection.xml"));
  if (!detectionEntry) {
    throw new Error("Detection.xml was not found in the supplied .intunewin package.");
  }

  const document = new DOMParser().parseFromString(textDecoder.decode(detectionEntry.content), "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("The supplied .intunewin package contains invalid Detection.xml metadata.");
  }

  const encryptedContentName = requiredXmlValue(document, "FileName");
  const encryptedContent = entries.find((entry) => entry.name.endsWith(`/${encryptedContentName}`));
  if (!encryptedContent) {
    throw new Error(`The supplied .intunewin package is missing ${encryptedContentName}.`);
  }

  return {
    encryptedContent: new Blob([
      encryptedContent.content.buffer.slice(
        encryptedContent.content.byteOffset,
        encryptedContent.content.byteOffset + encryptedContent.content.byteLength
      ) as ArrayBuffer,
    ]),
    encryptedContentName,
    setupFile: requiredXmlValue(document, "SetupFile"),
    unencryptedContentSize: requiredPositiveInteger(document, "UnencryptedContentSize"),
    encryptionInfo: {
      encryptionKey: requiredXmlValue(document, "EncryptionKey"),
      macKey: requiredXmlValue(document, "MacKey"),
      initializationVector: requiredXmlValue(document, "InitializationVector"),
      mac: requiredXmlValue(document, "Mac"),
      profileIdentifier: requiredXmlValue(document, "ProfileIdentifier"),
      fileDigest: requiredXmlValue(document, "FileDigest"),
      fileDigestAlgorithm: requiredXmlValue(document, "FileDigestAlgorithm"),
    },
  };
}
