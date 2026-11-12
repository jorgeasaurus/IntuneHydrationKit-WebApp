import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // Crawlers must be able to fetch /wizard and /dashboard to read their
      // `noindex` metadata. A robots.txt disallow hides that metadata.
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
