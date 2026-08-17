import { AlertTriangle, RotateCcw } from "lucide-react";
import { AppNavigation } from "@/components/AppNavigation";
import { SensitiveData } from "@/components/SensitiveData";
import { ActivityLog } from "@/components/dashboard/ActivityLog";
import { ExecutionControls } from "@/components/dashboard/ExecutionControls";
import { ProgressBar } from "@/components/dashboard/ProgressBar";
import { ResultsSummary } from "@/components/dashboard/ResultsSummary";
import { RunNotices } from "@/components/dashboard/RunNotices";
import { RunOverview } from "@/components/dashboard/RunOverview";
import { TaskList } from "@/components/dashboard/TaskList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActivityMessage } from "@/lib/hydration/types";
import type { ExecutionState } from "@/lib/hydration/executionStateStore";
import type {
  BatchProgress,
  ExecutionOutcome,
  HydrationSummary,
  HydrationTask,
  OperationMode,
} from "@/types/hydration";

interface DashboardRunViewProps {
  tasks: HydrationTask[];
  summary: HydrationSummary | null;
  outcome: ExecutionOutcome | null;
  fatalError: string | null;
  activityLog: ActivityMessage[];
  startTime: Date | null;
  endTime: Date | null;
  operationMode: OperationMode;
  isPreview: boolean;
  tenantName?: string;
  tenantId?: string;
  selectedObjectCount: number;
  phase: ExecutionState["phase"];
  batchProgress: BatchProgress | null;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onDownloadLog: () => void;
  onStartNewHydration: () => void;
}

function getOperationText(
  operationMode: OperationMode,
  isPreview: boolean,
  isCompleted: boolean,
): string {
  const operation = operationMode === "delete" ? "Delete" : "Create";
  if (isPreview) {
    return isCompleted
      ? `${operation} preview completed`
      : `Previewing ${operation.toLowerCase()} changes`;
  }
  return isCompleted
    ? `${operation} run completed`
    : `${operationMode === "create" ? "Creating" : "Deleting"} configurations`;
}

export function DashboardRunView({
  tasks,
  summary,
  outcome,
  fatalError,
  activityLog,
  startTime,
  endTime,
  operationMode,
  isPreview,
  tenantName,
  tenantId,
  selectedObjectCount,
  phase,
  batchProgress,
  onPause,
  onResume,
  onCancel,
  onDownloadLog,
  onStartNewHydration,
}: DashboardRunViewProps): React.JSX.Element {
  const isBuildingQueue = phase === "building";
  const isPaused = phase === "paused";
  const isCancelling = phase === "cancelling";
  const isCompleted = phase === "completed";
  const completedTaskCount = tasks.filter(
    (task) =>
      task.status === "success" ||
      task.status === "failed" ||
      task.status === "skipped",
  ).length;
  const successTaskCount = tasks.filter(
    (task) => task.status === "success",
  ).length;

  return (
    <div className="relative z-10 min-h-screen">
      <AppNavigation
        brandHref={isCompleted ? "/" : null}
        eyebrow={
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-hydrate">
            {isCompleted ? "Execution record" : "Live execution"}
          </span>
        }
        title="Hydration Dashboard"
        description={
          <>
            {getOperationText(operationMode, isPreview, isCompleted)} in{" "}
            <SensitiveData
              value={tenantName || tenantId}
              fallback="the selected tenant"
            />
          </>
        }
        actions={
          isCompleted ? (
            <Button
              variant="outline"
              onClick={onStartNewHydration}
              className="nav-action size-9 px-0 sm:w-auto sm:px-4"
            >
              <RotateCcw className="size-4 sm:mr-2" />
              <span className="sr-only sm:not-sr-only">
                Start New Hydration
              </span>
            </Button>
          ) : null
        }
      />

      <main className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
        <RunOverview
          operationMode={operationMode}
          isPreview={isPreview}
          selectedObjectCount={selectedObjectCount}
          completedTaskCount={completedTaskCount}
          totalTaskCount={tasks.length}
          successTaskCount={successTaskCount}
          isBuildingQueue={isBuildingQueue}
          isCompleted={isCompleted}
          outcome={outcome}
        />

        <RunNotices
          isCompleted={isCompleted}
          summary={summary}
          outcome={outcome}
          fatalError={fatalError}
          successTaskCount={successTaskCount}
          isPreview={isPreview}
          operationMode={operationMode}
          isBuildingQueue={isBuildingQueue}
          taskCount={tasks.length}
        />

        {!isCompleted && tasks.length > 0 && (
          <ProgressBar
            tasks={tasks}
            title="Overall Progress"
            description={`${completedTaskCount} of ${tasks.length} tasks completed`}
          />
        )}

        {startTime && (
          <ExecutionControls
            tasks={tasks}
            isPaused={isPaused}
            isCancelling={isCancelling}
            isCompleted={isCompleted}
            outcome={outcome}
            startTime={startTime}
            endTime={endTime}
            batchProgress={batchProgress}
            onPause={onPause}
            onResume={onResume}
            onCancel={onCancel}
            onDownloadLog={onDownloadLog}
          />
        )}

        <ActivityLog messages={activityLog} />

        {isCompleted && summary && outcome && outcome !== "failed" && (
          <div className="space-y-5">
            {!isPreview &&
              operationMode === "create" &&
              tasks.some((task) => task.category === "conditionalAccess") && (
                <Alert className="border-amber-500/60 bg-card/95 text-card-foreground shadow-lg shadow-slate-950/15 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Conditional Access follow-up</AlertTitle>
                  <AlertDescription>
                    Review Conditional Access policies in Intune before you
                    enable them in production.
                  </AlertDescription>
                </Alert>
              )}
            <ResultsSummary
              summary={summary}
              tasks={tasks}
              isPreview={isPreview}
              outcome={outcome}
            />
          </div>
        )}
        {isCompleted && !summary && tasks.length > 0 && (
          <TaskList tasks={tasks} />
        )}
        {!isCompleted && <TaskList tasks={tasks} />}
      </main>
    </div>
  );
}
