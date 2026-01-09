"use client";

import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PrerequisiteCheckResult, PrerequisiteCheckStatus } from "@/types/prerequisites";
import { useWizardState } from "@/hooks/useWizardState";
import { InfoIcon, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { createGraphClient } from "@/lib/graph/client";
import { validatePrerequisites } from "@/lib/graph/prerequisites";

export function TenantConfig() {
  const { state, setTenantConfig, setPrerequisiteResult: setWizardPrerequisiteResult, nextStep } = useWizardState();
  const { accounts } = useMsal();
  const [isLoading, setIsLoading] = useState(false);
  const [prerequisiteStatus, setPrerequisiteStatus] = useState<PrerequisiteCheckStatus>("pending");
  const [prerequisiteResult, setPrerequisiteResult] = useState<PrerequisiteCheckResult | null>(null);

  // Get tenant info directly from signed-in account
  const tenantId = accounts.length > 0 ? accounts[0].tenantId : "";
  const tenantName = prerequisiteResult?.organization?.displayName || "";

  // Run prerequisite checks when component mounts or account changes
  useEffect(() => {
    async function runPrerequisiteChecks() {
      if (accounts.length > 0 && !state.tenantConfig) {
        try {
          setIsLoading(true);
          setPrerequisiteStatus("checking");

          // Always use global cloud environment (user's signed-in environment)
          const graphClient = createGraphClient("global");

          // Validate prerequisites (includes organization info, licenses, permissions)
          const result = await validatePrerequisites(graphClient);
          setPrerequisiteResult(result);
          setWizardPrerequisiteResult(result); // Store in wizard state for execution

          // Set status based on validation result
          if (result.errors.length > 0) {
            setPrerequisiteStatus("error");
          } else if (result.warnings.length > 0) {
            setPrerequisiteStatus("warning");
          } else {
            setPrerequisiteStatus("success");
          }
        } catch (error) {
          console.error("Failed to validate prerequisites:", error);
          setPrerequisiteStatus("error");
          setPrerequisiteResult({
            organization: null,
            licenses: null,
            permissions: null,
            isValid: false,
            warnings: [],
            errors: [error instanceof Error ? error.message : "Unknown error"],
            timestamp: new Date(),
          });
        } finally {
          setIsLoading(false);
        }
      }
    }

    runPrerequisiteChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, state.tenantConfig]);

  const handleRecheck = async () => {
    if (accounts.length === 0) return;

    try {
      setPrerequisiteStatus("checking");
      const graphClient = createGraphClient("global");
      const result = await validatePrerequisites(graphClient);
      setPrerequisiteResult(result);
      setWizardPrerequisiteResult(result); // Store in wizard state for execution

      // Set status based on validation result
      if (result.errors.length > 0) {
        setPrerequisiteStatus("error");
      } else if (result.warnings.length > 0) {
        setPrerequisiteStatus("warning");
      } else {
        setPrerequisiteStatus("success");
      }
    } catch (error) {
      console.error("Failed to recheck prerequisites:", error);
      setPrerequisiteStatus("error");
    }
  };

  const handleContinue = () => {
    setTenantConfig({
      tenantId,
      tenantName: tenantName || undefined,
      cloudEnvironment: "global", // Always use global environment
    });
    nextStep();
  };

  const isValid = tenantId.length > 0 && prerequisiteResult?.isValid !== false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant Configuration</CardTitle>
        <CardDescription>
          Validate your Microsoft Intune tenant prerequisites
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            Managing tenant: <strong>{tenantName || tenantId || "Loading..."}</strong>
            <br />
            To manage a different tenant, sign out and sign in with that account.
          </AlertDescription>
        </Alert>

        {/* Tenant Information Display */}
        <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Organization</Label>
            <p className="text-sm font-medium">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading organization info...
                </span>
              ) : (
                tenantName || "Unknown Organization"
              )}
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Tenant ID</Label>
            <p className="text-sm font-mono">{tenantId || "Not signed in"}</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Cloud Environment</Label>
            <p className="text-sm">Global (Commercial)</p>
          </div>

          {accounts.length > 0 && accounts[0].username && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Signed in as</Label>
              <p className="text-sm">{accounts[0].username}</p>
            </div>
          )}
        </div>

        {/* Prerequisite Checks */}
        {accounts.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Prerequisite Checks</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecheck}
                disabled={prerequisiteStatus === "checking"}
              >
                {prerequisiteStatus === "checking" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Recheck</span>
              </Button>
            </div>

            {prerequisiteStatus === "checking" && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Validating tenant prerequisites...
                </AlertDescription>
              </Alert>
            )}

            {prerequisiteStatus === "success" && prerequisiteResult && (
              <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertTitle className="text-green-800 dark:text-green-200">
                  All Prerequisites Met
                </AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>
                        Organization: {prerequisiteResult.organization?.displayName}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <div className="space-y-0.5">
                        <p>
                          Intune License: Found ({prerequisiteResult.licenses?.intuneServicePlans.length || 0} plan
                          {(prerequisiteResult.licenses?.intuneServicePlans.length || 0) !== 1 ? "s" : ""})
                        </p>
                        {prerequisiteResult.licenses?.intuneServicePlans && prerequisiteResult.licenses.intuneServicePlans.length > 0 && (
                          <ul className="list-disc list-inside ml-2">
                            {prerequisiteResult.licenses.intuneServicePlans.map((plan, idx) => (
                              <li key={idx} className="text-xs">{plan}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    {prerequisiteResult.licenses?.hasPremiumP2License && (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <div className="space-y-0.5">
                          <p>
                            Azure AD Premium P2: Found ({prerequisiteResult.licenses.premiumP2ServicePlans.length} plan
                            {prerequisiteResult.licenses.premiumP2ServicePlans.length !== 1 ? "s" : ""})
                          </p>
                          {prerequisiteResult.licenses.premiumP2ServicePlans.length > 0 && (
                            <ul className="list-disc list-inside ml-2">
                              {prerequisiteResult.licenses.premiumP2ServicePlans.map((plan, idx) => (
                                <li key={idx} className="text-xs">{plan}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {prerequisiteStatus === "warning" && prerequisiteResult && (
              <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-900 dark:text-blue-100">
                  Prerequisites Met with Warnings
                </AlertTitle>
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  <div className="mt-2 space-y-2 text-sm">
                    {prerequisiteResult.organization && (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                        <span>
                          Organization: {prerequisiteResult.organization.displayName}
                        </span>
                      </div>
                    )}
                    {prerequisiteResult.licenses?.hasIntuneLicense && (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" />
                        <div className="space-y-0.5">
                          <p>
                            Intune License: Found ({prerequisiteResult.licenses.intuneServicePlans.length} plan
                            {prerequisiteResult.licenses.intuneServicePlans.length !== 1 ? "s" : ""})
                          </p>
                          {prerequisiteResult.licenses.intuneServicePlans.length > 0 && (
                            <ul className="list-disc list-inside ml-2">
                              {prerequisiteResult.licenses.intuneServicePlans.map((plan, idx) => (
                                <li key={idx} className="text-xs">{plan}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                    {prerequisiteResult.warnings.map((warning, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {prerequisiteStatus === "error" && prerequisiteResult && (
              <Alert className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-800 dark:text-red-200">
                  Prerequisite Check Failed
                </AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-300">
                  <div className="mt-2 space-y-2 text-sm">
                    {prerequisiteResult.errors.map((error, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    ))}
                    {prerequisiteResult.warnings.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                        {prerequisiteResult.warnings.map((warning, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="pt-4">
          <Button onClick={handleContinue} disabled={!isValid} className="w-full">
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
