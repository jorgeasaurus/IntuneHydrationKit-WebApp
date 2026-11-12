"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Download } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SensitiveData } from "@/components/SensitiveData";
import { ComparisonBadge, ComparisonDetails, MarkerBadge } from "@/components/drift/ComparisonDetails";
import { createGraphClient } from "@/lib/graph/client";
import { getTaskCategoryLabel } from "@/lib/hydration/categoryLabels";
import { generateDriftCSV, generateDriftFilename, generateDriftJSON } from "@/lib/hydration/drift/export";
import { runDriftScan, type DriftItem, type DriftReport } from "@/lib/hydration/drift/scan";
import { downloadReport } from "@/lib/hydration/reporter";

function DriftItemRow({ item }: { item: DriftItem }): React.JSX.Element {
  return (
    <li className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{item.itemName}</p>
        <span className="text-xs text-slate-400">{getTaskCategoryLabel(item.category)}</span>
        <MarkerBadge marker={item.marker} />
        <ComparisonBadge status={item.comparison.status} />
      </div>
      <p className="break-all text-xs text-slate-400">
        Object: {item.objectName} ({item.objectId})
      </p>
      <ComparisonDetails comparison={item.comparison} />
    </li>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }): React.JSX.Element {
  return (
    <details className="rounded-2xl border border-white/10 bg-slate-950/60 p-4" open={count > 0 && count <= 20}>
      <summary className="cursor-pointer font-semibold">
        {title} ({count})
      </summary>
      <div className="mt-3">{count === 0 ? <p className="text-sm text-slate-400">None.</p> : children}</div>
    </details>
  );
}

function DriftResult({ report }: { report: DriftReport }): React.JSX.Element {
  const differs = report.kitObjects.filter((item) => item.comparison.status === "differs");
  const cannotCompare = report.kitObjects.filter((item) => item.comparison.status === "cannotCompare");
  const matches = report.kitObjects.length - differs.length - cannotCompare.length;
  return (
    <div className="space-y-4 text-sm text-slate-100">
      <p>
        {report.kitObjects.length} kit objects: {differs.length} differ; {matches} match; {cannotCompare.length} cannot
        be compared. {report.missing.length} templates have no object. {report.orphans.length} kit objects match no
        template.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => downloadReport(generateDriftJSON(report), generateDriftFilename("json"))}>
          <Download aria-hidden="true" className="mr-2 size-4" />
          Download JSON
        </Button>
        <Button variant="outline" onClick={() => downloadReport(generateDriftCSV(report), generateDriftFilename("csv"))}>
          <Download aria-hidden="true" className="mr-2 size-4" />
          Download CSV
        </Button>
      </div>
      {(report.unchecked.length > 0 || report.orphanTypesNotChecked.length > 0) && (
        <Alert role="status" className="border-amber-400/40 bg-slate-950/80 text-slate-100">
          <AlertTitle>Not checked</AlertTitle>
          <AlertDescription>
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
      <Section title="Kit objects that differ from the template" count={differs.length}>
        <ul className="space-y-2">{differs.map((item) => <DriftItemRow key={item.objectId} item={item} />)}</ul>
      </Section>
      <Section title="Kit objects that cannot be compared" count={cannotCompare.length}>
        <ul className="space-y-2">{cannotCompare.map((item) => <DriftItemRow key={item.objectId} item={item} />)}</ul>
      </Section>
      <Section title="Kit objects without a matching template" count={report.orphans.length}>
        <p className="mb-2 text-xs text-slate-400">
          Objects that carry the kit marker but match no current template name. Objects from CIS Baseline templates or
          from renamed templates show here.
        </p>
        <ul className="space-y-1">
          {report.orphans.map((item) => (
            <li key={item.objectId} className="break-all">
              {item.objectName} <span className="text-slate-400">({item.objectType}, {item.objectId})</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Templates without an object" count={report.missing.length}>
        <ul className="space-y-1">
          {report.missing.map((item) => (
            <li key={`${item.category}-${item.itemName}`}>
              {item.itemName} <span className="text-slate-400">({getTaskCategoryLabel(item.category)})</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Objects with a template name but no kit marker" count={report.unmarkedMatches.length}>
        <p className="mb-2 text-xs text-slate-400">These objects were not created by the kit, so they are not compared.</p>
        <ul className="space-y-2">{report.unmarkedMatches.map((item) => <DriftItemRow key={item.objectId} item={item} />)}</ul>
      </Section>
      <Section title="Kit objects that match the template" count={matches}>
        <ul className="space-y-2">
          {report.kitObjects
            .filter((item) => item.comparison.status === "matches")
            .map((item) => <DriftItemRow key={item.objectId} item={item} />)}
        </ul>
      </Section>
    </div>
  );
}

/** Read-only drift scan of the signed-in tenant. */
export function DriftScanView(): React.JSX.Element {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const [report, setReport] = useState<DriftReport>();
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();
  const cancelled = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancelled.current = true;
    };
  }, []);

  async function scan(): Promise<void> {
    if (!account) return;
    cancelled.current = false;
    setError(undefined);
    setReport(undefined);
    setProgress("Starting the scan...");
    try {
      const client = createGraphClient({ tenantId: account.tenantId, homeAccountId: account.homeAccountId });
      const result = await runDriftScan(client, account.tenantId, {
        shouldCancel: () => cancelled.current,
        onProgress: (message) => {
          if (active.current) setProgress(message);
        },
      });
      if (active.current) setReport(result);
    } catch {
      if (!active.current) return;
      setError(
        cancelled.current
          ? "The scan was cancelled. No result is shown."
          : "The tenant could not be read. Check your connection and sign-in, then try again."
      );
    } finally {
      if (active.current) setProgress(undefined);
    }
  }

  const running = progress !== undefined;
  return (
    <Card className="data-card rounded-2xl border bg-card/90 backdrop-blur">
      <CardHeader>
        <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-hydrate">Read-only</p>
        <CardTitle>Drift scan</CardTitle>
        <CardDescription>
          Compare the objects that the kit created in{" "}
          <SensitiveData value={account?.tenantId} fallback="the signed-in tenant" /> with the current templates. The
          scan only reads (GET requests). It does not change the tenant. Only the settings that a template defines are
          compared. Names, descriptions, assignments, and Graph metadata are not compared.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Scanned: Dynamic and static groups, device filters, compliance policies, Conditional Access policies, App
          Protection policies, and OpenIntuneBaseline policies. Not scanned: enrollment profiles, Win32 apps, and CIS
          Baseline policies.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={scan} disabled={!account || running}>
            {running ? "Scanning…" : report ? "Scan again" : "Start drift scan"}
          </Button>
          {running && (
            <Button variant="outline" onClick={() => { cancelled.current = true; }}>
              Cancel scan
            </Button>
          )}
        </div>
        {running && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{progress}</p>}
        {error && (
          <Alert role="alert">
            <AlertTitle>Scan incomplete</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {report && (
          <div className="rounded-2xl bg-slate-950/80 p-4">
            <DriftResult report={report} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
