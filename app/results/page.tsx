/* oxlint-disable react-doctor/nextjs-missing-metadata -- route metadata is defined in app/layout.tsx for this client page. */
"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Home, RefreshCcw, AlertTriangle } from "lucide-react";
import { ResultsSummary } from "@/components/dashboard";
import { HydrationSummary, HydrationTask } from "@/types/hydration";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWizardState } from "@/hooks/useWizardState";
import { EXECUTION_RESULT_STORAGE_KEYS } from "@/lib/storageKeys";

type ExecutionResultsSnapshot = {
  summary: HydrationSummary | null;
  tasks: HydrationTask[];
  isPreview: boolean;
  error: string | null;
} | null;

let cachedStorageSignature = "";
let cachedExecutionResults: ExecutionResultsSnapshot = null;

function subscribeToExecutionResults() {
  return () => {};
}

function getServerExecutionResults(): ExecutionResultsSnapshot {
  return null;
}

function readExecutionResults(): ExecutionResultsSnapshot {
  if (typeof window === "undefined") {
    return null;
  }

  const summaryJson = sessionStorage.getItem(EXECUTION_RESULT_STORAGE_KEYS.summary);
  const tasksJson = sessionStorage.getItem(EXECUTION_RESULT_STORAGE_KEYS.tasks);
  const isPreviewJson = sessionStorage.getItem(EXECUTION_RESULT_STORAGE_KEYS.isPreview);
  const signature = JSON.stringify([summaryJson, tasksJson, isPreviewJson]);

  if (signature === cachedStorageSignature) {
    return cachedExecutionResults;
  }

  cachedStorageSignature = signature;

  if (!summaryJson || !tasksJson) {
    cachedExecutionResults = {
      summary: null,
      tasks: [],
      isPreview: false,
      error: "No execution results found. Please run a hydration first.",
    };
    return cachedExecutionResults;
  }

  try {
    const parsedSummary = JSON.parse(summaryJson);
    const parsedTasks = JSON.parse(tasksJson);
    const parsedIsPreview = isPreviewJson ? JSON.parse(isPreviewJson) : false;

    parsedSummary.startTime = new Date(parsedSummary.startTime);
    parsedSummary.endTime = new Date(parsedSummary.endTime);
    parsedSummary.errors = parsedSummary.errors.map((error: { timestamp: string }) => ({
      ...error,
      timestamp: new Date(error.timestamp),
    }));

    parsedTasks.forEach((task: HydrationTask) => {
      if (task.startTime) task.startTime = new Date(task.startTime);
      if (task.endTime) task.endTime = new Date(task.endTime);
    });

    cachedExecutionResults = {
      summary: parsedSummary,
      tasks: parsedTasks,
      isPreview: parsedIsPreview,
      error: null,
    };
    return cachedExecutionResults;
  } catch (error) {
    console.error("Failed to load results:", error);
    cachedExecutionResults = {
      summary: null,
      tasks: [],
      isPreview: false,
      error: "Failed to load execution results. The data may be corrupted.",
    };
    return cachedExecutionResults;
  }
}

export default function ResultsPage() {
  const router = useRouter();
  const { state, resetWizard } = useWizardState();
  const executionResults = useSyncExternalStore(
    subscribeToExecutionResults,
    readExecutionResults,
    getServerExecutionResults
  );
  const summary = executionResults?.summary ?? null;
  const tasks = executionResults?.tasks ?? [];
  const isPreview = executionResults?.isPreview ?? false;
  const error = executionResults?.error ?? null;

  const handleStartNew = () => {
    // Clear previous results
    sessionStorage.removeItem(EXECUTION_RESULT_STORAGE_KEYS.summary);
    sessionStorage.removeItem(EXECUTION_RESULT_STORAGE_KEYS.tasks);
    sessionStorage.removeItem(EXECUTION_RESULT_STORAGE_KEYS.isPreview);

    // Clear all template caches (intune-hydration-templates-*)
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("intune-hydration-templates-")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));

    // Reset wizard state to step 1
    resetWizard();

    // Navigate to wizard
    router.push("/wizard");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen relative z-10">
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/IHTLogoClear.png"
                alt="Intune Hydration Kit"
                width={144}
                height={169}
                className="h-10 w-auto"
                style={{ width: "auto" }}
              />
              <div>
                <h1 className="text-2xl font-bold">Execution Results</h1>
                <p className="text-sm text-muted-foreground">
                  {summary
                    ? `${summary.operationMode.charAt(0).toUpperCase() + summary.operationMode.slice(1)} operation completed`
                    : "Loading results…"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push("/")}>
                <Home className="size-4 mr-2" />
                Home
              </Button>
              <Button onClick={handleStartNew}>
                <RefreshCcw className="size-4 mr-2" />
                Start New Hydration
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error}
                <div className="mt-4">
                  <Button onClick={handleStartNew}>Start New Hydration</Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : summary ? (
            tasks.length > 0 ? (
              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-border/80 bg-card/80 p-4 backdrop-blur">
                    <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                      Tenant
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {summary.tenantName || summary.tenantId}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card/80 p-4 backdrop-blur">
                    <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                      Mode
                    </p>
                    <p className="mt-2 text-base font-semibold capitalize">
                      {summary.operationMode}
                      {isPreview ? " preview" : ""}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card/80 p-4 backdrop-blur">
                    <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                      Tasks
                    </p>
                    <p className="mt-2 text-base font-semibold">{summary.stats.total}</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card/80 p-4 backdrop-blur">
                    <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                      Duration
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {Math.round(summary.duration / 1000)}s
                    </p>
                  </div>
                </div>

                {state.selectedTargets.includes("conditionalAccess") &&
                  summary.operationMode === "create" && (
                    <Alert className="border-amber-500/30 bg-amber-500/10">
                      <AlertTriangle className="size-4" />
                      <AlertTitle>Conditional Access follow-up</AlertTitle>
                      <AlertDescription>
                        Review Conditional Access policies in Intune before enabling them in
                        production.
                      </AlertDescription>
                    </Alert>
                  )}

                <ResultsSummary summary={summary} tasks={tasks} isPreview={isPreview} />
              </div>
            ) : (
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertTitle>No Tasks Executed</AlertTitle>
                <AlertDescription>
                  The execution completed but no tasks were created. This usually means the selected templates could not be loaded.
                  <div className="mt-4">
                    <Button onClick={handleStartNew}>Start New Hydration</Button>
                  </div>
                </AlertDescription>
              </Alert>
            )
          ) : (
            <div className="flex items-center justify-center min-h-[400px]">
              <p className="text-muted-foreground">Loading results…</p>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
