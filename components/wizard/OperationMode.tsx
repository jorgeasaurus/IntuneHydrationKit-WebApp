"use client";

import { type ComponentPropsWithoutRef, type ReactNode, useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup } from "@/components/ui/radio-group";
import { AlertTriangle, Eye, PlusCircle, ShieldAlert, Trash2, type LucideIcon } from "lucide-react";
import { OperationMode } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";
import { cn } from "@/lib/utils";

type SemanticTone = "create" | "delete" | "preview" | "live";

interface ChoiceOption<TId extends string> {
  id: TId;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: SemanticTone;
  eyebrow?: string;
}

const SEMANTIC_TONES = {
  create: {
    card: "border-emerald-300/55 bg-emerald-300/[0.14] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08),0_0_0_1px_rgb(110_231_183_/_0.08)]",
    icon: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    indicator: "border-emerald-200/80 text-emerald-200",
    title: "text-emerald-50",
    detail: "text-emerald-50/80",
    marker: "bg-emerald-300",
  },
  delete: {
    card: "border-red-300/60 bg-red-400/[0.14] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08),0_0_0_1px_rgb(252_165_165_/_0.08)]",
    icon: "border-red-300/25 bg-red-300/10 text-red-100",
    indicator: "border-red-200/85 text-red-200",
    title: "text-red-50",
    detail: "text-red-50/80",
    marker: "bg-red-300",
  },
  preview: {
    card: "border-sky-300/55 bg-sky-300/[0.14] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08),0_0_0_1px_rgb(125_211_252_/_0.08)]",
    icon: "border-sky-300/25 bg-sky-300/10 text-sky-100",
    indicator: "border-sky-200/80 text-sky-200",
    title: "text-sky-50",
    detail: "text-sky-50/80",
    marker: "bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.7)]",
    execution: {
      shell: "border-sky-300/35 bg-slate-950/60 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]",
      label: "text-sky-200",
      badge: "border-sky-300/40 bg-sky-300/10 text-sky-100",
      summary: "border-sky-300/25 bg-sky-300/[0.08]",
      eyebrow: "Preview",
    },
  },
  live: {
    card: "border-amber-300/60 bg-amber-300/[0.14] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08),0_0_0_1px_rgb(252_211_77_/_0.08)]",
    icon: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    indicator: "border-amber-200/85 text-amber-200",
    title: "text-amber-50",
    detail: "text-amber-50/80",
    marker: "bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.7)]",
    execution: {
      shell: "border-amber-300/40 bg-slate-950/60 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]",
      label: "text-amber-200",
      badge: "border-amber-300/45 bg-amber-300/10 text-amber-100",
      summary: "border-amber-300/30 bg-amber-300/[0.09]",
      eyebrow: "Live change",
    },
  },
} as const;

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

type ExecutionBehavior = "preview" | "live";

const EXECUTION_OPTIONS: ChoiceOption<ExecutionBehavior>[] = [
  {
    id: "preview",
    label: "Preview",
    description: "Read-only validation mode. No Graph mutations will be sent.",
    eyebrow: "Dry run",
    icon: Eye,
    tone: "preview",
  },
  {
    id: "live",
    label: "Live",
    description: "Apply changes to the selected tenant when the run starts.",
    eyebrow: "Mutating",
    icon: Eye,
    tone: "live",
  },
];

const MODE_OPTIONS: ChoiceOption<OperationMode>[] = [
  {
    id: "create",
    label: "Create",
    description: "Deploy new configurations into the tenant and safely skip objects that already exist.",
    icon: PlusCircle,
    tone: "create",
  },
  {
    id: "delete",
    label: "Delete",
    description: "Remove only configurations created by this kit, subject to marker and state safety checks.",
    icon: Trash2,
    tone: "delete",
  },
];

function OperationModeCardRadio({
  className,
  indicatorClassName,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & {
  children: ReactNode;
  indicatorClassName?: string;
}) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "relative h-auto w-full cursor-pointer rounded-2xl border p-5 text-left transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 active:scale-[0.99]",
        className,
      )}
      {...props}
    >
      {children}
      <RadioGroupPrimitive.Indicator
        className={cn(
          "absolute right-5 top-5 flex size-5 items-center justify-center rounded-full border",
          indicatorClassName,
        )}
      >
        <span aria-hidden="true" className="size-2.5 rounded-full bg-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

