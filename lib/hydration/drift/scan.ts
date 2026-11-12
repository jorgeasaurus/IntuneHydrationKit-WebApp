/* oxlint-disable react-doctor/async-await-in-loop -- reads are sequential to avoid Graph throttling and to stop on cancel. */
/**
 * Read-only tenant checks: the pre-run conflict check and the drift scan.
 * Every tenant request is a GET request. Reads are sequential and stop between
 * requests when the user cancels.
 */

import type { GraphClient } from "@/lib/graph/client";
import { hasConditionalAccessHydrationMarker, hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import { isRunCancelledError } from "@/lib/utils/retry";
import type { BaselineSelection, CategorySelections, CISCategoryId, TaskCategory } from "@/types/hydration";
import {
  CONFLICT_CHECK_CACHES,
  CheckCancelledError,
  compareExistingObject,
  detectConflicts,
  resolveExistingForCreate,
  type ConflictReport,
  type ReadControls,
  type UncheckedItem,
} from "../conflicts";
import { TENANT_CACHE_PREFETCHES, buildTaskQueueAsync } from "../engine";
import type { ExecutionContext, TenantCacheKey } from "../types";
import { TENANT_CACHE_LABELS } from "../utils";
import type { ObjectComparison } from "./compare";

/** Context for read-only checks. Preview mode: no executor in this module writes. */
function createReadOnlyContext(client: GraphClient, tenantId: string, shouldCancel?: () => boolean): ExecutionContext {
  return { client, tenantId, operationMode: "create", isPreview: true, stopOnFirstError: false, shouldCancel };
}

/**
 * Load the prefetched tenant caches that the categories need, one after another,
 * with the loaders that the run uses. A failed load leaves the cache unset and records
 * the reason in prefetchErrors, the same as the run.
 */
export async function loadTenantCaches(
  context: ExecutionContext,
  categories: TaskCategory[],
  controls: ReadControls = {}
): Promise<void> {
  const keys = new Set(categories.flatMap((category) => CONFLICT_CHECK_CACHES[category] ?? []));
  for (const prefetch of TENANT_CACHE_PREFETCHES) {
    if (!keys.has(prefetch.key) || context[prefetch.key]) continue;
    if (controls.shouldCancel?.()) throw new CheckCancelledError();
    const label = TENANT_CACHE_LABELS[prefetch.key];
    controls.onProgress?.(`Reading existing ${label}...`);
    try {
      const items = await prefetch.load(context.client);
      (context as Record<TenantCacheKey, unknown[] | undefined>)[prefetch.key] = items;
    } catch (error) {
      if (isRunCancelledError(error)) throw new CheckCancelledError();
      const reason = error instanceof Error ? error.message : String(error);
      context.prefetchErrors = { ...context.prefetchErrors, [prefetch.key]: reason };
    }
  }
}

export interface ConflictCheckSelection {
  selectedTargets: TaskCategory[];
  selectedCISCategories?: CISCategoryId[];
  baselineSelection?: BaselineSelection;
  categorySelections?: CategorySelections;
}

/** Check the selected create templates for objects that already exist in the tenant. */
export async function runConflictCheck(
  client: GraphClient,
  tenantId: string,
  selection: ConflictCheckSelection,
  controls: ReadControls = {}
): Promise<ConflictReport> {
  controls.onProgress?.("Loading the selected templates...");
  const tasks = await buildTaskQueueAsync(selection.selectedTargets, "create", {
    selectedCISCategories: selection.selectedCISCategories,
    baselineSelection: selection.baselineSelection,
    categorySelections: selection.categorySelections,
    shouldCancel: controls.shouldCancel,
  });
  const context = createReadOnlyContext(client, tenantId, controls.shouldCancel);
  await loadTenantCaches(context, selection.selectedTargets, controls);
  return detectConflicts(tasks, context, controls);
}

/** Categories that the drift scan compares. */
export const DRIFT_SCAN_CATEGORIES: TaskCategory[] = [
  "groups",
  "filters",
  "compliance",
  "conditionalAccess",
  "appProtection",
  "baseline",
];

/**
 * Caches searched for kit objects without a template. Administrative Templates and
 * Endpoint Security profiles come only from CIS Baseline templates, which the scan
 * does not load, so they are not searched.
 */
const ORPHAN_CACHES: TenantCacheKey[] = [
  "cachedIntuneGroups",
  "cachedFilters",
  "cachedCompliancePolicies",
  "cachedV2CompliancePolicies",
  "cachedConditionalAccessPolicies",
  "cachedAppProtectionPolicies",
  "cachedSettingsCatalogPolicies",
  "cachedDeviceConfigurations",
  "cachedDriverUpdateProfiles",
];

export interface DriftItem {
  category: TaskCategory;
  itemName: string;
  objectId: string;
  objectName: string;
  marker: "present" | "missing";
  comparison: ObjectComparison;
}

export interface DriftOrphan {
  /** Label of the object type, for example "device filters". */
  objectType: string;
  objectId: string;
  objectName: string;
}

export interface DriftReport {
  tenantId: string;
  scannedAt: string;
  /** Kit objects (with the marker) that match a template, with the comparison. */
  kitObjects: DriftItem[];
  /** Objects that match a template name but do not carry the kit marker. Not compared. */
  unmarkedMatches: DriftItem[];
  /** Templates with no object of the same name in the tenant. */
  missing: Array<{ category: TaskCategory; itemName: string }>;
  /** Kit-marked objects that match no template of the scanned categories. */
  orphans: DriftOrphan[];
  /** Templates that could not be checked, with the reason. */
  unchecked: UncheckedItem[];
  /** Object types that were not searched for kit objects without a template, with the reason. */
  orphanTypesNotChecked: Array<{ objectType: string; reason: string }>;
}

function hasKitMarker(key: TenantCacheKey, item: { displayName?: string; description?: string }): boolean {
  return key === "cachedConditionalAccessPolicies"
    ? hasConditionalAccessHydrationMarker(item.displayName)
    : hasHydrationMarker(item.description);
}

/**
 * Compare kit objects in the tenant with the current templates. GET requests only.
 * Throws CheckCancelledError when cancelled.
 */
export async function runDriftScan(
  client: GraphClient,
  tenantId: string,
  controls: ReadControls = {}
): Promise<DriftReport> {
  controls.onProgress?.("Loading templates...");
  const tasks = await buildTaskQueueAsync(DRIFT_SCAN_CATEGORIES, "create", { shouldCancel: controls.shouldCancel });
  const context = createReadOnlyContext(client, tenantId, controls.shouldCancel);
  await loadTenantCaches(context, DRIFT_SCAN_CATEGORIES, controls);

  const report: DriftReport = {
    tenantId,
    scannedAt: new Date().toISOString(),
    kitObjects: [],
    unmarkedMatches: [],
    missing: [],
    orphans: [],
    unchecked: [],
    orphanTypesNotChecked: [],
  };
  const matchedIds = new Set<string>();

  for (const [index, task] of tasks.entries()) {
    if (controls.shouldCancel?.()) throw new CheckCancelledError();
    const resolution = resolveExistingForCreate(task, context);
    if (resolution.status === "unchecked") {
      report.unchecked.push({ category: task.category, itemName: task.itemName, reason: resolution.reason });
      continue;
    }
    if (resolution.status === "notFound") {
      report.missing.push({ category: task.category, itemName: task.itemName });
      continue;
    }
    const { object } = resolution;
    matchedIds.add(object.id);
    const item: Omit<DriftItem, "comparison"> = {
      category: task.category,
      itemName: task.itemName,
      objectId: object.id,
      objectName: object.name,
      marker: object.hasMarker ? "present" : "missing",
    };
    if (!object.hasMarker) {
      report.unmarkedMatches.push({
        ...item,
        comparison: { status: "cannotCompare", differences: [], reason: "Not created by the kit (no marker), so it is not compared." },
      });
      continue;
    }
    controls.onProgress?.(`Comparing ${index + 1} of ${tasks.length}: ${task.itemName}`);
    try {
      report.kitObjects.push({ ...item, comparison: await compareExistingObject(object, client) });
    } catch (error) {
      if (isRunCancelledError(error)) throw new CheckCancelledError();
      throw error;
    }
  }

  for (const key of ORPHAN_CACHES) {
    const items = context[key] as Array<{ id?: string; name?: string; displayName?: string; description?: string }> | undefined;
    if (!items) {
      const reason = context.prefetchErrors?.[key];
      report.orphanTypesNotChecked.push({
        objectType: TENANT_CACHE_LABELS[key],
        reason: `Could not read the existing ${TENANT_CACHE_LABELS[key]}${reason ? ` (${reason})` : ""}.`,
      });
      continue;
    }
    for (const item of items) {
      if (!item.id || matchedIds.has(item.id) || !hasKitMarker(key, item)) continue;
      report.orphans.push({
        objectType: TENANT_CACHE_LABELS[key],
        objectId: item.id,
        objectName: item.name ?? item.displayName ?? item.id,
      });
    }
  }

  return report;
}
