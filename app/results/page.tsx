"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Home, RefreshCcw, AlertTriangle } from "lucide-react";
import { ResultsSummary } from "@/components/dashboard";
import { HydrationSummary, HydrationTask } from "@/types/hydration";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWizardState } from "@/hooks/useWizardState";

export default function ResultsPage() {
  const router = useRouter();
  const { state, resetWizard } = useWizardState();
  const [summary, setSummary] = useState<HydrationSummary | null>(null);
  const [tasks, setTasks] = useState<HydrationTask[]>([]);
  const [isPreview, setIsPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load summary and tasks from sessionStorage
    try {
      const summaryJson = sessionStorage.getItem("hydration-summary");
      const tasksJson = sessionStorage.getItem("hydration-tasks");
      const isPreviewJson = sessionStorage.getItem("hydration-isPreview");

      if (!summaryJson || !tasksJson) {
        setError("No execution results found. Please run a hydration first.");
        return;
      }

      const parsedSummary = JSON.parse(summaryJson);
      const parsedTasks = JSON.parse(tasksJson);
      const parsedIsPreview = isPreviewJson ? JSON.parse(isPreviewJson) : false;

      // Convert date strings back to Date objects
      parsedSummary.startTime = new Date(parsedSummary.startTime);
      parsedSummary.endTime = new Date(parsedSummary.endTime);
      parsedSummary.errors = parsedSummary.errors.map((e: { timestamp: string }) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));

      parsedTasks.forEach((task: HydrationTask) => {
        if (task.startTime) task.startTime = new Date(task.startTime);
        if (task.endTime) task.endTime = new Date(task.endTime);
      });

      setSummary(parsedSummary);
      setTasks(parsedTasks);
      setIsPreview(parsedIsPreview);
    } catch (err) {
      console.error("Failed to load results:", err);
      setError("Failed to load execution results. The data may be corrupted.");
    }
  }, []);

  const handleStartNew = () => {
    // Clear previous results
    sessionStorage.removeItem("hydration-summary");
    sessionStorage.removeItem("hydration-tasks");

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
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/IHTLogoClear.png"
                alt="Intune Hydration Kit"
                width={40}
                height={40}
                className="w-10 h-10"
              />
              <div>
                <h1 className="text-2xl font-bold">Execution Results</h1>
                <p className="text-sm text-muted-foreground">
                  {summary
                    ? `${summary.operationMode.charAt(0).toUpperCase() + summary.operationMode.slice(1)} operation completed`
                    : "Loading results..."}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push("/")}>
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
              <Button onClick={handleStartNew}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Start New Hydration
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
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
                      <AlertTriangle className="h-4 w-4" />
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
                <AlertTriangle className="h-4 w-4" />
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
              <p className="text-muted-foreground">Loading results...</p>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
