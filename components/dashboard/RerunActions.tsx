"use client";

import { useState } from "react";
import { PlayCircle, RotateCw } from "lucide-react";
import { RerunConfirmDialog } from "@/components/dashboard/RerunConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  getLiveRunScope,
  getRerunObjectCount,
  getRetryTasks,
  type RerunKind,
  type RerunSource,
} from "@/lib/hydration/rerun";

export interface ContinueRunProps {
  source: RerunSource;
  /** Reason why no new run can start now (a run is active, or a different account), or null. */
  disabledReason: string | null;
  onStart: (kind: RerunKind) => void;
  onDownloadLog: () => void;
  onDownloadReport?: () => void;
}

/** Actions on a completed run: retry the failed tasks, or run a preview for real. */
export function RerunActions({
  source,
  disabledReason,
  onStart,
  onDownloadLog,
  onDownloadReport,
}: ContinueRunProps): React.JSX.Element | null {
  const [dialogKind, setDialogKind] = useState<RerunKind | null>(null);
  const retryCount = getRetryTasks(source.tasks).length;
  const canRunLive = getLiveRunScope(source) !== null;
  if (retryCount === 0 && !canRunLive) return null;

  const reasonId = "rerun-disabled-reason";
  const disabled = disabledReason !== null;

  return (
    <section
      aria-labelledby="rerun-actions-heading"
      className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-lg backdrop-blur"
    >
      <h2 id="rerun-actions-heading" className="text-base font-semibold">
        Continue from this run
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each action starts a new run for the same account and tenant. The new run loads the templates again and
        runs every check again.
      </p>
      {disabledReason && (
        <p id={reasonId} role="status" className="mt-3 text-sm font-medium text-amber-200">
          {disabledReason}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {retryCount > 0 && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-describedby={disabled ? reasonId : undefined}
            onClick={() => setDialogKind("retry")}
          >
            <RotateCw aria-hidden="true" className="mr-2 size-4" />
            Retry {retryCount} failed {retryCount === 1 ? "task" : "tasks"}
          </Button>
        )}
        {canRunLive && (
          <Button
            type="button"
            disabled={disabled}
            aria-describedby={disabled ? reasonId : undefined}
            onClick={() => setDialogKind("live")}
          >
            <PlayCircle aria-hidden="true" className="mr-2 size-4" />
            Run this for real
          </Button>
        )}
      </div>
      {retryCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Skipped and cancelled tasks are not retried. Start a new hydration to run them again.
        </p>
      )}
      {dialogKind && (
        <RerunConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogKind(null);
          }}
          kind={dialogKind}
          tenantName={source.tenantName}
          tenantId={source.tenantId}
          operationMode={source.operationMode}
          isPreview={dialogKind === "live" ? false : source.isPreview}
          objectCount={getRerunObjectCount(dialogKind, source)}
          onConfirm={() => {
            setDialogKind(null);
            onStart(dialogKind);
          }}
          onDownloadLog={onDownloadLog}
          onDownloadReport={onDownloadReport}
        />
      )}
    </section>
  );
}
