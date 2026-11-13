"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useHydrationExecution } from "@/hooks/useHydrationExecution";
import { useRunHistoryRecorder } from "@/hooks/useRunHistoryRecorder";
import { useWizardState } from "@/hooks/useWizardState";
import {
  clearHydrationSession,
  isExecutionCheckpoint,
  readExecutionRecord,
  writeExecutionRecord,
  type ExecutionRecord,
} from "@/lib/hydration/executionRecord";
import { getEstimatedTaskCount } from "@/lib/hydration/engine";
import type { CloudEnvironment, ExecutionOutcome, HydrationSummary, HydrationTask, OperationMode, WizardState } from "@/types/hydration";
import { getExecutionState, type ExecutionState } from "@/lib/hydration/executionStateStore";
import { prepareRestoredRecord, startRunCheckpoints } from "@/lib/hydration/runCheckpoint";
import { claimRunLock, watchRunLock, type RunLockState } from "@/lib/hydration/runLock";
import { downloadReport, generateJSONReport, generateReportFilename } from "@/lib/hydration/reporter";
import { getCreatedObjectLinks } from "@/lib/utils/portalLinks";
import {
  createRerunPlan,
  getRerunAvailability,
  getRunLockBlockReason,
  getSavedRecordAction,
  type RerunKind,
} from "@/lib/hydration/rerun";
import type { ActivityMessage } from "@/lib/hydration/types";

interface DashboardRun {
  tenantId?: string;
  homeAccountId?: string;
  tenantName?: string;
  /** Cloud of the run. Without it, the dashboard shows no admin portal links. */
  cloudEnvironment?: CloudEnvironment;
  operationMode: OperationMode;
  isPreview: boolean;
  tasks: HydrationTask[];
  summary: HydrationSummary | null;
  outcome: ExecutionOutcome | null;
  fatalError: string | null;
  activityLog: ActivityMessage[];
  startTime: Date | null;
  endTime: Date | null;
  /** Total time of closed engine pause waits, in milliseconds. */
  pausedMs: number;
  /** Start of the open engine pause wait, or null. */
  pauseStartedAt: Date | null;
}

function getLiveDashboardRun(execution: ExecutionState, state: WizardState): DashboardRun {
  return {
    tenantId: execution.configuration?.tenantId ?? state.tenantConfig?.tenantId,
    homeAccountId: execution.configuration?.homeAccountId ?? state.tenantConfig?.homeAccountId,
    tenantName: execution.configuration?.tenantName ?? state.tenantConfig?.tenantName,
    cloudEnvironment: execution.configuration?.cloudEnvironment ?? state.tenantConfig?.cloudEnvironment,
    operationMode: execution.configuration?.operationMode ?? state.operationMode ?? "create",
    isPreview: execution.configuration?.isPreview ?? state.isPreview,
    tasks: execution.tasks,
    summary: execution.summary,
    outcome: execution.outcome,
    fatalError: execution.fatalError,
    activityLog: execution.activityLog,
    startTime: execution.startTime,
    endTime: execution.endTime,
    pausedMs: execution.pausedMs,
    pauseStartedAt: execution.pauseStartedAt,
  };
}

function getRestoredDashboardRun(record: ExecutionRecord): DashboardRun {
  return {
    ...record,
    // An interrupted run has no end time. Its last saved progress is the closest known time.
    endTime: record.endTime ?? (isExecutionCheckpoint(record) ? record.checkpointAt : null),
    pausedMs: record.pausedMs ?? 0,
    pauseStartedAt: null,
  };
}

/** Time between two checks for a run of the displayed tenant in another tab. */
const RUN_LOCK_POLL_MS = 3000;

const RUN_START_MESSAGES: Record<RerunKind, string> = {
  retry: "Retry run started.",
  resume: "Resumed run started.",
  live: "Live run started.",
};

