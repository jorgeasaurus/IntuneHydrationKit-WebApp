"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Eye } from "lucide-react";
import { OperationMode } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";

export function OperationModeSelection() {
  const { state, setOperationMode, setIsPreview, nextStep, previousStep } = useWizardState();
  const [mode, setMode] = useState<OperationMode>(state.operationMode || "create");
  const [isPreview, setIsPreviewLocal] = useState(state.isPreview || false);

  const handleContinue = () => {
    setOperationMode(mode);
    setIsPreview(isPreview);
    nextStep();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operation Mode</CardTitle>
        <CardDescription>
          Choose how you want to interact with your Intune tenant
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={mode} onValueChange={(value) => setMode(value as OperationMode)}>
          <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
            <RadioGroupItem value="create" id="create" />
            <div className="space-y-1">
              <Label htmlFor="create" className="font-medium cursor-pointer">
                Create
              </Label>
              <p className="text-sm text-muted-foreground">
                Deploy new configurations to your Intune tenant. Skips objects that already
                exist.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
            <RadioGroupItem value="delete" id="delete" />
            <div className="space-y-1">
              <Label htmlFor="delete" className="font-medium cursor-pointer">
                Delete
              </Label>
              <p className="text-sm text-muted-foreground">
                Remove configurations created by this tool from your tenant.
              </p>
            </div>
          </div>
        </RadioGroup>

        {/* Preview checkbox */}
        <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50">
          <Checkbox
            id="preview"
            checked={isPreview}
            onCheckedChange={(checked) => setIsPreviewLocal(checked as boolean)}
          />
          <div className="space-y-1">
            <Label htmlFor="preview" className="font-medium cursor-pointer flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview (WhatIf)
            </Label>
            <p className="text-sm text-muted-foreground">
              Show what would happen without making any changes. {mode === "create" ? "Items that already exist will be marked as skipped." : "Items that would be deleted will be shown."}
            </p>
          </div>
        </div>

        {mode === "delete" && !isPreview && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning: Delete Mode</AlertTitle>
            <AlertDescription>
              Delete mode will remove configurations created by this tool. Only objects with
              &quot;Imported by Intune Hydration Kit&quot; in the description will be deleted.
              Conditional Access policies must be disabled to be deleted.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={previousStep} className="flex-1">
            Back
          </Button>
          <Button onClick={handleContinue} className="flex-1">
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
