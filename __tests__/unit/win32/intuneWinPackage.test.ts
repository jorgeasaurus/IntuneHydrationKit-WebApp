import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";

describe("readIntuneWinPackage", () => {
  it("reads the supplied 7-Zip package metadata and encrypted content", async () => {
    const packageBytes = readFileSync(
      join(process.cwd(), "public/win32-apps/7zip-25.01.intunewin")
    );
    const packageFile = await readIntuneWinPackage(
      packageBytes.buffer.slice(
        packageBytes.byteOffset,
        packageBytes.byteOffset + packageBytes.byteLength
      ) as ArrayBuffer
    );

    expect(packageFile.encryptedContentName).toBe("IntunePackage.intunewin");
    expect(packageFile.encryptedContent.size).toBe(2315712);
    expect(packageFile.unencryptedContentSize).toBe(2315651);
    expect(packageFile.encryptionInfo).toMatchObject({
      profileIdentifier: "ProfileVersion1",
      fileDigestAlgorithm: "SHA256",
    });
  });
});
