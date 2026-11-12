import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateDetailPage } from "@/components/templates/TemplateDetailPage";
import {
  getServerTemplateBySlug,
  loadServerTemplateCatalog,
  loadServerTemplatePayload,
} from "@/lib/templates/serverCatalog";
import { buildTemplateMetadata } from "./templateMetadata";

interface TemplatePageProps {
  params: Promise<{ id: string }>;
}

// Every catalog item gets a page at build time. Other ids are not valid, so
// Next.js shows the not-found page for them.
export const dynamicParams = false;

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const catalog = await loadServerTemplateCatalog();
  return catalog.items.map((item) => ({ id: item.slug }));
}

export async function generateMetadata({ params }: TemplatePageProps): Promise<Metadata> {
  const { id } = await params;
  const item = await getServerTemplateBySlug(id);
  if (!item) {
    notFound();
  }

  return buildTemplateMetadata(item);
}

export default async function TemplatePage({ params }: TemplatePageProps) {
  const { id } = await params;
  const item = await getServerTemplateBySlug(id);
  if (!item) {
    notFound();
  }

  const payload = await loadServerTemplatePayload(item);
  return <TemplateDetailPage item={item} payload={payload} />;
}
