import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";
import { TargetSelectionCategoryView } from "@/components/wizard/TargetSelectionCategoryView";
import { TargetSelectionConsole } from "@/components/wizard/TargetSelectionConsole";
import type { TargetSelectionViewModel } from "@/components/wizard/targetSelectionTypes";

export function TargetSelectionView({ model }: { model: TargetSelectionViewModel }) {
  const {
    search,
    data,
    selection,
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
        <TargetSelectionConsole model={model} />

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
