"use client";

import { CheckCircle2, Eye, ShieldAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { OperationMode } from "@/types/hydration";

interface ExecutionApprovalCardProps {
  isPreview: boolean;
  operationMode?: OperationMode;
  estimatedObjects: number;
  approved: boolean;
  onApprovedChange: (approved: boolean) => void;
}

export function ExecutionApprovalCard({
  isPreview,
  operationMode,
  estimatedObjects,
  approved,
  onApprovedChange,
}: ExecutionApprovalCardProps): React.JSX.Element {
  const action = operationMode === "delete" ? "delete" : "create";

  if (isPreview) {
    return (
      <section
        aria-label="Preview approval"
        className="overflow-hidden rounded-2xl border border-sky-300/45 bg-slate-950/70 text-slate-50 shadow-xl shadow-slate-950/20"
      >
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/30 bg-sky-300/10 text-sky-100">
              <Eye aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-100">
                Read-only approval
              </p>
              <h3 className="mt-1 text-base font-semibold text-white">Preview mode</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-200">
                Preview mode will check what would be {action === "create" ? "created" : "deleted"}
                {" "}without making any changes to your tenant.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-100">
            <CheckCircle2 aria-hidden="true" className="size-3" />
            No approval required
          </span>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10 bg-white/[0.035] text-sm">
          <div className="border-r border-white/10 px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Scope</p>
            <p className="mt-1 font-medium text-white">{estimatedObjects} objects</p>
          </div>
          <div className="px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Graph access</p>
            <p className="mt-1 font-medium text-white">Read only</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Live execution approval"
      className="live-acknowledgement overflow-hidden rounded-2xl border shadow-xl backdrop-blur-md"
    >
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/35 bg-amber-300/10 text-amber-100">
            <ShieldAlert aria-hidden="true" className="size-4" />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-100">
              Human approval required
            </p>
            <h3 className="live-acknowledgement__title mt-1 text-base font-semibold">
              Approve live tenant changes
            </h3>
            <p className="live-acknowledgement__copy mt-1 text-sm leading-relaxed">
              This run can {action} up to {estimatedObjects} tenant objects. Completed actions are
              not rolled back automatically.
            </p>
          </div>
        </div>
        <span
          aria-live="polite"
          className="inline-flex shrink-0 self-start rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-100"
        >
          {approved ? "Approved" : "Awaiting approval"}
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-x-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <Checkbox
            id="acknowledge"
            checked={approved}
            onCheckedChange={(checked) => onApprovedChange(checked === true)}
            className="live-acknowledgement__checkbox"
          />
          <div className="space-y-1">
            <Label
              htmlFor="acknowledge"
              className="live-acknowledgement__title cursor-pointer font-medium"
            >
              I understand this run will modify my Intune tenant
            </Label>
            <p className="live-acknowledgement__copy text-sm">
              This operation will {action === "create" ? "create new" : "delete existing"}
              {" "}configurations in your Intune tenant.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
