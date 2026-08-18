import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // App routes are auth-gated, thin, and hold no SEO value.
      disallow: ["/wizard", "/dashboard"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    // The `host` directive expects a bare hostname (no scheme).
    host: new URL(SITE_URL).host,
  };
}
