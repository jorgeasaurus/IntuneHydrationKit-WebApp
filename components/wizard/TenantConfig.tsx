/* oxlint-disable react-doctor/no-giant-component -- tenant readiness UI keeps auth, prerequisite status, and cloud selection in one step. */
"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useMsal } from "@azure/msal-react";
import { Button } from "@/components/ui/button";
import { SensitiveData } from "@/components/SensitiveData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  PrerequisiteCheckResult,
  PrerequisiteCheckStatus,
  PrerequisiteValidationStep,
} from "@/types/prerequisites";
import { useWizardState } from "@/hooks/useWizardState";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  KeyRound,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { createGraphClient } from "@/lib/graph/client";
import { validatePrerequisites } from "@/lib/graph/prerequisites";
import { AuthSessionExpiredError } from "@/lib/auth/authUtils";
import {
  PrerequisiteTrace,
  type PrerequisiteTraceItem,
} from "@/components/wizard/PrerequisiteTrace";

const CLOUD_ENVIRONMENT_LABEL = "Global (Commercial)";

const subscribeToUserLocale = () => () => {};
const getUserLocale = () => navigator.language;
const getServerLocale = () => null;

function getStatusFromResult(result: PrerequisiteCheckResult): PrerequisiteCheckStatus {
  if (result.errors.length > 0) return "error";
  if (result.warnings.length > 0) return "warning";
  return "success";
}

