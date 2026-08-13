import { AlertTriangle, Check, Minus } from "lucide-react";
import { getTaskCategoryLabel } from "@/components/dashboard/categoryLabels";
import type { HydrationTask, OperationMode } from "@/types/hydration";
import { cn } from "@/lib/utils";

interface PreviewChangeTableProps {
  tasks: HydrationTask[];
  operationMode: OperationMode;
}

type PreviewDecision = "change" | "unchanged" | "blocked";

function getDecision(task: HydrationTask): PreviewDecision {
  if (task.status === "failed") return "blocked";
  if (task.status === "skipped") return "unchanged";
  return "change";
}

const DECISION_STYLES: Record<
  PreviewDecision,
  { label: string; className: string; icon: typeof Check }
> = {
  change: {
    label: "Change",
    className: "border-sky-300/25 bg-sky-300/10 text-sky-100",
    icon: Check,
  },
  unchanged: {
    label: "No change",
    className: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    icon: Minus,
  },
  blocked: {
    label: "Blocked",
    className: "border-red-300/25 bg-red-300/10 text-red-100",
    icon: AlertTriangle,
  },
};

export function PreviewChangeTable({
  tasks,
  operationMode,
}: PreviewChangeTableProps): React.JSX.Element {
  const actionLabel = operationMode === "create" ? "Create" : "Delete";
  const counts = tasks.reduce(
    (result, task) => {
      result[getDecision(task)] += 1;
      return result;
    },
    { change: 0, unchanged: 0, blocked: 0 }
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.12] bg-slate-950/45 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.05)]">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-sky-200">
            Proposed changes
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-50">Tenant change review</h2>
          <p className="mt-1 text-sm text-slate-300">
            Review each simulated decision. The preview did not change the tenant.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 text-sky-100">
            {counts.change} change
          </span>
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-amber-100">
            {counts.unchanged} unchanged
          </span>
          <span className="rounded-full border border-red-300/25 bg-red-300/10 px-2.5 py-1 text-red-100">
            {counts.blocked} blocked
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead className="bg-white/[0.035] font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
            <tr>
              <th className="px-5 py-3 font-medium">Decision</th>
              <th className="px-5 py-3 font-medium">Object</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Action</th>
              <th className="px-5 py-3 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {tasks.map((task) => {
              const decision = getDecision(task);
              const style = DECISION_STYLES[decision];
              const StatusIcon = style.icon;

              return (
                <tr key={task.id} className="transition-colors hover:bg-white/[0.035]">
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                        style.className
                      )}
                    >
                      <StatusIcon aria-hidden="true" className="size-3" />
                      {style.label}
                    </span>
                  </td>
                  <td className="max-w-[280px] px-5 py-3.5 font-medium text-slate-100">
                    <span className="block truncate" title={task.itemName}>{task.itemName}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-300">
                    {getTaskCategoryLabel(task.category)}
                  </td>
                  <td className="px-5 py-3.5 text-slate-300">
                    {decision === "change" ? actionLabel : "None"}
                  </td>
                  <td className="max-w-[320px] px-5 py-3.5 text-slate-400">
                    <span className="block truncate" title={task.error || task.warning}>
                      {task.error || task.warning || `Ready to ${actionLabel.toLowerCase()}`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
