"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FileJson, FileSpreadsheet, Wand2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SensitiveData } from "@/components/SensitiveData";
import { ComparisonBadge, ComparisonDetails, MarkerBadge } from "@/components/drift/ComparisonDetails";
import { getTaskCategoryLabel } from "@/lib/hydration/categoryLabels";
import { generateDriftCSV, generateDriftFilename, generateDriftJSON } from "@/lib/hydration/drift/export";
import {
  getDifferenceNextStep,
  SECTION_NEXT_STEPS,
  type DriftSectionId,
} from "@/lib/hydration/drift/nextSteps";
import type { DriftItem, DriftReport } from "@/lib/hydration/drift/scan";
import { downloadReport } from "@/lib/hydration/reporter";
import { cn } from "@/lib/utils";
import { getPortalLink } from "@/lib/utils/portalLinks";

/** Rows shown in a section before "Show all". */
const ROW_PREVIEW_LIMIT = 25;

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.24em] text-sky-200";
const CHIP = "inline-flex items-center rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em]";

type Tone = "attention" | "neutral" | "good";

const TONE_COUNT: Record<Tone, string> = {
  attention: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  neutral: "border-white/15 bg-white/[0.04] text-slate-200",
  good: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
};

function PortalLinkButton({ item }: { item: DriftItem }): React.JSX.Element | null {
  const link = getPortalLink({
    cloud: "global",
    category: item.category,
    objectId: item.objectId,
    objectName: item.objectName,
  });
  if (!link) return null;
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={link.accessibleName}
      className="inline-flex items-center gap-1 rounded-md text-xs text-sky-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ExternalLink aria-hidden="true" className="size-3.5" />
      {link.label}
    </a>
  );
}

