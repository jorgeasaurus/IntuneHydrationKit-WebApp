"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useHydrationExecution } from "@/hooks/useHydrationExecution";
import { useWizardState } from "@/hooks/useWizardState";
import {
  clearHydrationSession,
  readExecutionRecord,
  writeExecutionRecord,
  type ExecutionRecord,
} from "@/lib/hydration/executionRecord";
import { getEstimatedTaskCount } from "@/lib/hydration/engine";
import type { ExecutionOutcome, HydrationSummary, HydrationTask, OperationMode, WizardState } from "@/types/hydration";
import type { ExecutionState } from "@/lib/hydration/executionStateStore";
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

function getLiveDashboardRun(execution: ExecutionState, state: WizardState): DashboardRun {
  return {
    tenantId: execution.configuration?.tenantId ?? state.tenantConfig?.tenantId,
    homeAccountId: execution.configuration?.homeAccountId ?? state.tenantConfig?.homeAccountId,
    tenantName: execution.configuration?.tenantName ?? state.tenantConfig?.tenantName,
    operationMode: execution.configuration?.operationMode ?? state.operationMode ?? "create",
    isPreview: execution.configuration?.isPreview ?? state.isPreview,
    tasks: execution.tasks,
    summary: execution.summary,
    outcome: execution.outcome,
    fatalError: execution.fatalError,
    activityLog: execution.activityLog,
    startTime: execution.startTime,
    endTime: execution.endTime,
  };
}

function hasDifferentOwner(
  owner: Pick<DashboardRun, "homeAccountId" | "tenantId"> | null,
  homeAccountId: string | null,
  tenantId: string | null,
): boolean {
  if (!owner || !homeAccountId || !tenantId) return false;
  return owner.homeAccountId !== homeAccountId || owner.tenantId !== tenantId;
}

/** Restore, persist, and reset the dashboard run for the active account. */
export function useDashboardRun() {
  const router = useRouter();
  const { state, resetWizard } = useWizardState();
  const hasStartedRef = useRef(false);
  const [restoredRecord, setRestoredRecord] = useState<ExecutionRecord | null>(null);
  const [hasCheckedRecord, setHasCheckedRecord] = useState(false);
  const { instance, accounts } = useMsal();
  const activeAccount = instance.getActiveAccount() ?? accounts[0] ?? null;
  const activeHomeAccountId = activeAccount?.homeAccountId ?? null;
  const activeTenantId = activeAccount?.tenantId ?? null;
  const execution = useHydrationExecution();
  const {
    tasks,
    phase,
    configuration,
    isCompleted,
    startTime,
    endTime,
    summary,
    outcome,
    fatalError,
    activityLog,
    startExecution,
    reset,
  } = execution;

  useEffect(() => {
    if (!activeHomeAccountId || !activeTenantId) return;
    const record = readExecutionRecord(sessionStorage);
    if (
      record &&
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
    if (!summary || !startTime) return;
    writeExecutionRecord(sessionStorage, {
      ...baseRecord,
      outcome,
      summary,
      fatalError: null,
    });
  }, [activityLog, endTime, fatalError, isCompleted, outcome, startTime, configuration, summary, tasks]);

  const displayRun = restoredRecord ?? getLiveDashboardRun(execution, state);
  const displayCompleted = Boolean(restoredRecord) || isCompleted;
  const selectedObjectCount = restoredRecord
    ? restoredRecord.selectedObjectCount
    : configuration?.selectedObjectCount ?? getEstimatedTaskCount(state.selectedTargets, state.categorySelections);
  const ownerMismatch =
    hasDifferentOwner(configuration, activeHomeAccountId, activeTenantId) ||
    hasDifferentOwner(restoredRecord, activeHomeAccountId, activeTenantId);

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
      tasks: displayRun.tasks,
      activityLog: displayRun.activityLog,
      startTime: displayRun.startTime,
      endTime: displayRun.endTime,
      operationMode: displayRun.operationMode,
      tenantId: displayRun.tenantId,
      outcome: displayRun.outcome,
      fatalError: displayRun.fatalError,
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

  return {
    execution,
    displayRun,
    displayCompleted,
    selectedObjectCount,
    restoredRecord,
    ownerMismatch,
    handleDownloadLog,
    handleStartNewHydration,
  };
}
