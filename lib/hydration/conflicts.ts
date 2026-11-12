/**
 * Conflict detection for create runs (read-only).
 *
 * For each create task, find the tenant object that the run would skip because it
 * already exists. The match uses the same name rules and prefetched caches as the
 * create executors (existingObjects.ts, findBaselineMatch). For a match, report the
 * kit marker and whether the object differs from the template. All tenant requests
 * are GET requests.
 */

import type { GraphClient } from "@/lib/graph/client";
import { CONDITIONAL_ACCESS_POLICIES_ENDPOINT } from "@/lib/graph/conditionalAccess";
import { getCachedTemplates } from "@/lib/templates/loader";
import type { AppProtectionTemplate, BaselinePolicy, ComplianceTemplate } from "@/lib/templates/loader";
import { hasConditionalAccessHydrationMarker, hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import { isRunCancelledError } from "@/lib/utils/retry";
import type { HydrationTask, TaskCategory } from "@/types/hydration";
import { findBaselineMatch, readBaselinePolicy } from "./baselineEvidence";
import { compareWithTemplate, type CompareKind, type ObjectComparison } from "./drift/compare";
import {
  findExistingAppProtectionPolicy,
  findExistingConditionalAccessPolicy,
  findExistingFilter,
  findExistingGroup,
  namesMatchIgnoringImportPrefix,
} from "./existingObjects";
import { resolveOIBOrganizationId } from "./templatePlaceholders";
import type { ExecutionContext, TenantCacheKey } from "./types";
import { TENANT_CACHE_LABELS, findBaselineTemplate } from "./utils";

type JsonRecord = Record<string, unknown>;

/** Tenant object that a create task matched by name. */
export interface ExistingObject {
  id: string;
  name: string;
  /** True when the object carries the kit marker (description, or display name for Conditional Access). */
  hasMarker: boolean;
  /** Comparison type, or undefined when the type cannot be compared. */
  kind?: CompareKind;
  /** Reason why the object cannot be compared (when kind is undefined). */
  cannotCompareReason?: string;
  /** Template of the task, after the same preparation as the create path. */
  template: JsonRecord;
  /** Read the object from the tenant by ID (GET only). */
  read: (client: GraphClient) => Promise<JsonRecord>;
}

export type ExistingResolution =
  | { status: "found"; object: ExistingObject }
  | { status: "notFound" }
  | { status: "unchecked"; reason: string };

/** Categories whose existing objects cannot be checked before the run, with the reason. */
export const UNCHECKED_CATEGORY_REASONS: Partial<Record<TaskCategory, string>> = {
  enrollment: "Enrollment profiles are looked up during the run, so they are not checked here.",
  win32Apps: "Win32 apps are looked up during the run, so they are not checked here.",
  cisBaseline: "CIS Baseline policies are not checked here.",
  notification: "Notification templates are not checked here.",
};

/** Caches that the conflict check reads for each category (the same caches the run prefetches). */
export const CONFLICT_CHECK_CACHES: Partial<Record<TaskCategory, TenantCacheKey[]>> = {
  groups: ["cachedIntuneGroups"],
  filters: ["cachedFilters"],
  compliance: ["cachedCompliancePolicies", "cachedV2CompliancePolicies"],
  conditionalAccess: ["cachedConditionalAccessPolicies"],
  appProtection: ["cachedAppProtectionPolicies"],
  baseline: [
    "cachedSettingsCatalogPolicies",
    "cachedCompliancePolicies",
    "cachedDeviceConfigurations",
    "cachedDriverUpdateProfiles",
    "cachedAppProtectionPolicies",
  ],
};

function cacheUnavailable(context: ExecutionContext, key: TenantCacheKey): ExistingResolution {
  const reason = context.prefetchErrors?.[key];
  return {
    status: "unchecked",
    reason: `Could not read the existing ${TENANT_CACHE_LABELS[key]} from the tenant${reason ? ` (${reason})` : ""}.`,
  };
}

function readById(path: string, version: "v1.0" | "beta" = "beta") {
  return (client: GraphClient) => client.get<JsonRecord>(path, version);
}

const APP_PROTECTION_NOT_COMPARED = "App Protection settings and targeted apps are not compared.";

function resolveGroup(task: HydrationTask, context: ExecutionContext): ExistingResolution {
  const templates = getCachedTemplates("groups") as Array<{ displayName: string }> | null;
  const template = templates?.find((item) => item.displayName === task.itemName);
  if (!template) return { status: "unchecked", reason: "Template not found." };
  if (!context.cachedIntuneGroups) return cacheUnavailable(context, "cachedIntuneGroups");
  const match = findExistingGroup(context.cachedIntuneGroups, template.displayName);
  if (!match?.id) return { status: "notFound" };
  return {
    status: "found",
    object: {
      id: match.id,
      name: match.displayName,
      hasMarker: hasHydrationMarker(match.description),
      kind: "group",
      template: template as JsonRecord,
      read: readById(
        `/groups/${match.id}?$select=id,displayName,description,groupTypes,mailEnabled,securityEnabled,membershipRule,membershipRuleProcessingState`,
        "v1.0"
      ),
    },
  };
}

function resolveFilter(task: HydrationTask, context: ExecutionContext): ExistingResolution {
  const templates = getCachedTemplates("filters") as Array<{ displayName: string }> | null;
  const template = templates?.find((item) => item.displayName === task.itemName);
  if (!template) return { status: "unchecked", reason: "Template not found." };
  if (!context.cachedFilters) return cacheUnavailable(context, "cachedFilters");
  const match = findExistingFilter(context.cachedFilters, template.displayName);
  if (!match?.id) return { status: "notFound" };
  return {
    status: "found",
    object: {
      id: match.id,
      name: match.displayName,
      hasMarker: hasHydrationMarker(match.description),
      kind: "filter",
      template: template as JsonRecord,
      read: readById(`/deviceManagement/assignmentFilters/${match.id}`),
    },
  };
}

function resolveCompliance(task: HydrationTask, context: ExecutionContext): ExistingResolution {
  const templates = getCachedTemplates("compliance") as ComplianceTemplate[] | null;
  const template = templates?.find((item) => namesMatchIgnoringImportPrefix(item.displayName, task.itemName));
  if (!template) return { status: "unchecked", reason: "Template not found." };
  const isV2 = !template["@odata.type"] && ("platforms" in template || "technologies" in template);
  if (isV2) {
    if (!context.cachedV2CompliancePolicies) return cacheUnavailable(context, "cachedV2CompliancePolicies");
    const match = context.cachedV2CompliancePolicies.find((policy) =>
      namesMatchIgnoringImportPrefix(policy.name, template.displayName)
    );
    if (!match?.id) return { status: "notFound" };
    return {
      status: "found",
      object: {
        id: match.id,
        name: match.name,
        hasMarker: hasHydrationMarker(match.description),
        cannotCompareReason: "Settings Catalog compliance settings are not compared.",
        template,
        read: readById(`/deviceManagement/compliancePolicies/${match.id}`),
      },
    };
  }
  if (!context.cachedCompliancePolicies) return cacheUnavailable(context, "cachedCompliancePolicies");
  const match = context.cachedCompliancePolicies.find((policy) =>
    namesMatchIgnoringImportPrefix(policy.displayName, template.displayName)
  );
  if (!match?.id) return { status: "notFound" };
  return {
    status: "found",
    object: {
      id: match.id,
      name: match.displayName ?? task.itemName,
      hasMarker: hasHydrationMarker(match.description),
      kind: "compliance",
      template,
      read: (client) => readBaselinePolicy(client, "V1Compliance", match.id),
    },
  };
}

function resolveConditionalAccess(task: HydrationTask, context: ExecutionContext): ExistingResolution {
  const templates = getCachedTemplates("conditionalAccess") as Array<{ displayName: string }> | null;
  const template = templates?.find((item) => item.displayName === task.itemName);
  if (!template) return { status: "unchecked", reason: "Template not found." };
  if (!context.cachedConditionalAccessPolicies) return cacheUnavailable(context, "cachedConditionalAccessPolicies");
  const match = findExistingConditionalAccessPolicy(template.displayName, context.cachedConditionalAccessPolicies);
  if (!match?.id) return { status: "notFound" };
  return {
    status: "found",
    object: {
      id: match.id,
      name: match.displayName ?? task.itemName,
      hasMarker: hasConditionalAccessHydrationMarker(match.displayName),
      kind: "conditionalAccess",
      template: template as JsonRecord,
      read: readById(`${CONDITIONAL_ACCESS_POLICIES_ENDPOINT}/${match.id}`),
    },
  };
}

function resolveAppProtection(task: HydrationTask, context: ExecutionContext): ExistingResolution {
  const templates = getCachedTemplates("appProtection") as AppProtectionTemplate[] | null;
  const template = templates?.find((item) => namesMatchIgnoringImportPrefix(item.displayName, task.itemName));
  if (!template) return { status: "unchecked", reason: "Template not found." };
  if (!context.cachedAppProtectionPolicies) return cacheUnavailable(context, "cachedAppProtectionPolicies");
  const match = findExistingAppProtectionPolicy(context.cachedAppProtectionPolicies, template.displayName);
  if (!match?.id) return { status: "notFound" };
  return {
    status: "found",
    object: {
      id: match.id,
      name: match.displayName,
      hasMarker: hasHydrationMarker(match.description),
      cannotCompareReason: APP_PROTECTION_NOT_COMPARED,
      template,
      read: async () => ({}),
    },
  };
}

/** Baseline policy type routing, the same as the baseline create executor. */
function resolveBaseline(task: HydrationTask, context: ExecutionContext): ExistingResolution {
  const found = findBaselineTemplate(task, context);
  if (!found) return { status: "unchecked", reason: "Template not found." };
  const template = resolveOIBOrganizationId(found, context.tenantId) as BaselinePolicy;
  const policyName = template.name || template.displayName || task.itemName;
  const type = template._oibPolicyType;

  const resolveIn = (
    key: TenantCacheKey,
    matchType: string,
    policies: Array<{ id?: string; name?: string; displayName?: string; description?: string }> | undefined,
    compare: { kind: CompareKind; readType: string } | { reason: string }
  ): ExistingResolution => {
    if (!policies) return cacheUnavailable(context, key);
    const match = findBaselineMatch(matchType, policyName, policies);
    if (!match?.id) return { status: "notFound" };
    const id = match.id;
    return {
      status: "found",
      object: {
        id,
        name: match.name ?? match.displayName ?? policyName,
        hasMarker: hasHydrationMarker(match.description),
        ...("kind" in compare ? { kind: compare.kind } : { cannotCompareReason: compare.reason }),
        template: template as JsonRecord,
        read: "readType" in compare ? (client) => readBaselinePolicy(client, compare.readType, id) : async () => ({}),
      },
    };
  };

  switch (type) {
    case "CompliancePolicies":
      return resolveIn("cachedCompliancePolicies", "CompliancePolicies", context.cachedCompliancePolicies, {
        kind: "compliance",
        readType: "CompliancePolicies",
      });
    case "AppProtection": {
      const platformType =
        template["@odata.type"] === "#microsoft.graph.iosManagedAppProtection"
          ? "#microsoft.graph.iosManagedAppProtection"
          : "#microsoft.graph.androidManagedAppProtection";
      const platform = platformType.includes("ios") ? "iOS" : "android";
      const policies = context.cachedAppProtectionPolicies?.filter((policy) =>
        policy._platform ? policy._platform === platform : policy["@odata.type"] === platformType
      );
      return resolveIn("cachedAppProtectionPolicies", "AppProtection", policies, { reason: APP_PROTECTION_NOT_COMPARED });
    }
    case "DeviceConfiguration":
    case "UpdatePolicies":
      return resolveIn("cachedDeviceConfigurations", "DeviceConfiguration", context.cachedDeviceConfigurations, {
        kind: "DeviceConfiguration",
        readType: "DeviceConfiguration",
      });
    case "DriverUpdateProfiles":
      return resolveIn("cachedDriverUpdateProfiles", "DriverUpdateProfiles", context.cachedDriverUpdateProfiles, {
        kind: "DriverUpdateProfiles",
        readType: "DriverUpdateProfiles",
      });
    default:
      return resolveIn("cachedSettingsCatalogPolicies", "SettingsCatalog", context.cachedSettingsCatalogPolicies, {
        kind: "SettingsCatalog",
        readType: "SettingsCatalog",
      });
  }
}

/**
 * Find the tenant object that a create task matches, with the create path's rules.
 * Reads only the prefetched caches and the loaded templates; sends no requests.
 */
export function resolveExistingForCreate(task: HydrationTask, context: ExecutionContext): ExistingResolution {
  const categoryReason = UNCHECKED_CATEGORY_REASONS[task.category];
  if (categoryReason) return { status: "unchecked", reason: categoryReason };
  switch (task.category) {
    case "groups":
      return resolveGroup(task, context);
    case "filters":
      return resolveFilter(task, context);
    case "compliance":
      return resolveCompliance(task, context);
    case "conditionalAccess":
      return resolveConditionalAccess(task, context);
    case "appProtection":
      return resolveAppProtection(task, context);
    case "baseline":
      return resolveBaseline(task, context);
    default:
      return { status: "unchecked", reason: "This category is not checked here." };
  }
}

/**
 * Read an existing object and compare it with its template. GET only.
 * A read error gives "cannotCompare" with the reason. A cancelled run throws.
 */
export async function compareExistingObject(object: ExistingObject, client: GraphClient): Promise<ObjectComparison> {
  if (!object.kind) {
    return { status: "cannotCompare", differences: [], reason: object.cannotCompareReason ?? "This type is not compared." };
  }
  try {
    const actual = await object.read(client);
    return compareWithTemplate(object.kind, object.template, actual);
  } catch (error) {
    if (isRunCancelledError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { status: "cannotCompare", differences: [], reason: `The object could not be read: ${message}` };
  }
}

export interface ConflictItem {
  taskId: string;
  category: TaskCategory;
  itemName: string;
  existingId: string;
  existingName: string;
  marker: "present" | "missing";
  comparison: ObjectComparison;
}

export interface UncheckedItem {
  category: TaskCategory;
  itemName: string;
  reason: string;
}

export interface ConflictReport {
  /** Number of tasks that were checked (found or not found). */
  checked: number;
  conflicts: ConflictItem[];
  unchecked: UncheckedItem[];
}

export interface ReadControls {
  shouldCancel?: () => boolean;
  onProgress?: (message: string) => void;
}

/** Error thrown when the user cancels a read-only check. */
export class CheckCancelledError extends Error {
  constructor() {
    super("The check was cancelled.");
    this.name = "CheckCancelledError";
  }
}

/**
 * Check create tasks for objects that already exist. Reads one object at a time
 * (sequential GET requests) and stops between reads when cancelled.
 * The caches must be loaded first (loadTenantCaches).
 */
export async function detectConflicts(
  tasks: HydrationTask[],
  context: ExecutionContext,
  controls: ReadControls = {}
): Promise<ConflictReport> {
  const report: ConflictReport = { checked: 0, conflicts: [], unchecked: [] };
  for (const [index, task] of tasks.entries()) {
    if (controls.shouldCancel?.()) throw new CheckCancelledError();
    const resolution = resolveExistingForCreate(task, context);
    if (resolution.status === "unchecked") {
      report.unchecked.push({ category: task.category, itemName: task.itemName, reason: resolution.reason });
      continue;
    }
    report.checked += 1;
    if (resolution.status === "notFound") continue;
    controls.onProgress?.(`Comparing ${index + 1} of ${tasks.length}: ${task.itemName}`);
    // oxlint-disable-next-line react-doctor/async-await-in-loop -- sequential reads avoid Graph throttling.
    const comparison = await compareExistingObject(resolution.object, context.client);
    report.conflicts.push({
      taskId: task.id,
      category: task.category,
      itemName: task.itemName,
      existingId: resolution.object.id,
      existingName: resolution.object.name,
      marker: resolution.object.hasMarker ? "present" : "missing",
      comparison,
    });
  }
  return report;
}
