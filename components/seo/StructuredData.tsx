/* oxlint-disable react-doctor/no-danger -- JSON-LD requires raw script
   content; `schemaJson` is JSON.stringify of a static, hardcoded object with no
   user or dynamic input, so there is no XSS vector. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.intunehydrationkit.com";

// Static SoftwareApplication schema, built once at module load. Keep values
// aligned with the homepage metadata in app/layout.tsx.
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

const schemaJson = JSON.stringify(schema);

/**
 * SoftwareApplication JSON-LD for the site. Rendered into the initial server
 * HTML (outside MsalProvider, which gates SSR) so crawlers can read the
 * structured data without executing client JS.
 */
export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: schemaJson }}
    />
  );
}