/** Download of the JSON report of a run, or undefined when the run has no report. */
function createReportDownload(run: DashboardRun): (() => void) | undefined {
  const { summary, outcome } = run;
  if (!summary || !outcome || outcome === "failed") return undefined;
  return () => {
    const links = getCreatedObjectLinks(run.tasks, run.cloudEnvironment, run.isPreview);
    downloadReport(
      generateJSONReport(summary, run.tasks, outcome, run.isPreview, links),
      generateReportFilename(run.operationMode, "json", run.isPreview),
    );
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
  /** True when an interrupted run of a different account or tenant is saved. Its details are not shown. */
  const [hasForeignInterruptedRun, setHasForeignInterruptedRun] = useState(false);
  /** Polite screen reader text for the start of a run that continues an earlier run. */
  const [runStartMessage, setRunStartMessage] = useState("");
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
    pausedMs,
    summary,
    outcome,
    fatalError,
    activityLog,
    startExecution,
    startRerun,
    reset,
  } = execution;
  useRunHistoryRecorder(execution, restoredRecord);

  // Liveness of runs for the displayed tenant in other tabs (a duplicated tab copies the checkpoint).
  const [lockCheck, setLockCheck] = useState<{ tenantId: string; state: RunLockState } | null>(null);
  const lockTenantId = restoredRecord?.tenantId ?? (isCompleted ? configuration?.tenantId : undefined) ?? null;
  useEffect(() => {
    if (!lockTenantId) return;
    return watchRunLock(lockTenantId, (state) => setLockCheck({ tenantId: lockTenantId, state }), RUN_LOCK_POLL_MS);
  }, [lockTenantId]);
  const lockState = lockCheck?.tenantId === lockTenantId ? lockCheck.state : null;

  // Save the progress of the active run, so that an interrupted run can be resumed.
  useEffect(() => startRunCheckpoints({ storage: sessionStorage, eventTarget: window }), []);

  useEffect(() => {
    if (!activeHomeAccountId || !activeTenantId) return;
    const record = readExecutionRecord(sessionStorage);
    const action = getSavedRecordAction(
      record,
      { homeAccountId: activeHomeAccountId, tenantId: activeTenantId },
      getExecutionState().phase !== "idle",
    );
    setHasForeignInterruptedRun(action === "foreignInterrupted");
    if (action === "restore" && record) setRestoredRecord(prepareRestoredRecord(record, sessionStorage));
    if (action === "clear") clearHydrationSession(sessionStorage);
    setHasCheckedRecord(true);
  }, [activeHomeAccountId, activeTenantId]);

  useEffect(() => {
    if (!hasCheckedRecord) return;
    if (restoredRecord || hasForeignInterruptedRun) return;
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
  }, [hasCheckedRecord, hasForeignInterruptedRun, restoredRecord, router, phase, startExecution, state.confirmed]);

  useEffect(() => {
    if (!isCompleted || !outcome || !endTime || !configuration) return;
    const baseRecord = {
      tenantId: configuration.tenantId,
      homeAccountId: configuration.homeAccountId,
      tenantName: configuration.tenantName,
      cloudEnvironment: configuration.cloudEnvironment,
      operationMode: configuration.operationMode,
      isPreview: configuration.isPreview,
      selectedObjectCount: configuration.selectedObjectCount,
      scope: configuration.scope,
      licenses: configuration.licenses,
      tasks,
      activityLog,
      startTime,
      endTime,
      pausedMs,
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
  }, [activityLog, endTime, fatalError, isCompleted, outcome, pausedMs, startTime, configuration, summary, tasks]);

  const displayRun = restoredRecord ? getRestoredDashboardRun(restoredRecord) : getLiveDashboardRun(execution, state);
  const displayCompleted = Boolean(restoredRecord) || isCompleted;
  const selectedObjectCount = restoredRecord
    ? restoredRecord.selectedObjectCount
    : configuration?.selectedObjectCount ?? getEstimatedTaskCount(state.selectedTargets, state.categorySelections);
  const ownerMismatch =
    hasDifferentOwner(configuration, activeHomeAccountId, activeTenantId) ||
    hasDifferentOwner(restoredRecord, activeHomeAccountId, activeTenantId);

  useEffect(() => {
    if (!ownerMismatch) return;
    reset();
    setRestoredRecord(null);
    // The same rule as on page load: an interrupted run of another account stays saved, with no
    // details shown, so that account can resume it. The page offers only to discard it.
    // Sign-out still clears everything (clearHydrationSession in the sign-out flow).
    const saved = readExecutionRecord(sessionStorage);
    if (saved && isExecutionCheckpoint(saved) && activeHomeAccountId && activeTenantId) {
      const action = getSavedRecordAction(saved, { homeAccountId: activeHomeAccountId, tenantId: activeTenantId }, false);
      setHasForeignInterruptedRun(action === "foreignInterrupted");
      if (action === "restore") setRestoredRecord(prepareRestoredRecord(saved, sessionStorage));
      return;
    }
    clearHydrationSession(sessionStorage);
    // oxlint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- account ownership is client authentication state
    router.push("/wizard");
  }, [activeHomeAccountId, activeTenantId, ownerMismatch, reset, router]);

  function handleDownloadLog(): void {
    const log = {
      tasks: displayRun.tasks,
      activityLog: displayRun.activityLog,
      startTime: displayRun.startTime,
      endTime: displayRun.endTime,
      pausedMs: displayRun.pausedMs,
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

  const handleDownloadReport = createReportDownload(displayRun);

  function handleStartNewHydration(): void {
    clearHydrationSession(sessionStorage);
    reset();
    setRestoredRecord(null);
    setHasForeignInterruptedRun(false);
    resetWizard();
    router.push("/wizard");
  }

  const {
    source: rerunSource,
    disabledReason: rerunDisabledReason,
    isInterrupted,
  } = getRerunAvailability({
    restoredRecord,
    liveRun: { configuration, tasks },
    phase,
    active: { homeAccountId: activeHomeAccountId, tenantId: activeTenantId },
    lockState,
  });

  /**
   * Start a new run that continues from the displayed run. At confirm time this tab claims the
   * run lock of the tenant. The claim is atomic, so when two tabs confirm at the same time only
   * one of them starts, and a run that started in another tab after the last check is refused.
   */
  async function startRerunAfterChecks(kind: RerunKind): Promise<void> {
    if (!rerunSource || rerunDisabledReason) return;
    if (kind === "resume" && !isInterrupted) return;
    if (kind === "live" && !rerunSource.isPreview) return;
    const source = rerunSource;
    const claim = await claimRunLock(source.tenantId);
    const release = claim.state === "claimed" ? claim.release : undefined;
    const currentLockState: RunLockState = claim.state === "claimed" ? "free" : claim.state;
    if (claim.state !== "claimed") setLockCheck({ tenantId: source.tenantId, state: currentLockState });
    if (getRunLockBlockReason(kind, currentLockState)) return;
    const currentPhase = getExecutionState().phase;
    if (currentPhase !== "idle" && currentPhase !== "completed") {
      release?.();
      return;
    }
    let plan: ReturnType<typeof createRerunPlan>;
    try {
      plan = createRerunPlan(kind, source);
    } catch (error) {
      release?.();
      throw error;
    }
    // The wizard must not start its own run after the displayed record is removed.
    hasStartedRef.current = true;
    setRestoredRecord(null);
    setRunStartMessage(`${RUN_START_MESSAGES[kind]} ${plan.configuration.selectedObjectCount} items in scope.`);
    startRerun(plan, release).catch(() => {
      // The execution hook records and displays the actionable error.
    });
  }

  function handleRerun(kind: RerunKind): void {
    void startRerunAfterChecks(kind);
  }

  return {
    execution,
    displayRun,
    displayCompleted,
    selectedObjectCount,
    restoredRecord,
    ownerMismatch,
    isInterrupted,
    hasForeignInterruptedRun,
    rerunSource,
    rerunDisabledReason,
    runStartMessage,
    handleRerun,
    handleDownloadLog,
    handleDownloadReport,
    handleStartNewHydration,
  };
}
