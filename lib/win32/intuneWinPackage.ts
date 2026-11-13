import { readStoredZipEntries } from "@/lib/win32/storedZip";

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

const textDecoder = new TextDecoder();

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
    encryptedContent: new Blob([encryptedContent.content]),
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
