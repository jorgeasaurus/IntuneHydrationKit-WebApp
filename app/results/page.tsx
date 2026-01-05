"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Home, RefreshCcw } from "lucide-react";
import { ResultsSummary } from "@/components/dashboard";
import { HydrationSummary, HydrationTask } from "@/types/hydration";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function ResultsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<HydrationSummary | null>(null);
  const [tasks, setTasks] = useState<HydrationTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load summary and tasks from sessionStorage
    try {
      const summaryJson = sessionStorage.getItem("hydration-summary");
      const tasksJson = sessionStorage.getItem("hydration-tasks");

      if (!summaryJson || !tasksJson) {
        setError("No execution results found. Please run a hydration first.");
        return;
      }

      const parsedSummary = JSON.parse(summaryJson);
      const parsedTasks = JSON.parse(tasksJson);

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
    } catch (err) {
      console.error("Failed to load results:", err);
      setError("Failed to load execution results. The data may be corrupted.");
    }
  }, []);

  const handleStartNew = () => {
    // Clear previous results
    sessionStorage.removeItem("hydration-summary");
    sessionStorage.removeItem("hydration-tasks");

    // Navigate to wizard
    router.push("/wizard");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Execution Results</h1>
              <p className="text-sm text-muted-foreground">
                {summary
                  ? `${summary.operationMode.charAt(0).toUpperCase() + summary.operationMode.slice(1)} operation completed`
                  : "Loading results..."}
              </p>
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
              <ResultsSummary summary={summary} tasks={tasks} />
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
