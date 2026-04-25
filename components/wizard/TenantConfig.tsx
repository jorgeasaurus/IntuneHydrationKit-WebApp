"use client";

import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PrerequisiteCheckResult, PrerequisiteCheckStatus } from "@/types/prerequisites";
import { useWizardState } from "@/hooks/useWizardState";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { createGraphClient } from "@/lib/graph/client";
import { validatePrerequisites } from "@/lib/graph/prerequisites";
import { getSelectedCloudEnvironment, AuthSessionExpiredError } from "@/lib/auth/authUtils";
import { CloudEnvironment } from "@/types/hydration";

const CLOUD_ENVIRONMENT_LABELS: Record<CloudEnvironment, string> = {
  global: "Global (Commercial)",
  usgov: "US Government (GCC High)",
  usgovdod: "US Government (DoD)",
  germany: "Germany",
  china: "China (21Vianet)",
};

function getStatusFromResult(result: PrerequisiteCheckResult): PrerequisiteCheckStatus {
  if (result.errors.length > 0) return "error";
  if (result.warnings.length > 0) return "warning";
  return "success";
}

function createErrorResult(error: unknown): PrerequisiteCheckResult {
  const isAuthError =
    error instanceof AuthSessionExpiredError ||
    (error instanceof Error && error.message.includes("sign in"));
  const message = isAuthError
    ? "Your session has expired. Please sign out and sign in again."
    : error instanceof Error
      ? error.message
      : "Unknown error";

  return {
    organization: null,
    licenses: null,
    permissions: null,
    isValid: false,
    warnings: [],
    errors: [message],
    timestamp: new Date(),
  };
}

type CheckStatus = "success" | "warning" | "error" | "checking";

const CHECK_STYLES: Record<
  CheckStatus,
  {
    card: string;
    icon: string;
    label: string;
  }
> = {
  success: {
    card: "border-green-500/30 bg-green-500/10",
    icon: "text-green-500",
    label: "Healthy",
  },
  warning: {
    card: "border-amber-500/30 bg-amber-500/10",
    icon: "text-amber-500",
    label: "Partial",
  },
  error: {
    card: "border-red-500/30 bg-red-500/10",
    icon: "text-red-500",
    label: "Blocked",
  },
  checking: {
    card: "border-blue-500/30 bg-blue-500/10",
    icon: "text-blue-500",
    label: "Checking",
  },
};

