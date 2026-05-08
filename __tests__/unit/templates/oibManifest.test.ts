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
});
