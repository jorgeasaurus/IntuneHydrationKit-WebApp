"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ProgressBar, TaskList, ExecutionControls } from "@/components/dashboard";
import { useHydrationExecution } from "@/hooks/useHydrationExecution";
import { useWizardState } from "@/hooks/useWizardState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { state } = useWizardState();
  const {
    tasks,
    isRunning,
    isPaused,
    isCompleted,
    startTime,
    endTime,
    summary,
    startExecution,
    pause,
    resume,
    cancel,
  } = useHydrationExecution();

  // Auto-start execution when page loads
  useEffect(() => {
    if (!state.confirmed) {
      // Redirect to wizard if not confirmed
      router.push("/wizard");
      return;
    }

    // Start execution
    startExecution().catch((error) => {
      console.error("Failed to start execution:", error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to results when completed
  useEffect(() => {
    if (isCompleted && summary) {
      // Store summary in sessionStorage for results page
      sessionStorage.setItem("hydration-summary", JSON.stringify(summary));
      sessionStorage.setItem("hydration-tasks", JSON.stringify(tasks));

      // Navigate to results page after a short delay
      setTimeout(() => {
        router.push("/results");
      }, 2000);
    }
  }, [isCompleted, summary, tasks, router]);

  const handleDownloadLog = () => {
    // Download current execution log as JSON
    const log = {
      tasks,
      startTime,
      endTime,
      operationMode: state.operationMode,
      tenantId: state.tenantConfig?.tenantId,
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
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen relative z-10">
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Hydration Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                {state.operationMode === "create"
                  ? "Creating configurations"
                  : state.operationMode === "delete"
                    ? "Deleting configurations"
                    : "Previewing changes"}{" "}
                in {state.tenantConfig?.tenantName || state.tenantConfig?.tenantId}
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push("/wizard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Wizard
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
          {/* Warning for delete mode */}
          {state.operationMode === "delete" && !isCompleted && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Delete Mode Active</AlertTitle>
              <AlertDescription>
                Deleting configurations from your tenant. Only objects created by Intune
                Hydration Kit will be removed.
              </AlertDescription>
            </Alert>
          )}

          {/* Progress Overview */}
          <ProgressBar
            tasks={tasks}
            title="Overall Progress"
            description={`${tasks.filter((t) => t.status === "success" || t.status === "failed" || t.status === "skipped").length} of ${tasks.length} tasks completed`}
          />

          {/* Execution Controls */}
          {startTime && (
            <ExecutionControls
              tasks={tasks}
              isPaused={isPaused}
              isCompleted={isCompleted}
              startTime={startTime}
              onPause={isRunning && !isPaused ? pause : undefined}
              onResume={isRunning && isPaused ? resume : undefined}
              onCancel={isRunning ? cancel : undefined}
              onDownloadLog={handleDownloadLog}
            />
          )}

          {/* Task List */}
          <TaskList tasks={tasks} />

          {/* Completion Message */}
          {isCompleted && (
            <Alert>
              <AlertTitle>Execution Complete</AlertTitle>
              <AlertDescription>
                {summary
                  ? `Successfully completed ${summary.stats.created + summary.stats.deleted} of ${summary.stats.total} tasks. ${summary.stats.failed > 0 ? `${summary.stats.failed} tasks failed.` : ""}`
                  : "Execution completed. Redirecting to results..."}
              </AlertDescription>
            </Alert>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
