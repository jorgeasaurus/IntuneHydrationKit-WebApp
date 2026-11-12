import type { Metadata } from "next";
import { TemplateCatalogPage } from "@/components/templates/TemplateCatalogPage";

const TITLE = "Template Catalog";
const SOCIAL_TITLE = "Template Catalog | Intune Hydration Kit";
const DESCRIPTION =
  "Browse every importable Intune Hydration Kit template and inspect import-ready JSON payloads and Win32 wrapper scripts.";
const SOCIAL_IMAGE = {
  url: "/SocialCard.jpg",
  width: 1200,
  height: 630,
  alt: "Intune Hydration Kit social preview card",
};

// Next.js replaces the root openGraph and twitter objects instead of merging
// them, so this page declares every field it needs.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/templates",
  },
  openGraph: {
    type: "website",
    url: "/templates",
    siteName: "Intune Hydration Kit",
    title: SOCIAL_TITLE,
    description: DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: DESCRIPTION,
    images: [SOCIAL_IMAGE.url],
  },
};

export default function TemplatesPage() {
  return <TemplateCatalogPage />;
}
