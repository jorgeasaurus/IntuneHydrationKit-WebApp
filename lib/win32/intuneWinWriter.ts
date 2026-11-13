/**
 * Create an Intune Win32 app package (.intunewin) in the browser with the Web Crypto API.
 *
 * The format is the same as the one that the IntuneHydrationKit PowerShell module
 * (Private/WinGet/New-IntuneWinPackage.ps1) and the Microsoft Win32 Content Prep Tool make:
 *
 *   outer ZIP (stored entries, no data descriptors)
 *     IntuneWinPackage/Contents/IntunePackage.intunewin
 *         HMAC-SHA256 (32 bytes) | IV (16 bytes) | AES-256-CBC (PKCS#7) ciphertext of the content ZIP
 *         The HMAC uses a separate random MAC key and covers IV | ciphertext.
 *     IntuneWinPackage/Metadata/Detection.xml
 *         Keys, IV, MAC, and the SHA-256 digest of the content ZIP, all base64.
 *
 * The encryption steps follow intunewin.ts of AutopilotBranding by Michael Niehaus
 * (https://github.com/mtniehaus/AutopilotBranding, MIT License, Copyright (c) Michael Niehaus).
 */

import { bytesToBase64 } from "@/lib/utils/base64";
import { writeStoredZip } from "@/lib/win32/storedZip";

/** The largest package that /api/win32-upload accepts. */
export const MAX_WIN32_UPLOAD_BYTES = 4 * 1024 * 1024;
export const INTUNEWIN_CONTENT_ENTRY = "IntuneWinPackage/Contents/IntunePackage.intunewin";
export const INTUNEWIN_DETECTION_ENTRY = "IntuneWinPackage/Metadata/Detection.xml";
const ENCRYPTED_FILE_NAME = "IntunePackage.intunewin";
/** The ToolVersion that the PowerShell module packager writes. */
const TOOL_VERSION = "1.4.0.0";
const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

export interface IntuneWinOptions {
  /** Name element of Detection.xml (the PowerShell packager uses the app display name). */
  name: string;
  /** Setup file at the root of the content ZIP, for example AutopilotBranding.ps1. */
  setupFile: string;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("The Web Crypto API is not available. Open the app over HTTPS or on localhost.");
  }
  return subtle;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** Detection.xml with the same structure, indentation, and line ends as the PowerShell packager. */
function formatDetectionXml(fields: {
  name: string;
  unencryptedContentSize: number;
  setupFile: string;
  encryptionKey: string;
  macKey: string;
  initializationVector: string;
  mac: string;
  fileDigest: string;
}): string {
  return [
    `<ApplicationInfo ToolVersion="${TOOL_VERSION}">`,
    `  <Name>${escapeXml(fields.name)}</Name>`,
    `  <UnencryptedContentSize>${fields.unencryptedContentSize}</UnencryptedContentSize>`,
    `  <FileName>${ENCRYPTED_FILE_NAME}</FileName>`,
    `  <SetupFile>${escapeXml(fields.setupFile)}</SetupFile>`,
    "  <EncryptionInfo>",
    `    <EncryptionKey>${fields.encryptionKey}</EncryptionKey>`,
    `    <MacKey>${fields.macKey}</MacKey>`,
    `    <InitializationVector>${fields.initializationVector}</InitializationVector>`,
    `    <Mac>${fields.mac}</Mac>`,
    "    <ProfileIdentifier>ProfileVersion1</ProfileIdentifier>",
    `    <FileDigest>${fields.fileDigest}</FileDigest>`,
    "    <FileDigestAlgorithm>SHA256</FileDigestAlgorithm>",
    "  </EncryptionInfo>",
    "</ApplicationInfo>",
  ].join("\r\n");
}

/**
 * Encrypt a content ZIP and wrap it as a .intunewin package. Each call makes a new random
 * encryption key, MAC key, and IV.
 */
export async function createIntuneWinPackage(
  contentZip: Uint8Array<ArrayBuffer>,
  options: IntuneWinOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  if (contentZip.length === 0) throw new Error("The package content is empty.");
  if (!options.setupFile || options.setupFile.includes("/") || options.setupFile.includes("\\")) {
    throw new Error("The setup file must be a file name at the root of the package content.");
  }
  const subtle = getSubtleCrypto();
  const encryptionKey = randomBytes(32);
  const macKey = randomBytes(32);
  const iv = randomBytes(16);

  const aesKey = await subtle.importKey("raw", encryptionKey, { name: "AES-CBC" }, false, ["encrypt"]);
  // Web Crypto AES-CBC always adds PKCS#7 padding.
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv }, aesKey, contentZip));

  const encrypted = new Uint8Array(32 + iv.length + ciphertext.length);
  encrypted.set(iv, 32);
  encrypted.set(ciphertext, 32 + iv.length);
  const hmacKey = await subtle.importKey("raw", macKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await subtle.sign("HMAC", hmacKey, encrypted.subarray(32)));
  encrypted.set(mac, 0);

  const fileDigest = new Uint8Array(await subtle.digest("SHA-256", contentZip));
  const detectionXml = formatDetectionXml({
    name: options.name,
    unencryptedContentSize: contentZip.length,
    setupFile: options.setupFile,
    encryptionKey: bytesToBase64(encryptionKey),
    macKey: bytesToBase64(macKey),
    initializationVector: bytesToBase64(iv),
    mac: bytesToBase64(mac),
    fileDigest: bytesToBase64(fileDigest),
  });
  const xmlBytes = new TextEncoder().encode(detectionXml);
  // The PowerShell packager writes Detection.xml as UTF-8 with a byte order mark.
  const detection = new Uint8Array(UTF8_BOM.length + xmlBytes.length);
  detection.set(UTF8_BOM, 0);
  detection.set(xmlBytes, UTF8_BOM.length);

  return writeStoredZip([
    { name: INTUNEWIN_CONTENT_ENTRY, content: encrypted },
    { name: INTUNEWIN_DETECTION_ENTRY, content: detection },
  ]);
}
