"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SettingsModal } from "@/components/SettingsModal";
import { TenantConfig } from "@/components/wizard/TenantConfig";
import { OperationModeSelection } from "@/components/wizard/OperationMode";
import { TargetSelection } from "@/components/wizard/TargetSelection";
import { ReviewConfirm } from "@/components/wizard/ReviewConfirm";
import { Button } from "@/components/ui/button";
import { useWizardState } from "@/hooks/useWizardState";
import { getEstimatedTaskCount } from "@/lib/hydration/engine";
import { signOut } from "@/lib/auth/authUtils";
import {
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Home,
  Layers3,
  LogOut,
  Radar,
  Settings2,
  ShieldCheck,
} from "lucide-react";

const CLOUD_ENVIRONMENT_LABELS = {
  global: "Global",
  usgov: "GCC High",
  usgovdod: "DoD",
  germany: "Germany",
  china: "21Vianet",
} as const;

const WIZARD_STEPS = [
  {
    id: 1,
    label: "Tenant checkpoint",
    eyebrow: "Connect",
    description: "Confirm tenant identity, Graph connectivity, and license readiness.",
    icon: ShieldCheck,
  },
  {
    id: 2,
    label: "Execution mode",
    eyebrow: "Choose",
    description: "Decide whether you are creating, deleting, or dry-running the change set.",
    icon: Radar,
  },
  {
    id: 3,
    label: "Deployment scope",
    eyebrow: "Scope",
    description: "Select the exact categories and policies you want this run to touch.",
    icon: Layers3,
  },
  {
    id: 4,
    label: "Launch review",
    eyebrow: "Confirm",
    description: "Review impact, safety rails, and operator acknowledgement before execution.",
    icon: FileCheck2,
  },
] as const;

