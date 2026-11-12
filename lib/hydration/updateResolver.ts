/**
 * Update Resolver
 *
 * The single place that decides whether a create task with "Update existing kit objects"
 * may update an existing tenant object, and sends the update.
 *
 * Safety rules (every rule fails closed: if a check cannot complete, nothing is written):
 * - Only object types with a known, documented update call are updated (UPDATE_SUPPORT).
 *   Every other type is skipped with "update is not supported for this type".
 * - The object must carry the kit marker. The object is read again by ID immediately
 *   before the update and the marker is checked on that fresh copy. A read error fails
 *   the task without a write.
 * - The fresh copy is compared with the template (drift/compare.ts). An object that
 *   matches is skipped as "already matches". Only differing, updatable settings are sent.
 * - The update body holds only template-owned settings: never the name, the description,
 *   assignments, scope tags, or a Conditional Access state.
 * - Preview mode runs the same checks with GET requests only.
 */

import { hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import { isRunCancelledError } from "@/lib/utils/retry";
import type { HydrationTask, TaskCategory } from "@/types/hydration";
import type { ConflictItem, ConflictReport } from "./conflicts";
import { resolveExistingForCreate } from "./conflicts";
import { compareWithTemplate, formatDifference, type ObjectComparison } from "./drift/compare";
import { buildFilterCreateBody, buildGroupCreateBody } from "./existingObjects";
import type { ExecutionContext, ExecutionResult } from "./types";
import type { DeviceFilter, DeviceGroup } from "@/types/graph";
import type { FilterTemplate, GroupTemplate } from "@/lib/templates/loader";

type JsonRecord = Record<string, unknown>;

interface UpdateSupport {
  /** PATCH endpoint of the object. */
  path: (id: string) => string;
  apiVersion: "v1.0" | "beta";
  /** Template-owned settings that the PATCH call can change. */
  updatableFields: ReadonlySet<string>;
  /** Values of the updatable settings, from the template as the create path builds it. */
  templateValues: (template: JsonRecord) => JsonRecord;
}

/**
 * Object types that can be updated, with the Graph call.
 * - Groups: PATCH /v1.0/groups/{id} (Microsoft Graph "Update group"; membershipRule and
 *   membershipRuleProcessingState are updatable properties). groupTypes, mailEnabled and
 *   securityEnabled are not changed: a change between static and dynamic membership is not
 *   an update of the template's rule.
 * - Device filters: PATCH /beta/deviceManagement/assignmentFilters/{id} (Microsoft Graph
 *   "Update deviceAndAppManagementAssignmentFilter"; rule is updatable). The platform of a
 *   filter cannot be changed after create, so a platform difference is not updated.
 */
export const UPDATE_SUPPORT: Partial<Record<TaskCategory, UpdateSupport>> = {
  groups: {
    path: (id) => `/groups/${id}`,
    apiVersion: "v1.0",
    updatableFields: new Set(["membershipRule", "membershipRuleProcessingState"]),
    templateValues: (template) => {
      const body = buildGroupCreateBody(template as unknown as GroupTemplate | DeviceGroup);
      return { membershipRule: body.membershipRule, membershipRuleProcessingState: body.membershipRuleProcessingState };
    },
  },
  filters: {
    path: (id) => `/deviceManagement/assignmentFilters/${id}`,
    apiVersion: "beta",
    updatableFields: new Set(["rule"]),
    templateValues: (template) => ({ rule: buildFilterCreateBody(template as unknown as FilterTemplate | DeviceFilter).rule }),
  },
};

export const UPDATE_REASONS = {
  notSupported: "Already exists. Update is not supported for this type.",
  noMarker: "Already exists. Not updated: not created by the kit (no marker).",
  matches: "Already exists and matches the template.",
  cannotCompare: (reason: string) => `Already exists. Not updated: the object cannot be compared (${reason})`,
  notUpdatable: (fields: string[]) =>
    `Already exists. Not updated: ${fields.join(", ")} differs from the template and update cannot change it.`,
} as const;

export function isUpdateSupported(category: TaskCategory): boolean {
  return UPDATE_SUPPORT[category] !== undefined;
}

function rootField(path: string): string {
  return path.split(/[.[]/)[0];
}

type UpdatePlan =
  | { action: "update"; fields: string[] }
  | { action: "skip"; skipKind: "noOp" | "blocked"; reason: string };

/** Decide from a comparison which settings an update changes. */
export function planUpdate(category: TaskCategory, comparison: ObjectComparison): UpdatePlan {
  const support = UPDATE_SUPPORT[category];
  if (!support) return { action: "skip", skipKind: "noOp", reason: UPDATE_REASONS.notSupported };
  if (comparison.status === "matches") return { action: "skip", skipKind: "noOp", reason: UPDATE_REASONS.matches };
  if (comparison.status === "cannotCompare") {
    return { action: "skip", skipKind: "blocked", reason: UPDATE_REASONS.cannotCompare(comparison.reason) };
  }
  const fields = [...new Set(comparison.differences.map((difference) => rootField(difference.path)))];
  const blocked = fields.filter((field) => !support.updatableFields.has(field));
  if (blocked.length > 0) return { action: "skip", skipKind: "blocked", reason: UPDATE_REASONS.notUpdatable(blocked) };
  return { action: "update", fields };
}

/** Whether a conflict from the pre-run check would be updated. Used for the count in the review step. */
export function wouldUpdateConflict(item: ConflictItem): boolean {
  return item.marker === "present" && planUpdate(item.category, item.comparison).action === "update";
}

export function countUpdatableConflicts(report: ConflictReport): number {
  return report.conflicts.filter(wouldUpdateConflict).length;
}

function skip(task: HydrationTask, skipKind: "noOp" | "blocked", reason: string): ExecutionResult {
  return { task, success: true, skipped: true, skipKind, error: reason };
}

function fail(task: HydrationTask, reason: string): ExecutionResult {
  return { task, success: false, skipped: false, error: reason };
}

/**
 * Update the existing object of a create task, or skip it with the reason.
 * Call only when the create executor found an existing object and context.updateExisting is set.
 */
export async function updateExistingObject(task: HydrationTask, context: ExecutionContext): Promise<ExecutionResult> {
  const support = UPDATE_SUPPORT[task.category];
  if (!support) return skip(task, "noOp", UPDATE_REASONS.notSupported);

  const resolution = resolveExistingForCreate(task, context);
  if (resolution.status !== "found") {
    return fail(task, `The existing object could not be resolved, so it was not updated${resolution.status === "unchecked" ? `: ${resolution.reason}` : "."}`);
  }
  const { object } = resolution;
  if (!object.hasMarker || !object.kind) return skip(task, "blocked", UPDATE_REASONS.noMarker);

  // The marker above comes from the prefetch at the start of the run. Read the object
  // again so a marker removed since then (during a pause, for example) blocks the update.
  let fresh: JsonRecord;
  try {
    fresh = await object.read(context.client);
  } catch (error) {
    if (isRunCancelledError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return fail(task, `The object could not be read again before the update, so it was not updated: ${message}`);
  }
  if (!hasHydrationMarker(fresh.description as string | undefined)) {
    return skip(task, "blocked", UPDATE_REASONS.noMarker);
  }

  const comparison = compareWithTemplate(object.kind, object.template, fresh);
  const plan = planUpdate(task.category, comparison);
  if (plan.action === "skip") return skip(task, plan.skipKind, plan.reason);

  const values = support.templateValues(object.template);
  const body = Object.fromEntries(plan.fields.map((field) => [field, values[field]]));
  const update = { objectId: object.id, applied: !context.isPreview, differences: comparison.differences.map(formatDifference) };

  if (context.isPreview) {
    task.update = update;
    return { task, success: true, skipped: false };
  }

  try {
    await context.client.patch(support.path(object.id), body, support.apiVersion);
  } catch (error) {
    if (isRunCancelledError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return fail(task, `Update failed: ${message}`);
  }
  task.update = update;
  return { task, success: true, skipped: false };
}

/**
 * Skip reason for an existing object of a type that this run does not update, when the
 * user chose "Update existing kit objects". Other skip reasons are returned unchanged.
 */
export function getExistingSkipReason(task: HydrationTask, reason: string | undefined, context: ExecutionContext): string | undefined {
  if (!context.updateExisting || task.operation !== "create" || !reason || !/already exists/i.test(reason)) return reason;
  if (isUpdateSupported(task.category)) return reason;
  const resolution = resolveExistingForCreate(task, context);
  if (resolution.status === "found" && !resolution.object.hasMarker) return UPDATE_REASONS.noMarker;
  return UPDATE_REASONS.notSupported;
}
