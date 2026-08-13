/* oxlint-disable react-doctor/no-giant-component -- summary sections are kept together to preserve report workflow context. */
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HydrationSummary, HydrationTask } from "@/types/hydration";
import { FileText, FileJson, FileSpreadsheet, CheckCircle2, XCircle, MinusCircle, Eye } from "lucide-react";
import {
  generateMarkdownReport,
  generateJSONReport,
  generateCSVReport,
  downloadReport,
  generateReportFilename,
} from "@/lib/hydration/reporter";
import { formatDateTime } from "@/lib/utils/dateFormat";
import { getTaskCategoryLabel } from "@/components/dashboard/categoryLabels";
import { PreviewChangeTable } from "@/components/dashboard/PreviewChangeTable";

interface ResultsSummaryProps {
  summary: HydrationSummary;
  tasks: HydrationTask[];
  isPreview?: boolean;
}

function getCategoryDisplayName(category: string): string {
  return getTaskCategoryLabel(category);
}

function getTaskStatusClassName(status: HydrationTask["status"]): string {
  switch (status) {
    case "success":
      return "text-emerald-100";
    case "skipped":
      return "text-amber-100";
    case "failed":
      return "text-red-100";
    default:
      return "text-slate-100";
  }
}

function formatDuration(ms: number): string {
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
}

