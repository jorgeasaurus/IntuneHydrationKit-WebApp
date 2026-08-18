import { AlertTriangle, Eye, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getExecutionOutcomeLabel } from "@/lib/hydration/executionOutcome";
import type {
  ExecutionOutcome,
  HydrationSummary,
  OperationMode,
} from "@/types/hydration";

interface RunNoticesProps {
  isCompleted: boolean;
  summary: HydrationSummary | null;
  outcome: ExecutionOutcome | null;
  fatalError: string | null;
  successTaskCount: number;
  isPreview: boolean;
  operationMode: OperationMode;
  isBuildingQueue: boolean;
  taskCount: number;
}

export function RunNotices({
  isCompleted,
  summary,
  outcome,
  fatalError,
  successTaskCount,
  isPreview,
  operationMode,
  isBuildingQueue,
  taskCount,
}: RunNoticesProps): React.JSX.Element {
  return (
    <>
      {isCompleted && !summary && (
        <Alert className="rounded-2xl border-red-300/35 bg-slate-950/75 text-slate-50 shadow-xl shadow-slate-950/20 backdrop-blur-md [&>svg]:text-red-300">
          <AlertTriangle className="size-4" />
          <AlertTitle className="text-red-100">Run failed</AlertTitle>
          <AlertDescription className="text-slate-200">
            {fatalError || "The run stopped before a summary was available."}
          </AlertDescription>
        </Alert>
      )}

      {isCompleted && outcome !== "failed" && (
        <p role="status" aria-live="polite" className="sr-only">
          {getExecutionOutcomeLabel(outcome, successTaskCount)}
        </p>
      )}

      {isPreview && !isCompleted && (
        <Alert className="glass-panel rounded-2xl text-slate-50 [&>svg]:text-sky-100">
          <Eye className="size-4" />
          <AlertTitle className="text-white">Preview Mode</AlertTitle>
          <AlertDescription className="text-slate-200">
            No changes will be made to your tenant. This dry run shows what
            would happen.
          </AlertDescription>
        </Alert>
      )}

      {operationMode === "delete" && !isPreview && !isCompleted && (
        <Alert className="border-red-500/70 bg-slate-950/90 text-slate-50 shadow-2xl shadow-slate-950/25 backdrop-blur-md [&>svg]:text-red-400">
          <AlertTriangle className="size-4" />
          <AlertTitle className="text-red-200">Delete Mode Active</AlertTitle>
          <AlertDescription className="text-slate-200">
            Deleting configurations from your tenant. Only objects created by
            Intune Hydration Kit will be removed.
          </AlertDescription>
        </Alert>
      )}

      {isBuildingQueue && taskCount === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="size-5 animate-spin text-blue-500" />
              Preparing Hydration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Building and validating the task queue. Large selections can take
              a moment.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-blue-500/40 via-blue-500 to-blue-500/40" />
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
