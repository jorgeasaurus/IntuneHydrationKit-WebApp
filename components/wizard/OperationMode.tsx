"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  Eye,
  Radio,
  PlusCircle,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { OperationMode } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";

interface ExecutionTone {
  shell: string;
  panel: string;
  label: string;
  badge: string;
  summary: string;
  marker: string;
  title: string;
  detail: string;
  eyebrow: string;
}

function getExecutionTone(isPreview: boolean): ExecutionTone {
  if (isPreview) {
    return {
      shell: "border-blue-500/30 bg-blue-500/10",
      panel: "border-blue-500/30 bg-background/70",
      label: "text-blue-500",
      badge: "border-blue-500/40 bg-blue-500/15 text-blue-500",
      summary: "border-blue-500/30 bg-blue-500/10",
      marker: "bg-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.75)]",
      title: "Preview execution",
      detail: "Read-only validation mode. No Graph mutations will be sent.",
      eyebrow: "Preview",
    };
  }

  return {
    shell: "border-amber-500/35 bg-amber-500/10",
    panel: "border-amber-500/35 bg-background/70",
    label: "text-amber-500",
    badge: "border-amber-500/40 bg-amber-500/15 text-amber-500",
    summary: "border-amber-500/35 bg-amber-500/10",
    marker: "bg-amber-500 shadow-[0_0_18px_rgba(245,158,11,0.75)]",
    title: "Live execution",
    detail: "Changes will be applied when the run starts.",
    eyebrow: "Live change",
  };
}

function getPreviewLabel(isPreview: boolean): string {
  if (isPreview) {
    return "Preview before touching the tenant";
  }

  return "Switch on preview to avoid tenant changes";
}

function getPreviewDescription(isPreview: boolean, mode: OperationMode): string {
  if (isPreview) {
    return `Simulate the ${mode} flow first. The wizard will evaluate what would happen, surface skips, and avoid any Graph mutations.`;
  }

  return `Preview is off. Starting this ${mode} run will perform live Graph writes against the selected tenant.`;
}

function getExecutionSummary(isPreview: boolean): string {
  if (isPreview) {
    return "This run is safe to review without mutating the tenant.";
  }

  return "This run will actively create or delete tenant objects.";
}