export function TenantConfig(): React.JSX.Element {
  const {
    state,
    setTenantConfig,
    setPrerequisiteResult: setWizardPrerequisiteResult,
    nextStep,
  } = useWizardState();
  const { accounts } = useMsal();
  const [isLoading, setIsLoading] = useState(false);
  const [prerequisiteStatus, setPrerequisiteStatus] =
    useState<PrerequisiteCheckStatus>("pending");
  const [prerequisiteResult, setPrerequisiteResult] =
    useState<PrerequisiteCheckResult | null>(null);

  const tenantId = accounts.length > 0 ? accounts[0].tenantId : "";
  const tenantName = prerequisiteResult?.organization?.displayName || "";

  async function runPrerequisiteValidation(showLoadingState: boolean): Promise<void> {
    try {
      if (showLoadingState) {
        setIsLoading(true);
      }
      setPrerequisiteStatus("checking");

      const cloudEnv = getSelectedCloudEnvironment();
      const graphClient = createGraphClient(cloudEnv);
      const result = await validatePrerequisites(graphClient);
      setPrerequisiteResult(result);
      setWizardPrerequisiteResult(result);
      setPrerequisiteStatus(getStatusFromResult(result));
    } catch (error) {
      console.error("Failed to validate prerequisites:", error);
      setPrerequisiteStatus("error");
      setPrerequisiteResult(createErrorResult(error));
    } finally {
      if (showLoadingState) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (accounts.length > 0 && !state.tenantConfig) {
      void runPrerequisiteValidation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, state.tenantConfig]);

  async function handleRecheck(): Promise<void> {
    if (accounts.length === 0) return;
    await runPrerequisiteValidation(false);
  }

  function handleContinue(): void {
    const cloudEnv = getSelectedCloudEnvironment();
    setTenantConfig({
      tenantId,
      tenantName: tenantName || undefined,
      cloudEnvironment: cloudEnv,
    });
    nextStep();
  }

  const isValid = tenantId.length > 0 && prerequisiteResult?.isValid !== false;
  const cloudEnvironment = getSelectedCloudEnvironment();
  const validatedAt = prerequisiteResult?.timestamp
    ? new Date(prerequisiteResult.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const healthChecks = [
    {
      title: "Graph connectivity",
      value: prerequisiteResult?.organization?.displayName ?? "Waiting for response",
      detail: prerequisiteResult?.organization
        ? "Connected to the selected tenant and organization endpoint."
        : "Confirm the app can resolve tenant organization details.",
      status:
        prerequisiteStatus === "checking"
          ? "checking"
          : prerequisiteResult?.organization
            ? "success"
            : prerequisiteStatus === "error"
              ? "error"
              : "warning",
      icon: Cloud,
    },
    {
      title: "Intune license",
      value: prerequisiteResult?.licenses?.hasIntuneLicense
        ? `${prerequisiteResult.licenses.intuneServicePlans.length} service plan(s)`
        : "No qualifying license",
      detail: prerequisiteResult?.licenses?.hasIntuneLicense
        ? prerequisiteResult.licenses.intuneServicePlans.join(", ")
        : "An Intune-capable subscription is required before execution can continue.",
      status:
        prerequisiteStatus === "checking"
          ? "checking"
          : prerequisiteResult?.licenses?.hasIntuneLicense
            ? "success"
            : prerequisiteResult?.licenses
              ? "error"
              : "warning",
      icon: ShieldCheck,
    },
    {
      title: "Conditional Access readiness",
      value: prerequisiteResult?.licenses?.hasPremiumP2License
        ? "Risk-based CA supported"
        : prerequisiteResult?.licenses?.hasConditionalAccessLicense
          ? "Basic CA only"
          : "CA will be skipped",
      detail: prerequisiteResult?.licenses?.hasPremiumP2License
        ? "Premium P2 found for advanced Conditional Access templates."
        : prerequisiteResult?.licenses?.hasConditionalAccessLicense
          ? "P1-equivalent licensing exists, but risk-based templates will be skipped."
          : "No qualifying Entra ID Premium license detected for Conditional Access creation.",
      status:
        prerequisiteStatus === "checking"
          ? "checking"
          : prerequisiteResult?.licenses?.hasPremiumP2License
            ? "success"
            : "warning",
      icon: Sparkles,
    },
    {
      title: "Driver update profiles",
      value: prerequisiteResult?.licenses?.hasWindowsDriverUpdateLicense
        ? "Windows entitlement detected"
        : "Will be skipped",
      detail: prerequisiteResult?.licenses?.hasWindowsDriverUpdateLicense
        ? "Windows E3/E5-compatible licensing is available for driver update templates."
        : "Windows Driver Update profiles require Windows Enterprise or equivalent Microsoft 365 licensing.",
      status:
        prerequisiteStatus === "checking"
          ? "checking"
          : prerequisiteResult?.licenses?.hasWindowsDriverUpdateLicense
            ? "success"
            : "warning",
      icon: KeyRound,
    },
  ] as const;

  return (
    <Card className="data-card rounded-2xl border bg-card/90 backdrop-blur">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-hydrate">
              Readiness Gate
            </p>
            <CardTitle className="mt-2">Tenant Configuration</CardTitle>
            <CardDescription className="mt-2">
              Validate your Microsoft Intune tenant before anything mutates the environment.
            </CardDescription>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3 text-sm">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Validation status
            </p>
            <p className="mt-2 font-medium">
              {prerequisiteStatus === "checking"
                ? "Running checks"
                : prerequisiteResult?.isValid
                  ? "Ready to continue"
                  : "Action required"}
            </p>
            {validatedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Last checked at {validatedAt}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Organization
            </p>
            <p className="mt-3 text-base font-semibold">
              {isLoading ? "Resolving tenant..." : tenantName || "Unknown organization"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This run stays scoped to the currently signed-in tenant.
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Tenant ID
            </p>
            <p className="mt-3 break-all text-sm font-medium">
              {tenantId || "Not signed in"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use sign out if you need to pivot to another tenant.
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Cloud environment
            </p>
            <p className="mt-3 text-base font-semibold">
              {CLOUD_ENVIRONMENT_LABELS[cloudEnvironment]}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Authentication and Graph routing inherit the environment chosen at sign-in.
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Operator
            </p>
            <p className="mt-3 text-base font-semibold">
              {accounts[0]?.username || "Not signed in"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Delegated permissions are evaluated through the active user session.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-muted/20 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
                Health checklist
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                These checks mirror the go/no-go criteria used before the wizard advances.
              </p>
            </div>

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
              <span className="ml-2">Recheck readiness</span>
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {healthChecks.map((check) => {
              const Icon = check.icon;
              const style = CHECK_STYLES[check.status];

              return (
                <div
                  key={check.title}
                  className={`rounded-2xl border p-4 ${style.card}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`rounded-xl border border-current/20 bg-background/70 p-2 ${style.icon}`}
                    >
                      {check.status === "checking" ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : check.status === "error" ? (
                        <XCircle className="h-5 w-5" />
                      ) : check.status === "warning" ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span className="rounded-full border border-current/20 bg-background/70 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-semibold">{check.title}</p>
                  <p className="mt-2 text-sm font-medium">{check.value}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="space-y-3 border-t border-border/70 pt-4">
            {prerequisiteStatus === "checking" && (
              <Alert className="border-blue-500/30 bg-blue-500/10">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Validating tenant prerequisites and live license signals...
                </AlertDescription>
              </Alert>
            )}

            {prerequisiteStatus === "success" && prerequisiteResult && (
              <Alert className="border-green-500/30 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertTitle className="text-green-800 dark:text-green-200">
                  All prerequisites met
                </AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  Validation passed. You have the baseline licensing needed to continue with this
                  wizard.
                </AlertDescription>
              </Alert>
            )}

            {prerequisiteStatus === "warning" && prerequisiteResult && (
              <Alert className="border-amber-500/30 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-amber-900 dark:text-amber-100">
                  Prerequisites met with warnings
                </AlertTitle>
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <div className="mt-2 space-y-2 text-sm">
                    {prerequisiteResult.warnings.map((warning, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {prerequisiteStatus === "error" && prerequisiteResult && (
              <Alert className="border-red-500/30 bg-red-500/10">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-800 dark:text-red-200">
                  Prerequisite check failed
                </AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-300">
                  <div className="mt-2 space-y-2 text-sm">
                    {prerequisiteResult.errors.map((error, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <XCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    ))}
                    {prerequisiteResult.warnings.length > 0 && (
                      <div className="mt-3 border-t border-red-200 pt-3 dark:border-red-800">
                        {prerequisiteResult.warnings.map((warning, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
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
