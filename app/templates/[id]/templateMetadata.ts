import type { Metadata } from "next";
import { getTemplatePath, type TemplateDocumentationItem } from "@/lib/templates/catalog";

const MAX_DESCRIPTION_LENGTH = 160;
const SOCIAL_IMAGE = {
  url: "/SocialCard.jpg",
  width: 1200,
  height: 630,
  alt: "Intune Hydration Kit social preview card",
};

/** Returns the meta description for a template detail page. */
export function getTemplateMetaDescription(item: TemplateDocumentationItem): string {
  const platform = item.platform ? `${item.platform} ` : "";
  const text = `${item.categoryLabel}: ${platform}${item.itemType} template. ${item.description}`;

  return text.length > MAX_DESCRIPTION_LENGTH
    ? `${text.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`
    : text;
}

/** Builds the page metadata for a template. Next.js replaces the root openGraph and twitter objects, so this sets every field. */
export function buildTemplateMetadata(item: TemplateDocumentationItem): Metadata {
  const path = getTemplatePath(item);
  const description = getTemplateMetaDescription(item);
  const socialTitle = `${item.displayName} | Intune Hydration Kit`;

  return {
    title: item.displayName,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      siteName: "Intune Hydration Kit",
      title: socialTitle,
      description,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [SOCIAL_IMAGE.url],
    },
  };
}
