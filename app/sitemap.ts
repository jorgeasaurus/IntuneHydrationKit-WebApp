import type { MetadataRoute } from "next";

import { getTemplatePath } from "@/lib/templates/catalog";
import { loadServerTemplateCatalog } from "@/lib/templates/serverCatalog";
import { SITE_URL } from "@/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await loadServerTemplateCatalog();

  // Intentionally omit `lastModified`: generating `new Date()` per request would
  // claim every URL changed "just now" and trigger needless recrawls. Let search
  // engines rely on their own crawl heuristics instead.
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/templates`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...catalog.items.map((item) => ({
      url: `${SITE_URL}${getTemplatePath(item)}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
