"use client";

import { FileSearch, Trash2 } from "lucide-react";
import { SensitiveData } from "@/components/SensitiveData";
import { Button } from "@/components/ui/button";
import type { RunHistoryEntry } from "@/lib/history/runHistory";
import { formatRunDuration, getRunModeLabel, getRunOutcomeLabel } from "@/lib/history/runHistoryFormat";
import { formatDateTime } from "@/lib/utils/dateFormat";
import { cn } from "@/lib/utils";

interface RunHistoryListProps {
  entries: RunHistoryEntry[];
  onOpen: (entry: RunHistoryEntry) => void;
  onDelete: (entry: RunHistoryEntry) => void;
}

// The same words as the results summary and the reports: a preview changes nothing.
// The update count shows only for a run that updated objects, as in the results summary.
type CountKey = keyof RunHistoryEntry["counts"];
const LIVE_COUNT_LABELS: ReadonlyArray<readonly [CountKey, string]> = [
  ["created", "Created"],
  ["updated", "Updated"],
  ["deleted", "Deleted"],
  ["skipped", "Skipped"],
  ["failed", "Failed"],
];
const PREVIEW_COUNT_LABELS: ReadonlyArray<readonly [CountKey, string]> = [
  ["wouldCreate", "Would create"],
  ["wouldUpdate", "Would update"],
  ["wouldDelete", "Would delete"],
  ["skipped", "Skipped"],
  ["failed", "Failed"],
];

function getCountLabels(entry: RunHistoryEntry): ReadonlyArray<readonly [CountKey, string]> {
  const labels = entry.isPreview ? PREVIEW_COUNT_LABELS : LIVE_COUNT_LABELS;
  const updateKey = entry.isPreview ? "wouldUpdate" : "updated";
  return entry.counts[updateKey] > 0 ? labels : labels.filter(([key]) => key !== updateKey);
}

/** Past runs, newest first. */
export function RunHistoryList({ entries, onOpen, onDelete }: RunHistoryListProps): React.JSX.Element {
  return (
    <ul aria-label="Past runs" className="space-y-3">
      {entries.map((entry) => {
        const date = formatDateTime(entry.endTime);
        return (
          <li key={entry.id} className="data-card rounded-2xl border bg-card/90 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-foreground">{date}</p>
                <p className="break-words text-sm text-muted-foreground">
                  <SensitiveData value={entry.tenantName} fallback="Tenant name not recorded" />
                  {" ("}
                  <SensitiveData value={entry.tenantId} fallback="Tenant ID not recorded" className="font-mono" />
                  {")"}
                </p>
                <p className="flex flex-wrap gap-2 pt-1 text-xs">
                  <span className="rounded-full border border-border px-2 py-0.5">{getRunModeLabel(entry)}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5",
                      entry.outcome === "succeeded" ? "border-emerald-500/50" : "border-amber-500/60",
                    )}
                  >
                    {getRunOutcomeLabel(entry.outcome)}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 tabular-nums">
                    Duration {formatRunDuration(entry.durationMs)}
                  </span>
                </p>
                <dl className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm">
                  {getCountLabels(entry).map(([key, label]) => (
                    <div key={key} className="flex gap-1">
                      <dt className="text-muted-foreground">{label}:</dt>
                      <dd className="font-medium tabular-nums">{entry.counts[key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex flex-wrap gap-2 lg:shrink-0">
                <Button size="sm" onClick={() => onOpen(entry)} aria-label={`Open results of the run on ${date}`}>
                  <FileSearch aria-hidden="true" />
                  Open results
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDelete(entry)}
                  aria-label={`Delete the run on ${date} from history`}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
