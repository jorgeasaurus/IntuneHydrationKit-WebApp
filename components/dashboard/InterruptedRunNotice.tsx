"use client";

import { useState } from "react";
import { AlertTriangle, Download, Play, Trash2 } from "lucide-react";
import { RerunConfirmDialog } from "@/components/dashboard/RerunConfirmDialog";
import { Button } from "@/components/ui/button";
import { getResumeTasks } from "@/lib/hydration/rerun";
import { formatDateTime } from "@/lib/utils/dateFormat";
import type { ContinueRunProps } from "@/components/dashboard/RerunActions";

interface InterruptedRunNoticeProps extends Omit<ContinueRunProps, "onStart" | "onDownloadReport"> {
  /** Time of the last saved progress. */
  checkpointAt: Date;
  onResume: () => void;
  onDiscard: () => void;
}

/**
 * Notice for a run that stopped before it completed (for example after a refresh or a
 * closed tab). It offers to resume the unfinished tasks, or to discard the run.
 */
export function InterruptedRunNotice({
  source,
  checkpointAt,
  disabledReason,
  onResume,
  onDiscard,
  onDownloadLog,
}: InterruptedRunNoticeProps): React.JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const unfinishedCount = getResumeTasks(source.tasks).length;
  const finishedCount = source.tasks.length - unfinishedCount;
  const canResume = disabledReason === null && unfinishedCount > 0;
  const reasonId = "interrupted-run-reason";

  return (
    <section
      role="alert"
      aria-labelledby="interrupted-run-heading"
      className="rounded-2xl border border-amber-400/70 bg-slate-950/90 p-5 text-slate-100 shadow-xl shadow-slate-950/20 backdrop-blur-md"
    >
      <div className="flex gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-300" />
        <div className="min-w-0 space-y-2">
          <h2 id="interrupted-run-heading" className="text-base font-semibold text-amber-100">
            This run was interrupted
          </h2>
          <p className="text-sm text-slate-200">
            The page was closed or refreshed before the run completed. {finishedCount} of {source.tasks.length} tasks
            finished. {unfinishedCount} {unfinishedCount === 1 ? "task did" : "tasks did"} not finish. Progress was
            last saved at {formatDateTime(checkpointAt)}.
          </p>
          <p className="text-sm text-slate-200">
            Resume starts a new run for the unfinished tasks only. The outcome of a task that was running is not
            known, so it runs the normal checks again: a create is skipped when the object exists, and a delete is
            checked again before it runs.
          </p>
          {disabledReason && (
            <p id={reasonId} className="text-sm font-medium text-amber-200">
              {disabledReason}
            </p>
          )}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            {unfinishedCount > 0 && (
              <Button
                type="button"
                disabled={!canResume}
                aria-describedby={disabledReason ? reasonId : undefined}
                onClick={() => setConfirmOpen(true)}
              >
                <Play aria-hidden="true" className="mr-2 size-4" />
                Resume {unfinishedCount} unfinished {unfinishedCount === 1 ? "task" : "tasks"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="border-slate-400/60 bg-transparent text-slate-100 hover:bg-slate-800 hover:text-white"
              onClick={onDiscard}
            >
              <Trash2 aria-hidden="true" className="mr-2 size-4" />
              Discard run
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-400/60 bg-transparent text-slate-100 hover:bg-slate-800 hover:text-white"
              onClick={onDownloadLog}
            >
              <Download aria-hidden="true" className="mr-2 size-4" />
              Download execution log
            </Button>
          </div>
        </div>
      </div>
      <RerunConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        kind="resume"
        tenantName={source.tenantName}
        tenantId={source.tenantId}
        operationMode={source.operationMode}
        isPreview={source.isPreview}
        objectCount={unfinishedCount}
        onConfirm={() => {
          setConfirmOpen(false);
          onResume();
        }}
        onDownloadLog={onDownloadLog}
      />
    </section>
  );
}

/** Notice for an interrupted run of a different account or tenant. It shows no run details. */
export function ForeignInterruptedRunNotice({ onDiscard }: { onDiscard: () => void }): React.JSX.Element {
  return (
    <section
      role="alert"
      aria-labelledby="foreign-interrupted-run-heading"
      className="rounded-2xl border border-amber-400/70 bg-slate-950/90 p-5 text-slate-100 shadow-xl"
    >
      <h2 id="foreign-interrupted-run-heading" className="text-base font-semibold text-amber-100">
        An interrupted run cannot be resumed
      </h2>
      <p className="mt-2 text-sm text-slate-200">
        A run in this browser tab was interrupted, but it belongs to a different account or tenant than the one you are
        signed in with. To resume it, sign in with the account and tenant that started it. You can also discard it.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-4 border-slate-400/60 bg-transparent text-slate-100 hover:bg-slate-800 hover:text-white"
        onClick={onDiscard}
      >
        <Trash2 aria-hidden="true" className="mr-2 size-4" />
        Discard run
      </Button>
    </section>
  );
}
