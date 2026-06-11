import type { Metadata } from "next";
import { TemplateCatalogPage } from "@/components/templates/TemplateCatalogPage";

export const metadata: Metadata = {
  title: "Template Catalog",
  description:
    "Browse every importable Intune Hydration Kit template and inspect the import-ready JSON payloads.",
  alternates: {
    canonical: "/templates",
  },
};

export default function TemplatesPage() {
  return <TemplateCatalogPage />;
}
