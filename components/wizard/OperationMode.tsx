"use client";

import { type ComponentPropsWithoutRef, type ReactNode, useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  AlertTriangle,
  Eye,
  PlusCircle,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { OperationMode } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";
import { cn } from "@/lib/utils";

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

const EXECUTION_OPTIONS = [
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

const MODE_OPTIONS = [
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

function OperationModeCardRadio({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & { children: ReactNode }) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "relative h-auto w-full cursor-pointer rounded-2xl border p-5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
      <RadioGroupPrimitive.Indicator className="absolute right-5 top-5 flex size-5 items-center justify-center rounded-full border border-primary text-primary">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export function OperationModeSelection(): React.JSX.Element {
  const { state, setOperationMode, setIsPreview, nextStep, previousStep } =
    useWizardState();
  const [mode, setMode] = useState<OperationMode>(state.operationMode || "create");
  const [isPreview, setIsPreviewLocal] = useState(state.isPreview ?? true);
  const executionTone = getExecutionTone(isPreview);

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
        <RadioGroup
          aria-label="Operation intent"
          className="grid gap-4 md:grid-cols-2"
          value={mode}
          onValueChange={(value) => setMode(value as OperationMode)}
        >
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.id;

            return (
              <OperationModeCardRadio
                key={option.id}
                id={`operation-mode-${option.id}`}
                value={option.id}
                aria-label={option.label}
                aria-describedby={`operation-mode-${option.id}-description`}
                className={
                  selected
                    ? `${option.accent} shadow-[0_0_0_1px_hsl(var(--hydrate)/0.12)]`
                    : "border-border/80 bg-background/60 hover:border-hydrate/30 hover:bg-muted/30"
                }
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="rounded-xl border border-current/15 bg-background/70 p-2 text-foreground">
                    <Icon className="size-5" />
                  </span>
                </span>

                <span className="mt-4 block text-lg font-semibold">{option.label}</span>
                <span
                  id={`operation-mode-${option.id}-description`}
                  className="mt-2 block text-sm leading-relaxed text-muted-foreground"
                >
                  {option.description}
                </span>
              </OperationModeCardRadio>
            );
          })}
        </RadioGroup>

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
                <span className={`size-2.5 rounded-full ${executionTone.marker}`} />
                <span className={`text-xs font-medium uppercase tracking-[0.22em] ${executionTone.label}`}>
                  {isPreview ? "Safe mode" : "Mutating mode"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-base font-semibold">
                <Eye className="size-4" />
                {getPreviewLabel(isPreview)}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {getPreviewDescription(isPreview, mode)}
              </p>
            </div>

            <RadioGroup
              aria-label="Execution behavior"
              className="grid gap-4 md:grid-cols-2"
              value={isPreview ? "preview" : "live"}
              onValueChange={(value) => setIsPreviewLocal(value === "preview")}
            >
              {EXECUTION_OPTIONS.map((option) => {
                const selected =
                  (option.id === "preview" && isPreview) ||
                  (option.id === "live" && !isPreview);

                return (
                  <OperationModeCardRadio
                    key={option.id}
                    id={`execution-behavior-${option.id}`}
                    value={option.id}
                    aria-label={option.title}
                    aria-describedby={`execution-behavior-${option.id}-description`}
                    className={
                      selected
                        ? `${option.accent} shadow-[0_0_0_1px_hsl(var(--hydrate)/0.12)]`
                        : "border-border/80 bg-background/60 hover:border-hydrate/30 hover:bg-muted/30"
                    }
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="rounded-xl border border-current/15 bg-background/70 p-2 text-foreground">
                        <Eye className="size-5" />
                      </span>
                    </span>

                    <span className="mt-4 flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${option.marker}`} />
                      <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                        {option.eyebrow}
                      </span>
                    </span>

                    <span className="mt-2 block text-lg font-semibold">{option.title}</span>
                    <span
                      id={`execution-behavior-${option.id}-description`}
                      className="mt-2 block text-sm leading-relaxed text-muted-foreground"
                    >
                      {option.description}
                    </span>
                  </OperationModeCardRadio>
                );
              })}
            </RadioGroup>
          </div>
        </div>

        <div className={`w-full rounded-xl border p-4 transition-colors ${executionTone.summary}`}>
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
            <span className={`size-2.5 rounded-full ${executionTone.marker}`} />
            <p className="text-base font-semibold">
              {isPreview ? "WhatIf preview" : "Live change"}
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {getExecutionSummary(isPreview)}
          </p>
        </div>

        {mode === "delete" && !isPreview && (
          <Alert variant="destructive" className="border-red-500/30 bg-red-500/10">
            <ShieldAlert className="size-4" />
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
            <AlertTriangle className="size-4" />
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
            Choose Operation Mode
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
