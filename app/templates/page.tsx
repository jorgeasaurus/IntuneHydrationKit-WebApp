import type { Metadata } from "next";
import { TemplateCatalogPage } from "@/components/templates/TemplateCatalogPage";

export const metadata: Metadata = {
  title: "Template Catalog | Intune Hydration Kit",
  description:
    "Browse every importable Intune Hydration Kit template and inspect the import-ready JSON payloads.",
};

export default function TemplatesPage() {
  return <TemplateCatalogPage />;
}