function createErrorResult(error: unknown): PrerequisiteCheckResult {
  const isSessionExpired =
    error instanceof Error && error.message.includes("sign in");
  const message = error instanceof AuthSessionExpiredError
    ? error.message
    : isSessionExpired
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

type ValidationTraceState = Record<PrerequisiteValidationStep, PrerequisiteCheckStatus>;

function createPendingTrace(): ValidationTraceState {
  return {
    organization: "checking",
    intuneLicense: "pending",
    conditionalAccess: "pending",
    driverUpdates: "pending",
  };
}

function createTraceFromResult(result: PrerequisiteCheckResult): ValidationTraceState {
  return {
    organization: result.organization ? "success" : "error",
    intuneLicense: result.licenses?.hasIntuneLicense ? "success" : "error",
    conditionalAccess: !result.licenses
      ? "error"
      : result.licenses.hasPremiumP2License
        ? "success"
        : "warning",
    driverUpdates: !result.licenses
      ? "error"
      : result.licenses.hasWindowsDriverUpdateLicense
        ? "success"
        : "warning",
  };
}

export function TenantConfig(): React.JSX.Element {
  const {
    state,
    setTenantConfig,
    setPrerequisiteResult: setWizardPrerequisiteResult,
    nextStep,
  } = useWizardState();
  const { accounts, instance } = useMsal();
  const [isLoading, setIsLoading] = useState(false);
  const [prerequisiteStatus, setPrerequisiteStatus] =
    useState<PrerequisiteCheckStatus>(
      state.prerequisiteResult ? getStatusFromResult(state.prerequisiteResult) : "pending"
    );
  const [prerequisiteResult, setPrerequisiteResult] =
    useState<PrerequisiteCheckResult | null>(state.prerequisiteResult ?? null);
  const [validationTrace, setValidationTrace] = useState<ValidationTraceState>(() =>
    state.prerequisiteResult
      ? createTraceFromResult(state.prerequisiteResult)
      : createPendingTrace()
  );
  const userLocale = useSyncExternalStore(subscribeToUserLocale, getUserLocale, getServerLocale);

  const activeAccount = instance.getActiveAccount() ?? accounts[0] ?? null;
  const tenantId = activeAccount?.tenantId ?? "";
  const homeAccountId = activeAccount?.homeAccountId ?? "";
  const operatorUsername = activeAccount?.username;
  const tenantName = prerequisiteResult?.organization?.displayName || "";

  const runPrerequisiteValidation = useCallback(async (showLoadingState: boolean): Promise<void> => {
    try {
      if (showLoadingState) {
        setIsLoading(true);
      }
      setPrerequisiteStatus("checking");
      setValidationTrace(createPendingTrace());

      if (!tenantId || !homeAccountId) {
        throw new AuthSessionExpiredError();
      }

      const graphClient = createGraphClient({
        tenantId,
        homeAccountId,
      });
      const result = await validatePrerequisites(graphClient, (progress) => {
        setValidationTrace((current) => ({
          ...current,
          [progress.step]: progress.status,
        }));
      });
      setPrerequisiteResult(result);
      setWizardPrerequisiteResult(result);
      setPrerequisiteStatus(getStatusFromResult(result));
      setValidationTrace(createTraceFromResult(result));
    } catch (error) {
      const errorResult = createErrorResult(error);
      console.error("Failed to validate prerequisites:", error);
      setPrerequisiteStatus("error");
      setPrerequisiteResult(errorResult);
      setWizardPrerequisiteResult(errorResult);
      setValidationTrace(createTraceFromResult(errorResult));
    } finally {
      setIsLoading(false);
    }
  }, [homeAccountId, setWizardPrerequisiteResult, tenantId]);

  useEffect(() => {
    if (accounts.length === 0) {
      return;
    }
    // Re-run validation when there is no cached result, OR when the cached
    // result belongs to a DIFFERENT tenant (user signed out and into another
    // tenant in the same session) - stale results from tenant A must never
    // gate execution against tenant B.
    const cachedOrgId = state.prerequisiteResult?.organization?.id;
    // Single source of truth: `tenantId` derives from the accounts array this
    // effect depends on, so the staleness check can never read an untracked value.
    const isStale = Boolean(cachedOrgId && tenantId && cachedOrgId !== tenantId);
    if (!state.prerequisiteResult || isStale) {
      void runPrerequisiteValidation(true);
    }
  }, [accounts.length, tenantId, runPrerequisiteValidation, state.prerequisiteResult]);

  useEffect(() => {
    if (!state.prerequisiteResult) {
      return;
    }

    setPrerequisiteResult(state.prerequisiteResult);
    setPrerequisiteStatus(getStatusFromResult(state.prerequisiteResult));
    setValidationTrace(createTraceFromResult(state.prerequisiteResult));
  }, [state.prerequisiteResult]);

  async function handleRecheck(): Promise<void> {
    if (accounts.length === 0) return;
    await runPrerequisiteValidation(false);
  }

  function handleContinue(): void {
    if (!activeAccount || prerequisiteStatus === "checking" || prerequisiteResult?.isValid !== true) {
      return;
    }

    setTenantConfig({
      tenantId,
      homeAccountId,
      tenantName: tenantName || undefined,
      cloudEnvironment: "global",
    });
    nextStep();
  }

  const isValid = Boolean(
    activeAccount && tenantId && prerequisiteStatus !== "checking" && prerequisiteResult?.isValid === true
  );
  const validatedAt = useMemo(() => {
    if (!prerequisiteResult?.timestamp || !userLocale) {
      return null;
    }

    return new Intl.DateTimeFormat(userLocale, {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(prerequisiteResult.timestamp));
  }, [prerequisiteResult?.timestamp, userLocale]);
  const healthChecks: PrerequisiteTraceItem[] = [
    {
      id: "organization",
      title: "Graph connectivity",
      value: validationTrace.organization === "checking"
        ? "Querying the organization endpoint…"
        : validationTrace.organization === "pending"
          ? "Queued"
          : (
              <SensitiveData
                value={prerequisiteResult?.organization?.displayName}
                fallback="Organization unavailable"
              />
            ),
      detail: prerequisiteResult?.organization
        ? "Connected to the selected tenant and organization endpoint."
        : "Confirm the app can resolve tenant organization details.",
      status: validationTrace.organization,
      icon: Cloud,
    },
    {
      id: "intuneLicense",
      title: "Intune license",
      value: validationTrace.intuneLicense === "checking"
        ? "Reading subscribed service plans…"
        : validationTrace.intuneLicense === "pending"
          ? "Queued"
          : prerequisiteResult?.licenses?.hasIntuneLicense
            ? `${prerequisiteResult.licenses.intuneServicePlans.length} service plan(s)`
            : "No qualifying license",
      detail: prerequisiteResult?.licenses?.hasIntuneLicense
        ? prerequisiteResult.licenses.intuneServicePlans.join(", ")
        : "An Intune-capable subscription is required before execution can continue.",
      status: validationTrace.intuneLicense,
      icon: ShieldCheck,
    },
    {
      id: "conditionalAccess",
      title: "Conditional Access readiness",
      value: validationTrace.conditionalAccess === "checking"
        ? "Evaluating Entra entitlements…"
        : validationTrace.conditionalAccess === "pending"
          ? "Queued"
          : prerequisiteResult?.licenses?.hasPremiumP2License
            ? "Risk-based CA supported"
            : prerequisiteResult?.licenses?.hasConditionalAccessLicense
              ? "Basic CA only"
              : "CA will be skipped",
      detail: prerequisiteResult?.licenses?.hasPremiumP2License
        ? "Premium P2 found for advanced Conditional Access templates."
        : prerequisiteResult?.licenses?.hasConditionalAccessLicense
          ? "P1-equivalent licensing exists, but risk-based templates will be skipped."
          : "No qualifying Entra ID Premium license detected for Conditional Access creation.",
      status: validationTrace.conditionalAccess,
      icon: Sparkles,
    },
    {
      id: "driverUpdates",
      title: "Driver update profiles",
      value: validationTrace.driverUpdates === "checking"
        ? "Evaluating Windows entitlements…"
        : validationTrace.driverUpdates === "pending"
          ? "Queued"
          : prerequisiteResult?.licenses?.hasWindowsDriverUpdateLicense
            ? "Windows entitlement detected"
            : "Will be skipped",
      detail: prerequisiteResult?.licenses?.hasWindowsDriverUpdateLicense
        ? "Windows E3/E5-compatible licensing is available for driver update templates."
        : "Windows Driver Update profiles require Windows Enterprise or equivalent Microsoft 365 licensing.",
      status: validationTrace.driverUpdates,
      icon: KeyRound,
    },
  ];

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
                Last checked at {validatedAt} UTC
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
              <SensitiveData
                value={isLoading ? undefined : tenantName}
                fallback={isLoading ? "Resolving tenant..." : "Unknown organization"}
              />
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
              <SensitiveData value={tenantId} fallback="Not signed in" />
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
              {CLOUD_ENVIRONMENT_LABEL}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Authentication and Graph routing inherit the environment chosen at sign-in.
            </p>
          </div>

          <div className="min-w-0 rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Operator
            </p>
            <SensitiveData
              value={operatorUsername}
              fallback="Not signed in"
              className="mt-3 block max-w-full break-all text-sm font-semibold leading-6"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Delegated permissions are evaluated through the active user session.
            </p>
          </div>
        </div>

        <PrerequisiteTrace
          items={healthChecks}
          isChecking={prerequisiteStatus === "checking"}
          onRecheck={handleRecheck}
        />

        {accounts.length > 0 && (
          <div className="space-y-3 border-t border-border/70 pt-4">
            {prerequisiteStatus === "success" && prerequisiteResult && (
              <Alert className="border-emerald-300/45 bg-emerald-500/18 text-emerald-50">
                <CheckCircle2 className="size-4 text-emerald-200" />
                <AlertTitle className="text-emerald-50">
                  All prerequisites met
                </AlertTitle>
                <AlertDescription className="text-emerald-100">
                  Validation passed. You have the baseline licensing needed to continue with this
                  wizard.
                </AlertDescription>
              </Alert>
            )}

            {prerequisiteStatus === "warning" && prerequisiteResult && (
              <Alert className="border-amber-500/30 bg-amber-500/10">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-amber-900 dark:text-amber-100">
                  Prerequisites met with warnings
                </AlertTitle>
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <div className="mt-2 space-y-2 text-sm">
                    {prerequisiteResult.warnings.map((warning) => (
                      <div key={warning} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-3 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {prerequisiteStatus === "error" && prerequisiteResult && (
              <Alert className="border-red-500/30 bg-red-500/10">
                <XCircle className="size-4 text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-800 dark:text-red-200">
                  Prerequisite check failed
                </AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-300">
                  <div className="mt-2 space-y-2 text-sm">
                    {prerequisiteResult.errors.map((error) => (
                      <div key={error} className="flex items-start gap-2">
                        <XCircle className="mt-0.5 size-3 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    ))}
                    {prerequisiteResult.warnings.length > 0 && (
                      <div className="mt-3 border-t border-red-200 pt-3 dark:border-red-800">
                        {prerequisiteResult.warnings.map((warning) => (
                          <div key={warning} className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 size-3 flex-shrink-0" />
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
            Use Tenant Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
