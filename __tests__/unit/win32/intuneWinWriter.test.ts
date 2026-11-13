import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import {
  createIntuneWinPackage,
  INTUNEWIN_CONTENT_ENTRY,
  INTUNEWIN_DETECTION_ENTRY,
} from "@/lib/win32/intuneWinWriter";
import { crc32, readStoredZipEntries, writeStoredZip } from "@/lib/win32/storedZip";

const encoder = new TextEncoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function xmlValue(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  if (!match) throw new Error(`Missing ${tag}`);
  return match[1];
}

/** Decrypt a package with node:crypto and the keys in its Detection.xml, and check the MAC and digest. */
function openPackage(packageBytes: Uint8Array) {
  const outer = readStoredZipEntries(toArrayBuffer(packageBytes));
  expect(outer.map((entry) => entry.name)).toEqual([INTUNEWIN_CONTENT_ENTRY, INTUNEWIN_DETECTION_ENTRY]);
  const detectionBytes = Buffer.from(outer[1].content);
  const xml = detectionBytes.toString("utf8").replace(/^﻿/, "");
  const encrypted = Buffer.from(outer[0].content);

  const key = Buffer.from(xmlValue(xml, "EncryptionKey"), "base64");
  const macKey = Buffer.from(xmlValue(xml, "MacKey"), "base64");
  const iv = Buffer.from(xmlValue(xml, "InitializationVector"), "base64");
  const mac = Buffer.from(xmlValue(xml, "Mac"), "base64");
  expect(key).toHaveLength(32);
  expect(macKey).toHaveLength(32);
  expect(iv).toHaveLength(16);

  expect(encrypted.subarray(0, 32).equals(mac)).toBe(true);
  expect(encrypted.subarray(32, 48).equals(iv)).toBe(true);
  expect(createHmac("sha256", macKey).update(encrypted.subarray(32)).digest().equals(mac)).toBe(true);

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const contentZip = Buffer.concat([decipher.update(encrypted.subarray(48)), decipher.final()]);
  expect(Number(xmlValue(xml, "UnencryptedContentSize"))).toBe(contentZip.length);
  expect(createHash("sha256").update(contentZip).digest("base64")).toBe(xmlValue(xml, "FileDigest"));
  return { xml, detectionBytes, contentZip, key, macKey, iv };
}

