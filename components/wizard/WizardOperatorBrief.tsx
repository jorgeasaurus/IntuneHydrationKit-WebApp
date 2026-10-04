import { SensitiveData } from "@/components/SensitiveData";
import type { WizardState } from "@/types/hydration";

const CLOUD_ENVIRONMENT_LABELS = {
  global: "Global",
  usgov: "GCC High",
  usgovdod: "DoD",
  germany: "Germany",
  china: "21Vianet",
} as const;

export function WizardOperatorBrief({
  state,
  selectedObjectCount,
}: {
  state: WizardState;
  selectedObjectCount: number;
}) {
  return (
    <div className="data-card rounded-2xl border bg-card/90 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
            Operator Brief
          </p>
          <h3 className="mt-2 text-lg font-semibold">
            <SensitiveData
              value={state.tenantConfig?.tenantName}
              fallback="Tenant not locked in"
            />
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
            <SensitiveData
              value={state.tenantConfig?.tenantId}
              fallback="Awaiting validation"
            />
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
  );
}
