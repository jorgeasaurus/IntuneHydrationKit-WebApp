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

const CHIP = "inline-flex items-center rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em]";

export function ComparisonBadge({ status }: { status: ObjectComparison["status"] }): React.JSX.Element {
  return <span className={cn(CHIP, STATUS_CLASSES[status])}>{STATUS_LABELS[status]}</span>;
}

export function MarkerBadge({ marker }: { marker: "present" | "missing" }): React.JSX.Element {
  return (
    <span
      className={cn(
        CHIP,
        marker === "present" ? "border-sky-300/30 bg-sky-300/10 text-sky-100" : "border-red-300/30 bg-red-300/10 text-red-100"
      )}
    >
      {marker === "present" ? "Kit marker" : "No kit marker"}
    </span>
  );
}

/** A stored value is JSON text. Show a plain string without its quotes. */
function displayValue(value: string | undefined): string {
  if (value === undefined) return "";
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

/** Reason and per-setting differences of a comparison. */
export function ComparisonDetails({ comparison }: { comparison: ObjectComparison }): React.JSX.Element {
  return (
    <div className="space-y-2 text-xs text-slate-300">
      {comparison.differences.length === 0 && <p>{comparison.reason}</p>}
      {comparison.differences.length > 0 && (
        <ul className="space-y-2">
          {comparison.differences.map((difference) => (
            <li key={difference.path} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
              <p className="border-b border-white/10 px-3 py-1.5 font-mono text-[11px] text-slate-100">{difference.path}</p>
              {difference.template !== undefined && (
                <dl className="grid gap-px bg-white/10 sm:grid-cols-2">
                  <div className="bg-slate-950/80 px-3 py-2">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Tenant</dt>
                    <dd className="mt-1 break-all font-mono text-amber-100">{displayValue(difference.tenant)}</dd>
                  </div>
                  <div className="bg-slate-950/80 px-3 py-2">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Template</dt>
                    <dd className="mt-1 break-all font-mono text-emerald-100">{displayValue(difference.template)}</dd>
                  </div>
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
