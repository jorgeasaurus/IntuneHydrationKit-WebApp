"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskCategory } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";
import { TEMPLATE_METADATA } from "@/templates";

interface Target {
  id: TaskCategory;
  label: string;
  description: string;
  count: number;
}

// Build targets from template metadata
const TARGETS: Target[] = Object.entries(TEMPLATE_METADATA).map(([key, meta]) => ({
  id: key as TaskCategory,
  label: meta.displayName,
  description: meta.description,
  count: meta.count,
}));

export function TargetSelection() {
  const { state, setSelectedTargets, nextStep, previousStep } = useWizardState();
  const [targets, setTargets] = useState<TaskCategory[]>(state.selectedTargets || []);

  const handleToggle = (targetId: TaskCategory) => {
    setTargets((prev) =>
      prev.includes(targetId)
        ? prev.filter((id) => id !== targetId)
        : [...prev, targetId]
    );
  };

  const handleSelectAll = () => {
    setTargets(TARGETS.map((t) => t.id));
  };

  const handleDeselectAll = () => {
    setTargets([]);
  };

  const handleContinue = () => {
    setSelectedTargets(targets);
    // Skip baseline config step if baseline is not selected
    if (targets.includes("baseline")) {
      nextStep();
    } else {
      // Jump to review step (step 5)
      nextStep();
      nextStep();
    }
  };

  const totalCount = TARGETS.filter((t) => targets.includes(t.id)).reduce(
    (sum, t) => sum + t.count,
    0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target Selection</CardTitle>
        <CardDescription>
          Choose which configurations to deploy or remove
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeselectAll}>
            Deselect All
          </Button>
        </div>

        <div className="space-y-4">
          {TARGETS.map((target) => (
            <div
              key={target.id}
              className="flex items-start space-x-3 space-y-0 rounded-md border p-4"
            >
              <Checkbox
                id={target.id}
                checked={targets.includes(target.id)}
                onCheckedChange={() => handleToggle(target.id)}
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor={target.id} className="font-medium cursor-pointer">
                  {target.label}{" "}
                  <span className="text-sm text-muted-foreground">
                    ({target.count} {target.count === 1 ? "item" : "items"})
                  </span>
                </Label>
                <p className="text-sm text-muted-foreground">{target.description}</p>
              </div>
            </div>
          ))}
        </div>

        {targets.length > 0 && (
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm font-medium">
              Total: {targets.length} {targets.length === 1 ? "category" : "categories"} ({totalCount} items)
            </p>
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={previousStep} className="flex-1">
            Back
          </Button>
          <Button onClick={handleContinue} disabled={targets.length === 0} className="flex-1">
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
