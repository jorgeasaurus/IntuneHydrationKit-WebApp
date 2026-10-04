/**
 * Report generation for Intune Hydration Kit
 * Generates reports in Markdown, JSON, and CSV formats
 */

import {
  HydrationSummary,
  HydrationTask,
  BatchExecutionStats,
  type ReportableExecutionOutcome,
} from "@/types/hydration";
import { formatFileTimestamp } from "@/lib/utils/dateFormat";
import { getTaskEvidenceOutcome, type TaskEvidenceOutcome } from "@/lib/hydration/executionOutcome";
import { getTaskCategoryLabel } from "@/lib/hydration/categoryLabels";

const TASK_OUTCOME_LABELS: Record<TaskEvidenceOutcome, string> = {
  pending: "Pending",
  running: "Running",
  success: "Success",
  failed: "Failed",
  noOp: "No change",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const RUN_OUTCOME_LABELS: Record<ReportableExecutionOutcome, string> = {
  succeeded: "Succeeded",
  completedWithIssues: "Completed with issues",
  cancelled: "Cancelled",
};

function formatUtcDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function getExportStats(summary: HydrationSummary, isPreview: boolean) {
  return {
    ...summary.stats,
    created: isPreview ? 0 : summary.stats.created,
    deleted: isPreview ? 0 : summary.stats.deleted,
    wouldCreate: isPreview ? summary.stats.created : 0,
    wouldDelete: isPreview ? summary.stats.deleted : 0,
  };
}

function getReportOutcome(task: HydrationTask, isPreview: boolean): string {
  if (isPreview && task.status === "success") {
    return task.operation === "create" ? "wouldCreate" : "wouldDelete";
  }
  return getTaskEvidenceOutcome(task);
}

function getReportOutcomeLabel(task: HydrationTask, isPreview: boolean): string {
  if (isPreview && task.status === "success") {
    return task.operation === "create" ? "Would create" : "Would delete";
  }
  return TASK_OUTCOME_LABELS[getTaskEvidenceOutcome(task)];
}

function getTaskMarkdown(task: HydrationTask, isPreview: boolean): string {
  const lines = [
    `${getTaskStatusIcon(task.status)} ${task.itemName}`,
    `   - Outcome: ${getReportOutcomeLabel(task, isPreview)}`,
  ];
  if (task.error) lines.push(`   - ${task.status === "failed" ? "Error" : "Reason"}: ${task.error}`);
  if (task.warning) lines.push(`   - Warning: ${task.warning}`);
  if (task.match) {
    lines.push(`   - Matched object: ${task.match.name} (${task.match.id})`, `   - Match: ${task.match.matchType}`);
    if (task.match.portalUrl) lines.push(`   - Portal: ${task.match.portalUrl}`);
  }
  if (task.drift) {
    lines.push(`   - Configuration comparison: ${task.drift.status}`);
    if (task.drift.reason) lines.push(`   - Comparison reason: ${task.drift.reason}`);
    for (const difference of task.drift.differences) lines.push(`   - Difference: ${difference}`);
  }
  if (task.startTime) lines.push(`   - Started: ${formatUtcDateTime(task.startTime)} UTC`);
  if (task.endTime) lines.push(`   - Completed: ${formatUtcDateTime(task.endTime)} UTC`);
  if (task.startTime && task.endTime) lines.push(`   - Duration: ${formatDuration(task.endTime.getTime() - task.startTime.getTime())}`);
  return lines.join("\n") + "\n";
}

/** Generate a report with explicit preview outcomes and UTC timestamps. */
export function generateMarkdownReport(
  summary: HydrationSummary,
  tasks: HydrationTask[],
  outcome: ReportableExecutionOutcome,
  isPreview: boolean,
): string {
  const stats = getExportStats(summary, isPreview);
  const provenance = summary.provenance;
  let markdown = `# Intune Hydration Report

**Tenant ID**: ${summary.tenantId}
**Operation**: ${summary.operationMode.charAt(0).toUpperCase() + summary.operationMode.slice(1)}
**Execution**: ${isPreview ? "Preview" : "Live"}
**Outcome**: ${RUN_OUTCOME_LABELS[outcome]}
**Started**: ${formatUtcDateTime(summary.startTime)} UTC
**Completed**: ${formatUtcDateTime(summary.endTime)} UTC
**Exported**: ${formatUtcDateTime(new Date())} UTC
**Duration**: ${formatDuration(summary.duration)}
**Run ID**: ${provenance?.runId ?? "Not recorded"}
**App version**: ${provenance?.appVersion ?? "Not recorded"}
**Baseline version**: ${provenance?.baselineVersion ?? "Not recorded"}
**Baseline Source SHA**: ${provenance?.baselineSourceSha ?? "Not recorded"}

## Summary

- **Total Tasks**: ${stats.total}
- **Created**: ${stats.created}
- **Deleted**: ${stats.deleted}
- **Would Create**: ${stats.wouldCreate}
- **Would Delete**: ${stats.wouldDelete}
- **Skipped**: ${stats.skipped}
- **Failed**: ${stats.failed}
`;
  if (summary.batchStats) {
    const batch = summary.batchStats;
    markdown += `
### Batch Execution
- **Batch Size**: ${batch.batchSize}
- **Batch Requests**: ${batch.batchRequestCount}
- **Batched Tasks**: ${batch.batchedTaskCount}
- **Sequential Checks**: ${batch.sequentialTaskCount}
Sequential checks include skipped tasks. A batch fallback can count in both paths. Batch requests count emitted requests, including retries.
`;
  }
  markdown += "\n## Category Breakdown\n\n";
  for (const [category, categoryStats] of Object.entries(summary.categoryBreakdown)) {
    markdown += `### ${getTaskCategoryLabel(category)} (${categoryStats.total})\n`;
    markdown += `- ${isPreview ? "Would change" : "Success"}: ${categoryStats.success}\n`;
    markdown += `- Skipped: ${categoryStats.skipped}\n- Failed: ${categoryStats.failed}\n\n`;
  }
  markdown += "## Task Details\n\n";
  for (const [category, categoryTasks] of Object.entries(groupTasksByCategory(tasks))) {
    markdown += `### ${getTaskCategoryLabel(category)}\n\n`;
    markdown += categoryTasks.map((task) => getTaskMarkdown(task, isPreview)).join("") + "\n";
  }
  for (const [label, entries] of [["Warnings", summary.warnings], ["Errors", summary.errors]] as const) {
    if (entries.length === 0) continue;
    markdown += `## ${label}\n\n`;
    for (const entry of entries) {
      markdown += `- **[${formatUtcDateTime(entry.timestamp)} UTC]** ${entry.task}: ${entry.message}\n`;
    }
    markdown += "\n";
  }
  return markdown + "---\n\n*Generated by [Intune Hydration Kit](https://github.com/jorgeasaurus/IntuneHydrationKit-WebApp)*\n";
}

/** Generate JSON evidence without counting preview decisions as mutations. */
export function generateJSONReport(
  summary: HydrationSummary,
  tasks: HydrationTask[],
  outcome: ReportableExecutionOutcome,
  isPreview: boolean,
): string {
  return JSON.stringify({
    outcome,
    executionMode: isPreview ? "preview" : "live",
    summary: { ...summary, stats: getExportStats(summary, isPreview) },
    tasks: tasks.map((task) => ({
      id: task.id,
      category: task.category,
      operation: task.operation,
      itemName: task.itemName,
      status: task.status,
      outcome: getReportOutcome(task, isPreview),
      error: task.status === "failed" ? task.error : undefined,
      reason: task.status !== "failed" ? task.error : undefined,
      warning: task.warning,
      match: task.match,
      drift: task.drift,
      startTime: task.startTime?.toISOString(),
      endTime: task.endTime?.toISOString(),
      duration: task.startTime && task.endTime ? task.endTime.getTime() - task.startTime.getTime() : null,
    })),
    metadata: { reportVersion: "2.0", generatedAt: new Date().toISOString() },
  }, null, 2);
}

function escapeCSVField(value: string | number): string {
  let text = String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '\"\"')}"`;
}

