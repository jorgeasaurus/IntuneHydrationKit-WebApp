"use client";

import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardRunView } from "@/components/dashboard/DashboardRunView";
import { ForeignInterruptedRunNotice, InterruptedRunNotice } from "@/components/dashboard/InterruptedRunNotice";
import { RerunActions } from "@/components/dashboard/RerunActions";
import { useDashboardRun } from "@/hooks/useDashboardRun";
import { isExecutionCheckpoint } from "@/lib/hydration/executionRecord";

type DashboardRunState = ReturnType<typeof useDashboardRun>;

/** The interrupted-run notice and the actions that continue from a completed run. */
function getContinueRunSlots(dashboard: DashboardRunState): { notice?: ReactNode; rerunActions?: ReactNode } {
  const { restoredRecord, rerunSource, rerunDisabledReason, handleRerun, handleDownloadLog } = dashboard;
  if (!rerunSource) return {};
  if (restoredRecord && isExecutionCheckpoint(restoredRecord)) {
    return {
      notice: (
        <InterruptedRunNotice
          source={rerunSource}
          checkpointAt={restoredRecord.checkpointAt}
          disabledReason={rerunDisabledReason}
          onResume={() => handleRerun("resume")}
          onDiscard={dashboard.handleStartNewHydration}
          onDownloadLog={handleDownloadLog}
        />
      ),
    };
  }
  return {
    rerunActions: (
      <RerunActions
        source={rerunSource}
        disabledReason={rerunDisabledReason}
        onStart={handleRerun}
        onDownloadLog={handleDownloadLog}
        onDownloadReport={dashboard.handleDownloadReport}
      />
    ),
  };
}

/** Pause, resume, and cancel handlers that apply to the current run phase. */
function getRunControls(execution: DashboardRunState["execution"]) {
  const { isRunning, isPaused, isCancelling, isBuildingQueue, pause, resume, cancel } = execution;
  const canControl = isRunning && !isCancelling;
  return {
    onPause: canControl && !isPaused ? pause : undefined,
    onResume: canControl && isPaused ? resume : undefined,
    onCancel: (isRunning || isBuildingQueue) && !isCancelling ? cancel : undefined,
  };
}

export default function DashboardPage(): React.JSX.Element {
  const dashboard = useDashboardRun();
  const {
    execution,
    displayRun,
    displayCompleted,
    selectedObjectCount,
    restoredRecord,
    ownerMismatch,
    isInterrupted,
    hasForeignInterruptedRun,
    runStartMessage,
    handleDownloadLog,
    handleStartNewHydration,
  } = dashboard;
  const { runId, phase, batchProgress } = execution;

  if (ownerMismatch) {
    return <ProtectedRoute>{null}</ProtectedRoute>;
  }

  if (hasForeignInterruptedRun && !restoredRecord && phase === "idle") {
    return (
      <ProtectedRoute>
        <main className="container mx-auto max-w-3xl px-4 py-8">
          <ForeignInterruptedRunNotice onDiscard={handleStartNewHydration} />
        </main>
      </ProtectedRoute>
    );
  }

  const { notice, rerunActions } = getContinueRunSlots(dashboard);

  return (
    <ProtectedRoute>
      {/* This live region stays mounted, so the start of a new run is announced. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="run-start-announcer">
        {runStartMessage}
      </div>
      <DashboardRunView
        // A new run (for example a retry) starts with a fresh view state and fresh announcements.
        key={restoredRecord ? "restored" : `run-${runId ?? "none"}`}
        tasks={displayRun.tasks}
        summary={displayRun.summary}
        outcome={displayRun.outcome}
        fatalError={displayRun.fatalError}
        activityLog={displayRun.activityLog}
        startTime={displayRun.startTime}
        endTime={displayRun.endTime}
        pausedMs={displayRun.pausedMs}
        pauseStartedAt={displayRun.pauseStartedAt}
        operationMode={displayRun.operationMode}
        isPreview={displayRun.isPreview}
        tenantName={displayRun.tenantName}
        tenantId={displayRun.tenantId}
        cloudEnvironment={displayRun.cloudEnvironment}
        selectedObjectCount={selectedObjectCount}
        phase={displayCompleted ? "completed" : phase}
        batchProgress={restoredRecord ? null : batchProgress}
        {...getRunControls(execution)}
        onDownloadLog={handleDownloadLog}
        onStartNewHydration={handleStartNewHydration}
        isInterrupted={isInterrupted}
        notice={notice}
        rerunActions={rerunActions}
      />
    </ProtectedRoute>
  );
}
