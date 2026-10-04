"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardRunView } from "@/components/dashboard/DashboardRunView";
import { useDashboardRun } from "@/hooks/useDashboardRun";

export default function DashboardPage(): React.JSX.Element {
  const {
    execution,
    displayRun,
    displayCompleted,
    selectedObjectCount,
    restoredRecord,
    ownerMismatch,
    handleDownloadLog,
    handleStartNewHydration,
  } = useDashboardRun();
  const {
    phase,
    batchProgress,
    isRunning,
    isPaused,
    isCancelling,
    isBuildingQueue,
    pause,
    resume,
    cancel,
  } = execution;

  if (ownerMismatch) {
    return <ProtectedRoute>{null}</ProtectedRoute>;
  }

  return (
    <ProtectedRoute>
      <DashboardRunView
        tasks={displayRun.tasks}
        summary={displayRun.summary}
        outcome={displayRun.outcome}
        fatalError={displayRun.fatalError}
        activityLog={displayRun.activityLog}
        startTime={displayRun.startTime}
        endTime={displayRun.endTime}
        operationMode={displayRun.operationMode}
        isPreview={displayRun.isPreview}
        tenantName={displayRun.tenantName}
        tenantId={displayRun.tenantId}
        selectedObjectCount={selectedObjectCount}
        phase={displayCompleted ? "completed" : phase}
        batchProgress={restoredRecord ? null : batchProgress}
        onPause={isRunning && !isPaused && !isCancelling ? pause : undefined}
        onResume={isRunning && isPaused && !isCancelling ? resume : undefined}
        onCancel={(isRunning || isBuildingQueue) && !isCancelling ? cancel : undefined}
        onDownloadLog={handleDownloadLog}
        onStartNewHydration={handleStartNewHydration}
      />
    </ProtectedRoute>
  );
}