export function OperationModeSelection(): React.JSX.Element {
  const { state, setOperationMode, setIsPreview, nextStep, previousStep } =
    useWizardState();
  const [mode, setMode] = useState<OperationMode>(state.operationMode || "create");
  const [isPreview, setIsPreviewLocal] = useState(state.isPreview || false);
  const executionTone = getExecutionTone(isPreview);
  const executionOptions = [
    {
      id: "preview" as const,
      title: "Preview",
      description: "Read-only validation mode. No Graph mutations will be sent.",
      eyebrow: "Dry run",
      accent: "border-blue-500/30 bg-blue-500/10",
      badge: "border-blue-500/40 bg-blue-500/15 text-blue-500",
      marker: "bg-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.75)]",
    },
    {
      id: "live" as const,
      title: "Live",
      description: "Apply changes to the selected tenant when the run starts.",
      eyebrow: "Mutating",
      accent: "border-amber-500/35 bg-amber-500/10",
      badge: "border-amber-500/40 bg-amber-500/15 text-amber-500",
      marker: "bg-amber-500 shadow-[0_0_18px_rgba(245,158,11,0.75)]",
    },
  ];

  const modeOptions = [
    {
      id: "create" as const,
      label: "Create",
      description:
        "Deploy new configurations into the tenant and safely skip objects that already exist.",
      icon: PlusCircle,
      accent: "border-hydrate/50 bg-hydrate/10",
    },
    {
      id: "delete" as const,
      label: "Delete",
      description:
        "Remove only configurations created by this kit, subject to marker and state safety checks.",
      icon: Trash2,
      accent: "border-red-500/40 bg-red-500/10",
    },
  ];

  function handleContinue(): void {
    setOperationMode(mode);
    setIsPreview(isPreview);
    nextStep();
  }

  return (
    <Card className="data-card rounded-2xl border bg-card/90 backdrop-blur">
      <CardHeader>
        <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-hydrate">
          Change Strategy
        </p>
        <CardTitle>Operation Mode</CardTitle>
        <CardDescription>
          Choose the intent of this run, then decide whether to execute it live or dry-run it
          first.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {modeOptions.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                className={`rounded-2xl border p-5 text-left transition ${
                  selected
                    ? `${option.accent} shadow-[0_0_0_1px_hsl(var(--hydrate)/0.12)]`
                    : "border-border/80 bg-background/60 hover:border-hydrate/30 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-xl border border-current/15 bg-background/70 p-2 text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  {selected && (
                    <span className="rounded-full border border-hydrate/40 bg-hydrate/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-hydrate">
                      Selected
                    </span>
                  )}
                </div>

                <p className="mt-4 text-lg font-semibold">{option.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className={`rounded-2xl border p-5 transition-colors ${executionTone.shell}`}>
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className={`text-[11px] font-mono uppercase tracking-[0.28em] ${executionTone.label}`}>
                  Execution behavior
                </p>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em] ${executionTone.badge}`}
                >
                  {executionTone.eyebrow}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${executionTone.marker}`} />
                <span className={`text-xs font-medium uppercase tracking-[0.22em] ${executionTone.label}`}>
                  {isPreview ? "Safe mode" : "Mutating mode"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-base font-semibold">
                <Eye className="h-4 w-4" />
                {getPreviewLabel(isPreview)}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {getPreviewDescription(isPreview, mode)}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {executionOptions.map((option) => {
                const selected =
                  (option.id === "preview" && isPreview) ||
                  (option.id === "live" && !isPreview);

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setIsPreviewLocal(option.id === "preview")}
                    className={`rounded-2xl border p-5 text-left transition ${
                      selected
                        ? `${option.accent} shadow-[0_0_0_1px_hsl(var(--hydrate)/0.12)]`
                        : "border-border/80 bg-background/60 hover:border-hydrate/30 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-xl border border-current/15 bg-background/70 p-2 text-foreground">
                        <Radio className="h-5 w-5" />
                      </div>
                      {selected && (
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em] ${option.badge}`}>
                          Selected
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${option.marker}`} />
                      <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                        {option.eyebrow}
                      </p>
                    </div>

                    <p className="mt-2 text-lg font-semibold">{option.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Intent
            </p>
            <p className="mt-2 text-base font-semibold capitalize">{mode}</p>
          </div>
          <div className={`rounded-xl border p-4 transition-colors ${executionTone.summary}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                Execution
              </p>
              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.22em] ${executionTone.badge}`}
              >
                {isPreview ? "Preview" : "Live"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${executionTone.marker}`} />
              <p className="text-base font-semibold">
                {isPreview ? "WhatIf preview" : "Live change"}
              </p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {getExecutionSummary(isPreview)}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Safety rail
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "create"
                ? "Create skips matching objects instead of clobbering them."
                : "Delete requires hydration markers and CA disablement."}
            </p>
          </div>
        </div>

        {mode === "delete" && !isPreview && (
          <Alert variant="destructive" className="border-red-500/30 bg-red-500/10">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Delete mode is live</AlertTitle>
            <AlertDescription>
              Delete mode will remove configurations created by this tool. Only objects with
              &quot;Imported by Intune Hydration Kit&quot; in the description will be deleted.
              Conditional Access policies must be disabled to be deleted.
            </AlertDescription>
          </Alert>
        )}

        {mode === "delete" && isPreview && (
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Delete flow in preview</AlertTitle>
            <AlertDescription>
              This dry run will show exactly which hydration-tagged objects qualify for removal
              before any destructive action is allowed.
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
