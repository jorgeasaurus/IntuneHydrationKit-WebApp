const BINARY_STRING_CHUNK_SIZE = 32 * 1024;

export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BINARY_STRING_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(
      offset,
      offset + BINARY_STRING_CHUNK_SIZE
    )));
  }
  return btoa(chunks.join(""));
}

export function utf8ToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}
