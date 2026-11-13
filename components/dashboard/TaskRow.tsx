import { memo } from "react";
import {
  AlertCircle,
  Ban,
  Check,
  Circle,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HydrationTask, TaskStatus } from "@/types/hydration";
import { getTaskCategoryLabel } from "@/lib/hydration/categoryLabels";
import type { PortalLink } from "@/lib/utils/portalLinks";

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

interface TaskRowProps {
  task: HydrationTask;
  /** Clamp the content so the row fits its fixed windowed slot. */
  fixedHeight?: boolean;
  /** Admin portal link for an object that this task created. */
  portalLink?: PortalLink;
}

/** One task card. The caller supplies the list item wrapper. */
/** Status label: an update of an existing object says "Updated", or "Would update" in preview. */
function getStatusLabel(task: HydrationTask): string {
  if (task.status === "success" && task.update) return task.update.applied ? "Updated" : "Would update";
  return STATUS_CONFIG[task.status].label;
}

function getUpdateDetail(task: HydrationTask): string | undefined {
  return task.update ? `Settings changed to match the template: ${task.update.differences.join("; ")}` : undefined;
}

function TaskRowComponent({ task, fixedHeight = false, portalLink }: TaskRowProps): React.JSX.Element {
  const status = { ...STATUS_CONFIG[task.status], label: getStatusLabel(task) };
  const duration = formatDuration(task);
  const detail = task.error ?? task.warning ?? getUpdateDetail(task);
  const DetailIcon = task.status === "failed" ? X : AlertCircle;

  return (
    <article
      aria-label={`${task.itemName}: ${status.label}`}
      className={cn(
        "group relative grid grid-cols-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-xl border bg-slate-950/55 px-3 py-3",
        "transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-white/20 hover:bg-slate-950/75",
        fixedHeight && "h-full",
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
            <div
              className={cn(
                "mt-1 flex items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400",
                fixedHeight ? "flex-nowrap overflow-hidden whitespace-nowrap" : "flex-wrap"
              )}
            >
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

          <div className="flex shrink-0 items-center gap-1.5">
            {portalLink && (
              // An icon-size link keeps the row height fixed for the windowed list.
              <a
                href={portalLink.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={portalLink.accessibleName}
                title={portalLink.label}
                className="flex size-6 items-center justify-center rounded-md border border-sky-300/25 bg-sky-300/10 text-sky-100 transition-colors hover:border-sky-200/60 hover:bg-sky-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            )}
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
                status.badgeClassName
              )}
            >
              {status.label}
            </span>
          </div>
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
            {/* A clamped detail keeps its full text in the tooltip and the accessibility tree. */}
            <span className={fixedHeight ? "line-clamp-2" : undefined} title={fixedHeight ? detail : undefined}>
              {detail}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

export const TaskRow = memo(TaskRowComponent);
