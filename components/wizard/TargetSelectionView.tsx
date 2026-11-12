import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";
import { TargetSelectionCategoryView } from "@/components/wizard/TargetSelectionCategoryView";
import { TargetSelectionConsole } from "@/components/wizard/TargetSelectionConsole";
import { ScopeProfilesPanel } from "@/components/wizard/ScopeProfilesPanel";
import type { TargetSelectionViewModel } from "@/components/wizard/targetSelectionTypes";

export function TargetSelectionView({ model }: { model: TargetSelectionViewModel }) {
  const {
    search,
    data,
    selection,
    navigation,
    profiles,
  } = model;
  // While a profile apply loads catalogs, the selection must not change and the step must
  // not continue with the previous scope.
  const locked = profiles.isApplying;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target Selection</CardTitle>
        <CardDescription>
          Choose which configurations to deploy or remove. Expand each category to select individual items.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset disabled={locked} aria-busy={locked} className="m-0 min-w-0 border-0 p-0">
          <TargetSelectionConsole model={model} />
        </fieldset>

        <ScopeProfilesPanel model={model} />

        <fieldset disabled={locked} aria-busy={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <legend className="sr-only">Categories and items</legend>
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
        </fieldset>

        {locked && (
          <p id="target-selection-locked" className="text-sm text-muted-foreground">
            The app is applying a scope profile. Wait until it finishes, then review the selection.
          </p>
        )}
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={navigation.previousStep}
            disabled={locked}
            aria-describedby={locked ? "target-selection-locked" : undefined}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={navigation.continue}
            disabled={!selection.isValid || locked}
            aria-describedby={locked ? "target-selection-locked" : undefined}
            className="flex-1"
          >
            Review Selection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
