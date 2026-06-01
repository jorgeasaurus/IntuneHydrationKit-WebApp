import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { OIBPlatformId } from "@/types/hydration";
import type { TargetSelectionViewModel } from "@/components/wizard/targetSelectionTypes";
import { IMPORT_PREFIX } from "@/lib/utils/hydrationMarker";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
  baselineFileMatchesSearch,
  cisFileMatchesSearch,
  countSelectedPaths,
  filterItemsBySearch,
  getBaselinePolicyPathsMatchingSearch,
  getCISPolicyPathsMatchingSearch,
  PLATFORM_NAMES,
  type CategoryItem,
  type Target,
} from "@/components/wizard/targetSelectionModel";

interface TargetSelectionCategoryViewProps {
  model: TargetSelectionViewModel;
  target: Target;
}

function getFilteredData(
  model: TargetSelectionViewModel,
  target: Target,
  items: CategoryItem[],
  selected: Set<string>
): { filteredCount: number; selectedMatchingCount: number; isLoaded: boolean } {
  const { baselineManifest, cisManifest, loadingCategories } = model.data;
  const { normalized } = model.search;
  const { selectedCISPolicies } = model.selection;
  const selectedCount = model.selection.getSelectedCount(target.id);
  const totalCount = model.selection.getTotalCount(target.id);

  if (!normalized) {
    return { filteredCount: totalCount, selectedMatchingCount: selectedCount, isLoaded: true };
  }
  if (target.id === "baseline") {
    if (!baselineManifest) {
      return { filteredCount: totalCount, selectedMatchingCount: 0, isLoaded: false };
    }
    const matching = getBaselinePolicyPathsMatchingSearch(baselineManifest.files, normalized);
    return {
      filteredCount: matching.length,
      selectedMatchingCount: countSelectedPaths(matching, selected),
      isLoaded: true,
    };
  }
  if (target.id === "cisBaseline") {
    if (!cisManifest) {
      return { filteredCount: totalCount, selectedMatchingCount: 0, isLoaded: false };
    }
    const matching = getCISPolicyPathsMatchingSearch(cisManifest.files, normalized);
    return {
      filteredCount: matching.length,
      selectedMatchingCount: countSelectedPaths(matching, selectedCISPolicies),
      isLoaded: true,
    };
  }
  if (items.length === 0 && !loadingCategories.has(target.id)) {
    return { filteredCount: totalCount, selectedMatchingCount: 0, isLoaded: false };
  }

  const filtered = filterItemsBySearch(items, normalized);
  const selectedMatching = filtered.filter(i => selected.has(i.displayName)).length;
  return { filteredCount: filtered.length, selectedMatchingCount: selectedMatching, isLoaded: true };
}

function getTargetCountLabel({
  isSelected,
  selectedCount,
  displayCount,
  isLoaded,
  hasSearch,
}: {
  isSelected: boolean;
  selectedCount: number;
  displayCount: number;
  isLoaded: boolean;
  hasSearch: boolean;
}): string {
  if (hasSearch && !isLoaded) {
    return `${displayCount} items`;
  }

  if (isSelected) {
    return `${selectedCount}/${displayCount}${hasSearch ? " matching" : ""}`;
  }

  return `${displayCount}${hasSearch ? " matching" : ""}`;
}

function CategoryHeader({
  model,
  target,
  isExpanded,
  isLoading,
  targetCountLabel,
}: {
  model: TargetSelectionViewModel;
  target: Target;
  isExpanded: boolean;
  isLoading: boolean;
  targetCountLabel: string;
}) {
  const { targets } = model.selection;
  const { toggleTarget, toggleCategoryExpanded } = model.actions;
  const isSelected = targets.includes(target.id);
  const categoryButtonLabel = isLoading
    ? `Loading ${target.label}`
    : isSelected
      ? `${isExpanded ? "Collapse" : "Expand"} ${target.label}`
      : `Select ${target.label}`;

  return (
    <div
      className={`flex items-start space-x-3 space-y-0 rounded-md border p-4 ${
        isSelected && isExpanded ? "rounded-b-none border-b-0" : ""
      }`}
      >
      <Checkbox
        id={target.id}
        checked={isSelected}
        onCheckedChange={() => toggleTarget(target.id)}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <Label
            htmlFor={target.id}
            className="min-w-0 cursor-pointer text-base font-medium leading-tight break-words"
          >
            {target.label}
          </Label>
          <span className="inline-flex shrink-0 self-start rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {targetCountLabel}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{target.description}</p>
      </div>
      <button
        type="button"
        aria-label={categoryButtonLabel}
        aria-expanded={isSelected ? isExpanded : undefined}
        className="text-muted-foreground hover:text-foreground transition-colors p-1"
        onClick={e => {
          e.preventDefault();
          if (!isSelected) {
            toggleTarget(target.id);
          } else {
            toggleCategoryExpanded(target.id);
          }
        }}
      >
        {isLoading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : isSelected && isExpanded ? (
          <ChevronDown className="size-5" />
        ) : (
          <ChevronRight className="size-5" />
        )}
      </button>
    </div>
  );
}

