/**
 * Read and write ZIP files that have only stored (uncompressed) entries and no data descriptors.
 * The .intunewin outer package and the Autopilot Branding content file use this format.
 */

export interface StoredZipEntry {
  name: string;
  content: Uint8Array<ArrayBuffer>;
}

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
/** General purpose flag 11: the entry name is UTF-8. */
const UTF8_NAME_FLAG = 0x0800;
const VERSION_NEEDED = 20;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
/** 2026-01-01 00:00:00 in MS-DOS format. A fixed time makes the same content give the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

/** CRC-32 (ISO-HDLC, the ZIP checksum) of the bytes. */
export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Read the entries of a ZIP file. Throws for a compressed entry, a data descriptor, or a truncated file.
 * @param label Name of the file in the error messages.
 */
export function readStoredZipEntries(
  zipBytes: ArrayBuffer,
  label = "The supplied .intunewin package",
): StoredZipEntry[] {
  const view = new DataView(zipBytes);
  const bytes = new Uint8Array(zipBytes);
  const entries: StoredZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= view.byteLength && view.getUint32(offset, true) === LOCAL_FILE_HEADER) {
    const flags = view.getUint16(offset + 6, true);
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);

    if ((flags & 0x08) !== 0 || compressionMethod !== 0) {
      throw new Error(
        `${label} must contain stored (uncompressed) ZIP entries without data descriptors.`
      );
    }

    const contentStart = offset + 30 + nameLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    if (contentEnd > view.byteLength) {
      throw new Error(`${label} is truncated.`);
    }

    entries.push({
      name: textDecoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength)),
      content: bytes.subarray(contentStart, contentEnd),
    });
    offset = contentEnd;
  }

  return entries;
}

function isAscii(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

/**
 * Write a ZIP file with stored entries: local headers with the sizes and CRC-32 (no data
 * descriptors), the central directory, and the end record. ZIP64 is not supported.
 */
export function writeStoredZip(entries: readonly StoredZipEntry[]): Uint8Array<ArrayBuffer> {
  if (entries.length > MAX_UINT16) throw new Error("A stored ZIP file can have at most 65535 entries.");
  const names = entries.map((entry) => textEncoder.encode(entry.name));
  const seenNames = new Set<string>();
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith("/") || entry.name.includes("\\") || entry.name.split("/").includes("..")) {
      throw new Error(`The ZIP entry name "${entry.name}" is not a relative path with forward slashes.`);
    }
    if (seenNames.has(entry.name)) throw new Error(`The ZIP entry name "${entry.name}" is used more than once.`);
    seenNames.add(entry.name);
  }

  const localSize = entries.reduce((total, entry, index) => total + 30 + names[index].length + entry.content.length, 0);
  const centralSize = names.reduce((total, name) => total + 46 + name.length, 0);
  const totalSize = localSize + centralSize + 22;
  if (totalSize > MAX_UINT32) throw new Error("A stored ZIP file must be smaller than 4 GiB.");

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  const localOffsets: number[] = [];
  const checksums = entries.map((entry) => crc32(entry.content));
  let offset = 0;

  entries.forEach((entry, index) => {
    const name = names[index];
    const flags = isAscii(entry.name) ? 0 : UTF8_NAME_FLAG;
    localOffsets.push(offset);
    view.setUint32(offset, LOCAL_FILE_HEADER, true);
    view.setUint16(offset + 4, VERSION_NEEDED, true);
    view.setUint16(offset + 6, flags, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, DOS_TIME, true);
    view.setUint16(offset + 12, DOS_DATE, true);
    view.setUint32(offset + 14, checksums[index], true);
    view.setUint32(offset + 18, entry.content.length, true);
    view.setUint32(offset + 22, entry.content.length, true);
    view.setUint16(offset + 26, name.length, true);
    view.setUint16(offset + 28, 0, true);
    output.set(name, offset + 30);
    output.set(entry.content, offset + 30 + name.length);
    offset += 30 + name.length + entry.content.length;
  });

  const centralStart = offset;
  entries.forEach((entry, index) => {
    const name = names[index];
    const flags = isAscii(entry.name) ? 0 : UTF8_NAME_FLAG;
    view.setUint32(offset, CENTRAL_DIRECTORY_HEADER, true);
    view.setUint16(offset + 4, VERSION_NEEDED, true);
    view.setUint16(offset + 6, VERSION_NEEDED, true);
    view.setUint16(offset + 8, flags, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, DOS_TIME, true);
    view.setUint16(offset + 14, DOS_DATE, true);
    view.setUint32(offset + 16, checksums[index], true);
    view.setUint32(offset + 20, entry.content.length, true);
    view.setUint32(offset + 24, entry.content.length, true);
    view.setUint16(offset + 28, name.length, true);
    // Extra field, comment, disk number, and internal and external attributes are all zero.
    view.setUint32(offset + 42, localOffsets[index], true);
    output.set(name, offset + 46);
    offset += 46 + name.length;
  });

  view.setUint32(offset, END_OF_CENTRAL_DIRECTORY, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return output;
}
