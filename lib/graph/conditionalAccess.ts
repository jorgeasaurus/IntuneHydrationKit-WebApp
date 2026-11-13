/**
 * Microsoft Graph API operations for Conditional Access Policies
 * IMPORTANT: All CA policies are created in DISABLED state for safety
 */

import { GraphClient } from "./client";
import type { ApiVersion } from "@/lib/graph/batch";
import { ConditionalAccessPolicy } from "@/types/graph";
import {
  HYDRATION_MARKER,
  HYDRATION_MARKER_LEGACY,
  IMPORT_PREFIX,
  hasConditionalAccessHydrationMarker,
  normalizeConditionalAccessPolicyName,
} from "@/lib/utils/hydrationMarker";

export const CONDITIONAL_ACCESS_POLICIES_ENDPOINT =
  "/identity/conditionalAccess/policies";

const TOP_LEVEL_CREATE_OMIT_KEYS = new Set([
  "id",
  "createdDateTime",
  "modifiedDateTime",
  "deletedDateTime",
]);
const BETA_ONLY_GRANT_CONTROLS = new Set(["verifiedID"]);
const BETA_ONLY_USER_ACTIONS = new Set(["urn:user:accountrecovery"]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function stringArrayIncludesAny(value: unknown, expected: Set<string>): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && expected.has(item));
}

function normalizeCreateValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeCreateValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value !== "object") {
    return value;
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === "@odata.context" ||
      key.endsWith("@odata.context") ||
      (depth === 0 && TOP_LEVEL_CREATE_OMIT_KEYS.has(key))
    ) {
      continue;
    }

    const normalizedValue = normalizeCreateValue(nestedValue, depth + 1);
    if (normalizedValue !== undefined) {
      normalized[key] = normalizedValue;
    }
  }

  return normalized;
}

