"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SensitiveData } from "@/components/SensitiveData";
import {
  compareReports,
  parseComparisonReport,
  validateComparisonFile,
  type ComparisonReport,
  type ReportDifference,
} from "@/lib/hydration/reportComparison";

function ReportFileInput({ label, onChange }: {
  label: string;
  onChange: (report: ComparisonReport | null) => void;
}) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const request = useRef(0);

  async function loadFile(file?: File) {
    const current = ++request.current;
    onChange(null);
    setError("");
    setStatus("");
    if (!file) return;
    try {
      validateComparisonFile(file);
      setStatus("Reading report…");
      const report = parseComparisonReport(await file.text());
      if (current !== request.current) return;
      onChange(report);
      setStatus(`${report.format}: ${report.tasks.length} tasks`);
    } catch (cause) {
      if (current !== request.current) return;
      setStatus("");
      setError(cause instanceof SyntaxError ? "The JSON report is invalid." : String(cause instanceof Error ? cause.message : "Cannot read this report."));
    }
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-2 text-sm font-medium">
        <span>{label}</span>
        <input
          type="file"
          accept=".md,.json,text/markdown,application/json"
          className="block w-full rounded-md border p-2 text-sm"
          onChange={event => void loadFile(event.target.files?.[0])}
        />
      </label>
      <p aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function DifferenceTable({ differences }: { differences: ReportDifference[] }) {
  const [limit, setLimit] = useState(50);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border" role="region" aria-label="Report differences" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="p-3">Task</th><th className="p-3">First report</th><th className="p-3">Second report</th></tr></thead>
          <tbody>
            {differences.slice(0, limit).map(row => (
              <tr key={row.key} className="border-b last:border-0">
                <td className="p-3"><SensitiveData value={row.name} fallback="Unnamed task" /><span className="block text-xs text-muted-foreground">{row.category}</span></td>
                <td className="p-3">{row.first.join(", ") || "Not listed"}</td>
                <td className="p-3">{row.second.join(", ") || "Not listed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit < differences.length && <Button variant="outline" onClick={() => setLimit(limit + 50)}>Show 50 more differences</Button>}
    </div>
  );
}

function ComparisonResults({ first, second }: { first: ComparisonReport; second: ComparisonReport }) {
  const { differences, warnings } = compareReports(first, second);
  return (
    <div className="space-y-4" aria-live="polite">
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/40 p-3 text-sm">
          <p className="font-medium">Comparison limits</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
      <p className="text-sm">{differences.length} task inventory or outcome differences.</p>
      {differences.length > 0 ? <DifferenceTable differences={differences} /> : <p className="text-sm text-muted-foreground">Task names and reported outcomes match. This does not confirm that policy settings match.</p>}
    </div>
  );
}

/** Compare two local report exports without uploading or saving their contents. */
export function ReportComparison() {
  const [first, setFirst] = useState<ComparisonReport | null>(null);
  const [second, setSecond] = useState<ComparisonReport | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Compare reports</CardTitle>
        <CardDescription>Compare task inventory and outcomes from PowerShell Markdown or web Markdown/JSON exports. Files stay in this browser and are not uploaded. Maximum 2 MB per file.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <ReportFileInput label="First report" onChange={setFirst} />
          <ReportFileInput label="Second report" onChange={setSecond} />
        </div>
        {first && second && <ComparisonResults first={first} second={second} />}
      </CardContent>
    </Card>
  );
}
