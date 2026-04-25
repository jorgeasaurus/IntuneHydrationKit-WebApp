"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWizardState } from "@/hooks/useWizardState";
import { TEMPLATE_METADATA } from "@/templates";
import { getEstimatedTaskCount, getEstimatedCategoryCount } from "@/lib/hydration/engine";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const CLOUD_ENVIRONMENT_LABELS = {
  global: "Global (Commercial)",
  usgov: "US Government (GCC High)",
  usgovdod: "US Government (DoD)",
  germany: "Germany",
  china: "China (21Vianet)",
} as const;

function getModeLabel(
  operationMode: "create" | "delete" | undefined,
  isPreview: boolean
): string {
  const baseLabel = operationMode === "delete" ? "Delete" : "Create";

  if (isPreview) {
    return `${baseLabel} (Preview)`;
  }

  return baseLabel;
}

function getActionButtonText(
  operationMode: "create" | "delete" | undefined,
  isPreview: boolean
): string {
  if (isPreview) {
    return operationMode === "delete" ? "Preview Delete" : "Preview Create";
  }

  return operationMode === "delete" ? "Start Deletion" : "Start Hydration";
}

function getOutcomeSummary(
  operationMode: "create" | "delete" | undefined,
  isPreview: boolean
): string {
  if (isPreview) {
    return `Read-only preview of ${operationMode === "delete" ? "eligible deletions" : "new objects"}.`;
  }

  if (operationMode === "delete") {
    return "Deletes hydration-tagged objects that still qualify for removal.";
  }

  return "Creates missing objects and skips matches.";
}

export function ReviewConfirm(): React.JSX.Element {
  const { state, setConfirmed, previousStep } = useWizardState();
  const [acknowledged, setAcknowledged] = useState(false);
  const router = useRouter();

  function handleStart(): void {
    setConfirmed(true);
    router.push("/dashboard");
  }

  const estimatedObjects = getEstimatedTaskCount(
    state.selectedTargets,
    state.categorySelections
  );
  const showConditionalAccessReminder =
    state.operationMode === "create" && state.selectedTargets.includes("conditionalAccess");

  return (
    <Card className="data-card rounded-2xl border bg-card/90 backdrop-blur">
      <CardHeader>
        <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-hydrate">
          Final Briefing
        </p>
        <CardTitle>Review & Confirm</CardTitle>
        <CardDescription>
          Review scope, safety rails, and impact before the run starts.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Operation
            </p>
            <p className="mt-2 text-lg font-semibold">
              {getModeLabel(state.operationMode, state.isPreview)}
            </p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Categories
            </p>
            <p className="mt-2 text-lg font-semibold">{state.selectedTargets.length}</p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Estimated objects
            </p>
            <p className="mt-2 text-lg font-semibold">{estimatedObjects}</p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Readiness
            </p>
            <p className="mt-2 text-lg font-semibold">
              {state.prerequisiteResult?.isValid ? "Validated" : "Review warnings"}
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-border/80 bg-background/60 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-hydrate" />
                <p className="text-sm font-semibold">Execution brief</p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                    Tenant
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {state.tenantConfig?.tenantName || "Not set"}
                  </p>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {state.tenantConfig?.tenantId || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                    Cloud environment
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {state.tenantConfig
                      ? CLOUD_ENVIRONMENT_LABELS[state.tenantConfig.cloudEnvironment]
                      : "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                    Execution mode
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {getModeLabel(state.operationMode, state.isPreview)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                    Outcome
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {getOutcomeSummary(state.operationMode, state.isPreview)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-background/60 p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-hydrate" />
                <p className="text-sm font-semibold">Selected targets</p>
              </div>

              <div className="mt-4 space-y-3">
                {state.selectedTargets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No targets selected</p>
                ) : (
                  state.selectedTargets.map((target) => {
                    const meta = TEMPLATE_METADATA[target as keyof typeof TEMPLATE_METADATA];
                    const count = getEstimatedCategoryCount(target, state.categorySelections);

                    return (
                      <div
                        key={target}
                        className="flex items-center justify-between rounded-xl border border-border/80 bg-card/70 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium">{meta?.displayName || target}</p>
                          <p className="text-sm text-muted-foreground">Included in this run</p>
                        </div>
                        <div className="rounded-full border border-border/80 bg-background/70 px-3 py-1 text-sm font-medium">
                          {count} items
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-hydrate/30 bg-hydrate/10 px-4 py-3">
                <p className="font-semibold">Estimated total impact</p>
                <p className="text-lg font-bold">{estimatedObjects} objects</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border/80 bg-background/60 p-5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-hydrate" />
                <p className="text-sm font-semibold">Safety rails</p>
              </div>

              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <div className="rounded-xl border border-border/80 bg-card/70 p-4">
                  {state.operationMode === "create"
                    ? "Create mode skips matching objects instead of blindly overwriting them."
                    : "Delete mode only removes objects carrying the Intune Hydration Kit marker."}
                </div>
                <div className="rounded-xl border border-border/80 bg-card/70 p-4">
                  {state.isPreview
                    ? "Preview mode issues read-only checks and never sends Graph mutations."
                    : "Live mode will begin immediately after acknowledgement; completed actions are not rolled back on cancel."}
                </div>
                <div className="rounded-xl border border-border/80 bg-card/70 p-4">
                  Conditional Access policies must be disabled before deletion. Review them
                  manually after create runs.
                </div>
              </div>
            </div>

            {showConditionalAccessReminder && (
              <Alert className="border-amber-500/30 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Conditional Access reminder</AlertTitle>
                <AlertDescription>
                  The run can create Conditional Access templates, but you should review and
                  enable those policies manually after verification.
                </AlertDescription>
              </Alert>
            )}

            {state.prerequisiteResult &&
              (state.prerequisiteResult.warnings.length > 0 ||
                state.prerequisiteResult.errors.length > 0) && (
                <Alert className="border-blue-500/30 bg-blue-500/10">
                  {state.prerequisiteResult.errors.length > 0 ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  <AlertTitle>Readiness notices</AlertTitle>
                  <AlertDescription className="space-y-2">
                    {state.prerequisiteResult.errors.map((error, index) => (
                      <p key={`error-${index}`}>{error}</p>
                    ))}
                    {state.prerequisiteResult.warnings.map((warning, index) => (
                      <p key={`warning-${index}`}>{warning}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
          </div>
        </div>

        {!state.isPreview && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5">
            <div className="flex items-start space-x-3 space-y-0">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked as boolean)}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="acknowledge"
                  className="cursor-pointer font-medium text-blue-900 dark:text-blue-100"
                >
                  I understand this run will modify my Intune tenant
                </Label>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  This operation will{" "}
                  {state.operationMode === "create" ? "create new" : "delete existing"}{" "}
                  configurations in your Intune tenant. Completed actions are not rolled back
                  automatically.
                </p>
              </div>
            </div>
          </div>
        )}

        {state.isPreview && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5">
            <p className="font-medium text-blue-900 dark:text-blue-100">Preview mode</p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Preview mode will check what would{" "}
              {state.operationMode === "create" ? "be created" : "be deleted"} without making
              any changes to your tenant.
            </p>
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={previousStep} className="flex-1">
            Back
          </Button>
          <Button
            onClick={handleStart}
            disabled={!acknowledged && !state.isPreview}
            className="flex-1"
          >
            {getActionButtonText(state.operationMode, state.isPreview)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