function DriftItemRow({ item, showNextStep }: { item: DriftItem; showNextStep: boolean }): React.JSX.Element {
  const nextStep = showNextStep ? getDifferenceNextStep(item) : null;
  return (
    <li className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium text-slate-50">{item.itemName}</p>
          <p className="mt-1 text-xs text-slate-400">{getTaskCategoryLabel(item.category)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:shrink-0">
          <MarkerBadge marker={item.marker} />
          <ComparisonBadge status={item.comparison.status} />
          {nextStep && (
            <span
              className={cn(
                CHIP,
                nextStep.kind === "kit"
                  ? "border-sky-300/40 bg-sky-300/10 text-sky-100"
                  : "border-white/15 bg-white/[0.04] text-slate-200",
              )}
            >
              {nextStep.label}
            </span>
          )}
        </div>
      </div>
      <ComparisonDetails comparison={item.comparison} />
      {nextStep && <p className="text-xs text-slate-300">{nextStep.text}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span className="break-all font-mono">
          {item.objectName !== item.itemName && <>{item.objectName} · </>}
          {item.objectId}
        </span>
        <PortalLinkButton item={item} />
      </div>
    </li>
  );
}

interface SectionProps {
  id: DriftSectionId;
  title: string;
  count: number;
  tone: Tone;
  /** Link to the wizard, for a section that the wizard can act on. */
  wizardAction?: string;
  children: (limit: number) => React.ReactNode;
}

function Section({ id, title, count, tone, wizardAction, children }: SectionProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false);
  return (
    <AccordionItem value={id} className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/35 px-0">
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline" disabled={count === 0}>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-4">
          <p className="min-w-0 text-left font-medium text-slate-50">{title}</p>
          <span className={cn(CHIP, "shrink-0 tabular-nums", count === 0 ? TONE_COUNT.neutral : TONE_COUNT[tone])}>
            {count}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={EYEBROW}>What you can do</p>
            <p className="mt-1.5 max-w-3xl text-sm text-slate-200">{SECTION_NEXT_STEPS[id]}</p>
          </div>
          {wizardAction && (
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href="/wizard">
                <Wand2 aria-hidden="true" className="mr-2 size-3.5" />
                {wizardAction}
              </Link>
            </Button>
          )}
        </div>
        {children(showAll ? count : ROW_PREVIEW_LIMIT)}
        {count > ROW_PREVIEW_LIMIT && (
          <Button type="button" variant="ghost" size="sm" className="w-full text-slate-300" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show fewer" : `Show all ${count}`}
          </Button>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function Statistic({ label, value, className }: { label: string; value: number; className: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-semibold tabular-nums", className)}>{value}</dd>
    </div>
  );
}

function SimpleRow({ name, detail }: { name: string; detail: string }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <span className="break-words font-medium text-slate-50">{name}</span>
      <span className="break-all text-xs text-slate-400 sm:text-right">{detail}</span>
    </li>
  );
}

/** Result of a drift scan: the receipt, the findings with what to do for each, and the exports. */
export function DriftResult({ report }: { report: DriftReport }): React.JSX.Element {
  const differs = report.kitObjects.filter((item) => item.comparison.status === "differs");
  const cannotCompare = report.kitObjects.filter((item) => item.comparison.status === "cannotCompare");
  const matches = report.kitObjects.filter((item) => item.comparison.status === "matches");
  const notChecked = report.unchecked.length > 0 || report.orphanTypesNotChecked.length > 0;
  const hasDrift = differs.length > 0 || report.missing.length > 0;
  const openByDefault = (["differs", "missing"] as const).filter(
    (id) => (id === "differs" ? differs.length : report.missing.length) > 0,
  );

  return (
    <div className="space-y-5">
      <Card className={cn("overflow-hidden", hasDrift ? "border-amber-300/35" : "border-emerald-300/25")}>
        <CardHeader className="border-b border-white/10 bg-black/15">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className={EYEBROW}>Drift receipt</p>
              <CardTitle className={cn("mt-2", hasDrift ? "text-amber-100" : "text-emerald-100")}>
                {hasDrift ? "Drift found" : "No drift found"}
              </CardTitle>
              <CardDescription className="mt-1">Scanned {report.scannedAt} (UTC)</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-200">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                <SensitiveData value={report.tenantId} fallback="Tenant unavailable" />
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">Read-only scan</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Statistic label="Kit objects" value={report.kitObjects.length} className="text-white" />
            <Statistic label="Match" value={matches.length} className="text-emerald-200" />
            <Statistic label="Differ" value={differs.length} className={differs.length > 0 ? "text-amber-200" : "text-slate-200"} />
            <Statistic label="Not in tenant" value={report.missing.length} className={report.missing.length > 0 ? "text-amber-200" : "text-slate-200"} />
            <Statistic label="No template" value={report.orphans.length} className="text-sky-200" />
            <Statistic label="Cannot compare" value={cannotCompare.length} className="text-slate-200" />
          </dl>
        </CardContent>
      </Card>

      {notChecked && (
        <Alert role="status" className="glass-panel rounded-2xl border-amber-300/40 text-slate-50">
          <AlertTitle className="text-white">Not checked</AlertTitle>
          <AlertDescription className="text-slate-200">
            <ul className="space-y-1">
              {[...new Set(report.unchecked.map((item) => `${getTaskCategoryLabel(item.category)}: ${item.reason}`))].map((line) => (
                <li key={line}>{line}</li>
              ))}
              {report.orphanTypesNotChecked.map((item) => (
                <li key={item.objectType}>Kit objects without a template, {item.objectType}: {item.reason}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-white/10 bg-black/15">
          <p className={EYEBROW}>Scan evidence</p>
          <CardTitle className="mt-2">Findings</CardTitle>
          <CardDescription className="mt-1">Open a finding to see its objects and what you can do.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Accordion type="multiple" defaultValue={[...openByDefault]} className="space-y-3">
            <Section id="differs" title="Kit objects that differ from the template" count={differs.length} tone="attention" wizardAction="Open the wizard">
              {(limit) => (
                <ul className="space-y-2">
                  {differs.slice(0, limit).map((item) => <DriftItemRow key={item.objectId} item={item} showNextStep />)}
                </ul>
              )}
            </Section>
            <Section id="missing" title="Templates without an object in the tenant" count={report.missing.length} tone="attention" wizardAction="Create in the wizard">
              {(limit) => (
                <ul className="space-y-2">
                  {report.missing.slice(0, limit).map((item) => (
                    <SimpleRow key={`${item.category}-${item.itemName}`} name={item.itemName} detail={getTaskCategoryLabel(item.category)} />
                  ))}
                </ul>
              )}
            </Section>
            <Section id="orphans" title="Kit objects without a matching template" count={report.orphans.length} tone="neutral">
              {(limit) => (
                <ul className="space-y-2">
                  {report.orphans.slice(0, limit).map((item) => (
                    <SimpleRow key={item.objectId} name={item.objectName} detail={`${item.objectType} · ${item.objectId}`} />
                  ))}
                </ul>
              )}
            </Section>
            <Section id="cannotCompare" title="Kit objects that cannot be compared" count={cannotCompare.length} tone="neutral">
              {(limit) => (
                <ul className="space-y-2">
                  {cannotCompare.slice(0, limit).map((item) => <DriftItemRow key={item.objectId} item={item} showNextStep={false} />)}
                </ul>
              )}
            </Section>
            <Section id="unmarked" title="Objects with a template name but no kit marker" count={report.unmarkedMatches.length} tone="neutral">
              {(limit) => (
                <ul className="space-y-2">
                  {report.unmarkedMatches.slice(0, limit).map((item) => <DriftItemRow key={item.objectId} item={item} showNextStep={false} />)}
                </ul>
              )}
            </Section>
            <Section id="matches" title="Kit objects that match the template" count={matches.length} tone="good">
              {(limit) => (
                <ul className="space-y-2">
                  {matches.slice(0, limit).map((item) => <DriftItemRow key={item.objectId} item={item} showNextStep={false} />)}
                </ul>
              )}
            </Section>
          </Accordion>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-100">Download report</p>
            <p className="mt-1 text-xs text-slate-400">Export every finding. Keep it to compare with a later scan.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadReport(generateDriftJSON(report), generateDriftFilename("json"))}>
              <FileJson aria-hidden="true" className="mr-2 size-3.5" /> JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadReport(generateDriftCSV(report), generateDriftFilename("csv"))}>
              <FileSpreadsheet aria-hidden="true" className="mr-2 size-3.5" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
