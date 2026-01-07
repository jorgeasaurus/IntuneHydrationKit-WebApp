"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HydrationSummary, HydrationTask } from "@/types/hydration";
import { Download, FileText, FileJson, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import {
  generateMarkdownReport,
  generateJSONReport,
  generateCSVReport,
  downloadReport,
  generateReportFilename,
} from "@/lib/hydration/reporter";
import { format } from "date-fns";

interface ResultsSummaryProps {
  summary: HydrationSummary;
  tasks: HydrationTask[];
}

export function ResultsSummary({ summary, tasks }: ResultsSummaryProps) {
  const handleDownload = (fileFormat: "md" | "json" | "csv") => {
    let content: string;
    let filename: string;

    switch (fileFormat) {
      case "md":
        content = generateMarkdownReport(summary, tasks);
        filename = generateReportFilename(summary.operationMode, "md");
        break;
      case "json":
        content = generateJSONReport(summary, tasks);
        filename = generateReportFilename(summary.operationMode, "json");
        break;
      case "csv":
        content = generateCSVReport(tasks);
        filename = generateReportFilename(summary.operationMode, "csv");
        break;
    }

    downloadReport(content, filename);
  };

  const successRate =
    summary.stats.total > 0
      ? Math.round(((summary.stats.created + summary.stats.deleted) / summary.stats.total) * 100)
      : 0;

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Summary</CardTitle>
          <CardDescription>
            {summary.operationMode.charAt(0).toUpperCase() + summary.operationMode.slice(1)}{" "}
            operation completed on {format(summary.endTime, "PPp")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Overall Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Tasks</p>
              <p className="text-2xl font-bold">{summary.stats.total}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {summary.operationMode === "create" ? "Created" : "Deleted"}
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {summary.operationMode === "create"
                  ? summary.stats.created
                  : summary.stats.deleted}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Skipped</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {summary.stats.skipped}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {summary.stats.failed}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold">{successRate}%</p>
            </div>
          </div>

          {/* Duration and Time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
            <div>
              <p className="text-sm text-muted-foreground">Duration</p>
              <p className="text-lg font-medium">{formatDuration(summary.duration)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Started</p>
              <p className="text-lg font-medium">{format(summary.startTime, "PPp")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-lg font-medium">{format(summary.endTime, "PPp")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
          <CardDescription>Results grouped by category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(summary.categoryBreakdown).map(([category, stats]) => (
              <div
                key={category}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="space-y-1">
                  <p className="font-medium">
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {stats.total} {stats.total === 1 ? "item" : "items"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium">{stats.success}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium">{stats.failed}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Successfully Imported Items */}
      {(() => {
        const successfulTasks = tasks.filter((task) => task.status === "success");
        return successfulTasks.length > 0 ? (
          <Card className="border-green-200 dark:border-green-900">
            <CardHeader>
              <CardTitle className="text-green-600 dark:text-green-400">
                Successfully {summary.operationMode === "create" ? "Created" : "Deleted"} Items ({successfulTasks.length})
              </CardTitle>
              <CardDescription>
                Items that were successfully {summary.operationMode === "create" ? "created" : "deleted"} in your tenant
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {Object.entries(
                  successfulTasks.reduce((acc, task) => {
                    if (!acc[task.category]) acc[task.category] = [];
                    acc[task.category].push(task);
                    return acc;
                  }, {} as Record<string, HydrationTask[]>)
                ).map(([category, categoryTasks]) => (
                  <div key={category} className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {category.charAt(0).toUpperCase() + category.slice(1)} ({categoryTasks.length})
                    </h4>
                    <div className="space-y-1 ml-2">
                      {categoryTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 p-2 rounded border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20"
                        >
                          <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                          <span className="text-sm text-green-900 dark:text-green-100">
                            {task.itemName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* Errors */}
      {summary.errors.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">
              Errors ({summary.errors.length})
            </CardTitle>
            <CardDescription>Tasks that failed during execution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {summary.errors.map((error, index) => (
                <div key={index} className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
                  <p className="text-sm font-medium text-red-900 dark:text-red-100">
                    {error.task}
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                    {error.message}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {format(error.timestamp, "PPp")}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Download Reports</CardTitle>
          <CardDescription>
            Export execution results in multiple formats
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" onClick={() => handleDownload("md")} className="w-full">
              <FileText className="h-4 w-4 mr-2" />
              Markdown
            </Button>
            <Button variant="outline" onClick={() => handleDownload("json")} className="w-full">
              <FileJson className="h-4 w-4 mr-2" />
              JSON
            </Button>
            <Button variant="outline" onClick={() => handleDownload("csv")} className="w-full">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
