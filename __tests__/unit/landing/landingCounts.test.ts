import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONFIGURATION_GROUPS,
  HERO_STATS,
  LANDING_TEMPLATE_COUNTS,
  LANDING_TEMPLATE_TOTAL,
  MOBILE_RUN_STEPS,
} from "@/components/landing/landingContent";
import { loadTemplateDocumentationCatalog } from "@/lib/templates/catalog";

describe("landing template counts", () => {
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

  it("match the bundled template catalog for each category", async () => {
    const catalog = await loadTemplateDocumentationCatalog();
    const catalogCounts = Object.fromEntries(
      catalog.categories.map((category) => [category.id, category.count])
    );

    expect(LANDING_TEMPLATE_COUNTS).toEqual(catalogCounts);
    expect(LANDING_TEMPLATE_TOTAL).toBe(catalog.totalCount);
  });

  it("use the catalog total in the hero and mobile run preview", () => {
    const total = LANDING_TEMPLATE_TOTAL.toLocaleString("en-US");

    expect(HERO_STATS[0]).toEqual({ value: total, label: "deployable objects" });
    expect(MOBILE_RUN_STEPS[0].value).toBe(`${total} objects`);
  });

  it("cover every catalog object exactly once in the configuration groups", () => {
    const countedGroups = CONFIGURATION_GROUPS.filter((group) => group.unit !== "controls");

    for (const group of countedGroups) {
      const itemTotal = group.items.reduce(
        (total, item) => total + (typeof item.value === "number" ? item.value : 0),
        0
      );
      expect(itemTotal, group.title).toBe(group.total);
    }

    expect(countedGroups.reduce((total, group) => total + group.total, 0)).toBe(
      LANDING_TEMPLATE_TOTAL
    );
  });
});
