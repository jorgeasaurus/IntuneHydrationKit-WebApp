const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.intunehydrationkit.com";

/**
 * SoftwareApplication JSON-LD for the landing page. Rendered into the initial
 * server HTML so crawlers (Google, Bing) can read the structured data without
 * executing client JS. Keep values aligned with the homepage metadata.
 */
export function StructuredData() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Intune Hydration Kit",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Microsoft Intune management",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "Bootstrap Microsoft Intune tenants with OpenIntuneBaseline policies, compliance, and conditional access — deployed via Microsoft Graph with preview mode and safety checks.",
    image: `${siteUrl}/SocialCard.png`,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Organization",
      name: "Intune Hydration Kit",
      url: siteUrl,
    },
    sameAs: ["https://github.com/jorgeasaurus/IntuneHydrationKit"],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inline; no user input is interpolated.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
