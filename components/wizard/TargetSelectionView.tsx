import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { TargetSelectionCategoryView } from "@/components/wizard/TargetSelectionCategoryView";
import {
  OS_PLATFORM_FILTERS,
  TARGETS,
} from "@/components/wizard/targetSelectionModel";
import type { TargetSelectionViewModel } from "@/components/wizard/targetSelectionTypes";

export function TargetSelectionView({ model }: { model: TargetSelectionViewModel }) {
  const {
    search,
    platformFilters,
    data,
    selection,
    actions,
    navigation,
  } = model;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target Selection</CardTitle>
        <CardDescription>
          Choose which configurations to deploy or remove. Expand each category to select individual items.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search categories and policies..."
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {search.query && (
              <button
                type="button"
                onClick={() => search.setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={actions.selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={actions.deselectAll}>
            Deselect All
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 items-center py-2 px-1 border rounded-md bg-muted/30">
          <span className="text-sm font-medium text-muted-foreground pl-2">Filter by OS:</span>
          {OS_PLATFORM_FILTERS.map(platform => (
            <div key={platform.id} className="flex items-center gap-2">
                <Checkbox
                  id={`platform-filter-${platform.id}`}
                  checked={platformFilters.selected.has(platform.id)}
                  onCheckedChange={() => platformFilters.toggle(platform.id)}
                />
              <Label
                htmlFor={`platform-filter-${platform.id}`}
                className="text-sm cursor-pointer"
              >
                {platform.label}
              </Label>
            </div>
          ))}
        </div>

        {search.normalized && (
          <p className="text-sm text-muted-foreground">
            Showing {data.filteredTargets.length} of {TARGETS.length} categories matching &quot;{search.query}&quot;
          </p>
        )}

        <div className="space-y-4">
          {data.filteredTargets.length === 0 && search.normalized && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="size-8 mx-auto mb-2 opacity-50" />
              <p>No categories or policies match &quot;{search.query}&quot;</p>
              <Button variant="link" onClick={() => search.setQuery("")} className="mt-2">
                Clear search
              </Button>
            </div>
          )}
          {data.filteredTargets.map(target => (
            <TargetSelectionCategoryView
              key={target.id}
              model={model}
              target={target}
            />
          ))}
        </div>

        {selection.targets.length > 0 && (
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm font-medium">
              Total: {selection.targets.length} {selection.targets.length === 1 ? "category" : "categories"} ({selection.totalSelectedCount} items)
            </p>
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={navigation.previousStep} className="flex-1">
            Back
          </Button>
          <Button onClick={navigation.continue} disabled={!selection.isValid} className="flex-1">
            Review Selection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
