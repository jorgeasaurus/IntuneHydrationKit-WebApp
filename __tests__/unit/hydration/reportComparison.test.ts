import { describe, expect, it } from "vitest";
import { createSummary, generateJSONReport, generateMarkdownReport } from "@/lib/hydration/reporter";
import type { HydrationTask } from "@/types/hydration";
import { compareReports, MAX_COMPARISON_FILE_BYTES, parseComparisonReport, validateComparisonFile } from "@/lib/hydration/reportComparison";

// These fixtures retain the supplied exports' syntax, with tenant and policy names replaced.
const powershell = `# Intune Hydration Summary
**Started:** 2026-10-03 19:37:11
**Tenant:** example-tenant
**Mode:** Live
## Summary
| Total Operations | 2 |
## All Operations
| Timestamp | Type | Name | Action | ID | Details |
|-----------|------|------|--------|-----|---------|
| 2026-10-03 19:37:32 | WINDOWS/IntuneManagement | [IHD] Example Policy - v4.0 | Created | example-id | |
| 2026-10-03 19:37:32 | BYOD/AppProtection | [IHD] Example App | Skipped | | Already exists |
`;
const markdown = `# Intune Hydration Report
**Tenant ID**: example-tenant
**Operation**: Create
**Execution**: Preview
**Date**: 2026-10-04 02:36:16 UTC
## Summary
- **Total Tasks**: 2
- **Created**: 1
## Task Details
### OpenIntuneBaseline
\u2713 [IHD] Example Policy - v4.0
   - Outcome: Success
\u2297 [IHD] Example App
   - Outcome: No change
## Errors
`;
function jsonReport() {
  return {
    executionMode: "preview",
    summary: { tenantId: "example-tenant", operationMode: "create", startTime: "2026-10-04T02:36:16.000Z", stats: { total: 2 }, provenance: { baselineSourceSha: "example-sha" } },
    tasks: [
      { category: "baseline", itemName: "[IHD] Example Policy - v4.0", status: "success", outcome: "success" },
      { category: "baseline", itemName: "[IHD] Example App", status: "skipped", outcome: "noOp" },
    ],
  };
}

describe("local report comparison", () => {
  it("compares supplied PowerShell and web report shapes without treating preview success as creation", () => {
    const first = parseComparisonReport(powershell);
    const second = parseComparisonReport(markdown);
    const result = compareReports(first, second);
    expect(first.tasks).toHaveLength(2);
    expect(result.differences).toEqual([expect.objectContaining({ name: "[IHD] Example Policy - v4.0", first: ["Created"], second: ["Would create"] })]);
    expect(result.warnings).toContain("Execution mode differs between reports.");
    expect(result.warnings).toContain("Operation is unknown in one or both reports.");
    expect(result.warnings).toContain("Start time or time zone is unknown. Run order cannot be confirmed.");
  });

  it("reads JSON task outcomes and compares them to Markdown without using aggregate creation counts", () => {
    const result = compareReports(parseComparisonReport(markdown), parseComparisonReport(JSON.stringify(jsonReport())));
    expect(result.differences).toEqual([]);
    expect(result.warnings).toContain("Baseline source SHA is unknown in one or both reports.");
  });

  it("retains version changes, missing tasks, and duplicate outcomes", () => {
    const first = parseComparisonReport(markdown);
    const second = { ...first, tasks: [first.tasks[0], first.tasks[0], { ...first.tasks[1], name: "Example App - v2" }] };
    const result = compareReports(first, second);
    expect(result.differences).toHaveLength(3);
    expect(result.differences.find(row => row.name.includes("Policy"))?.second).toHaveLength(2);
    expect(result.warnings.some(warning => warning.includes("repeated task names"))).toBe(true);
  });

  it("does not equate blocked skips with expected no-op outcomes", () => {
    const json = jsonReport();
    json.tasks[1].outcome = "blocked";
    const result = compareReports(parseComparisonReport(markdown), parseComparisonReport(JSON.stringify(json)));
    expect(result.differences[0]).toMatchObject({ first: ["No change"], second: ["Blocked"] });
  });

  it("warns about different tenants and known start times", () => {
    const first = parseComparisonReport(markdown);
    const result = compareReports(first, { ...first, tenant: "other-tenant", started: "2026-10-04T03:00:00Z" });
    expect(result.warnings).toContain("Tenant differs between reports.");
    expect(result.warnings).toContain("Reports have different start times. Tenant state can change between runs.");
  });

  it("rejects incomplete reports and unsupported data instead of silently dropping tasks", () => {
    expect(() => parseComparisonReport(markdown.replace("**Total Tasks**: 2", "**Total Tasks**: 3"))).toThrow("complete report");
    expect(() => parseComparisonReport(powershell.replace("| Created |", "| Created | extra |"))).toThrow("invalid operation row");
    expect(() => parseComparisonReport('{"tasks":[]}')).toThrow("supported web hydration report");
    expect(() => parseComparisonReport("# Arbitrary document")).toThrow("Select a PowerShell");
  });

  it.each([true, false])("round-trips current reporter exports (preview=%s)", (preview) => {
    const tasks: HydrationTask[] = [
      { id: "1", category: "baseline", operation: "create", itemName: "Example create", status: "success" },
      { id: "2", category: "baseline", operation: "create", itemName: "Example existing", status: "skipped", skipKind: "noOp", error: "Already exists" },
      { id: "3", category: "baseline", operation: "create", itemName: "Example blocked", status: "skipped", skipKind: "blocked", error: "Missing license" },
      { id: "4", category: "baseline", operation: "create", itemName: "Example failed", status: "failed", error: "Request failed" },
    ];
    const summary = createSummary("example-tenant", "create", new Date("2026-10-04T02:00:00Z"), new Date("2026-10-04T02:01:00Z"), tasks, undefined, undefined, {
      runId: "example-run", appVersion: "1.0", baselineVersion: "4.0", baselineSourceSha: "example-sha",
    });
    const markdownReport = parseComparisonReport(generateMarkdownReport(summary, tasks, "completedWithIssues", preview));
    const json = parseComparisonReport(generateJSONReport(summary, tasks, "completedWithIssues", preview));
    expect(compareReports(markdownReport, json)).toEqual({ differences: [], warnings: [] });
    expect(json.tasks.map(task => task.outcome)).toEqual([preview ? "Would create" : "Created", "No change", "Blocked", "Failed"]);
    expect(markdownReport.started).toBe("2026-10-04 02:00:00 UTC");
  });

  it("accepts an explicit empty PowerShell dry run", () => {
    const empty = "# Intune Hydration Summary\n**Mode:** Dry-Run\n## Summary\n| Total Operations | 0 |\n## Important Notes";
    expect(parseComparisonReport(empty)).toMatchObject({ execution: "preview", tasks: [] });
  });

  it("enforces file size, extension and empty-file guards", () => {
    expect(() => validateComparisonFile({ name: "report.md", size: 12 })).not.toThrow();
    expect(() => validateComparisonFile({ name: "report.html", size: 12 })).toThrow("Markdown");
    expect(() => validateComparisonFile({ name: "report.json", size: MAX_COMPARISON_FILE_BYTES + 1 })).toThrow("2 MB");
    expect(() => validateComparisonFile({ name: "report.md", size: 0 })).toThrow("empty");
    expect(() => parseComparisonReport("x".repeat(MAX_COMPARISON_FILE_BYTES + 1))).toThrow("2 MB");
  });
});