describe("stored ZIP writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes stored entries that the reader and unzip accept", () => {
    const zip = writeStoredZip([
      { name: "AutopilotBranding.ps1", content: encoder.encode("Write-Output 'run'") },
      { name: "AutopilotBranding/Tasks/a.ps1", content: encoder.encode("a") },
      { name: "empty.txt", content: new Uint8Array() },
    ]);
    const entries = readStoredZipEntries(toArrayBuffer(zip));
    expect(entries.map((entry) => [entry.name, new TextDecoder().decode(entry.content)])).toEqual([
      ["AutopilotBranding.ps1", "Write-Output 'run'"],
      ["AutopilotBranding/Tasks/a.ps1", "a"],
      ["empty.txt", ""],
    ]);

    const folder = mkdtempSync(join(tmpdir(), "ihk-zip-"));
    try {
      const path = join(folder, "test.zip");
      writeFileSync(path, zip);
      // unzip -t checks the CRC-32 of each entry and the central directory.
      expect(execFileSync("unzip", ["-t", path], { encoding: "utf8" })).toContain("No errors detected");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("rejects entry names that are not relative paths, and duplicates", () => {
    const content = new Uint8Array([1]);
    expect(() => writeStoredZip([{ name: "../a", content }])).toThrow("relative path");
    expect(() => writeStoredZip([{ name: "/a", content }])).toThrow("relative path");
    expect(() => writeStoredZip([{ name: "a\\b", content }])).toThrow("relative path");
    expect(() => writeStoredZip([{ name: "a", content }, { name: "a", content }])).toThrow("more than once");
  });
});

describe("createIntuneWinPackage", () => {
  const contentZip = writeStoredZip([
    { name: "AutopilotBranding.json", content: encoder.encode('{"Version":1}') },
    { name: "AutopilotBranding.ps1", content: encoder.encode("Write-Output 'run'") },
  ]);

  it("encrypts the content zip so that it decrypts with the keys in Detection.xml", async () => {
    const packageBytes = await createIntuneWinPackage(contentZip, {
      name: "Autopilot Branding",
      setupFile: "AutopilotBranding.ps1",
    });
    const opened = openPackage(packageBytes);

    expect(Buffer.from(contentZip).equals(opened.contentZip)).toBe(true);
    expect(readStoredZipEntries(toArrayBuffer(opened.contentZip)).map((entry) => entry.name)).toEqual([
      "AutopilotBranding.json",
      "AutopilotBranding.ps1",
    ]);
  });

  it("is accepted by the package reader with the right setup file", async () => {
    const packageBytes = await createIntuneWinPackage(contentZip, {
      name: "Autopilot Branding",
      setupFile: "AutopilotBranding.ps1",
    });
    const packageFile = await readIntuneWinPackage(toArrayBuffer(packageBytes));
    const opened = openPackage(packageBytes);

    expect(packageFile.setupFile).toBe("AutopilotBranding.ps1");
    expect(packageFile.encryptedContentName).toBe("IntunePackage.intunewin");
    expect(packageFile.unencryptedContentSize).toBe(contentZip.length);
    expect(packageFile.encryptedContent.size).toBe(48 + Math.ceil((contentZip.length + 1) / 16) * 16);
    expect(packageFile.encryptionInfo).toEqual({
      encryptionKey: opened.key.toString("base64"),
      macKey: opened.macKey.toString("base64"),
      initializationVector: opened.iv.toString("base64"),
      mac: xmlValue(opened.xml, "Mac"),
      profileIdentifier: "ProfileVersion1",
      fileDigest: xmlValue(opened.xml, "FileDigest"),
      fileDigestAlgorithm: "SHA256",
    });
  });

  it("writes Detection.xml with the same structure as the prebuilt packages", async () => {
    const packageBytes = await createIntuneWinPackage(contentZip, {
      name: "Autopilot Branding",
      setupFile: "AutopilotBranding.ps1",
    });
    const generated = openPackage(packageBytes).detectionBytes;
    const prebuiltPackage = readFileSync(join(process.cwd(), "public/win32-apps/autopilot-branding.intunewin"));
    const prebuilt = Buffer.from(
      readStoredZipEntries(toArrayBuffer(prebuiltPackage)).find((entry) => entry.name === INTUNEWIN_DETECTION_ENTRY)!
        .content,
    );
    const shape = (xml: Buffer) =>
      xml
        .toString("utf8")
        .replace(/>[A-Za-z0-9+/=]+</g, ">VALUE<")
        .replace(/>[0-9]+</g, ">VALUE<");

    // Same byte order mark, CRLF line ends, indentation, elements, and order. Only the values differ.
    expect(generated.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(shape(generated)).toBe(shape(prebuilt));
  });

  it("uses new random keys and IV for each package", async () => {
    const options = { name: "Autopilot Branding", setupFile: "AutopilotBranding.ps1" };
    const first = openPackage(await createIntuneWinPackage(contentZip, options));
    const second = openPackage(await createIntuneWinPackage(contentZip, options));

    expect(first.key.equals(second.key)).toBe(false);
    expect(first.macKey.equals(second.macKey)).toBe(false);
    expect(first.iv.equals(second.iv)).toBe(false);
  });

  it("rejects empty content and a setup file in a folder", async () => {
    await expect(createIntuneWinPackage(new Uint8Array(), { name: "x", setupFile: "a.ps1" })).rejects.toThrow("empty");
    await expect(createIntuneWinPackage(contentZip, { name: "x", setupFile: "dir/a.ps1" })).rejects.toThrow("root");
  });
});
