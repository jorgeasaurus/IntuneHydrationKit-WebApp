import Link from "next/link";
import { ArrowLeft, FileCode2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { PowerShellScriptPanel } from "@/components/templates/PowerShellScriptPanel";
import {
  CopyElementTextButton,
  CopyLinkButton,
} from "@/components/templates/TemplateCopyButtons";
import {
  getPayloadODataType,
  summarizeTemplateSettings,
  type TemplateSettingsSummary,
} from "@/components/templates/templateSettingsSummary";
import {
  getTemplateFilePath,
  getTemplateSourceLabel,
  type TemplateDocumentationItem,
} from "@/lib/templates/catalog";

interface TemplateDetailPageProps {
  item: TemplateDocumentationItem;
  /** The import-ready payload, or null when the payload could not load. */
  payload: unknown;
}

const JSON_ELEMENT_ID = "template-json";

const WIN32_SCRIPTS = [
  { key: "detectionScriptContent", title: "Detection script" },
  { key: "installScriptContent", title: "Install script" },
  { key: "uninstallScriptContent", title: "Uninstall script" },
] as const;

function getWin32Scripts(payload: unknown): Array<{ key: string; title: string; content: string }> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  return WIN32_SCRIPTS.flatMap(({ key, title }) => {
    const content = record[key];
    return typeof content === "string" ? [{ key, title, content }] : [];
  });
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/60 bg-black/20 p-4">
      <dt className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

/** Shows the subcategory only when it adds a label that the page does not show already. */
function showSubcategory(item: TemplateDocumentationItem): boolean {
  const subcategory = item.subcategory?.toLowerCase();
  return Boolean(
    subcategory &&
      subcategory !== item.itemType.toLowerCase() &&
      subcategory !== item.platform?.toLowerCase()
  );
}

function DetailsSection({ item, odataType }: { item: TemplateDocumentationItem; odataType?: string }) {
  const filePath = getTemplateFilePath(item);

  return (
    <section aria-labelledby="template-details-heading" className="space-y-4">
      <h2 id="template-details-heading" className="text-xl font-bold text-foreground">
        Template details
      </h2>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailField label="Category">{item.categoryLabel}</DetailField>
        <DetailField label="Platform">{item.platform ?? "General"}</DetailField>
        <DetailField label="Policy type">{item.itemType}</DetailField>
        <DetailField label="Source">{getTemplateSourceLabel(item)}</DetailField>
        {showSubcategory(item) ? (
          <DetailField label="Subcategory">{item.subcategory}</DetailField>
        ) : null}
        {odataType ? (
          <DetailField label="OData type">
            <span className="font-mono text-xs break-all">{odataType}</span>
          </DetailField>
        ) : null}
      </dl>
      <dl>
        <DetailField label="File path">
          {filePath ? (
            <span className="font-mono text-xs break-all">{filePath}</span>
          ) : (
            "Bundled with the web app"
          )}
        </DetailField>
      </dl>
    </section>
  );
}

function describeSummary(summary: TemplateSettingsSummary): string {
  const count = summary.rows.length;
  const formatted = count.toLocaleString("en-US");
  return summary.kind === "settingsCatalog"
    ? `${formatted} configured setting${count === 1 ? "" : "s"}, listed by setting definition ID.`
    : `${formatted} configured propert${count === 1 ? "y" : "ies"}. Nested values use dotted paths.`;
}

function SettingsSection({
  summary,
  payloadLoaded,
}: {
  summary: TemplateSettingsSummary | null;
  payloadLoaded: boolean;
}) {
  return (
    <section aria-labelledby="template-settings-heading" className="space-y-4">
      <h2 id="template-settings-heading" className="text-xl font-bold text-foreground">
        What this template configures
      </h2>
      {summary ? (
        <>
          <p className="text-sm leading-6 text-muted-foreground">{describeSummary(summary)}</p>
          <dl className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-black/20">
            {summary.rows.map((row) => (
              <div
                key={row.key}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr),minmax(0,1fr)] sm:gap-4"
              >
                <dt className="min-w-0 break-all font-mono text-xs leading-5 text-muted-foreground">
                  {row.entry ? (
                    <span className="block text-foreground/80">In {row.entry}</span>
                  ) : null}
                  {row.label}
                </dt>
                <dd className="min-w-0 break-words text-sm font-medium text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          {payloadLoaded
            ? "No summary is available for this template shape. The JSON below shows every value."
            : "No summary is available because the payload for this template could not load."}
        </p>
      )}
    </section>
  );
}

function ScriptsSection({ scripts }: { scripts: ReturnType<typeof getWin32Scripts> }) {
  return (
    <section aria-labelledby="template-scripts-heading" className="space-y-4">
      <h2 id="template-scripts-heading" className="text-xl font-bold text-foreground">
        Wrapper scripts
      </h2>
      {scripts.map((script) => (
        <PowerShellScriptPanel
          key={script.key}
          id={`template-script-${script.key}`}
          title={script.title}
          content={script.content}
          headingLevel="h3"
        />
      ))}
    </section>
  );
}

function JsonSection({ json }: { json: string | null }) {
  return (
    <section aria-labelledby="template-json-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="template-json-heading" className="text-xl font-bold text-foreground">
          Import-ready JSON
        </h2>
        {json ? (
          <CopyElementTextButton
            targetId={JSON_ELEMENT_ID}
            label="Copy JSON"
            successMessage="Template JSON copied to clipboard."
          />
        ) : null}
      </div>
      {json ? (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-[#050816]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs font-mono uppercase tracking-[0.24em] text-slate-300">
            <FileCode2 className="size-3.5" aria-hidden="true" />
            Payload
          </div>
          <pre
            tabIndex={0}
            aria-labelledby="template-json-heading"
            className="max-h-[640px] overflow-auto p-4 text-xs leading-6 text-slate-100 selection:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <code id={JSON_ELEMENT_ID} className="font-mono">
              {json}
            </code>
          </pre>
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          The payload for this template could not load.
        </p>
      )}
    </section>
  );
}

/** Server-rendered detail page for one catalog template. */
export function TemplateDetailPage({ item, payload }: TemplateDetailPageProps) {
  const scripts = getWin32Scripts(payload);
  const json = payload === null || payload === undefined ? null : JSON.stringify(payload, null, 2);

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10">
        <Navigation />

        <main className="pt-24 pb-20">
          <div className="container mx-auto px-4 sm:px-6">
            <article className="mx-auto max-w-5xl space-y-8 rounded-[32px] border border-border/70 bg-background/90 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
              <Link
                href="/templates"
                className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to the template catalog
              </Link>

              <header className="space-y-5 border-b border-border/70 pb-8">
                <p className="text-xs font-mono uppercase tracking-[0.28em] text-muted-foreground">
                  {item.categoryLabel}
                </p>
                <h1 className="break-words text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                  {item.displayName}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground">
                  {item.description}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <CopyLinkButton />
                </div>
              </header>

              <DetailsSection item={item} odataType={getPayloadODataType(payload)} />
              <SettingsSection
                summary={payload === null ? null : summarizeTemplateSettings(payload)}
                payloadLoaded={payload !== null}
              />
              {scripts.length > 0 ? <ScriptsSection scripts={scripts} /> : null}
              <JsonSection json={json} />
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
