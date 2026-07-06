import { existsSync } from "node:fs";
import path from "node:path";

import cisManifest from "@/public/CISIntuneBaselines/manifest.json";
import manifest from "@/public/IntuneTemplates/OpenIntuneBaseline/manifest.json";
import { describe, expect, it } from "vitest";

describe("OpenIntuneBaseline manifest parity", () => {
  it("matches the expected PowerShell inventory and BYOD metadata", () => {
    expect(manifest.totalFiles).toBe(98);

    expect(
      Object.fromEntries(manifest.platforms.map((platform) => [platform.id, platform.count]))
    ).toEqual({
      BYOD: 2,
      MACOS: 20,
      WINDOWS: 73,
      WINDOWS365: 3,
    });

    expect(manifest.platforms.find((platform) => platform.id === "BYOD")?.name).toBe(
      "BYOD (Bring Your Own Device)"
    );
  });

  it("references public template filenames that exist", () => {
    const manifests = [
      {
        root: "public/IntuneTemplates/OpenIntuneBaseline",
        files: manifest.files,
      },
      {
        root: "public/CISIntuneBaselines",
        files: cisManifest.files,
      },
    ];

    for (const { root, files } of manifests) {
      for (const file of files) {
        expect(existsSync(path.join(process.cwd(), root, file.path))).toBe(true);
      }
    }
  });
});
