import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.intunehydrationkit.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // App routes are auth-gated, thin, and hold no SEO value.
      disallow: ["/wizard", "/dashboard", "/results"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    // The `host` directive expects a bare hostname (no scheme).
    host: new URL(siteUrl).host,
  };
}
