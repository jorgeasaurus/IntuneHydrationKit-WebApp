import { memo } from "react";
import {
  AlertCircle,
  Ban,
  Check,
  Circle,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HydrationTask, TaskStatus } from "@/types/hydration";
import { getTaskCategoryLabel } from "@/components/dashboard/categoryLabels";

const STATUS_CONFIG: Record<
  TaskStatus,
  {
    label: string;
    Icon: typeof Circle;
    iconClassName: string;
    badgeClassName: string;
    rowClassName: string;
  }
> = {
  pending: {
    label: "Pending",
    Icon: Circle,
    iconClassName: "text-slate-400",
    badgeClassName: "border-white/10 bg-white/[0.04] text-slate-300",
    rowClassName: "border-white/10",
  },
  running: {
    label: "Running",
    Icon: Loader2,
    iconClassName: "animate-spin text-sky-300",
    badgeClassName: "border-sky-300/25 bg-sky-300/10 text-sky-100",
    rowClassName: "border-sky-300/35 bg-sky-400/[0.08] shadow-[inset_3px_0_0_rgb(125_211_252)]",
  },
  success: {
    label: "Success",
    Icon: Check,
    iconClassName: "text-emerald-300",
    badgeClassName: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    rowClassName: "border-emerald-300/15",
  },
  failed: {
    label: "Failed",
    Icon: X,
    iconClassName: "text-red-300",
    badgeClassName: "border-red-300/25 bg-red-300/10 text-red-100",
    rowClassName: "border-red-300/30 bg-red-400/[0.08] shadow-[inset_3px_0_0_rgb(252_165_165)]",
  },
  skipped: {
    label: "Skipped",
    Icon: Ban,
    iconClassName: "text-amber-300",
    badgeClassName: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    rowClassName: "border-amber-300/15",
  },
};

function formatDuration(task: HydrationTask): string | null {
  if (!task.startTime || !task.endTime) {
    return null;
  }

  return `${Math.round((task.endTime.getTime() - task.startTime.getTime()) / 1000)}s`;
}

function TaskRowComponent({ task }: { task: HydrationTask }): React.JSX.Element {
  const status = STATUS_CONFIG[task.status];
  const duration = formatDuration(task);
  const detail = task.error ?? task.warning;
  const DetailIcon = task.status === "failed" ? X : AlertCircle;

  return (
    <li>
      <article
        aria-label={`${task.itemName}: ${status.label}`}
        className={cn(
          "group relative grid grid-cols-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-xl border bg-slate-950/55 px-3 py-3",
          "transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-white/20 hover:bg-slate-950/75",
          status.rowClassName
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-6 items-center justify-center rounded-md border border-white/10 bg-black/25",
            status.iconClassName
          )}
        >
          <status.Icon className="size-3.5" />
        </span>

        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-5 text-slate-50">
                {task.itemName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                <span>{getTaskCategoryLabel(task.category)}</span>
                <span aria-hidden="true" className="text-slate-600">/</span>
                <span>{task.operation}</span>
                {duration && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">/</span>
                    <span>Duration {duration}</span>
                  </>
                )}
              </div>
            </div>

            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
                status.badgeClassName
              )}
            >
              {status.label}
            </span>
          </div>

          {detail && (
            <div
              className={cn(
                "mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs leading-5",
                task.status === "failed"
                  ? "border-red-300/20 bg-red-950/55 text-red-100"
                  : "border-amber-300/15 bg-amber-950/35 text-amber-100"
              )}
            >
              <DetailIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>{detail}</span>
            </div>
          )}
        </div>
      </article>
    </li>
  );
}

export const TaskRow = memo(TaskRowComponent);
