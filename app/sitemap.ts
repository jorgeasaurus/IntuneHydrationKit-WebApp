import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.intunehydrationkit.com";

export default function sitemap(): MetadataRoute.Sitemap {
  // Intentionally omit `lastModified`: generating `new Date()` per request would
  // claim every URL changed "just now" and trigger needless recrawls. Let search
  // engines rely on their own crawl heuristics instead.
  return [
    {
      url: `${siteUrl}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/templates`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
