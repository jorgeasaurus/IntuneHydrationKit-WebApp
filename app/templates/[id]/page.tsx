import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { notFound } from "next/navigation";
import { TemplateDetailPage } from "@/components/templates/TemplateDetailPage";
import {
  getServerTemplateBySlug,
  getServerWinGetCatalogApp,
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

  const [result, winGetApp] = await Promise.all([
    loadServerTemplatePayload(item),
    getServerWinGetCatalogApp(item),
  ]);
  if (result.status === "error") {
    // Every payload is a bundled file. At build time a missing file is a packaging
    // error, so the build stops. In other renders (for example `next dev`), the page
    // shows its "could not load" state instead of an error page.
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
      throw new Error(`Template payload for ${item.slug} did not load: ${result.error}`);
    }

    console.error(`[templates] Payload for ${item.slug} did not load: ${result.error}`);
    return <TemplateDetailPage item={item} payload={null} winGetApp={winGetApp} />;
  }

  return <TemplateDetailPage item={item} payload={result.payload} winGetApp={winGetApp} />;
}