function normalizeConditionalAccessPolicyForCreate(
  policy: Record<string, unknown>
): Record<string, unknown> {
  return normalizeCreateValue(policy) as Record<string, unknown>;
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * True when the policy uses a condition for agents. The Graph v1.0 schema has none of
 * these: `agents` (agent users), the agent identity lists of `clientApplications`, and
 * `agentIdRiskLevels` are in the beta schema only.
 */
function targetsAgents(conditions: Record<string, unknown> | undefined): boolean {
  const agents = asRecord(conditions?.agents);
  const clientApplications = asRecord(conditions?.clientApplications);
  return (
    isNonEmptyArray(agents?.includeAgentUsers) ||
    isNonEmptyArray(agents?.excludeAgentUsers) ||
    asRecord(agents?.agentFilter) !== undefined ||
    isNonEmptyArray(clientApplications?.includeAgentIdServicePrincipals) ||
    isNonEmptyArray(clientApplications?.excludeAgentIdServicePrincipals) ||
    asRecord(clientApplications?.agentIdServicePrincipalFilter) !== undefined ||
    (conditions?.agentIdRiskLevels !== undefined && conditions.agentIdRiskLevels !== null)
  );
}

function conditionalAccessCreateRequiresBetaGraph(
  policy: Record<string, unknown>
): boolean {
  const grantControls = asRecord(policy.grantControls);
  const conditions = asRecord(policy.conditions);
  const applications = asRecord(conditions?.applications);

  return (
    stringArrayIncludesAny(grantControls?.builtInControls, BETA_ONLY_GRANT_CONTROLS) ||
    stringArrayIncludesAny(applications?.includeUserActions, BETA_ONLY_USER_ACTIONS) ||
    targetsAgents(conditions)
  );
}

function getConditionalAccessCreateApiVersion(
  policy: Record<string, unknown>
): ApiVersion {
  return conditionalAccessCreateRequiresBetaGraph(policy) ? "beta" : "v1.0";
}

interface ConditionalAccessCreatePlan {
  endpoint: typeof CONDITIONAL_ACCESS_POLICIES_ENDPOINT;
  payload: Record<string, unknown>;
  apiVersion: ApiVersion;
}

export function buildConditionalAccessCreatePlan(
  policy: Record<string, unknown>
): ConditionalAccessCreatePlan {
  const displayName = typeof policy.displayName === "string" ? policy.displayName : "";
  const markedDisplayName = hasConditionalAccessHydrationMarker(displayName)
    ? displayName
    : `${displayName} [${HYDRATION_MARKER}]`.trim();
  const payload = normalizeConditionalAccessPolicyForCreate({
    ...policy,
    displayName: markedDisplayName,
    state: "disabled",
  });

  return {
    endpoint: CONDITIONAL_ACCESS_POLICIES_ENDPOINT,
    payload,
    apiVersion: getConditionalAccessCreateApiVersion(payload),
  };
}

function getConditionalAccessNamePriority(
  policyName: string,
  requestedName: string
): number {
  const normalizedPolicyName = policyName.trim().toLowerCase();
  const normalizedRequestedName = requestedName.trim().toLowerCase();

  if (normalizedPolicyName === normalizedRequestedName) return 0;
  if (normalizedPolicyName.endsWith(` [${HYDRATION_MARKER.toLowerCase()}]`)) return 1;
  if (normalizedPolicyName.startsWith(IMPORT_PREFIX.toLowerCase())) return 2;
  if (normalizedPolicyName.endsWith(` [${HYDRATION_MARKER_LEGACY.toLowerCase()}]`)) return 3;
  if (normalizedPolicyName.endsWith(" [intune hydration kit]")) return 4;
  return 5;
}

/**
 * Find the kit-created Conditional Access policy that matches a display name.
 * Only policies with the hydration marker in the display name can match, so a
 * policy with the same base name that an administrator created is never selected.
 */
export function findHydrationConditionalAccessPolicy<T extends { id?: string; displayName?: string }>(
  policies: T[],
  displayName: string
): T | null {
  const normalizedName = normalizeConditionalAccessPolicyName(displayName);

  const matches = policies.filter(
    (policy) =>
      policy.displayName !== undefined &&
      hasConditionalAccessHydrationMarker(policy.displayName) &&
      normalizeConditionalAccessPolicyName(policy.displayName) === normalizedName
  );

  matches.sort((left, right) => {
    const leftName = left.displayName ?? "";
    const rightName = right.displayName ?? "";
    const priorityDifference =
      getConditionalAccessNamePriority(leftName, displayName) -
      getConditionalAccessNamePriority(rightName, displayName);
    if (priorityDifference !== 0) return priorityDifference;

    const nameDifference = leftName.localeCompare(rightName);
    if (nameDifference !== 0) return nameDifference;

    return (left.id ?? "").localeCompare(right.id ?? "");
  });

  return matches[0] ?? null;
}

/**
 * Create a new conditional access policy
 * ALWAYS created in DISABLED state for safety
 */
export async function createConditionalAccessPolicy(
  client: GraphClient,
  policy: ConditionalAccessPolicy
): Promise<ConditionalAccessPolicy> {
  const plan = buildConditionalAccessCreatePlan(policy as Record<string, unknown>);

  return client.post<ConditionalAccessPolicy>(
    plan.endpoint,
    plan.payload,
    plan.apiVersion
  );
}

/**
 * Read a Conditional Access policy again immediately before delete and get the
 * reason why it must not be deleted. The prefetched list can be old: an
 * administrator can enable a policy while the run is in progress.
 * Returns null when the policy has the hydration marker and is disabled.
 * Throws when the policy cannot be read, so the caller does not delete it.
 */
export async function getConditionalAccessDeleteBlockReason(
  client: GraphClient,
  policyId: string
): Promise<string | null> {
  const policy = await client.get<ConditionalAccessPolicy>(
    `${CONDITIONAL_ACCESS_POLICIES_ENDPOINT}/${policyId}`
  );

  if (!hasConditionalAccessHydrationMarker(policy.displayName)) {
    return "Not created by Intune Hydration Kit (no marker in the display name)";
  }

  if (policy.state !== "disabled") {
    return `Policy state is "${policy.state}". Disable the policy before you delete it.`;
  }

  return null;
}
