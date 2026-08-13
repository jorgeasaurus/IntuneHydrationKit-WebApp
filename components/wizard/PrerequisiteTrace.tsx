"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PrerequisiteCheckStatus } from "@/types/prerequisites";

export interface PrerequisiteTraceItem {
  id: string;
  title: string;
  value: ReactNode;
  detail: string;
  status: PrerequisiteCheckStatus;
  icon: LucideIcon;
}

interface PrerequisiteTraceProps {
  items: PrerequisiteTraceItem[];
  isChecking: boolean;
  onRecheck: () => void;
}

const STATUS_STYLES: Record<
  PrerequisiteCheckStatus,
  { label: string; icon: string; badge: string; line: string }
> = {
  pending: {
    label: "Waiting",
    icon: "border-white/10 bg-white/[0.04] text-slate-500",
    badge: "border-white/10 bg-white/[0.04] text-slate-400",
    line: "bg-white/10",
  },
  checking: {
    label: "Running",
    icon: "border-sky-300/30 bg-sky-300/10 text-sky-200",
    badge: "border-sky-300/25 bg-sky-300/10 text-sky-100",
    line: "bg-sky-300/35",
  },
  success: {
    label: "Passed",
    icon: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    badge: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    line: "bg-emerald-300/30",
  },
  warning: {
    label: "Limited",
    icon: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    badge: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    line: "bg-amber-300/25",
  },
  error: {
    label: "Blocked",
    icon: "border-red-300/25 bg-red-300/10 text-red-200",
    badge: "border-red-300/25 bg-red-300/10 text-red-100",
    line: "bg-red-300/25",
  },
};

function TraceStatusIcon({
  status,
  fallback: Fallback,
}: {
  status: PrerequisiteCheckStatus;
  fallback: LucideIcon;
}): React.JSX.Element {
  switch (status) {
    case "checking":
      return <Loader2 aria-hidden="true" className="size-4 animate-spin" />;
    case "success":
      return <Check aria-hidden="true" className="size-4" />;
    case "warning":
      return <AlertTriangle aria-hidden="true" className="size-4" />;
    case "error":
      return <X aria-hidden="true" className="size-4" />;
    case "pending":
      return <Fallback aria-hidden="true" className="size-4" />;
  }
}

function getOverallLabel(items: PrerequisiteTraceItem[]): string {
  if (items.some((item) => item.status === "checking")) return "Running checks";
  if (items.some((item) => item.status === "error")) return "Action required";
  if (items.some((item) => item.status === "warning")) return "Ready with limits";
  if (items.every((item) => item.status === "success")) return "Ready to continue";
  return "Waiting to start";
}

export function PrerequisiteTrace({
  items,
  isChecking,
  onRecheck,
}: PrerequisiteTraceProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const overallLabel = getOverallLabel(items);

  const handleRecheck = (): void => {
    setExpanded(true);
    onRecheck();
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.12] bg-slate-950/45 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.05)]">
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="tenant-validation-trace"
          onClick={() => setExpanded((current) => !current)}
          className="group flex min-w-0 items-center gap-3 rounded-lg text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sky-300/20 bg-sky-300/10 text-sky-200">
            <Sparkles aria-hidden="true" className={cn("size-4", isChecking && "animate-pulse")} />
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
              Validation trace
            </span>
            <span className="mt-1 block truncate text-sm font-semibold text-slate-50">
              {isChecking ? "Checking tenant readiness" : "Tenant readiness evidence"}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "ml-1 size-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-200",
              expanded && "rotate-180"
            )}
          />
        </button>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span aria-live="polite" className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-300">
            {overallLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecheck}
            disabled={isChecking}
          >
            {isChecking ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            <span>Recheck readiness</span>
          </Button>
        </div>
      </div>

      {expanded && (
        <ol
          id="tenant-validation-trace"
          aria-label="Tenant validation trace"
          className="px-4 py-2"
        >
          {items.map((item, index) => {
            const style = STATUS_STYLES[item.status];
            const isLast = index === items.length - 1;

            return (
              <li key={item.id} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3">
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={cn("absolute left-[15px] top-10 h-[calc(100%-1rem)] w-px", style.line)}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex size-8 items-center justify-center rounded-full border",
                    style.icon
                  )}
                >
                  <TraceStatusIcon status={item.status} fallback={item.icon} />
                </span>

                <div className="min-w-0 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-50">{item.title}</p>
                      <p className="mt-1 break-words text-sm text-slate-200">{item.value}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em]",
                        style.badge
                      )}
                    >
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
