import { cn } from "@/lib/utils";
import type { ObjectComparison } from "@/lib/hydration/drift/compare";

const STATUS_LABELS: Record<ObjectComparison["status"], string> = {
  matches: "Matches",
  differs: "Differs",
  cannotCompare: "Cannot compare",
};

const STATUS_CLASSES: Record<ObjectComparison["status"], string> = {
  matches: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  differs: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  cannotCompare: "border-slate-300/30 bg-slate-300/10 text-slate-200",
};

export function ComparisonBadge({ status }: { status: ObjectComparison["status"] }): React.JSX.Element {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CLASSES[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function MarkerBadge({ marker }: { marker: "present" | "missing" }): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        marker === "present" ? "border-sky-300/30 bg-sky-300/10 text-sky-100" : "border-red-300/30 bg-red-300/10 text-red-100"
      )}
    >
      {marker === "present" ? "Kit marker" : "No kit marker"}
    </span>
  );
}

/** Reason and per-setting differences of a comparison. */
export function ComparisonDetails({ comparison }: { comparison: ObjectComparison }): React.JSX.Element {
  return (
    <div className="space-y-1 text-xs text-slate-300">
      <p>{comparison.reason}</p>
      {comparison.differences.length > 0 && (
        <ul className="space-y-1">
          {comparison.differences.map((difference) => (
            <li key={difference.path} className="break-all rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono">
              <span className="text-slate-100">{difference.path}</span>
              {difference.template !== undefined && (
                <>
                  <span className="block">Tenant: {difference.tenant}</span>
                  <span className="block">Template: {difference.template}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
