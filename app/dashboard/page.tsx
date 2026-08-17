"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardRunView } from "@/components/dashboard/DashboardRunView";
import { useHydrationExecution } from "@/hooks/useHydrationExecution";
import { useWizardState } from "@/hooks/useWizardState";
import {
  clearHydrationSession,
  readExecutionRecord,
  writeExecutionRecord,
  type ExecutionRecord,
} from "@/lib/hydration/executionRecord";
import { getEstimatedTaskCount } from "@/lib/hydration/engine";
import type { ExecutionOutcome, HydrationSummary, HydrationTask, OperationMode } from "@/types/hydration";
import type { ActivityMessage } from "@/lib/hydration/types";

interface DashboardRun {
  tenantId?: string;
  homeAccountId?: string;
  tenantName?: string;
  operationMode: OperationMode;
  isPreview: boolean;
  tasks: HydrationTask[];
  summary: HydrationSummary | null;
  outcome: ExecutionOutcome | null;
  fatalError: string | null;
  activityLog: ActivityMessage[];
  startTime: Date | null;
  endTime: Date | null;
}

export default function DashboardPage(): React.JSX.Element {
  const router = useRouter();
  const { state, resetWizard } = useWizardState();
  const hasStartedRef = useRef(false);
  const [restoredRecord, setRestoredRecord] = useState<ExecutionRecord | null>(null);
  const [hasCheckedRecord, setHasCheckedRecord] = useState(false);
  const { instance, accounts } = useMsal();
  const activeAccount = instance.getActiveAccount() ?? accounts[0] ?? null;
  const activeHomeAccountId = activeAccount?.homeAccountId ?? null;
  const activeTenantId = activeAccount?.tenantId ?? null;
  const {
    tasks,
    phase,
    configuration,
    isRunning,
    isPaused,
    isCancelling,
    isCompleted,
    isBuildingQueue,
    startTime,
    endTime,
    summary,
    outcome,
    fatalError,
    batchProgress,
    activityLog,
    startExecution,
    pause,
    resume,
    cancel,
    reset,
  } = useHydrationExecution();

  useEffect(() => {
    const record = readExecutionRecord(sessionStorage);
    if (
      record &&
      activeHomeAccountId &&
      activeTenantId &&
      record.homeAccountId === activeHomeAccountId &&
      record.tenantId === activeTenantId
    ) {
      setRestoredRecord(record);
    } else if (record) {
      clearHydrationSession(sessionStorage);
    }
    setHasCheckedRecord(true);
  }, [activeHomeAccountId, activeTenantId]);

  useEffect(() => {
    if (!hasCheckedRecord) return;
    if (restoredRecord) return;
    if (phase !== "idle") return;
    if (!state.confirmed) {
      // oxlint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- wizard confirmation lives in client context
      router.push("/wizard");
      return;
    }
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startExecution().catch(() => {
      // The execution hook records and displays the actionable error.
    });
  }, [hasCheckedRecord, restoredRecord, router, phase, startExecution, state.confirmed]);

  useEffect(() => {
    if (!isCompleted || !outcome || !endTime || !configuration) return;
    const baseRecord = {
      tenantId: configuration.tenantId,
      homeAccountId: configuration.homeAccountId,
      tenantName: configuration.tenantName,
      operationMode: configuration.operationMode,
      isPreview: configuration.isPreview,
      selectedObjectCount: configuration.selectedObjectCount,
      tasks,
      activityLog,
      startTime,
      endTime,
    };
    if (outcome === "failed") {
      if (!fatalError) return;
      writeExecutionRecord(sessionStorage, {
        ...baseRecord,
        outcome,
        summary: null,
        fatalError,
      });
      return;
    }
    if (!summary) return;
    writeExecutionRecord(sessionStorage, {
      ...baseRecord,
      outcome,
      summary,
      fatalError: null,
    });
  }, [activityLog, endTime, fatalError, isCompleted, outcome, startTime, configuration, summary, tasks]);

  const liveRun: DashboardRun = {
    tenantId: configuration?.tenantId ?? state.tenantConfig?.tenantId,
    homeAccountId: configuration?.homeAccountId ?? state.tenantConfig?.homeAccountId,
    tenantName: configuration?.tenantName ?? state.tenantConfig?.tenantName,
    operationMode: configuration?.operationMode ?? state.operationMode ?? "create",
    isPreview: configuration?.isPreview ?? state.isPreview,
    tasks,
    summary,
    outcome,
    fatalError,
    activityLog,
    startTime,
    endTime,
  };
  const displayRun: DashboardRun = restoredRecord ?? liveRun;
  const {
    tasks: displayTasks,
    summary: displaySummary,
    outcome: displayOutcome,
    fatalError: displayFatalError,
    activityLog: displayActivityLog,
    startTime: displayStartTime,
    endTime: displayEndTime,
    operationMode: displayOperationMode,
    isPreview: displayIsPreview,
    tenantName: displayTenantName,
    tenantId: displayTenantId,
  } = displayRun;
  const displayCompleted = Boolean(restoredRecord) || isCompleted;
  const selectedObjectCount = restoredRecord
    ? restoredRecord.selectedObjectCount
    : configuration?.selectedObjectCount ?? getEstimatedTaskCount(state.selectedTargets, state.categorySelections);
  const liveOwnerMismatch = Boolean(
    configuration &&
    activeHomeAccountId &&
    activeTenantId &&
    (configuration.homeAccountId !== activeHomeAccountId || configuration.tenantId !== activeTenantId),
  );
  const restoredOwnerMismatch = Boolean(
    restoredRecord &&
      activeHomeAccountId &&
      activeTenantId &&
      (restoredRecord.homeAccountId !== activeHomeAccountId || restoredRecord.tenantId !== activeTenantId),
  );
  const ownerMismatch = liveOwnerMismatch || restoredOwnerMismatch;

  useEffect(() => {
    if (!ownerMismatch) return;
    clearHydrationSession(sessionStorage);
    reset();
    setRestoredRecord(null);
    // oxlint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- account ownership is client authentication state
    router.push("/wizard");
  }, [ownerMismatch, reset, router]);

  function handleDownloadLog(): void {
    const log = {
      tasks: displayTasks,
      activityLog: displayActivityLog,
      startTime: displayStartTime,
      endTime: displayEndTime,
      operationMode: displayOperationMode,
      tenantId: displayTenantId,
      outcome: displayOutcome,
      fatalError: displayFatalError,
    };
    const blob = new Blob([JSON.stringify(log, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `execution-log-${new Date().toISOString()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleStartNewHydration(): void {
    clearHydrationSession(sessionStorage);
    reset();
    setRestoredRecord(null);
    resetWizard();
    router.push("/wizard");
  }

  if (ownerMismatch) {
    return <ProtectedRoute>{null}</ProtectedRoute>;
  }

  return (
    <ProtectedRoute>
      <DashboardRunView
        tasks={displayTasks}
        summary={displaySummary}
        outcome={displayOutcome}
        fatalError={displayFatalError}
        activityLog={displayActivityLog}
        startTime={displayStartTime}
        endTime={displayEndTime}
        operationMode={displayOperationMode}
        isPreview={displayIsPreview}
        tenantName={displayTenantName}
        tenantId={displayTenantId}
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