/** Generate CSV task evidence and repeat run metadata on each row. */
export function generateCSVReport(
  tasks: HydrationTask[],
  outcome: ReportableExecutionOutcome,
  isPreview: boolean,
  summary?: HydrationSummary,
): string {
  const headers = [
    "Category", "Item Name", "Operation", "Execution Mode", "Run Outcome", "Status", "Outcome",
    "Error", "Reason", "Warning", "Start Time (UTC)", "End Time (UTC)", "Duration (ms)",
    "Matched Object ID", "Matched Object Name", "Match Type", "Portal URL", "Configuration Comparison",
    "Differences", "Comparison Reason", "Tenant ID", "Run ID", "App Version", "Baseline Version", "Baseline Source SHA",
    "Run Start (UTC)", "Run End (UTC)", "Exported (UTC)", "Created", "Deleted", "Would Create", "Would Delete",
  ];
  const stats = summary ? getExportStats(summary, isPreview) : null;
  const provenance = summary?.provenance;
  const runValues = [
    summary?.tenantId ?? "", provenance?.runId ?? "", provenance?.appVersion ?? "",
    provenance?.baselineVersion ?? "", provenance?.baselineSourceSha ?? "",
    summary ? formatUtcDateTime(summary.startTime) : "", summary ? formatUtcDateTime(summary.endTime) : "",
    formatUtcDateTime(new Date()), stats?.created ?? "", stats?.deleted ?? "", stats?.wouldCreate ?? "", stats?.wouldDelete ?? "",
  ];
  const taskRows = tasks.map((task) => [
    task.category, task.itemName, task.operation, isPreview ? "preview" : "live", outcome,
    task.status, getReportOutcome(task, isPreview), task.status === "failed" ? task.error ?? "" : "",
    task.status !== "failed" ? task.error ?? "" : "", task.warning ?? "",
    task.startTime ? formatUtcDateTime(task.startTime) : "", task.endTime ? formatUtcDateTime(task.endTime) : "",
    task.startTime && task.endTime ? task.endTime.getTime() - task.startTime.getTime() : "",
    task.match?.id ?? "", task.match?.name ?? "", task.match?.matchType ?? "", task.match?.portalUrl ?? "",
    task.drift?.status ?? "", task.drift?.differences.join("; ") ?? "", task.drift?.reason ?? "",
    ...runValues,
  ]);
  if (taskRows.length === 0) {
    taskRows.push(["", "", "", isPreview ? "preview" : "live", outcome, ...Array<string>(15).fill(""), ...runValues]);
  }
  return [headers, ...taskRows].map((row) => row.map(escapeCSVField).join(",")).join("\n");
}

