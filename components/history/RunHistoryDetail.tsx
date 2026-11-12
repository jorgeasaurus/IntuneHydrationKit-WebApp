"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import { ResultsSummary } from "@/components/dashboard/ResultsSummary";
import { SensitiveData } from "@/components/SensitiveData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RunHistoryEntry } from "@/lib/history/runHistory";
import { formatRunDuration, getRunModeLabel } from "@/lib/history/runHistoryFormat";
import { formatDateTime } from "@/lib/utils/dateFormat";

/** Results of one past run. The results summary gives the Markdown, JSON, and CSV reports. */
export function RunHistoryDetail({
  entry,
  onBack,
}: {
  entry: RunHistoryEntry;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-5">
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Back to run history
      </Button>

      <h3 className="text-xl font-semibold">
        {getRunModeLabel(entry)} run on {formatDateTime(entry.endTime)}
      </h3>

      {entry.summary && entry.outcome !== "failed" ? (
        <ResultsSummary
          summary={entry.summary}
          tasks={entry.tasks}
          isPreview={entry.isPreview}
          outcome={entry.outcome}
        />
      ) : (
        <Alert className="border-amber-500/60 bg-card/95 text-card-foreground [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>The run failed before it finished</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{entry.fatalError}</p>
            <p>
              Tenant: <SensitiveData value={entry.tenantName || entry.tenantId} fallback="Tenant not recorded" />.
              Duration {formatRunDuration(entry.durationMs)}. {entry.counts.total} tasks: {entry.counts.created}{" "}
              created, {entry.counts.deleted} deleted, {entry.counts.skipped} skipped, {entry.counts.failed} failed.
            </p>
            <p>Reports are not available for a run that failed before it finished.</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
