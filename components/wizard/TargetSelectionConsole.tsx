import { CheckCheck, Layers3, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OS_PLATFORM_FILTERS,
  TARGETS,
} from "@/components/wizard/targetSelectionModel";
import type { TargetSelectionViewModel } from "@/components/wizard/targetSelectionTypes";
import { cn } from "@/lib/utils";

export function TargetSelectionConsole({
  model,
}: {
  model: TargetSelectionViewModel;
}): React.JSX.Element {
  const { search, platformFilters, data, selection, actions } = model;
  const hasSelection = selection.targets.length > 0;

  return (
    <section
      aria-label="Selection console"
      className="target-selection-console glass-surface overflow-hidden rounded-2xl"
    >
      <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-300/10 text-sky-100">
            <SlidersHorizontal aria-hidden="true" className="size-4" />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-100">
              Selection console
            </p>
            <p className="mt-1 text-sm text-slate-200">
              Search the catalog, narrow by platform, then set the run scope.
            </p>
          </div>
        </div>

        <div
          aria-live="polite"
          className={cn(
            "inline-flex shrink-0 items-center gap-2 self-start rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em]",
            hasSelection
              ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
              : "border-white/10 bg-white/[0.04] text-slate-300"
          )}
        >
          {hasSelection ? (
            <CheckCheck aria-hidden="true" className="size-3" />
          ) : (
            <Layers3 aria-hidden="true" className="size-3" />
          )}
          {hasSelection
            ? `Total: ${selection.targets.length} ${selection.targets.length === 1 ? "category" : "categories"} (${selection.totalSelectedCount} items)`
            : "No scope selected"}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-300"
            />
            <Input
              aria-label="Search target catalog"
              placeholder="Search categories and policies..."
              value={search.query}
              onChange={(event) => search.setQuery(event.target.value)}
              className="h-11 border-white/15 bg-slate-950/40 pl-9 pr-9 text-white placeholder:text-slate-400"
            />
            {search.query && (
              <button
                type="button"
                onClick={() => search.setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-300 transition hover:text-white focus-visible:text-white"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" size="sm" onClick={actions.selectAll} className="h-11">
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={actions.deselectAll} className="h-11">
              Deselect All
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300">
              Filter by OS
            </span>
            {OS_PLATFORM_FILTERS.map((platform) => {
              const checked = platformFilters.selected.has(platform.id);

              return (
                <Label
                  key={platform.id}
                  htmlFor={`platform-filter-${platform.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    checked
                      ? "border-sky-300/30 bg-sky-300/12 text-white"
                      : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/20 hover:text-white"
                  )}
                >
                  <Checkbox
                    id={`platform-filter-${platform.id}`}
                    checked={checked}
                    onCheckedChange={() => platformFilters.toggle(platform.id)}
                    className="size-3.5 border-current data-[state=checked]:bg-sky-200 data-[state=checked]:text-slate-950"
                  />
                  {platform.label}
                </Label>
              );
            })}
          </div>

          {search.normalized && (
            <p className="text-xs text-slate-300">
              Showing {data.filteredTargets.length} of {TARGETS.length} categories matching
              {" "}&quot;{search.query}&quot;
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