/**
 * Create a hydration summary from execution results
 */
export function createSummary(
  tenantId: string,
  operationMode: "create" | "delete",
  startTime: Date,
  endTime: Date,
  tasks: HydrationTask[],
  batchStats?: BatchExecutionStats,
  tenantName?: string,
  provenance?: HydrationSummary["provenance"],
): HydrationSummary {
  const stats = {
    total: tasks.length,
    created: tasks.filter((t) => t.status === "success" && t.operation === "create").length,
    deleted: tasks.filter((t) => t.status === "success" && t.operation === "delete").length,
    skipped: tasks.filter((t) => t.status === "skipped").length,
    failed: tasks.filter((t) => t.status === "failed").length,
  };

  // Group by category
  const categoryBreakdown: HydrationSummary["categoryBreakdown"] = {};
  for (const task of tasks) {
    if (!categoryBreakdown[task.category]) {
      categoryBreakdown[task.category] = {
        total: 0,
        success: 0,
        skipped: 0,
        failed: 0,
      };
    }

    categoryBreakdown[task.category].total++;
    if (task.status === "success") {
      categoryBreakdown[task.category].success++;
    } else if (task.status === "skipped") {
      categoryBreakdown[task.category].skipped++;
    } else if (task.status === "failed") {
      categoryBreakdown[task.category].failed++;
    }
  }

  // Collect errors
  const errors = tasks.reduce<HydrationSummary["errors"]>((items, task) => {
    if (task.status === "failed" && task.error) {
      items.push({
        task: task.itemName,
        message: task.error || "Unknown error",
        timestamp: task.endTime || endTime,
      });
    }
    return items;
  }, []);

  // Collect warnings (tasks that succeeded but have warnings)
  const warnings = tasks.reduce<HydrationSummary["warnings"]>((items, task) => {
    if (task.status === "success" && task.warning) {
      items.push({
        task: task.itemName,
        message: task.warning || "",
        timestamp: task.endTime || endTime,
      });
    }
    return items;
  }, []);

  return {
    tenantId,
    tenantName,
    operationMode,
    startTime,
    endTime,
    duration: endTime.getTime() - startTime.getTime(),
    stats,
    categoryBreakdown,
    errors,
    warnings,
    batchStats,
    provenance,
  };
}

export function summaryMatchesExecution(
  summary: HydrationSummary,
  source: Pick<HydrationSummary, "tenantId" | "tenantName" | "operationMode" | "startTime" | "endTime" | "provenance"> & {
    tasks: HydrationTask[];
  },
): boolean {
  const expected = createSummary(
    source.tenantId,
    source.operationMode,
    source.startTime,
    source.endTime,
    source.tasks,
    summary.batchStats,
    source.tenantName,
    source.provenance ?? summary.provenance,
  );
  return JSON.stringify(toCanonicalValue(summary)) === JSON.stringify(toCanonicalValue(expected));
}

function toCanonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toCanonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, toCanonicalValue(item)]),
    );
  }
  return value;
}

/**
 * Download a report as a file
 */
export function downloadReport(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format duration in milliseconds to human-readable string
 */
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

/**
 * Get icon for task status
 */
function getTaskStatusIcon(status: string): string {
  switch (status) {
    case "success":
      return "✓";
    case "failed":
      return "✗";
    case "skipped":
      return "⊗";
    case "running":
      return "⏳";
    case "pending":
      return "○";
    default:
      return "-";
  }
}

/**
 * Group tasks by category
 */
function groupTasksByCategory(tasks: HydrationTask[]): Record<string, HydrationTask[]> {
  return tasks.reduce<Record<string, HydrationTask[]>>((grouped, task) => {
    (grouped[task.category] ??= []).push(task);
    return grouped;
  }, {});
}

/**
 * Generate filename for report based on operation and timestamp
 */
export function generateReportFilename(
  operationMode: string,
  fileFormat: "md" | "json" | "csv",
  isPreview: boolean,
): string {
  const timestamp = formatFileTimestamp(new Date());
  return `intune-hydration-${operationMode}-${isPreview ? "preview" : "live"}-${timestamp}.${fileFormat}`;
}