function ChoiceCard({
  option,
  selected,
  idPrefix,
}: {
  option: ChoiceOption<string>;
  selected: boolean;
  idPrefix: string;
}): React.JSX.Element {
  const Icon = option.icon;
  const tone = SEMANTIC_TONES[option.tone];
  const descriptionId = `${idPrefix}-${option.id}-description`;

  return (
    <OperationModeCardRadio
      id={`${idPrefix}-${option.id}`}
      value={option.id}
      aria-label={option.label}
      aria-describedby={descriptionId}
      data-tone={option.tone}
      indicatorClassName={tone.indicator}
      className={
        selected ? tone.card : "border-white/[0.14] bg-slate-950/55 hover:border-white/25 hover:bg-slate-900/70"
      }
    >
      <span className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "rounded-xl border p-2",
            selected ? tone.icon : "border-white/[0.14] bg-white/[0.05] text-slate-100",
          )}
        >
          <Icon className="size-5" />
        </span>
      </span>

      {option.eyebrow && (
        <span className="mt-4 flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", tone.marker)} />
          <span
            className={cn(
              "text-[11px] font-mono uppercase tracking-[0.24em]",
              selected ? tone.detail : "text-slate-300",
            )}
          >
            {option.eyebrow}
          </span>
        </span>
      )}

      <span
        className={cn(
          option.eyebrow ? "mt-2" : "mt-4",
          "block text-lg font-semibold",
          selected ? tone.title : "text-white",
        )}
      >
        {option.label}
      </span>
      <span
        id={descriptionId}
        className={cn("mt-2 block text-sm leading-relaxed", selected ? tone.detail : "text-slate-300")}
      >
        {option.description}
      </span>
    </OperationModeCardRadio>
  );
}

export function OperationModeSelection(): React.JSX.Element {
  const { state, setOperationMode, setIsPreview, nextStep, previousStep } = useWizardState();
  const [mode, setMode] = useState<OperationMode>(state.operationMode || "create");
  const [isPreview, setIsPreviewLocal] = useState(state.isPreview ?? true);
  const selectedExecutionTone = SEMANTIC_TONES[isPreview ? "preview" : "live"];
  const executionTone = {
    ...selectedExecutionTone.execution,
    marker: selectedExecutionTone.marker,
  };

  function handleContinue(): void {
    setOperationMode(mode);
    setIsPreview(isPreview);
    nextStep();
  }

  return (
    <Card className="data-card rounded-2xl border bg-card/90 backdrop-blur">
      <CardHeader>
        <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-hydrate">Change Strategy</p>
        <CardTitle>Operation Mode</CardTitle>
        <CardDescription>
          Choose the intent of this run, then decide whether to execute it live or dry-run it first.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <RadioGroup
          aria-label="Operation intent"
          className="grid gap-4 md:grid-cols-2"
          value={mode}
          onValueChange={(value) => {
            if (value === "create" || value === "delete") setMode(value);
          }}
        >
          {MODE_OPTIONS.map((option) => (
            <ChoiceCard key={option.id} option={option} selected={mode === option.id} idPrefix="operation-mode" />
          ))}
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
              <p className="text-sm leading-relaxed text-white/85">{getPreviewDescription(isPreview, mode)}</p>
            </div>

            <RadioGroup
              aria-label="Execution behavior"
              className="grid gap-4 md:grid-cols-2"
              value={isPreview ? "preview" : "live"}
              onValueChange={(value) => {
                if (value === "preview" || value === "live") {
                  setIsPreviewLocal(value === "preview");
                }
              }}
            >
              {EXECUTION_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  option={option}
                  selected={isPreview ? option.id === "preview" : option.id === "live"}
                  idPrefix="execution-behavior"
                />
              ))}
            </RadioGroup>
          </div>
        </div>

        <div className={`w-full rounded-xl border p-4 transition-colors ${executionTone.summary}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/80">Execution</p>
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.22em] ${executionTone.badge}`}
            >
              {isPreview ? "Preview" : "Live"}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${executionTone.marker}`} />
            <p className="text-base font-semibold">{isPreview ? "WhatIf preview" : "Live change"}</p>
          </div>
          <p className="mt-2 text-sm text-white/85">{getExecutionSummary(isPreview)}</p>
        </div>

        {mode === "delete" && !isPreview && (
          <Alert
            variant="destructive"
            className="border-red-400/70 bg-slate-950/90 text-slate-100 shadow-xl shadow-slate-950/20 backdrop-blur-md [&>svg]:text-red-300"
          >
            <ShieldAlert className="size-4" />
            <AlertTitle className="text-red-200">Delete mode is live</AlertTitle>
            <AlertDescription className="text-slate-100/90">
              Delete mode will remove configurations created by this tool. Only objects with &quot;Imported by Intune
              Hydration Kit&quot; in the description will be deleted. Conditional Access policies must be disabled to be
              deleted.
            </AlertDescription>
          </Alert>
        )}

        {mode === "delete" && isPreview && (
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="size-4" />
            <AlertTitle>Delete flow in preview</AlertTitle>
            <AlertDescription>
              This dry run will show exactly which hydration-tagged objects qualify for removal before any destructive
              action is allowed.
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
