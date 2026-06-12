/* oxlint-disable react-doctor/no-danger -- JSON-LD requires raw script
   content. The schema is hardcoded except for `siteUrl`, which is env-derived,
   so `schemaJson` escapes every `<` into a unicode escape to make a
   `</script>` breakout impossible regardless of the configured value. */
import { SITE_URL as siteUrl } from "@/lib/siteUrl";

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
  image: `${siteUrl}/SocialCard.jpg`,
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

// Escape `<` so a stray `</script>` in any value cannot terminate the script
// tag early. The unicode escape is still valid JSON-LD.
const schemaJson = JSON.stringify(schema).replace(/</g, "\\u003c");

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
