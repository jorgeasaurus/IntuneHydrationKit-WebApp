"use client";

import { useRef, useState } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { SensitiveData } from "@/components/SensitiveData";
import { ExecutionApprovalCard } from "@/components/wizard/ExecutionApprovalCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RerunKind } from "@/lib/hydration/rerun";
import type { OperationMode } from "@/types/hydration";

export interface RerunConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: RerunKind;
  tenantName?: string;
  tenantId: string;
  operationMode: OperationMode;
  /** Preview state of the new run. */
  isPreview: boolean;
  objectCount: number;
  onConfirm: () => void;
  onDownloadLog: () => void;
  onDownloadReport?: () => void;
}

const TITLES: Record<RerunKind, (count: number) => string> = {
  retry: (count) => `Retry ${count} failed ${count === 1 ? "task" : "tasks"}`,
  resume: (count) => `Resume ${count} unfinished ${count === 1 ? "task" : "tasks"}`,
  live: () => "Run this preview for real",
};

const DESCRIPTIONS: Record<RerunKind, string> = {
  retry:
    "A new run builds these tasks again from the templates and runs the normal checks. A task whose object now exists is skipped.",
  resume:
    "A new run starts the tasks that did not finish. Each task runs the normal checks again, so an object that was already made is skipped.",
  live: "A new live run builds the same scope again from the templates and runs every check again. The preview results are not reused.",
};

function getConfirmLabel(kind: RerunKind, operationMode: OperationMode): string {
  if (kind === "retry") return "Start retry";
  if (kind === "resume") return "Resume run";
  return operationMode === "delete" ? "Start deletion" : "Start hydration";
}

/**
 * Confirmation before a run that continues from an earlier run.
 * The Cancel button gets the focus when the dialog opens, so a repeated Enter key cannot
 * start the run. A live run of a preview needs the same acknowledgement as the wizard.
 */
export function RerunConfirmDialog({
  open,
  onOpenChange,
  ...props
}: RerunConfirmDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The body mounts only while the dialog is open, so each opening starts without an acknowledgement. */}
      {open && <RerunConfirmBody {...props} />}
    </Dialog>
  );
}

function RerunConfirmBody({
  kind,
  tenantName,
  tenantId,
  operationMode,
  isPreview,
  objectCount,
  onConfirm,
  onDownloadLog,
  onDownloadReport,
}: Omit<RerunConfirmDialogProps, "open" | "onOpenChange">): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAcknowledgement = kind === "live";
  const canConfirm = !needsAcknowledgement || acknowledged;
  const modeLabel = `${operationMode === "delete" ? "Delete" : "Create"} ${isPreview ? "preview" : "live"}`;

  return (
    <DialogContent
      className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        cancelRef.current?.focus();
      }}
    >
      <DialogHeader>
        <DialogTitle>{TITLES[kind](objectCount)}</DialogTitle>
        <DialogDescription>{DESCRIPTIONS[kind]}</DialogDescription>
      </DialogHeader>

      <dl className="grid gap-3 rounded-xl border border-border/80 bg-background/60 p-4 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Tenant</dt>
          <dd className="mt-1 font-medium">
            <SensitiveData value={tenantName} fallback="Not named" />
          </dd>
          <dd className="mt-1 break-all text-muted-foreground">
            <SensitiveData value={tenantId} fallback="Not set" />
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Mode</dt>
          <dd className="mt-1 font-medium">{modeLabel}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {kind === "live" ? "Estimated objects" : "Tasks"}
          </dt>
          <dd className="mt-1 font-medium">{objectCount}</dd>
        </div>
      </dl>

      {operationMode === "delete" && !isPreview && (
        <Alert
          variant="destructive"
          className="border-red-400/70 bg-slate-950/90 text-slate-100 [&>svg]:text-red-300"
        >
          <ShieldAlert className="size-4" />
          <AlertTitle className="text-red-200">Delete mode is live</AlertTitle>
          <AlertDescription className="text-slate-100/90">
            Delete mode will remove configurations created by this tool. Only objects with &quot;Imported by Intune
            Hydration Kit&quot; in the description will be deleted. Conditional Access policies must be disabled to be
            deleted.
          </AlertDescription>
        </Alert>
      )}

      {needsAcknowledgement && (
        <ExecutionApprovalCard
          isPreview={false}
          operationMode={operationMode}
          estimatedObjects={objectCount}
          approved={acknowledged}
          onApprovedChange={setAcknowledged}
        />
      )}

      <div className="rounded-xl border border-border/80 bg-background/60 p-4 text-sm">
        <p className="font-medium">The new run replaces the results on this page</p>
        <p className="mt-1 text-muted-foreground">
          Download the current results first if you need them. You cannot open them again after the new run starts.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {onDownloadReport && (
            <Button type="button" variant="outline" size="sm" onClick={onDownloadReport}>
              <Download aria-hidden="true" className="mr-2 size-3.5" />
              Download report (JSON)
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onDownloadLog}>
            <Download aria-hidden="true" className="mr-2 size-3.5" />
            Download execution log
          </Button>
        </div>
      </div>

      <DialogFooter className="gap-2">
        <DialogClose asChild>
          <Button ref={cancelRef} type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" disabled={!canConfirm} onClick={onConfirm}>
          {getConfirmLabel(kind, operationMode)}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
