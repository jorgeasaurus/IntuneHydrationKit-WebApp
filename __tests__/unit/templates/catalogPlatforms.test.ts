import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPlatformFilterOrder,
  loadTemplateDocumentationCatalog,
  TEMPLATE_PLATFORMS,
} from "@/lib/templates/catalog";

describe("template catalog platforms", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const filePath = path.join(process.cwd(), "public", decodeURIComponent(url));
        return new Response(new Uint8Array(readFileSync(filePath)));
      })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("gives every bundled template a canonical platform or none", async () => {
    const catalog = await loadTemplateDocumentationCatalog();
    const platforms = new Set(
      catalog.items.map((item) => item.platform).filter(Boolean)
    );

    for (const platform of platforms) {
      expect(TEMPLATE_PLATFORMS).toContain(platform);
    }
    expect(getPlatformFilterOrder(catalog.items.map((item) => item.platform))).toEqual([
      "Windows",
      "macOS",
      "iOS/iPadOS",
      "Android",
      "Linux",
      "Identity",
    ]);
  });

  it("maps OIB BYOD and Windows 365 folders to device platforms", async () => {
    const catalog = await loadTemplateDocumentationCatalog();
    const baselineItems = catalog.items.filter((item) => item.category === "baseline");
    const byodItems = baselineItems.filter((item) => item.sourcePath?.startsWith("BYOD/"));
    const cloudPcItems = baselineItems.filter((item) =>
      item.sourcePath?.startsWith("WINDOWS365/")
    );

    expect(byodItems.map((item) => item.platform).toSorted()).toEqual([
      "Android",
      "iOS/iPadOS",
    ]);
    expect(byodItems.every((item) => item.subcategory === "BYOD (Bring Your Own Device)")).toBe(
      true
    );
    expect(cloudPcItems.length).toBeGreaterThan(0);
    expect(cloudPcItems.every((item) => item.platform === "Windows")).toBe(true);
    expect(cloudPcItems.every((item) => item.subcategory === "Windows 365 Cloud PC")).toBe(true);
  });

  it("maps Graph device filter platforms to canonical labels", async () => {
    const catalog = await loadTemplateDocumentationCatalog();
    const filterPlatforms = new Set(
      catalog.items.filter((item) => item.category === "filters").map((item) => item.platform)
    );

    expect(filterPlatforms).toEqual(new Set(["Windows", "macOS", "iOS/iPadOS", "Android"]));
  });
});
