/**
 * Delete Resolver
 *
 * The single place that decides whether a delete task may delete a tenant object.
 * The parallel delete path (batchExecutor.ts) and the sequential category executors
 * both use it, so a task gets the same outcome on both paths.
 *
 * Safety rules (every rule fails closed: if a check cannot complete, the object is not deleted):
 * - The object must carry the hydration marker in its description. Conditional Access
 *   policies have no description, so their marker is in the display name.
 * - A Conditional Access policy is read again and must be in the "disabled" state.
 * - An object with assignments is not deleted.
 * - Preview mode runs the same checks with GET requests only.
 */

import type { ApiVersion } from "@/lib/graph/batch";
import { APP_PROTECTION_PLATFORM_ENDPOINTS } from "@/lib/graph/appProtection";
import {
  CONDITIONAL_ACCESS_POLICIES_ENDPOINT,
  findHydrationConditionalAccessPolicy,
  getConditionalAccessDeleteBlockReason,
} from "@/lib/graph/conditionalAccess";
import {
  EnrollmentProfile,
  findEnrollmentProfileForDelete,
  getEnrollmentProfileName,
  getEnrollmentProfileType,
} from "@/lib/graph/enrollment";
import { getCachedTemplates } from "@/lib/templates/loader";
import { IMPORT_PREFIX, hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import { isRunCancelledError } from "@/lib/utils/retry";
import { HydrationTask } from "@/types/hydration";
import { detectCISPolicyType } from "./policyDetection";
import { ExecutionContext, ExecutionResult, TenantCacheKey } from "./types";
import {
  BaselinePolicyType,
  findBaselineTemplate,
  findCISBaselineTemplate,
  findExistingByName,
  getOIBPolicyType,
  requireTenantCache,
} from "./utils";

/**
 * Tenant object that a delete task resolved to.
 */
export interface DeleteTarget {
  id: string;
  name: string;
  /** Object type label for messages, for example "Settings Catalog policy". */
  label: string;
  /** DELETE endpoint. */
  url: string;
  apiVersion: ApiVersion;
  /** Assignments endpoint, or null when the object type cannot have assignments. */
  assignmentsUrl: string | null;
  /** Prefetched cache that holds the object, so the object can be removed after delete. */
  cacheKey?: TenantCacheKey;
}

/**
 * Results of the safety checks for a resolved object.
 */
export interface DeleteChecks {
  marker: "present" | "missing";
  /** Number of assignments, or "notApplicable" for object types without assignments. */
  assignments?: number | "notApplicable";
  /** Conditional Access state verdict after the policy is read again. */
  state?: "disabled" | "notDisabled";
}

export type DeleteResolution =
  | { action: "delete"; target: DeleteTarget; checks: DeleteChecks }
  | { action: "skip"; skipKind: "noOp" | "blocked"; reason: string; target?: DeleteTarget; checks?: DeleteChecks }
  | { action: "fail"; reason: string; target?: DeleteTarget };

export const DELETE_REASONS = {
  notFound: "Not found in tenant",
  noMarker: "Not created by Intune Hydration Kit (no marker in the description)",
  assigned: (count: number) =>
    `Policy has ${count} active assignment(s). Remove the assignments before you delete it.`,
} as const;

type CachedObject = {
  id?: string;
  name?: string;
  displayName?: string;
  description?: string;
  _platform?: string;
  "@odata.type"?: string;
};

interface DeleteSource {
  label: string;
  cacheKey: TenantCacheKey;
  getName: (item: CachedObject) => string | undefined;
  /** DELETE base path for the matched object. Throws when it cannot be determined. */
  basePath: (item: CachedObject) => string;
  apiVersion: ApiVersion;
  /** False only for object types that are assignment targets themselves (groups, filters). */
  hasAssignments: boolean;
}

const byName = (item: CachedObject) => item.name;
const byDisplayName = (item: CachedObject) => item.displayName;
const fixedPath = (path: string) => () => path;

function appProtectionBasePath(item: CachedObject): string {
  const odataType = item["@odata.type"]?.toLowerCase();
  const platform =
    item._platform ??
    (odataType === "#microsoft.graph.iosmanagedappprotection"
      ? "iOS"
      : odataType === "#microsoft.graph.androidmanagedappprotection"
        ? "android"
        : undefined);
  if (platform !== "iOS" && platform !== "android") {
    throw new Error(`Cannot determine the platform of App Protection policy "${item.displayName}"`);
  }
  return APP_PROTECTION_PLATFORM_ENDPOINTS[platform];
}

const SOURCES = {
  group: {
    label: "group",
    cacheKey: "cachedIntuneGroups",
    getName: byDisplayName,
    basePath: fixedPath("/groups"),
    apiVersion: "v1.0",
    hasAssignments: false,
  },
  filter: {
    label: "device filter",
    cacheKey: "cachedFilters",
    getName: byDisplayName,
    basePath: fixedPath("/deviceManagement/assignmentFilters"),
    apiVersion: "beta",
    hasAssignments: false,
  },
  settingsCatalog: {
    label: "Settings Catalog policy",
    cacheKey: "cachedSettingsCatalogPolicies",
    getName: byName,
    basePath: fixedPath("/deviceManagement/configurationPolicies"),
    apiVersion: "beta",
    hasAssignments: true,
  },
  v2Compliance: {
    label: "V2 Compliance policy",
    cacheKey: "cachedV2CompliancePolicies",
    getName: byName,
    basePath: fixedPath("/deviceManagement/compliancePolicies"),
    apiVersion: "beta",
    hasAssignments: true,
  },
  v1Compliance: {
    label: "Compliance policy",
    cacheKey: "cachedCompliancePolicies",
    getName: byDisplayName,
    basePath: fixedPath("/deviceManagement/deviceCompliancePolicies"),
    apiVersion: "beta",
    hasAssignments: true,
  },
  deviceConfiguration: {
    label: "Device Configuration",
    cacheKey: "cachedDeviceConfigurations",
    getName: byDisplayName,
    basePath: fixedPath("/deviceManagement/deviceConfigurations"),
    apiVersion: "beta",
    hasAssignments: true,
  },
  groupPolicyConfiguration: {
    label: "Administrative Template",
    cacheKey: "cachedGroupPolicyConfigurations",
    getName: byDisplayName,
    basePath: fixedPath("/deviceManagement/groupPolicyConfigurations"),
    apiVersion: "beta",
    hasAssignments: true,
  },
  securityIntent: {
    label: "Endpoint Security profile",
    cacheKey: "cachedSecurityIntents",
    getName: byDisplayName,
    basePath: fixedPath("/deviceManagement/intents"),
    apiVersion: "beta",
    hasAssignments: true,
  },
  driverUpdate: {
    label: "Driver Update profile",
    cacheKey: "cachedDriverUpdateProfiles",
    getName: byDisplayName,
    basePath: fixedPath("/deviceManagement/windowsDriverUpdateProfiles"),
    apiVersion: "beta",
    hasAssignments: true,
  },
  appProtection: {
    label: "App Protection policy",
    cacheKey: "cachedAppProtectionPolicies",
    getName: byDisplayName,
    basePath: appProtectionBasePath,
    apiVersion: "beta",
    hasAssignments: true,
  },
} satisfies Record<string, DeleteSource>;

/**
 * Prefetched caches to search for each category, in priority order.
 * The caches are the ones that engine.ts prefetches for the category.
 */
const CATEGORY_SOURCES: Partial<Record<HydrationTask["category"], DeleteSource[]>> = {
  groups: [SOURCES.group],
  filters: [SOURCES.filter],
  compliance: [SOURCES.v2Compliance, SOURCES.v1Compliance],
  appProtection: [SOURCES.appProtection],
  baseline: [
    SOURCES.settingsCatalog,
    SOURCES.v2Compliance,
    SOURCES.v1Compliance,
    SOURCES.deviceConfiguration,
    SOURCES.groupPolicyConfiguration,
    SOURCES.securityIntent,
    SOURCES.driverUpdate,
    SOURCES.appProtection,
  ],
  cisBaseline: [
    SOURCES.settingsCatalog,
    SOURCES.v2Compliance,
    SOURCES.v1Compliance,
    SOURCES.deviceConfiguration,
    SOURCES.groupPolicyConfiguration,
    SOURCES.securityIntent,
    SOURCES.driverUpdate,
  ],
};

/**
 * Caches to search when the policy type of a baseline task is known. The caches match
 * the endpoints that the create path uses for each type. A cache that failed to load
 * for another type then does not fail the task.
 */
const POLICY_TYPE_SOURCES: Partial<Record<BaselinePolicyType, DeleteSource[]>> = {
  SettingsCatalog: [SOURCES.settingsCatalog],
  // V2 policies sometimes appear in the Settings Catalog list too
  V2Compliance: [SOURCES.v2Compliance, SOURCES.settingsCatalog],
  V1Compliance: [SOURCES.v1Compliance],
  DeviceConfiguration: [SOURCES.deviceConfiguration],
  GroupPolicyConfiguration: [SOURCES.groupPolicyConfiguration],
  SecurityIntent: [SOURCES.securityIntent],
  DriverUpdateProfiles: [SOURCES.driverUpdate],
  AppProtection: [SOURCES.appProtection],
};

/**
 * Caches to search for a task. For a baseline task with a known policy type, only the
 * caches of that type. Otherwise every cache of the category (fail closed: a cache that
 * did not load stops a "not found" result).
 */
function getDeleteSources(task: HydrationTask, context: ExecutionContext): DeleteSource[] | undefined {
  let policyType: BaselinePolicyType | undefined;
  if (task.category === "baseline") {
    const template = findBaselineTemplate(task, context);
    policyType = template && getOIBPolicyType(template);
  } else if (task.category === "cisBaseline") {
    const template = findCISBaselineTemplate(task);
    policyType = template && detectCISPolicyType(template as Record<string, unknown>);
  }
  return (policyType && POLICY_TYPE_SOURCES[policyType]) || CATEGORY_SOURCES[task.category];
}

function stripImportPrefix(name: string): string {
  return name.toLowerCase().startsWith(IMPORT_PREFIX.toLowerCase()) ? name.slice(IMPORT_PREFIX.length) : name;
}

/**
 * Match a tenant object by name: exact (case-insensitive), then punctuation-tolerant,
 * then the same name without the [IHD] prefix on either side. Partial matches are
 * not used, because a partial match can select a different object.
 */
function findDeleteMatch<T>(items: T[], name: string, getName: (item: T) => string | undefined): T | undefined {
  const exact = findExistingByName(items, name, getName);
  if (exact) return exact;
  const strippedName = stripImportPrefix(name).toLowerCase();
  return items.find((item) => {
    const itemName = getName(item);
    return itemName !== undefined && stripImportPrefix(itemName).toLowerCase() === strippedName;
  });
}

interface FoundObject {
  target: DeleteTarget;
  description?: string;
}

/**
 * Tenant objects that a task of this run already resolved to, by object URL. Two tasks
 * can have the same item name (the same template in two categories, or two CIS
 * templates with one display name). The parallel delete path resolves every task before
 * it deletes anything, so without this record both tasks would resolve to the same
 * object and a second object with that name would stay in the tenant.
 */
const claimedTargets = new WeakMap<ExecutionContext, Map<string, string>>();

function isClaimedByOtherTask(context: ExecutionContext, url: string, taskId: string): boolean {
  const owner = claimedTargets.get(context)?.get(url);
  return owner !== undefined && owner !== taskId;
}

function claimTarget(context: ExecutionContext, url: string, taskId: string): void {
  let claims = claimedTargets.get(context);
  if (!claims) {
    claims = new Map();
    claimedTargets.set(context, claims);
  }
  claims.set(url, taskId);
}

function findInCaches(task: HydrationTask, context: ExecutionContext, sources: DeleteSource[]): FoundObject | null {
  const missingCaches: TenantCacheKey[] = [];
  for (const source of sources) {
    const items = context[source.cacheKey] as CachedObject[] | undefined;
    if (!items) {
      missingCaches.push(source.cacheKey);
      continue;
    }
    const objectUrl = (item: CachedObject) => `${source.basePath(item)}/${item.id}`;
    // Skip objects that another task of this run resolved to. A task keeps its own
    // claim, so resolving the same task again gives the same object.
    // basePath can throw for an object it cannot place (an App Protection policy of an
    // unknown platform). Such an object cannot be claimed, so it stays a candidate and
    // only fails the task that actually matches it.
    const unclaimed = items.filter((item) => {
      if (!item.id) return true;
      try {
        return !isClaimedByOtherTask(context, objectUrl(item), task.id);
      } catch {
        return true;
      }
    });
    const match = findDeleteMatch(unclaimed, task.itemName, source.getName);
    if (!match?.id) continue;

    const url = objectUrl(match);
    claimTarget(context, url, task.id);
    return {
      description: match.description,
      target: {
        id: match.id,
        name: source.getName(match) ?? task.itemName,
        label: source.label,
        url,
        apiVersion: source.apiVersion,
        assignmentsUrl: source.hasAssignments ? `${url}/assignments` : null,
        cacheKey: source.cacheKey,
      },
    };
  }

  // The object can be in a cache that was not loaded. Do not report "not found".
  if (missingCaches.length > 0) {
    requireTenantCache(context, missingCaches[0]);
  }
  return null;
}

/**
 * Read the assignment count of an object. Throws when the count cannot be read, so
 * the caller does not delete the object. A response without a "value" array is an error.
 */
export async function readAssignmentCount(context: ExecutionContext, assignmentsUrl: string): Promise<number> {
  const response = await context.client.get<{ value?: unknown }>(assignmentsUrl);
  if (!Array.isArray(response?.value)) {
    throw new Error(`Unexpected response from ${assignmentsUrl}: no assignment list`);
  }
  return response.value.length;
}

/**
 * Read a resolved object from the tenant by ID. Returns null when the object no longer
 * exists. Any other read error is thrown, so the caller does not delete the object.
 */
async function readCurrentObject(
  context: ExecutionContext,
  target: DeleteTarget
): Promise<{ description?: string } | null> {
  try {
    return await context.client.get<{ description?: string }>(target.url, target.apiVersion);
  } catch (error) {
    const { status, message } = (error ?? {}) as { status?: number; message?: string };
    if (status === 404 || /\[404\]|ResourceNotFound/i.test(message ?? "")) return null;
    throw error;
  }
}

async function resolveConditionalAccess(task: HydrationTask, context: ExecutionContext): Promise<DeleteResolution> {
  const policy = findHydrationConditionalAccessPolicy(
    requireTenantCache(context, "cachedConditionalAccessPolicies"),
    task.itemName
  );
  if (!policy) {
    return { action: "skip", skipKind: "noOp", reason: DELETE_REASONS.notFound };
  }

  const url = `${CONDITIONAL_ACCESS_POLICIES_ENDPOINT}/${policy.id}`;
  const target: DeleteTarget = {
    id: policy.id,
    name: policy.displayName ?? task.itemName,
    label: "Conditional Access policy",
    url,
    apiVersion: "beta",
    // Conditional Access policies target users in their conditions; they have no assignments.
    assignmentsUrl: null,
    cacheKey: "cachedConditionalAccessPolicies",
  };

  const blockReason = await getConditionalAccessDeleteBlockReason(context.client, policy.id);
  if (blockReason) {
    return {
      action: "skip",
      skipKind: "blocked",
      reason: blockReason,
      target,
      checks: { marker: "present", state: "notDisabled" },
    };
  }
  return { action: "delete", target, checks: { marker: "present", assignments: "notApplicable", state: "disabled" } };
}

async function findEnrollmentObject(task: HydrationTask, context: ExecutionContext): Promise<FoundObject | null> {
  // Enrollment objects are not prefetched; read them now. The template gives the object
  // type, so only that collection is searched.
  const templates = getCachedTemplates("enrollment");
  const template = Array.isArray(templates)
    ? (templates as EnrollmentProfile[]).find((profile) => getEnrollmentProfileName(profile) === task.itemName)
    : undefined;
  const candidate = await findEnrollmentProfileForDelete(
    context.client,
    task.itemName,
    template && getEnrollmentProfileType(template)
  );
  if (!candidate) return null;
  const url = `${candidate.basePath}/${candidate.id}`;
  return {
    description: candidate.description,
    target: {
      id: candidate.id,
      name: candidate.name,
      label: candidate.label,
      url,
      apiVersion: "beta",
      assignmentsUrl: `${url}/assignments`,
    },
  };
}

async function resolve(task: HydrationTask, context: ExecutionContext): Promise<DeleteResolution> {
  if (task.category === "conditionalAccess") {
    return resolveConditionalAccess(task, context);
  }

  let found: FoundObject | null;
  if (task.category === "enrollment") {
    found = await findEnrollmentObject(task, context);
  } else {
    const sources = getDeleteSources(task, context);
    if (!sources) {
      return { action: "fail", reason: `Delete is not supported for category "${task.category}"` };
    }
    found = findInCaches(task, context, sources);
  }

  if (!found) {
    return { action: "skip", skipKind: "noOp", reason: DELETE_REASONS.notFound };
  }

  const { target } = found;
  if (!hasHydrationMarker(found.description)) {
    return { action: "skip", skipKind: "blocked", reason: DELETE_REASONS.noMarker, target, checks: { marker: "missing" } };
  }

  // The description above can come from the prefetch at the start of the run. Read the
  // object again, so a marker that was removed since then (during a pause, for example)
  // blocks the delete. A read error stops the delete (the caller reports a failure).
  const current = await readCurrentObject(context, target);
  if (current === null) {
    return { action: "skip", skipKind: "noOp", reason: DELETE_REASONS.notFound };
  }
  if (!hasHydrationMarker(current.description)) {
    return { action: "skip", skipKind: "blocked", reason: DELETE_REASONS.noMarker, target, checks: { marker: "missing" } };
  }

  if (target.assignmentsUrl === null) {
    return { action: "delete", target, checks: { marker: "present", assignments: "notApplicable" } };
  }

  const assignmentCount = await readAssignmentCount(context, target.assignmentsUrl);
  if (assignmentCount > 0) {
    return {
      action: "skip",
      skipKind: "blocked",
      reason: DELETE_REASONS.assigned(assignmentCount),
      target,
      checks: { marker: "present", assignments: assignmentCount },
    };
  }
  return { action: "delete", target, checks: { marker: "present", assignments: 0 } };
}

/**
 * Resolve a delete task to a tenant object and run the safety checks.
 * Uses the prefetched tenant caches and GET requests only, so it is safe in preview mode.
 * Any error (cache not loaded, Graph read failure) gives a "fail" resolution.
 */
export async function resolveDeleteTarget(task: HydrationTask, context: ExecutionContext): Promise<DeleteResolution> {
  try {
    return await resolve(task, context);
  } catch (error) {
    // A cancelled run is not a failed safety check. The caller marks the task cancelled.
    if (isRunCancelledError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Delete] Safety checks failed for "${task.itemName}" - not deleted:`, message);
    return { action: "fail", reason: `Safety checks did not complete, so the object was not deleted: ${message}` };
  }
}

/**
 * Convert a skip or fail resolution to an execution result.
 * In preview mode a blocked skip says "Would skip", so the preview shows where live would block.
 */
export function deleteResolutionResult(
  task: HydrationTask,
  resolution: Exclude<DeleteResolution, { action: "delete" }>,
  isPreview: boolean
): ExecutionResult {
  if (resolution.action === "fail") {
    return { task, success: false, skipped: false, error: resolution.reason };
  }
  const reason = isPreview && resolution.skipKind === "blocked" ? `Would skip: ${resolution.reason}` : resolution.reason;
  return { task, success: false, skipped: true, skipKind: resolution.skipKind, error: reason };
}

/**
 * Remove a deleted object from its prefetched cache.
 */
function removeFromCache(target: DeleteTarget, context: ExecutionContext): void {
  if (!target.cacheKey) return;
  const cache = context[target.cacheKey] as Array<{ id?: string }> | undefined;
  const index = cache?.findIndex((item) => item.id === target.id) ?? -1;
  if (cache && index !== -1) {
    cache.splice(index, 1);
  }
}

export type DeleteRequestOutcome =
  | { status: "deleted" }
  | { status: "cancelled" }
  | { status: "failed"; error: Error };

/**
 * Send the DELETE request for a resolved object and remove the object from its cache
 * when it is gone. GraphClient.delete applies the retry policy (Retry-After, bounded
 * retries) and reads the object again after a 5xx or network error, so this function
 * sends the request once.
 */
export async function sendDeleteRequest(
  task: HydrationTask,
  target: DeleteTarget,
  context: ExecutionContext
): Promise<DeleteRequestOutcome> {
  try {
    await context.client.delete(target.url, target.apiVersion);
  } catch (error) {
    if (isRunCancelledError(error)) {
      return { status: "cancelled" };
    }
    const lastError = error instanceof Error ? error : new Error(String(error));
    // ResourceNotFound means that the resource is gone
    if (lastError.message.toLowerCase().includes("resourcenotfound")) {
      console.log(`[Delete] "${task.itemName}" - ResourceNotFound, treating as success`);
      removeFromCache(target, context);
      return { status: "deleted" };
    }
    return { status: "failed", error: lastError };
  }

  removeFromCache(target, context);
  return { status: "deleted" };
}

/**
 * Run a delete task on the sequential path: resolve, check, then delete.
 * The engine sets the task status from the returned result.
 */
export async function executeDeleteTask(task: HydrationTask, context: ExecutionContext): Promise<ExecutionResult> {
  const resolution = await resolveDeleteTarget(task, context);
  if (resolution.action !== "delete") {
    return deleteResolutionResult(task, resolution, context.isPreview);
  }

  if (context.isPreview) {
    return { task, success: true, skipped: false };
  }

  const outcome = await sendDeleteRequest(task, resolution.target, context);
  switch (outcome.status) {
    case "deleted":
      console.log(`[Delete] Deleted ${resolution.target.label} "${resolution.target.name}"`);
      return { task, success: true, skipped: false };
    case "cancelled":
      return { task, success: false, skipped: true, skipKind: "cancelled", error: "Cancelled" };
    case "failed":
      return { task, success: false, skipped: false, error: outcome.error.message };
  }
}
