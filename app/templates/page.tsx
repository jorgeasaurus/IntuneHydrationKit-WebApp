import type { Metadata } from "next";
import { TemplateCatalogPage } from "@/components/templates/TemplateCatalogPage";

export const metadata: Metadata = {
  title: "Template Catalog",
  description:
    "Browse every importable Intune Hydration Kit template and inspect import-ready JSON payloads and Win32 wrapper scripts.",
  alternates: {
    canonical: "/templates",
  },
};

export default function TemplatesPage() {
  return <TemplateCatalogPage />;
}
