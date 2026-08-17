import type { ExecutionOutcome, OperationMode } from "@/types/hydration";
import { getExecutionOutcomeLabel } from "@/lib/hydration/executionOutcome";

interface RunOverviewProps {
  operationMode: OperationMode;
  isPreview: boolean;
  selectedObjectCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
  successTaskCount: number;
  isBuildingQueue: boolean;
  isCompleted: boolean;
  outcome: ExecutionOutcome | null;
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border/80 bg-card/80 p-4 backdrop-blur">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function RunOverview({
  operationMode,
  isPreview,
  selectedObjectCount,
  completedTaskCount,
  totalTaskCount,
  successTaskCount,
  isBuildingQueue,
  isCompleted,
  outcome,
}: RunOverviewProps): React.JSX.Element {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Metric
        label="Run mode"
        value={`${operationMode === "create" ? "Create" : "Delete"} ${isPreview ? "preview" : "live"}`}
      />
      <Metric label="Planned scope" value={`${selectedObjectCount} objects`} />
      <Metric
        label="Completed"
        value={
          isBuildingQueue
            ? "—/—"
            : `${completedTaskCount}/${totalTaskCount || selectedObjectCount || 0}`
        }
      />
      <Metric
        label={isCompleted ? "Final outcome" : "Outcome so far"}
        value={getExecutionOutcomeLabel(outcome, successTaskCount)}
      />
    </div>
  );
}
