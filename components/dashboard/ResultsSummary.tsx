/* oxlint-disable react-doctor/no-giant-component -- the result hierarchy stays together so summary, filters, and categories use one task model. */
"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  FileJson,
  FileSpreadsheet,
  FileText,
  Minus,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { SensitiveData } from "@/components/SensitiveData";
import { getTaskCategoryLabel } from "@/components/dashboard/categoryLabels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  downloadReport,
  generateCSVReport,
  generateJSONReport,
  generateMarkdownReport,
  generateReportFilename,
} from "@/lib/hydration/reporter";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/dateFormat";
import type { HydrationSummary, HydrationTask } from "@/types/hydration";

interface ResultsSummaryProps {
  summary: HydrationSummary;
  tasks: HydrationTask[];
  isPreview?: boolean;
}

type ResultOutcome = "success" | "skipped" | "failed" | "change" | "unchanged" | "blocked";

const TASK_PREVIEW_LIMIT = 25;

const OUTCOME_STYLES: Record<
  ResultOutcome,
  {
    label: string;
    Icon: typeof Check;
    className: string;
    iconClassName: string;
    rowClassName: string;
  }
> = {
  success: {
    label: "Success",
    Icon: CheckCircle2,
    className: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    iconClassName: "text-emerald-100",
    rowClassName: "border-emerald-300/15",
  },
  skipped: {
    label: "Skipped",
    Icon: MinusCircle,
    className: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    iconClassName: "text-amber-100",
    rowClassName: "border-amber-300/15",
  },
  failed: {
    label: "Failed",
    Icon: XCircle,
    className: "border-red-300/25 bg-red-300/10 text-red-100",
    iconClassName: "text-red-100",
    rowClassName: "border-red-300/25 bg-red-950/20",
  },
  change: {
    label: "Change",
    Icon: Check,
    className: "border-sky-300/25 bg-sky-300/10 text-sky-100",
    iconClassName: "text-sky-100",
    rowClassName: "border-sky-300/15",
  },
  unchanged: {
    label: "No change",
    Icon: Minus,
    className: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    iconClassName: "text-amber-100",
    rowClassName: "border-amber-300/15",
  },
  blocked: {
    label: "Blocked",
    Icon: AlertTriangle,
    className: "border-red-300/25 bg-red-300/10 text-red-100",
    iconClassName: "text-red-100",
    rowClassName: "border-red-300/25 bg-red-950/20",
  },
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function isNoOpSkip(task: HydrationTask): boolean {
  const evidence = task.error || task.warning || "";
  return /\b(already exists|not found|does not exist)\b/i.test(evidence);
}

function getTaskOutcome(task: HydrationTask, isPreview: boolean): ResultOutcome {
  if (!isPreview) {
    if (task.status === "failed") return "failed";
    if (task.status === "skipped") return "skipped";
    return "success";
  }

  if (task.status === "failed") return "blocked";
  if (task.status === "skipped") return isNoOpSkip(task) ? "unchanged" : "blocked";
  return "change";
}

function isIssueTask(task: HydrationTask, isPreview: boolean): boolean {
  const outcome = getTaskOutcome(task, isPreview);
  return isPreview ? outcome === "blocked" : outcome === "failed" || outcome === "skipped";
}

function getOutcomeCount(tasks: HydrationTask[], outcome: ResultOutcome, isPreview: boolean): number {
  return tasks.filter((task) => getTaskOutcome(task, isPreview) === outcome).length;
}

export function ResultsSummary({
  summary,
  tasks,
  isPreview = false,
}: ResultsSummaryProps): React.JSX.Element {
  const issueData = useMemo(() => {
    const categories = new Set<string>();
    let taskCount = 0;

    for (const task of tasks) {
      if (!isIssueTask(task, isPreview)) continue;
      categories.add(task.category);
      taskCount += 1;
    }

    return { categories, taskCount };
  }, [isPreview, tasks]);
  const [openCategories, setOpenCategories] = useState<string[]>(() =>
    Array.from(issueData.categories)
  );
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState<Set<string>>(() => new Set());

  const categoryNames = useMemo(
    () => Array.from(new Set([
      ...Object.keys(summary.categoryBreakdown),
      ...tasks.map((task) => task.category),
    ])),
    [summary.categoryBreakdown, tasks]
  );

  const visibleCategories = issuesOnly
    ? categoryNames.filter((category) => issueData.categories.has(category))
    : categoryNames;

  const actionLabel = summary.operationMode === "create" ? "Created" : "Deleted";
  const actionCount = summary.operationMode === "create" ? summary.stats.created : summary.stats.deleted;
  const successRate = summary.stats.total > 0
    ? Math.round(((summary.stats.created + summary.stats.deleted) / summary.stats.total) * 100)
    : 0;

  function handleDownload(fileFormat: "md" | "json" | "csv"): void {
    const content = fileFormat === "md"
      ? generateMarkdownReport(summary, tasks)
      : fileFormat === "json"
        ? generateJSONReport(summary, tasks)
        : generateCSVReport(tasks);
    downloadReport(content, generateReportFilename(summary.operationMode, fileFormat));
  }

  function handleIssuesOnly(): void {
    const nextValue = !issuesOnly;
    setIssuesOnly(nextValue);
    if (nextValue) setOpenCategories(Array.from(issueData.categories));
  }

  function toggleShowAll(category: string): void {
    setShowAllCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {isPreview && (
        <Alert className="glass-panel rounded-2xl text-slate-50 [&>svg]:text-sky-100">
          <Eye className="size-4" />
          <AlertTitle className="text-white">Preview Mode</AlertTitle>
          <AlertDescription className="text-slate-200">
            Review the simulated outcomes below. No changes were made to the tenant.
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-white/10 bg-black/15">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-sky-200">
                {isPreview ? "Preview receipt" : "Run receipt"}
              </p>
              <CardTitle className="mt-2">{isPreview ? "Preview complete" : "Run complete"}</CardTitle>
              <CardDescription className="mt-1">
                Completed {formatDateTime(summary.endTime)}
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-200">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                <SensitiveData
                  value={summary.tenantName || summary.tenantId}
                  fallback="Tenant unavailable"
                />
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 capitalize">
                {summary.operationMode}{isPreview ? " preview" : " live"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 tabular-nums">
                {formatDuration(summary.duration)}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4 lg:grid-cols-5">
          <div>
            <p className="text-xs text-slate-400">Total</p>
            <p className="mt-1 text-2xl font-semibold text-white">{summary.stats.total}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">{isPreview ? "Changes" : actionLabel}</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-200">
              {isPreview ? getOutcomeCount(tasks, "change", true) : actionCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">{isPreview ? "No change" : "Skipped"}</p>
            <p className="mt-1 text-2xl font-semibold text-amber-200">
              {isPreview ? getOutcomeCount(tasks, "unchanged", true) : summary.stats.skipped}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">{isPreview ? "Blocked" : "Failed"}</p>
            <p className="mt-1 text-2xl font-semibold text-red-200">
              {isPreview ? getOutcomeCount(tasks, "blocked", true) : summary.stats.failed}
            </p>
          </div>
          {!isPreview && (
            <div>
              <p className="text-xs text-slate-400">Success rate</p>
              <p className="mt-1 text-2xl font-semibold text-white">{successRate}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-white/10 bg-black/15">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-sky-200">
                Run evidence
              </p>
              <CardTitle className="mt-2">Results by category</CardTitle>
              <CardDescription className="mt-1">
                Open a category to inspect its tasks.
              </CardDescription>
            </div>
            {issueData.categories.size > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={issuesOnly}
                onClick={handleIssuesOnly}
                className={cn(issuesOnly && "border-amber-300/40 bg-amber-300/10 text-amber-100")}
              >
                <AlertTriangle className="mr-2 size-3.5" />
                Issues only ({issueData.taskCount})
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <Accordion
            type="multiple"
            value={openCategories}
            onValueChange={setOpenCategories}
            className="space-y-3"
          >
            {visibleCategories.map((category) => {
              const categoryTasks = tasks.filter((task) => task.category === category);
              const filteredTasks = issuesOnly
                ? categoryTasks.filter((task) => isIssueTask(task, isPreview))
                : categoryTasks;
              const showAll = showAllCategories.has(category);
              const shownTasks = showAll ? filteredTasks : filteredTasks.slice(0, TASK_PREVIEW_LIMIT);
              const outcomes: ResultOutcome[] = isPreview
                ? ["change", "unchanged", "blocked"]
                : ["success", "skipped", "failed"];

              return (
                <AccordionItem
                  key={category}
                  value={category}
                  className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/35 px-0"
                >
                  <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
                    <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-left">
                        <p className="truncate font-medium text-slate-50">{getTaskCategoryLabel(category)}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {categoryTasks.length} {categoryTasks.length === 1 ? "item" : "items"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {outcomes.map((outcome) => {
                          const presentation = OUTCOME_STYLES[outcome];
                          const count = getOutcomeCount(categoryTasks, outcome, isPreview);
                          return (
                            <span
                              key={outcome}
                              aria-label={`${presentation.label}: ${count}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em]",
                                presentation.className
                              )}
                            >
                              <presentation.Icon aria-hidden="true" className="size-3" />
                              {count}
                              <span className="hidden md:inline">{presentation.label}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="border-t border-white/10 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
                    <ul className="space-y-1.5">
                      {shownTasks.map((task) => {
                        const outcome = getTaskOutcome(task, isPreview);
                        const presentation = OUTCOME_STYLES[outcome];
                        return (
                          <li
                            key={task.id}
                            className={cn(
                              "rounded-lg border bg-slate-950/55 px-3 py-2.5",
                              presentation.rowClassName
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <presentation.Icon
                                aria-hidden="true"
                                className={cn("mt-0.5 size-4 shrink-0", presentation.iconClassName)}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-100" title={task.itemName}>
                                  {task.itemName}
                                </p>
                                {(task.error || task.warning) && (
                                  <p className="mt-1 text-xs leading-5 text-slate-400">
                                    {task.error || task.warning}
                                  </p>
                                )}
                              </div>
                              <span className={cn(
                                "shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em]",
                                presentation.className
                              )}>
                                {presentation.label}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {filteredTasks.length > TASK_PREVIEW_LIMIT && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleShowAll(category)}
                        className="mt-3 w-full text-slate-300"
                      >
                        {showAll ? "Show fewer" : `Show all ${filteredTasks.length}`}
                      </Button>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {visibleCategories.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/15 py-10 text-center">
              <CheckCircle2 className="mx-auto size-7 text-emerald-200" />
              <p className="mt-3 text-sm font-medium text-slate-100">No issues found</p>
              <p className="mt-1 text-xs text-slate-400">All tasks completed without warnings or failures.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-100">Download report</p>
            <p className="mt-1 text-xs text-slate-400">Export the complete task record.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => handleDownload("md")}>
              <FileText className="mr-2 size-3.5" /> Markdown
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownload("json")}>
              <FileJson className="mr-2 size-3.5" /> JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownload("csv")}>
              <FileSpreadsheet className="mr-2 size-3.5" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
