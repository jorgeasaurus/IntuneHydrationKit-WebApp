import { z } from "zod";
import { TASK_CATEGORY_LABELS } from "@/lib/hydration/categoryLabels";
import type { TaskCategory } from "@/types/hydration";

export const MAX_COMPARISON_FILE_BYTES = 2 * 1024 * 1024;

export interface ComparisonTask {
  name: string;
  category: string;
  outcome: string;
}

export interface ComparisonReport {
  format: "PowerShell Markdown" | "Web Markdown" | "Web JSON";
  tenant: string | null;
  operation: string | null;
  execution: "preview" | "live" | null;
  started: string | null;
  baselineSourceSha: string | null;
  tasks: ComparisonTask[];
}

export interface ReportDifference {
  key: string;
  name: string;
  category: string;
  first: string[];
  second: string[];
}

/** Validate a local report before reading its contents. */
export function validateComparisonFile(file: Pick<File, "name" | "size">): void {
  if (!/\.(md|json)$/i.test(file.name)) throw new Error("Select a Markdown (.md) or JSON (.json) report.");
  if (file.size > MAX_COMPARISON_FILE_BYTES) throw new Error("Report files must be 2 MB or smaller.");
  if (file.size === 0) throw new Error("The report file is empty.");
}

// Result Type labels emitted by the PowerShell import and delete functions.
const POWERSHELL_CATEGORY_KEYS: Record<string, TaskCategory> = {
  DynamicGroup: "groups",
  StaticGroup: "groups",
  DeviceFilter: "filters",
  CompliancePolicy: "compliance",
  AppProtection: "appProtection",
  ConditionalAccessPolicy: "conditionalAccess",
  WinGetWin32App: "win32Apps",
  EnrollmentProfile: "enrollment",
  EnrollmentTemplate: "enrollment",
  AutopilotDeploymentProfile: "enrollment",
  AutopilotDevicePreparation: "enrollment",
  EnrollmentStatusPage: "enrollment",
  MacOSDEPEnrollmentProfile: "enrollment",
  NotificationTemplate: "notification",
  NotificationTemplateLocalizedMessage: "notification",
  BaselinePolicy: "baseline",
  CISBaselinePolicy: "cisBaseline",
};

function canonicalCategory(value: string): string {
  if (/^(BYOD\/AppProtection|(?:WINDOWS|MACOS|WINDOWS365)\/IntuneManagement)$/i.test(value)) {
    return TASK_CATEGORY_LABELS.baseline;
  }
  if (/^CISBaseline\/.+/i.test(value)) return TASK_CATEGORY_LABELS.cisBaseline;
  if (Object.hasOwn(POWERSHELL_CATEGORY_KEYS, value)) {
    return TASK_CATEGORY_LABELS[POWERSHELL_CATEGORY_KEYS[value]];
  }
  // MobileApp, WinGetRemediation, and Unknown have no matching web task category.
  return Object.hasOwn(TASK_CATEGORY_LABELS, value)
    ? TASK_CATEGORY_LABELS[value as keyof typeof TASK_CATEGORY_LABELS]
    : value;
}

function executionMode(value: string | null): ComparisonReport["execution"] {
  const mode = value?.toLowerCase();
  if (mode === "preview" || mode === "whatif" || mode === "dry-run") return "preview";
  return mode === "live" ? "live" : null;
}

function outcomeLabel(value: string, report: Pick<ComparisonReport, "operation" | "execution">, detail = ""): string {
  const labels: Record<string, string> = {
    created: "Created", deleted: "Deleted", updated: "Updated",
    wouldcreate: "Would create", woulddelete: "Would delete", wouldupdate: "Would update",
    "would create": "Would create", "would delete": "Would delete", "would update": "Would update",
    failed: "Failed", pending: "Pending", running: "Running", blocked: "Blocked", cancelled: "Cancelled",
    noop: "No change", "no change": "No change",
  };
  const normalized = value.toLowerCase();
  if (normalized === "skipped") return /already exists|not found/i.test(detail) ? "No change" : "Skipped (reason unknown)";
  if (normalized !== "success") return labels[normalized] ?? "Unknown";
  if (!report.execution || !report.operation) return "Success (mode unknown)";
  const action = report.operation.toLowerCase();
  if (report.execution === "preview") return action === "delete" ? "Would delete" : "Would create";
  return action === "delete" ? "Deleted" : "Created";
}