function WizardContent() {
  const { state, setCurrentStep } = useWizardState();
  const { accounts } = useMsal();
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const progress = (state.currentStep / WIZARD_STEPS.length) * 100;
  const currentStep = WIZARD_STEPS[state.currentStep - 1];
  const selectedObjectCount = getEstimatedTaskCount(
    state.selectedTargets,
    state.categorySelections
  );

  const stepStates = useMemo(() => {
    const checks = {
      1: Boolean(state.tenantConfig),
      2: Boolean(state.operationMode),
      3: state.selectedTargets.length > 0,
      4: state.confirmed,
    } as const;

    return WIZARD_STEPS.map((step) => {
      const complete = checks[step.id as keyof typeof checks];
      return {
        ...step,
        complete,
        current: step.id === state.currentStep,
        accessible: step.id <= state.currentStep,
      };
    });
  }, [
    state.confirmed,
    state.currentStep,
    state.operationMode,
    state.selectedTargets.length,
    state.tenantConfig,
  ]);

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <TenantConfig />;
      case 2:
        return <OperationModeSelection />;
      case 3:
        return <TargetSelection />;
      case 4:
        return <ReviewConfirm />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen relative z-10">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-4">
            <Image
              src="/IHTLogoClear.png"
              alt="Intune Hydration Kit Logo"
              width={48}
              height={48}
              className="h-12 w-12"
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-hydrate">
                  Hydration Console
                </p>
                <span className="rounded-full border border-hydrate/30 bg-hydrate/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.24em] text-hydrate">
                  Step {state.currentStep}/{WIZARD_STEPS.length}
                </span>
              </div>
              <h1 className="text-2xl font-bold">Intune Hydration Kit</h1>
              <p className="text-sm text-muted-foreground">
                Signed in as {accounts[0]?.username ?? "Connected operator"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Link>
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5 self-start lg:sticky lg:top-24">
          <div className="data-card overflow-hidden rounded-2xl border bg-card/90 backdrop-blur">
            <div className="border-b border-border/80 bg-gradient-to-r from-hydrate/10 via-transparent to-transparent px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-hydrate">
                    Hydration Flow
                  </p>
                  <h2 className="mt-2 text-lg font-semibold">Execution runway</h2>
                </div>
                <div className="rounded-full border border-border/80 bg-background/70 px-3 py-1 text-sm font-semibold">
                  {Math.round(progress)}%
                </div>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-hydrate to-cyan-400 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="space-y-2 p-3">
              {stepStates.map((step) => {
                const Icon = step.icon;

                return (
                  <button
                    key={step.id}
                    type="button"
                    disabled={!step.accessible}
                    onClick={() => step.accessible && setCurrentStep(step.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      step.current
                        ? "border-hydrate/60 bg-hydrate/10 shadow-[0_0_0_1px_hsl(var(--hydrate)/0.14)]"
                        : step.complete
                          ? "border-border/80 bg-background/60 hover:border-hydrate/40 hover:bg-muted/40"
                          : "border-transparent bg-transparent text-muted-foreground"
                    } ${!step.accessible ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border ${
                          step.current
                            ? "border-hydrate/60 bg-hydrate text-hydrate-foreground"
                            : step.complete
                              ? "border-green-500/40 bg-green-500/10 text-green-500"
                              : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {step.complete && !step.current ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <Icon className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
                            {step.eyebrow}
                          </p>
                          {step.current && (
                            <span className="rounded-full border border-hydrate/40 bg-hydrate/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.22em] text-hydrate">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-semibold text-foreground">{step.label}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {step.description}
                        </p>
                      </div>

                      {step.accessible && (
                        <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="data-card rounded-2xl border bg-card/90 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
                  Operator Brief
                </p>
                <h3 className="mt-2 text-lg font-semibold">
                  {state.tenantConfig?.tenantName ?? "Tenant not locked in"}
                </h3>
              </div>
              <div className="rounded-full border border-border/80 bg-background/70 px-3 py-1 text-xs font-mono uppercase tracking-[0.22em] text-muted-foreground">
                {state.isPreview ? "Preview" : state.operationMode ?? "Draft"}
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <div className="rounded-xl border border-border/80 bg-background/60 p-3">
                <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                  Tenant ID
                </p>
                <p className="mt-2 break-all text-sm text-foreground">
                  {state.tenantConfig?.tenantId ?? "Awaiting validation"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/80 bg-background/60 p-3">
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                    Cloud
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {state.tenantConfig
                      ? CLOUD_ENVIRONMENT_LABELS[state.tenantConfig.cloudEnvironment]
                      : "Not set"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/80 bg-background/60 p-3">
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                    Targets
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {state.selectedTargets.length} categories
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/80 bg-background/60 p-3">
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                    Objects
                  </p>
                  <p className="mt-2 text-sm font-medium">{selectedObjectCount}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-background/60 p-3">
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                    Readiness
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {state.prerequisiteResult?.isValid ? "Validated" : "Pending"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="overflow-hidden rounded-[28px] border border-border/80 bg-card/85 shadow-[0_24px_80px_-32px_hsl(var(--foreground)/0.45)] backdrop-blur">
            <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--hydrate)/0.18),transparent_34%),linear-gradient(135deg,hsl(var(--accent)/0.08),transparent_55%)] px-6 py-6 sm:px-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-hydrate">
                    {currentStep.eyebrow}
                  </p>
                  <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                    {currentStep.label}
                  </h2>
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                    {currentStep.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:min-w-[320px]">
                  <div className="rounded-2xl border border-border/80 bg-background/65 p-4">
                    <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                      Mode
                    </p>
                    <p className="mt-2 text-lg font-semibold capitalize">
                      {state.isPreview
                        ? `${state.operationMode ?? "create"} preview`
                        : state.operationMode ?? "Draft"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-background/65 p-4">
                    <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                      Scope
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {selectedObjectCount} objects
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {renderStep()}
        </section>
      </main>

      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}

export default function WizardPage() {
  return (
    <ProtectedRoute>
      <WizardContent />
    </ProtectedRoute>
  );
}
