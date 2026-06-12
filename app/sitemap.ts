import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/siteUrl";

export default function sitemap(): MetadataRoute.Sitemap {
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
  ];
}