function readField(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`^\\*\\*${escaped}(?::\\*\\*|\\*\\*:)\\s*(.+)$`, "mi"))?.[1].trim() ?? null;
}

function knownMetadata(value: string | null): string | null {
  return value && !/^(not recorded|unknown)$/i.test(value) ? value : null;
}

function markdownMetadata(text: string, powerShell: boolean): Omit<ComparisonReport, "tasks"> {
  return {
    format: powerShell ? "PowerShell Markdown" : "Web Markdown",
    tenant: readField(text, powerShell ? "Tenant" : "Tenant ID"),
    operation: ["create", "delete"].includes(readField(text, "Operation")?.toLowerCase() ?? "")
      ? readField(text, "Operation")!.toLowerCase() : null,
    execution: executionMode(readField(text, powerShell ? "Mode" : "Execution")),
    started: readField(text, "Started") ?? readField(text, "Date"),
    baselineSourceSha: knownMetadata(readField(text, "Baseline Source SHA")),
  };
}

function parsePowerShell(text: string): ComparisonReport {
  const metadata = markdownMetadata(text, true);
  const total = text.match(/^\| Total Operations \| (\d+) \|/m)?.[1];
  const section = text.split(/^## All Operations\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  if (!section && total !== "0") throw new Error("PowerShell report has no All Operations table.");
  const tasks: ComparisonTask[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map(cell => cell.trim().replace(/\\\|/g, "|"));
    if (cells[0] === "Timestamp" || /^-+$/.test(cells[0])) continue;
    if (cells.length !== 6 || !cells[1] || !cells[2] || !cells[3]) throw new Error("PowerShell report has an invalid operation row.");
    tasks.push({ category: canonicalCategory(cells[1]), name: cells[2], outcome: outcomeLabel(cells[3], metadata, cells[5]) });
  }
  checkTaskCount(tasks, total);
  return { ...metadata, tasks };
}

const ICON_OUTCOMES: Record<string, string> = {
  "\u2713": "success", "\u2717": "failed", "\u2297": "skipped", "\u25cb": "pending", "\u23f3": "running",
};

function parseWebMarkdown(text: string): ComparisonReport {
  const metadata = markdownMetadata(text, false);
  const section = text.split(/^## Task Details\s*$/m)[1]?.split(/^## /m)[0];
  if (!section) throw new Error("Web report has no Task Details section.");
  const tasks: ComparisonTask[] = [];
  let category = "Unknown category";
  for (const line of section.split(/\r?\n/)) {
    if (line.startsWith("### ")) category = line.slice(4).trim();
    const taskMatch = line.match(/^([\u2713\u2717\u2297\u25cb\u23f3])\s+(.+)$/);
    if (taskMatch) tasks.push({ name: taskMatch[2], category: canonicalCategory(category), outcome: outcomeLabel(ICON_OUTCOMES[taskMatch[1]], metadata) });
    const outcome = line.match(/^\s+- Outcome: (.+)$/)?.[1];
    if (outcome && tasks.length) tasks[tasks.length - 1].outcome = outcomeLabel(outcome, metadata);
  }
  const total = text.match(/^- \*\*Total Tasks\*\*: (\d+)/m)?.[1];
  checkTaskCount(tasks, total);
  return { ...metadata, tasks };
}

function checkTaskCount(tasks: ComparisonTask[], expected?: string): void {
  if (!tasks.length && expected !== "0") throw new Error("The report contains no task details to compare.");
  if (expected !== undefined && tasks.length !== Number(expected)) throw new Error("Task details do not match the report total. Select a complete report.");
}

const jsonReportSchema = z.object({
  executionMode: z.string().optional(),
  summary: z.object({
    tenantId: z.string().optional(),
    operationMode: z.enum(["create", "delete"]).optional(),
    startTime: z.string().optional(),
    stats: z.object({ total: z.number().int().nonnegative() }).optional(),
    provenance: z.object({ baselineSourceSha: z.string().optional() }).optional(),
  }),
  tasks: z.array(z.object({
    itemName: z.string().min(1), category: z.string().min(1),
    status: z.string(), outcome: z.string().optional(), error: z.string().optional(), reason: z.string().optional(),
  })),
});

function parseWebJson(text: string): ComparisonReport {
  const result = jsonReportSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new Error("This JSON file is not a supported web hydration report.");
  const { summary, tasks, executionMode: mode } = result.data;
  const metadata: Omit<ComparisonReport, "tasks"> = {
    format: "Web JSON", tenant: summary.tenantId ?? null, operation: summary.operationMode ?? null,
    execution: executionMode(mode ?? null), started: summary.startTime ?? null,
    baselineSourceSha: summary.provenance?.baselineSourceSha ?? null,
  };
  const parsed = tasks.map(task => ({ name: task.itemName, category: canonicalCategory(task.category), outcome: outcomeLabel(task.outcome ?? task.status, metadata, task.reason ?? task.error) }));
  checkTaskCount(parsed, summary.stats?.total.toString());
  return { ...metadata, tasks: parsed };
}

/** Parse supported report exports without sending their contents to a server. */
export function parseComparisonReport(text: string): ComparisonReport {
  if (new TextEncoder().encode(text).length > MAX_COMPARISON_FILE_BYTES) throw new Error("Report files must be 2 MB or smaller.");
  const source = text.replace(/^\uFEFF/, "").trim();
  if (source.startsWith("{")) return parseWebJson(source);
  if (source.startsWith("# Intune Hydration Summary")) return parsePowerShell(source);
  if (source.startsWith("# Intune Hydration Report")) return parseWebMarkdown(source);
  throw new Error("Select a PowerShell Markdown or web Markdown/JSON hydration report.");
}

function taskKey(task: ComparisonTask): string {
  return JSON.stringify([task.category.toLowerCase(), task.name.replace(/^\[IHD\]\s*/i, "").trim().toLowerCase()]);
}

function indexTasks(tasks: ComparisonTask[]): Map<string, { task: ComparisonTask; outcomes: string[] }> {
  const result = new Map<string, { task: ComparisonTask; outcomes: string[] }>();
  for (const task of tasks) {
    const key = taskKey(task);
    const entry = result.get(key) ?? { task, outcomes: [] };
    entry.outcomes.push(task.outcome);
    result.set(key, entry);
  }
  for (const entry of result.values()) entry.outcomes.sort();
  return result;
}

function comparisonWarnings(first: ComparisonReport, second: ComparisonReport): string[] {
  const warnings: string[] = [];
  for (const [key, label] of [["tenant", "Tenant"], ["operation", "Operation"], ["execution", "Execution mode"], ["baselineSourceSha", "Baseline source SHA"]] as const) {
    if (!first[key] || !second[key]) warnings.push(`${label} is unknown in one or both reports.`);
    else if (first[key]?.toLowerCase() !== second[key]?.toLowerCase()) warnings.push(`${label} differs between reports.`);
  }
  const timestamps = [first.started, second.started];
  const knownTimes = timestamps.every(time => time && /(?:UTC|Z|[+-]\d{2}:\d{2})$/i.test(time) && Number.isFinite(Date.parse(time)));
  if (!knownTimes) warnings.push("Start time or time zone is unknown. Run order cannot be confirmed.");
  else if (Date.parse(first.started!) !== Date.parse(second.started!)) warnings.push("Reports have different start times. Tenant state can change between runs.");
  if ([...first.tasks, ...second.tasks].some(task => /unknown/i.test(task.outcome))) warnings.push("Some task outcomes are unknown or lack a reason.");
  return warnings;
}

/** Compare task inventory and reported outcomes; this does not compare policy settings. */
export function compareReports(first: ComparisonReport, second: ComparisonReport): { differences: ReportDifference[]; warnings: string[] } {
  const left = indexTasks(first.tasks);
  const right = indexTasks(second.tasks);
  const differences: ReportDifference[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key);
    const b = right.get(key);
    if (JSON.stringify(a?.outcomes) === JSON.stringify(b?.outcomes)) continue;
    const task = (a ?? b)!.task;
    differences.push({ key, name: task.name, category: task.category, first: a?.outcomes ?? [], second: b?.outcomes ?? [] });
  }
  const warnings = comparisonWarnings(first, second);
  if (left.size !== first.tasks.length || right.size !== second.tasks.length) warnings.push("A report contains repeated task names within a category. All reported outcomes are retained.");
  return { differences, warnings };
}
