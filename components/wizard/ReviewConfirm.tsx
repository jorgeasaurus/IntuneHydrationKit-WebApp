"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWizardState } from "@/hooks/useWizardState";
import { useRouter } from "next/navigation";
import { TEMPLATE_METADATA } from "@/templates";
import { getEstimatedTaskCount } from "@/lib/hydration/engine";

export function ReviewConfirm() {
  const { state, setConfirmed, previousStep } = useWizardState();
  const [acknowledged, setAcknowledged] = useState(false);
  const router = useRouter();

  const handleStart = () => {
    setConfirmed(true);
    // TODO: Navigate to execution dashboard
    router.push("/dashboard");
  };

  const getModeLabel = () => {
    switch (state.operationMode) {
      case "create":
        return "Create";
      case "delete":
        return "Delete";
      case "preview":
        return "Preview";
      default:
        return "Unknown";
    }
  };

  const getActionButtonText = () => {
    switch (state.operationMode) {
      case "create":
        return "Start Hydration";
      case "delete":
        return "Start Deletion";
      case "preview":
        return "Preview Changes";
      default:
        return "Start";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Confirm</CardTitle>
        <CardDescription>
          Review your configuration before proceeding
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Tenant ID</p>
              <p className="text-sm text-muted-foreground">
                {state.tenantConfig?.tenantId || "Not set"}
              </p>
            </div>
            {state.tenantConfig?.tenantName && (
              <div>
                <p className="text-sm font-medium">Tenant Name</p>
                <p className="text-sm text-muted-foreground">
                  {state.tenantConfig.tenantName}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium">Cloud Environment</p>
              <p className="text-sm text-muted-foreground capitalize">
                {state.tenantConfig?.cloudEnvironment || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Operation Mode</p>
              <p className="text-sm text-muted-foreground">{getModeLabel()}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Selected Targets</p>
            <div className="rounded-md border p-4">
              {state.selectedTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No targets selected</p>
              ) : (
                <ul className="text-sm space-y-2">
                  {state.selectedTargets.map((target) => {
                    const meta = TEMPLATE_METADATA[target as keyof typeof TEMPLATE_METADATA];
                    return (
                      <li key={target} className="flex justify-between">
                        <span>{meta?.displayName || target}</span>
                        <span className="text-muted-foreground">
                          {meta?.count || 0} items
                        </span>
                      </li>
                    );
                  })}
                  <li className="flex justify-between border-t pt-2 mt-2 font-medium">
                    <span>Total</span>
                    <span>{getEstimatedTaskCount(state.selectedTargets)} objects</span>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>

        {state.operationMode !== "preview" && (
          <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
            <Checkbox
              id="acknowledge"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked as boolean)}
            />
            <div className="space-y-1">
              <Label htmlFor="acknowledge" className="font-medium cursor-pointer">
                I understand this will modify my Intune tenant
              </Label>
              <p className="text-sm text-muted-foreground">
                This operation will {state.operationMode === "create" ? "create new" : "delete existing"} configurations in your Intune tenant.
              </p>
            </div>
          </div>
        )}

        {state.operationMode === "preview" && (
          <div className="rounded-md border p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
              Preview Mode
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Preview mode will not make any changes to your tenant. You can proceed without confirmation.
            </p>
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={previousStep} className="flex-1">
            Back
          </Button>
          <Button
            onClick={handleStart}
            disabled={!acknowledged && state.operationMode !== "preview"}
            className="flex-1"
          >
            {getActionButtonText()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
