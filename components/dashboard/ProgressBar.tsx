"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HydrationTask, TaskCategory } from "@/types/hydration";

interface ProgressBarProps {
  tasks: HydrationTask[];
  title?: string;
  description?: string;
}

/**
 * Display names for task categories
 */
const CATEGORY_DISPLAY_NAMES: Record<TaskCategory, string> = {
  groups: "Dynamic Groups",
  filters: "Device Filters",
  compliance: "Compliance Policies",
  appProtection: "App Protection",
  conditionalAccess: "Conditional Access",
  enrollment: "Enrollment Profiles",
  notification: "Notifications",
  baseline: "OpenIntuneBaseline",
  cisBaseline: "CIS Baselines",
};

interface CategoryStats {
  category: TaskCategory;
  displayName: string;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  running: number;
  completed: number;
  progress: number;
}

export function ProgressBar({ tasks, title, description }: ProgressBarProps) {
  const total = tasks.length;
  const completed = tasks.filter(
    (t) => t.status === "success" || t.status === "failed" || t.status === "skipped"
  ).length;
  const succeeded = tasks.filter((t) => t.status === "success").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const skipped = tasks.filter((t) => t.status === "skipped").length;
  const remaining = total - completed;

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isComplete = completed === total && total > 0;

  // Group tasks by category and calculate per-category stats
  const categoryStats = useMemo(() => {
    const categories = new Map<TaskCategory, HydrationTask[]>();

    for (const task of tasks) {
      const existing = categories.get(task.category) || [];
      existing.push(task);
      categories.set(task.category, existing);
    }

    const stats: CategoryStats[] = [];
    for (const [category, categoryTasks] of categories) {
      const catTotal = categoryTasks.length;
      const catSucceeded = categoryTasks.filter((t) => t.status === "success").length;
      const catFailed = categoryTasks.filter((t) => t.status === "failed").length;
      const catSkipped = categoryTasks.filter((t) => t.status === "skipped").length;
      const catRunning = categoryTasks.filter((t) => t.status === "running").length;
      const catCompleted = catSucceeded + catFailed + catSkipped;
      const catProgress = catTotal > 0 ? (catCompleted / catTotal) * 100 : 0;

      stats.push({
        category,
        displayName: CATEGORY_DISPLAY_NAMES[category] || category,
        total: catTotal,
        succeeded: catSucceeded,
        failed: catFailed,
        skipped: catSkipped,
        running: catRunning,
        completed: catCompleted,
        progress: catProgress,
      });
    }

    // Sort by display name
    return stats.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [tasks]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "Overall Progress"}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">{percentage}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                isComplete
                  ? "bg-gradient-to-r from-green-500 to-emerald-400"
                  : "bg-gradient-to-r from-blue-500 to-cyan-400"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-card p-4 text-center">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {succeeded}
            </div>
            <div className="text-sm text-muted-foreground">Succeeded</div>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {failed}
            </div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {skipped}
            </div>
            <div className="text-sm text-muted-foreground">Skipped</div>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <div className="text-3xl font-bold text-muted-foreground">
              {remaining}
            </div>
            <div className="text-sm text-muted-foreground">Remaining</div>
          </div>
        </div>

        {/* Category Progress Bars */}
        {categoryStats.length > 1 && (
          <div className="space-y-3 rounded-lg border bg-card/50 p-4">
            <h3 className="text-sm font-medium text-muted-foreground">Category Progress</h3>
            {categoryStats.map((cat) => (
              <div key={cat.category}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">{cat.displayName}</span>
                  <span className="text-muted-foreground">
                    {cat.completed}/{cat.total}
                    {cat.failed > 0 && (
                      <span className="ml-1 text-red-500">({cat.failed} failed)</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all duration-300 ${
                      cat.progress === 100 && cat.failed === 0
                        ? "bg-gradient-to-r from-green-500 to-emerald-400"
                        : cat.failed > 0
                          ? "bg-gradient-to-r from-red-500 to-orange-400"
                          : "bg-gradient-to-r from-blue-500 to-cyan-400"
                    }`}
                    style={{ width: `${cat.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