function CISPolicyPanel({ model }: { model: TargetSelectionViewModel }) {
  const {
    cisManifest,
    cisLoading,
  } = model.data;
  const {
    expandedCISCategories,
  } = model.expansion;
  const {
    selectedCISPolicies,
  } = model.selection;
  const {
    normalized,
  } = model.search;
  const {
    selectAllCIS,
    deselectAllCIS,
    toggleCISCategoryExpanded,
    toggleCISCategoryPolicies,
    toggleCISPolicy,
    isCISCategoryFullySelected,
    isCISCategoryPartiallySelected,
  } = model.actions;

  return (
    <div className="border border-t-0 rounded-b-md p-4 bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Select CIS Benchmark Policies</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={selectAllCIS} className="h-7 text-xs">All</Button>
          <Button variant="ghost" size="sm" onClick={deselectAllCIS} className="h-7 text-xs">None</Button>
        </div>
      </div>

      {cisLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">Loading CIS policies…</span>
        </div>
      ) : cisManifest ? (
        <div className="space-y-2">
          {cisManifest.categories.map(category => {
            const isCatExpanded = expandedCISCategories.has(category.folder);
            const categoryPolicies = cisManifest.files.filter(f => f.category === category.folder);
            const filteredCategoryPolicies = normalized
              ? categoryPolicies.filter(p => cisFileMatchesSearch(p, normalized))
              : categoryPolicies;
            const categoryPolicyPaths = categoryPolicies.map((p) => p.path);
            const filteredCategoryPolicyPaths = filteredCategoryPolicies.map((p) => p.path);
            const selectedInCategory = countSelectedPaths(categoryPolicyPaths, selectedCISPolicies);
            const selectedMatchingInCategory = countSelectedPaths(filteredCategoryPolicyPaths, selectedCISPolicies);
            const currentFilteredCount = filteredCategoryPolicies.length;
            const currentDisplayCount = normalized ? currentFilteredCount : category.count;
            const displaySelected = normalized ? selectedMatchingInCategory : selectedInCategory;

            if (normalized && currentFilteredCount === 0) return null;

            return (
              <div key={category.folder} className="border rounded-md bg-background">
                <div className="flex items-center p-3 gap-2">
                  <Checkbox
                    id={`cis-cat-${category.folder}`}
                    checked={isCISCategoryFullySelected(category.folder)}
                    className={isCISCategoryPartiallySelected(category.folder) ? "data-[state=checked]:bg-primary/50" : ""}
                    onCheckedChange={() => toggleCISCategoryPolicies(category.folder)}
                  />
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-between cursor-pointer text-left"
                    onClick={() => toggleCISCategoryExpanded(category.folder)}
                  >
                    <div>
                      <Label className="font-medium cursor-pointer">{category.name}</Label>
                      <p className="text-xs text-muted-foreground">
                        {displaySelected} of {currentDisplayCount} policies{normalized ? " matching" : " selected"}
                      </p>
                    </div>
                    <span className="inline-flex size-6 items-center justify-center rounded-md">
                      {isCatExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </span>
                  </button>
                </div>
                {isCatExpanded && (
                  <div className="border-t px-3 py-2 space-y-1 max-h-64 overflow-y-auto">
                    {filteredCategoryPolicies.length > 0 ? (
                      filteredCategoryPolicies.map(policy => (
                        <div key={policy.path} className="flex items-center gap-x-2 py-1 px-2 rounded hover:bg-muted/50">
                          <Checkbox
                            id={`cis-policy-${policy.path}`}
                            checked={selectedCISPolicies.has(policy.path)}
                            onCheckedChange={() => toggleCISPolicy(policy.path)}
                          />
                          <Label htmlFor={`cis-policy-${policy.path}`} className="text-sm cursor-pointer flex-1 truncate" title={`${IMPORT_PREFIX}${policy.displayName}`}>
                            {IMPORT_PREFIX}{policy.displayName}
                          </Label>
                          <span className="text-xs text-muted-foreground shrink-0">{policy.subcategory}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">No policies match your search.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Failed to load CIS manifest.</p>
      )}

      {selectedCISPolicies.size === 0 && !cisLoading && (
        <p className="text-sm text-destructive">Please select at least one CIS policy</p>
      )}
    </div>
  );
}

function BaselinePolicyPanel({
  model,
  selected,
  isLoading,
}: {
  model: TargetSelectionViewModel;
  selected: Set<string>;
  isLoading: boolean;
}) {
  const {
    baselineManifest,
  } = model.data;
  const {
    expandedPlatforms,
  } = model.expansion;
  const {
    normalized,
  } = model.search;
  const {
    selectAllInCategory,
    deselectAllInCategory,
    togglePlatformExpanded,
    togglePlatformPolicies,
    isPlatformFullySelected,
    isPlatformPartiallySelected,
    toggleItem,
  } = model.actions;

  return (
    <div className="border border-t-0 rounded-b-md p-4 bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Select OpenIntuneBaseline Policies</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => selectAllInCategory("baseline")} className="h-7 text-xs">All</Button>
          <Button variant="ghost" size="sm" onClick={() => deselectAllInCategory("baseline")} className="h-7 text-xs">None</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">Loading baseline policies…</span>
        </div>
      ) : baselineManifest ? (
        <div className="space-y-2">
          {baselineManifest.platforms.map(platform => {
            const platformId = platform.id as OIBPlatformId;
            const isPlatExpanded = expandedPlatforms.has(platformId);
            const platformPolicies = baselineManifest.files.filter(f => f.platform === platformId);
            const filteredPlatformPolicies = normalized
              ? platformPolicies.filter(p => baselineFileMatchesSearch(p, normalized))
              : platformPolicies;
            const platformPolicyPaths = platformPolicies.map((p) => p.path);
            const filteredPlatformPolicyPaths = filteredPlatformPolicies.map((p) => p.path);
            const selectedInPlatform = countSelectedPaths(platformPolicyPaths, selected);
            const selectedMatchingInPlatform = countSelectedPaths(filteredPlatformPolicyPaths, selected);
            const currentFilteredCount = filteredPlatformPolicies.length;
            const currentDisplayCount = normalized ? currentFilteredCount : platform.count;
            const displaySelected = normalized ? selectedMatchingInPlatform : selectedInPlatform;

            if (normalized && currentFilteredCount === 0) return null;

            return (
              <div key={platformId} className="border rounded-md bg-background">
                <div className="flex items-center p-3 gap-2">
                  <Checkbox
                    id={`platform-${platformId}`}
                    checked={isPlatformFullySelected(platformId)}
                    className={isPlatformPartiallySelected(platformId) ? "data-[state=checked]:bg-primary/50" : ""}
                    onCheckedChange={() => togglePlatformPolicies(platformId)}
                  />
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-between cursor-pointer text-left"
                    onClick={() => togglePlatformExpanded(platformId)}
                  >
                    <div>
                      <Label className="font-medium cursor-pointer">
                        {platform.name || PLATFORM_NAMES[platformId]}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {displaySelected} of {currentDisplayCount} policies{normalized ? " matching" : " selected"}
                      </p>
                    </div>
                    <span className="inline-flex size-6 items-center justify-center rounded-md">
                      {isPlatExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </span>
                  </button>
                </div>
                {isPlatExpanded && (
                  <div className="border-t px-3 py-2 space-y-1 max-h-64 overflow-y-auto">
                    {filteredPlatformPolicies.length > 0 ? (
                      filteredPlatformPolicies.map(policy => (
                        <div key={policy.path} className="flex items-center gap-x-2 py-1 px-2 rounded hover:bg-muted/50">
                          <Checkbox
                            id={`policy-${policy.path}`}
                            checked={selected.has(policy.path)}
                            onCheckedChange={() => toggleItem("baseline", policy.path)}
                          />
                          <Label htmlFor={`policy-${policy.path}`} className="text-sm cursor-pointer flex-1 truncate" title={policy.displayName}>
                            {policy.displayName}
                          </Label>
                          <span className="text-xs text-muted-foreground shrink-0">{policy.policyType || "Config"}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">No policies match your search.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Failed to load baseline manifest.</p>
      )}

      {selected.size === 0 && !isLoading && (
        <p className="text-sm text-destructive">Please select at least one baseline policy</p>
      )}
    </div>
  );
}

function GenericCategoryPanel({
  model,
  target,
  items,
  selected,
  isLoading,
}: {
  model: TargetSelectionViewModel;
  target: Target;
  items: CategoryItem[];
  selected: Set<string>;
  isLoading: boolean;
}) {
  const { normalized } = model.search;
  const { selectAllInCategory, deselectAllInCategory, toggleItem } = model.actions;
  const filteredItems = filterItemsBySearch(items, normalized);

  return (
    <div className="border border-t-0 rounded-b-md p-4 bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Select {target.label}</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => selectAllInCategory(target.id)} className="h-7 text-xs">All</Button>
          <Button variant="ghost" size="sm" onClick={() => deselectAllInCategory(target.id)} className="h-7 text-xs">None</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">Loading {target.label.toLowerCase()}...</span>
        </div>
      ) : items.length > 0 ? (
        filteredItems.length > 0 ? (
          <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md bg-background p-2">
            {filteredItems.map(item => (
              <div key={item.displayName} className="flex items-center gap-x-2 py-1 px-2 rounded hover:bg-muted/50">
                <Checkbox
                  id={`item-${target.id}-${item.displayName}`}
                  checked={selected.has(item.displayName)}
                  onCheckedChange={() => toggleItem(target.id, item.displayName)}
                />
                <Label
                  htmlFor={`item-${target.id}-${item.displayName}`}
                  className="text-sm cursor-pointer flex-1 truncate"
                  title={item.description || item.displayName}
                >
                  {item.displayName}
                </Label>
                {item.subtype && (
                  <span className="text-xs text-muted-foreground shrink-0">{item.subtype}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No items match your search.</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">No items available.</p>
      )}

      {selected.size === 0 && !isLoading && items.length > 0 && (
        <p className="text-sm text-destructive">Please select at least one {target.label.toLowerCase().replace(/s$/, "")}</p>
      )}
    </div>
  );
}

export function TargetSelectionCategoryView({
  model,
  target,
}: TargetSelectionCategoryViewProps) {
  const { targets, selectedItems } = model.selection;
  const { expandedCategories } = model.expansion;
  const { loadingCategories, categoryItems } = model.data;
  const { normalized } = model.search;
  const isExpanded = expandedCategories.has(target.id);
  const isLoading = loadingCategories.has(target.id);
  const items = categoryItems[target.id] || [];
  const selected = selectedItems[target.id] || new Set();
  const selectedCount = model.selection.getSelectedCount(target.id);
  const totalCount = model.selection.getTotalCount(target.id);
  const { filteredCount, selectedMatchingCount, isLoaded } = getFilteredData(model, target, items, selected);
  const displayCount = normalized && isLoaded ? filteredCount : totalCount;
  const displaySelectedCount = normalized ? selectedMatchingCount : selectedCount;
  const targetCountLabel = getTargetCountLabel({
    isSelected: targets.includes(target.id),
    selectedCount: displaySelectedCount,
    displayCount,
    isLoaded,
    hasSearch: !!normalized,
  });

  return (
    <div>
      <CategoryHeader
        model={model}
        target={target}
        isExpanded={isExpanded}
        isLoading={isLoading}
        targetCountLabel={targetCountLabel}
      />
      {target.id === "cisBaseline" && targets.includes("cisBaseline") && isExpanded && (
        <CISPolicyPanel model={model} />
      )}
      {target.id === "baseline" && targets.includes("baseline") && isExpanded && (
        <BaselinePolicyPanel model={model} selected={selected} isLoading={isLoading} />
      )}
      {target.id !== "cisBaseline" && target.id !== "baseline" && targets.includes(target.id) && isExpanded && (
        <GenericCategoryPanel
          model={model}
          target={target}
          items={items}
          selected={selected}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
