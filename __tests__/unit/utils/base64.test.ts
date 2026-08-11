import { describe, expect, it } from "vitest";

import { bytesToBase64, utf8ToBase64 } from "@/lib/utils/base64";

describe("base64 utilities", () => {
  it("encodes byte arrays that span multiple conversion chunks", () => {
    const bytes = Uint8Array.from({ length: (32 * 1024 * 2) + 1 }, (_, index) => index % 256);

    expect(Buffer.from(bytesToBase64(bytes), "base64")).toEqual(Buffer.from(bytes));
  });

  it("preserves UTF-8 script content", () => {
    const script = "Write-Output 'Hydration complete: café'";

    expect(Buffer.from(utf8ToBase64(script), "base64").toString("utf8")).toBe(script);
  });
});
