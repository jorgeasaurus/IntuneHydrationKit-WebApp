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
  hasHydrationMarker,
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

function conditionalAccessCreateRequiresBetaGraph(
  policy: Record<string, unknown>
): boolean {
  const grantControls = asRecord(policy.grantControls);
  const conditions = asRecord(policy.conditions);
  const applications = asRecord(conditions?.applications);

  return (
    stringArrayIncludesAny(grantControls?.builtInControls, BETA_ONLY_GRANT_CONTROLS) ||
    stringArrayIncludesAny(applications?.includeUserActions, BETA_ONLY_USER_ACTIONS)
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

/**
 * Get all conditional access policies in the tenant
 */
async function getAllConditionalAccessPolicies(
  client: GraphClient
): Promise<ConditionalAccessPolicy[]> {
  return client.getCollection<ConditionalAccessPolicy>(CONDITIONAL_ACCESS_POLICIES_ENDPOINT);
}

/**
 * Get a conditional access policy by ID
 */
async function getConditionalAccessPolicyById(
  client: GraphClient,
  policyId: string
): Promise<ConditionalAccessPolicy> {
  return client.get<ConditionalAccessPolicy>(
    `/identity/conditionalAccess/policies/${policyId}`
  );
}

const CONDITIONAL_ACCESS_MARKER_SUFFIXES = [
  " [intune hydration kit]",
  ` [${HYDRATION_MARKER.toLowerCase()}]`,
  ` [${HYDRATION_MARKER_LEGACY.toLowerCase()}]`,
];

function hasConditionalAccessHydrationMarker(displayName: string): boolean {
  return (
    hasHydrationMarker(displayName) ||
    displayName.trim().toLowerCase().endsWith(" [intune hydration kit]")
  );
}

function normalizeConditionalAccessPolicyName(displayName: string): string {
  let normalized = displayName.trim().toLowerCase();
  const importPrefix = IMPORT_PREFIX.toLowerCase();

  if (normalized.startsWith(importPrefix)) {
    normalized = normalized.slice(importPrefix.length);
  }

  const markerSuffix = CONDITIONAL_ACCESS_MARKER_SUFFIXES.find((suffix) =>
    normalized.endsWith(suffix)
  );
  if (markerSuffix) {
    normalized = normalized.slice(0, -markerSuffix.length);
  }

  return normalized.trim();
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
 * Get a conditional access policy by display name
 */
async function getConditionalAccessPolicyByName(
  client: GraphClient,
  displayName: string
): Promise<ConditionalAccessPolicy | null> {
  const policies = await getAllConditionalAccessPolicies(client);
  const normalizedName = normalizeConditionalAccessPolicyName(displayName);

  const matches = policies.filter(
    (policy) =>
      hasConditionalAccessHydrationMarker(policy.displayName) &&
      normalizeConditionalAccessPolicyName(policy.displayName) === normalizedName
  );

  matches.sort((left, right) => {
    const priorityDifference =
      getConditionalAccessNamePriority(left.displayName, displayName) -
      getConditionalAccessNamePriority(right.displayName, displayName);
    if (priorityDifference !== 0) return priorityDifference;

    const nameDifference = left.displayName.localeCompare(right.displayName);
    if (nameDifference !== 0) return nameDifference;

    return (left.id ?? "").localeCompare(right.id ?? "");
  });

  return matches[0] ?? null;
}

/**
 * Check if a conditional access policy exists by display name (case-insensitive)
 */
export async function conditionalAccessPolicyExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const policy = await getConditionalAccessPolicyByName(client, displayName);
  return policy !== null;
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
 * Delete a conditional access policy by ID
 * Only deletes if:
 * 1. The policy was created by Intune Hydration Kit
 * 2. The policy is in DISABLED state
 */
async function deleteConditionalAccessPolicy(
  client: GraphClient,
  policyId: string
): Promise<void> {
  // First, verify the policy has the hydration marker and is disabled
  const policy = await getConditionalAccessPolicyById(client, policyId);

  if (!hasConditionalAccessHydrationMarker(policy.displayName)) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Not created by Intune Hydration Kit`
    );
  }

  if (policy.state !== "disabled") {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Policy must be disabled before deletion. Current state: ${policy.state}`
    );
  }

  await client.delete(`/identity/conditionalAccess/policies/${policyId}`);
}

/**
 * Delete a conditional access policy by display name
 * Only deletes if the policy was created by Intune Hydration Kit and is disabled
 */
export async function deleteConditionalAccessPolicyByName(
  client: GraphClient,
  displayName: string
): Promise<void> {
  const policy = await getConditionalAccessPolicyByName(client, displayName);

  if (!policy || !policy.id) {
    throw new Error(`Conditional access policy "${displayName}" not found`);
  }

  await deleteConditionalAccessPolicy(client, policy.id);
}
