"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ComparisonBadge, ComparisonDetails, MarkerBadge } from "@/components/drift/ComparisonDetails";
import { createGraphClient } from "@/lib/graph/client";
import { getTaskCategoryLabel } from "@/lib/hydration/categoryLabels";
import type { ConflictItem, ConflictReport, UncheckedItem } from "@/lib/hydration/conflicts";
import { runConflictCheck, type ConflictCheckSelection } from "@/lib/hydration/drift/scan";
import type { TenantConfig, WizardState } from "@/types/hydration";

interface ConflictSummaryProps {
  tenantConfig?: TenantConfig;
  selection: ConflictCheckSelection;
  /** Called with the result of a completed check, and with null when the result is cleared. */
  onReportChange?: (report: ConflictReport | null) => void;
}

function groupBy<T>(items: T[], key: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return [...groups];
}

function UncheckedNotice({ items }: { items: UncheckedItem[] }): React.JSX.Element | null {
  if (items.length === 0) return null;
  const groups = groupBy(items, (item) => `${item.category}\u0000${item.reason}`);
  return (
    <Alert role="status" className="border-amber-400/40 bg-slate-950/80 text-slate-100">
      <AlertTitle>Not checked</AlertTitle>
      <AlertDescription>
        <ul className="space-y-1">
          {groups.map(([key, group]) => (
            <li key={key}>
              {getTaskCategoryLabel(group[0].category)} ({group.length}): {group[0].reason}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function ConflictRow({ item }: { item: ConflictItem }): React.JSX.Element {
  return (
    <li className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{item.itemName}</p>
        <MarkerBadge marker={item.marker} />
        <ComparisonBadge status={item.comparison.status} />
      </div>
      <p className="break-all text-xs text-slate-400">
        Existing object: {item.existingName} ({item.existingId})
      </p>
      <ComparisonDetails comparison={item.comparison} />
    </li>
  );
}

function ConflictResult({ report }: { report: ConflictReport }): React.JSX.Element {
  const marked = report.conflicts.filter((item) => item.marker === "present").length;
  const count = (status: ConflictItem["comparison"]["status"]) =>
    report.conflicts.filter((item) => item.comparison.status === status).length;
  return (
    <div className="space-y-3 text-sm">
      <p>
        {report.conflicts.length} of {report.checked} checked templates already exist ({marked} with the kit marker):{" "}
        {count("differs")} differ; {count("matches")} match; {count("cannotCompare")} cannot be compared.
      </p>
      <UncheckedNotice items={report.unchecked} />
      {report.conflicts.length === 0 && report.unchecked.length === 0 && (
        <p className="text-slate-300">No selected template exists in the tenant.</p>
      )}
      {groupBy(report.conflicts, (item) => item.category).map(([category, items]) => (
        <details key={category}>
          <summary className="cursor-pointer">
            {getTaskCategoryLabel(category)} ({items.length})
          </summary>
          <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <ConflictRow key={item.taskId} item={item} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function ConflictSummarySession({ tenantConfig, selection, onReportChange }: ConflictSummaryProps): React.JSX.Element {
  const [report, setReport] = useState<ConflictReport>();
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

  async function check(): Promise<void> {
    if (!tenantConfig?.tenantId || !tenantConfig.homeAccountId) return;
    cancelled.current = false;
    setError(undefined);
    setReport(undefined);
    onReportChange?.(null);
    setProgress("Starting the check...");
    try {
      const client = createGraphClient({ tenantId: tenantConfig.tenantId, homeAccountId: tenantConfig.homeAccountId });
      const result = await runConflictCheck(client, tenantConfig.tenantId, selection, {
        shouldCancel: () => cancelled.current,
        onProgress: (message) => {
          if (active.current) setProgress(message);
        },
      });
      if (!active.current) return;
      setReport(result);
      onReportChange?.(result);
    } catch {
      if (!active.current) return;
      setError(
        cancelled.current
          ? "The check was cancelled. No result is shown."
          : "The existing objects could not be read. Check your connection and sign-in, then try again."
      );
    } finally {
      if (active.current) setProgress(undefined);
    }
  }

  const running = progress !== undefined;
  return (
    <section
      className="space-y-3 rounded-2xl border border-white/15 bg-slate-950/70 p-5 text-slate-100"
      aria-label="Existing objects"
    >
      <h3 className="font-semibold">Existing objects</h3>
      <p className="text-sm text-slate-300">
        Read the tenant to see which selected templates already exist, whether each existing object has the kit
        marker, and whether it differs from the template. This check only reads. The run skips existing objects.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
          onClick={check}
          disabled={!tenantConfig?.homeAccountId || running}
        >
          {running ? "Checking existing objects…" : "Check existing objects"}
        </Button>
        {running && (
          <Button variant="ghost" onClick={() => { cancelled.current = true; }}>
            Cancel check
          </Button>
        )}
      </div>
      {running && <p role="status" aria-live="polite" className="text-sm text-slate-300">{progress}</p>}
      {error && (
        <Alert role="alert" className="border-amber-400/40 bg-slate-950/80 text-slate-100">
          <AlertTitle>Check incomplete</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {report && <ConflictResult report={report} />}
    </section>
  );
}

/** Reset the check when the tenant, account, or selection changes. */
export function ConflictSummary(props: ConflictSummaryProps): React.JSX.Element {
  const scope = JSON.stringify([props.tenantConfig?.tenantId, props.tenantConfig?.homeAccountId, props.selection]);
  return <ConflictSummarySession key={scope} {...props} />;
}

/** The existing-objects check of the review step. Shown for create runs only. */
export function CreateConflictReview({
  state,
  onReportChange,
}: {
  state: WizardState;
  onReportChange?: (report: ConflictReport | null) => void;
}): React.JSX.Element | null {
  if (state.operationMode !== "create" || state.selectedTargets.length === 0) return null;
  return (
    <ConflictSummary
      tenantConfig={state.tenantConfig}
      selection={{
        selectedTargets: state.selectedTargets,
        selectedCISCategories: state.selectedCISCategories,
        baselineSelection: state.baselineSelection,
        categorySelections: state.categorySelections,
      }}
      onReportChange={onReportChange}
    />
  );
}
