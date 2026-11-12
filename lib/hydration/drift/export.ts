/**
 * Drift report exports (JSON and CSV). The exports hold the same data as the drift view.
 */

import { formatFileTimestamp } from "@/lib/utils/dateFormat";
import { getTaskCategoryLabel } from "../categoryLabels";
import { escapeCSVField } from "../reporter";
import { formatDifference } from "./compare";
import type { DriftReport } from "./scan";

export function generateDriftJSON(report: DriftReport): string {
  return JSON.stringify({ reportType: "drift", reportVersion: "1.0", ...report }, null, 2);
}

/** One row for each kit object, unmarked match, missing template, kit object without a template, and unchecked template. */
export function generateDriftCSV(report: DriftReport): string {
  const headers = [
    "Section", "Category", "Template", "Object ID", "Object Name", "Kit Marker",
    "Comparison", "Reason", "Differences", "Tenant ID", "Scanned (UTC)",
  ];
  const run = [report.tenantId, report.scannedAt];
  const rows: Array<Array<string | number>> = [
    ...report.kitObjects.map((item) => [
      "Kit object", getTaskCategoryLabel(item.category), item.itemName, item.objectId, item.objectName, item.marker,
      item.comparison.status, item.comparison.reason, item.comparison.differences.map(formatDifference).join("; "), ...run,
    ]),
    ...report.unmarkedMatches.map((item) => [
      "Object without kit marker", getTaskCategoryLabel(item.category), item.itemName, item.objectId, item.objectName,
      item.marker, item.comparison.status, item.comparison.reason, "", ...run,
    ]),
    ...report.missing.map((item) => [
      "Template without object", getTaskCategoryLabel(item.category), item.itemName, "", "", "", "", "", "", ...run,
    ]),
    ...report.orphans.map((item) => [
      "Kit object without template", item.objectType, "", item.objectId, item.objectName, "present", "", "", "", ...run,
    ]),
    ...report.unchecked.map((item) => [
      "Not checked", getTaskCategoryLabel(item.category), item.itemName, "", "", "", "", item.reason, "", ...run,
    ]),
    ...report.orphanTypesNotChecked.map((item) => [
      "Not checked", item.objectType, "", "", "", "", "", item.reason, "", ...run,
    ]),
  ];
  return [headers, ...rows].map((row) => row.map(escapeCSVField).join(",")).join("\n");
}

export function generateDriftFilename(format: "json" | "csv"): string {
  return `intune-hydration-drift-${formatFileTimestamp(new Date())}.${format}`;
}