export function ResultsSummary({
  summary,
  tasks,
  isPreview = false,
}: ResultsSummaryProps): React.JSX.Element {
  function handleDownload(fileFormat: "md" | "json" | "csv"): void {
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
  }

  const successRate =
    summary.stats.total > 0
      ? Math.round(((summary.stats.created + summary.stats.deleted) / summary.stats.total) * 100)
      : 0;

  // Get appropriate labels based on mode and preview state
  function getActionLabel(): string {
    if (isPreview) {
      return summary.operationMode === "create" ? "Would Create" : "Would Delete";
    }
    return summary.operationMode === "create" ? "Created" : "Deleted";
  }

  function getActionCount(): number {
    return summary.operationMode === "create"
      ? summary.stats.created
      : summary.stats.deleted;
  }

  return (
    <div className="space-y-6">
      {/* Preview Mode Banner */}
      {isPreview && (
        <Alert className="border-sky-300/60 bg-slate-950/95 text-slate-100 shadow-xl shadow-slate-950/25 backdrop-blur-md">
          <Eye className="size-4 !text-sky-200" />
          <AlertTitle className="text-slate-50">Preview Mode</AlertTitle>
          <AlertDescription className="text-slate-200">
            This is a preview of what would happen. No changes were made to your tenant.
            {summary.operationMode === "create"
              ? " Items marked as 'Would Create' do not exist in your tenant yet."
              : " Items marked as 'Would Delete' would be removed from your tenant."}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>{isPreview ? "Preview" : "Execution"} Summary</CardTitle>
          <CardDescription>
            {isPreview ? "Preview of " : ""}{summary.operationMode}{" "}
            operation {isPreview ? "completed" : "completed"} on {formatDateTime(summary.endTime)}
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
              <p className="text-sm text-muted-foreground">{getActionLabel()}</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {getActionCount()}
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
              <p className="text-lg font-medium">{formatDateTime(summary.startTime)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-lg font-medium">{formatDateTime(summary.endTime)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isPreview && (
        <PreviewChangeTable tasks={tasks} operationMode={summary.operationMode} />
      )}

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
          <CardDescription>Results grouped by category</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion
            type="multiple"
            defaultValue={Object.keys(summary.categoryBreakdown)}
            className="space-y-4"
          >
            {Object.entries(summary.categoryBreakdown).map(([category, stats]) => {
              const categoryTasks = tasks.filter((task) => task.category === category);
              return (
                <AccordionItem
                  key={category}
                  value={category}
                  className="overflow-hidden rounded-lg border px-0"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex w-full items-center justify-between gap-4 pr-4 text-left">
                      <div className="space-y-1">
                        <p className="font-medium">{getCategoryDisplayName(category)}</p>
                        <p className="text-sm text-muted-foreground">
                          {stats.total} {stats.total === 1 ? "item" : "items"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="size-4 text-emerald-200" />
                          <span className="text-sm font-medium">{stats.success}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MinusCircle className="size-4 text-amber-200" />
                          <span className="text-sm font-medium">{stats.skipped}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <XCircle className="size-4 text-red-200" />
                          <span className="text-sm font-medium">{stats.failed}</span>
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="border-t px-4 pb-4 pt-3">
                    <div className="space-y-1">
                      {categoryTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`flex items-start gap-2 rounded p-2 text-sm font-medium ${getTaskStatusClassName(task.status)}`}
                        >
                          {task.status === "success" ? (
                            <CheckCircle2 className="mt-0.5 size-3 flex-shrink-0" />
                          ) : task.status === "skipped" ? (
                            <MinusCircle className="mt-0.5 size-3 flex-shrink-0" />
                          ) : task.status === "failed" ? (
                            <XCircle className="mt-0.5 size-3 flex-shrink-0" />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <span className="block truncate">{task.itemName}</span>
                            {task.error &&
                              (task.status === "skipped" || task.status === "failed") && (
                                <span className="mt-0.5 block text-xs opacity-75">
                                  {task.error}
                                </span>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* Successfully Imported Items */}
      {(() => {
        const successfulTasks = tasks.filter((task) => task.status === "success");
        const actionVerb = isPreview
          ? (summary.operationMode === "create" ? "Would Be Created" : "Would Be Deleted")
          : (summary.operationMode === "create" ? "Created" : "Deleted");
        const actionDescription = isPreview
          ? (summary.operationMode === "create" ? "would be created" : "would be deleted")
          : (summary.operationMode === "create" ? "were created" : "were deleted");
        return !isPreview && successfulTasks.length > 0 ? (
          <Card className="completed-results-panel overflow-hidden text-slate-100">
            <CardHeader className="border-b border-white/10">
              <CardTitle className="text-slate-50">
                {isPreview ? "Items That " : "Successfully "}{actionVerb} ({successfulTasks.length})
              </CardTitle>
              <CardDescription className="text-slate-300">
                Items that {actionDescription} in your tenant
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] space-y-4 overflow-y-auto">
                {Object.entries(
                  successfulTasks.reduce((acc, task) => {
                    if (!acc[task.category]) acc[task.category] = [];
                    acc[task.category].push(task);
                    return acc;
                  }, {} as Record<string, HydrationTask[]>)
                ).map(([category, categoryTasks]) => (
                  <div key={category} className="space-y-2">
                    <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                      {getTaskCategoryLabel(category)} ({categoryTasks.length})
                    </h4>
                    <ul className="space-y-1.5">
                      {categoryTasks.map((task) => (
                        <li
                          key={task.id}
                          className="flex items-center gap-2.5 rounded-xl border border-emerald-300/15 bg-slate-950/65 px-3 py-2.5 shadow-[inset_3px_0_0_rgb(110_231_183_/_0.7)]"
                        >
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                            <CheckCircle2 aria-hidden="true" className="size-3.5" />
                          </span>
                          <span className="min-w-0 truncate text-sm font-medium text-slate-100">
                            {task.itemName}
                          </span>
                        </li>
                      ))}
                    </ul>
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
              {summary.errors.map((error) => (
                <div key={`${error.task}-${error.timestamp.toISOString()}`} className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
                  <p className="text-sm font-medium text-red-900 dark:text-red-100">
                    {error.task}
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                    {error.message}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {formatDateTime(error.timestamp)}
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
              <FileText className="size-4 mr-2" />
              Markdown
            </Button>
            <Button variant="outline" onClick={() => handleDownload("json")} className="w-full">
              <FileJson className="size-4 mr-2" />
              JSON
            </Button>
            <Button variant="outline" onClick={() => handleDownload("csv")} className="w-full">
              <FileSpreadsheet className="size-4 mr-2" />
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
