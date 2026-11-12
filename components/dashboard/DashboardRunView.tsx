"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, History, RotateCcw, Settings2 } from "lucide-react";
import { AppNavigation } from "@/components/AppNavigation";
import { SensitiveData } from "@/components/SensitiveData";
import { SettingsModal } from "@/components/SettingsModal";
import { ActivityLog } from "@/components/dashboard/ActivityLog";
import { CompletionNotificationToggle } from "@/components/dashboard/CompletionNotificationToggle";
import { ExecutionControls } from "@/components/dashboard/ExecutionControls";
import { ProgressBar } from "@/components/dashboard/ProgressBar";
import { ResultsSummary } from "@/components/dashboard/ResultsSummary";
import { RunNotices } from "@/components/dashboard/RunNotices";
import { RunOverview } from "@/components/dashboard/RunOverview";
import { RunStatusAnnouncer } from "@/components/dashboard/RunStatusAnnouncer";
import { TaskList } from "@/components/dashboard/TaskList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRunCompletionNotification } from "@/hooks/useRunCompletionNotification";
import { useRunWakeLock } from "@/hooks/useRunWakeLock";
import { useSettings } from "@/hooks/useSettings";
import { getCreatedObjectLinks, type PortalLink } from "@/lib/utils/portalLinks";
import type { ActivityMessage } from "@/lib/hydration/types";
import type { ExecutionState } from "@/lib/hydration/executionStateStore";
import type {
  BatchProgress,
  CloudEnvironment,
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
  pausedMs: number;
  pauseStartedAt: Date | null;
  operationMode: OperationMode;
  isPreview: boolean;
  tenantName?: string;
  tenantId?: string;
  /** Cloud of the run. Without it, no admin portal links show. */
  cloudEnvironment?: CloudEnvironment;
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
  pausedMs,
  pauseStartedAt,
  operationMode,
  isPreview,
  tenantName,
  tenantId,
  cloudEnvironment,
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
  const controlsStartTime = startTime ?? (isCompleted ? endTime : null);
  const portalLinks = useMemo(
    () => getCreatedObjectLinks(tasks, cloudEnvironment, isPreview),
    [cloudEnvironment, isPreview, tasks],
  );
  const { settings } = useSettings();
  useRunWakeLock();
  useRunCompletionNotification(settings.notifyOnCompletion);

  return (
    <div className="relative z-10 min-h-screen">
      <RunNavigation
        isCompleted={isCompleted}
        operationMode={operationMode}
        isPreview={isPreview}
        tenantName={tenantName}
        tenantId={tenantId}
        onStartNewHydration={onStartNewHydration}
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

        <RunStatusAnnouncer
          tasks={tasks}
          isCompleted={isCompleted}
          outcome={outcome}
          announceOutcome={Boolean(summary) && outcome !== "failed"}
        />

        <RunNotices
          isCompleted={isCompleted}
          summary={summary}
          fatalError={fatalError}
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

        {controlsStartTime && (
          <ExecutionControls
            tasks={tasks}
            isPaused={isPaused}
            isCancelling={isCancelling}
            isCompleted={isCompleted}
            outcome={outcome}
            startTime={controlsStartTime}
            endTime={endTime}
            pausedMs={pausedMs}
            pauseStartedAt={pauseStartedAt}
            batchProgress={batchProgress}
            onPause={onPause}
            onResume={onResume}
            onCancel={onCancel}
            onDownloadLog={onDownloadLog}
          />
        )}

        {!isCompleted && <CompletionNotificationToggle />}

        <ActivityLog messages={activityLog} />

        <RunResults
          isCompleted={isCompleted}
          summary={summary}
          outcome={outcome}
          tasks={tasks}
          isPreview={isPreview}
          operationMode={operationMode}
          portalLinks={portalLinks}
        />
      </main>
    </div>
  );
}

function RunNavigation({
  isCompleted,
  operationMode,
  isPreview,
  tenantName,
  tenantId,
  onStartNewHydration,
}: Pick<
  DashboardRunViewProps,
  | "operationMode"
  | "isPreview"
  | "tenantName"
  | "tenantId"
  | "onStartNewHydration"
> & { isCompleted: boolean }): React.JSX.Element {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
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
        <>
          <Button
            variant="outline"
            onClick={() => setShowSettings(true)}
            className="nav-action size-9 px-0 sm:w-auto sm:px-3"
          >
            <Settings2 aria-hidden="true" className="size-4 sm:mr-2" />
            <span className="sr-only sm:not-sr-only">Settings</span>
          </Button>
          {isCompleted && (
            <Button variant="outline" asChild className="nav-action size-9 px-0 sm:w-auto sm:px-3">
              <Link href="/history">
                <History aria-hidden="true" className="size-4 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">Run history</span>
              </Link>
            </Button>
          )}
          {isCompleted && (
            <Button
              variant="outline"
              onClick={onStartNewHydration}
              className="nav-action size-9 px-0 sm:w-auto sm:px-4"
            >
              <RotateCcw className="size-4 sm:mr-2" />
              <span className="sr-only sm:not-sr-only">Start New Hydration</span>
            </Button>
          )}
        </>
      }
    />
    <SettingsModal
      key={showSettings ? "settings-open" : "settings-closed"}
      open={showSettings}
      onOpenChange={setShowSettings}
    />
    </>
  );
}

function RunResults({
  isCompleted,
  summary,
  outcome,
  tasks,
  isPreview,
  operationMode,
  portalLinks,
}: Pick<
  DashboardRunViewProps,
  "summary" | "outcome" | "tasks" | "isPreview" | "operationMode"
> & { isCompleted: boolean; portalLinks: ReadonlyMap<string, PortalLink> }): React.JSX.Element {
  return (
    <>
      {isCompleted && summary && outcome && outcome !== "failed" && (
        <div className="space-y-5">
          {!isPreview &&
            operationMode === "create" &&
            tasks.some((task) => task.category === "conditionalAccess") && (
              <Alert className="border-amber-500/60 bg-card/95 text-card-foreground shadow-lg shadow-slate-950/15 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
                <AlertTriangle className="size-4" />
                <AlertTitle>Conditional Access follow-up</AlertTitle>
                <AlertDescription>
                  Review Conditional Access policies in Intune before you enable
                  them in production.
                </AlertDescription>
              </Alert>
            )}
          <ResultsSummary
            summary={summary}
            tasks={tasks}
            isPreview={isPreview}
            outcome={outcome}
            portalLinks={portalLinks}
          />
        </div>
      )}
      {isCompleted && !summary && tasks.length > 0 && (
        <TaskList tasks={tasks} portalLinks={portalLinks} />
      )}
      {!isCompleted && <TaskList tasks={tasks} portalLinks={portalLinks} />}
    </>
  );
}
