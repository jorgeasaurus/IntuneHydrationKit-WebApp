/**
 * Microsoft Graph API operations for Conditional Access Policies
 * IMPORTANT: All CA policies are created in DISABLED state for safety
 */

import { GraphClient } from "./client";
import { ConditionalAccessPolicy } from "@/types/graph";
import { HYDRATION_MARKER, hasHydrationMarker } from "@/lib/utils/hydrationMarker";

/**
 * Get all conditional access policies in the tenant
 */
export async function getAllConditionalAccessPolicies(
  client: GraphClient
): Promise<ConditionalAccessPolicy[]> {
  return client.getCollection<ConditionalAccessPolicy>("/identity/conditionalAccess/policies");
}

/**
 * Get conditional access policies created by Intune Hydration Kit
 */
export async function getHydrationKitConditionalAccessPolicies(
  client: GraphClient
): Promise<ConditionalAccessPolicy[]> {
  const policies = await getAllConditionalAccessPolicies(client);
  return policies.filter((policy) => hasHydrationMarker(policy.displayName));
}

/**
 * Get a conditional access policy by ID
 */
export async function getConditionalAccessPolicyById(
  client: GraphClient,
  policyId: string
): Promise<ConditionalAccessPolicy> {
  return client.get<ConditionalAccessPolicy>(
    `/identity/conditionalAccess/policies/${policyId}`
  );
}

/**
 * Get a conditional access policy by display name
 */
export async function getConditionalAccessPolicyByName(
  client: GraphClient,
  displayName: string
): Promise<ConditionalAccessPolicy | null> {
  const policies = await getAllConditionalAccessPolicies(client);
  const found = policies.find(
    (policy) => policy.displayName.toLowerCase() === displayName.toLowerCase()
  );
  return found || null;
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
 * Get conditional access policies by state
 */
export async function getConditionalAccessPoliciesByState(
  client: GraphClient,
  state: ConditionalAccessPolicy["state"]
): Promise<ConditionalAccessPolicy[]> {
  const policies = await getAllConditionalAccessPolicies(client);
  return policies.filter((policy) => policy.state === state);
}

/**
 * Create a new conditional access policy
 * ALWAYS created in DISABLED state for safety
 */
export async function createConditionalAccessPolicy(
  client: GraphClient,
  policy: ConditionalAccessPolicy
): Promise<ConditionalAccessPolicy> {
  // CRITICAL: Force policy to disabled state for safety
  policy.state = "disabled";

  // Add hydration marker to display name
  if (!hasHydrationMarker(policy.displayName)) {
    policy.displayName = `${policy.displayName || ""} [${HYDRATION_MARKER}]`.trim();
  }

  return client.post<ConditionalAccessPolicy>(
    "/identity/conditionalAccess/policies",
    policy
  );
}

/**
 * Update an existing conditional access policy
 */
export async function updateConditionalAccessPolicy(
  client: GraphClient,
  policyId: string,
  updates: Partial<ConditionalAccessPolicy>
): Promise<ConditionalAccessPolicy> {
  return client.patch<ConditionalAccessPolicy>(
    `/identity/conditionalAccess/policies/${policyId}`,
    updates
  );
}

/**
 * Enable a conditional access policy
 * Only allows enabling policies created by Intune Hydration Kit
 */
export async function enableConditionalAccessPolicy(
  client: GraphClient,
  policyId: string
): Promise<ConditionalAccessPolicy> {
  const policy = await getConditionalAccessPolicyById(client, policyId);

  if (!hasHydrationMarker(policy.displayName)) {
    throw new Error(
      `Cannot enable policy "${policy.displayName}": Not created by Intune Hydration Kit`
    );
  }

  return updateConditionalAccessPolicy(client, policyId, { state: "enabled" });
}

/**
 * Disable a conditional access policy
 */
export async function disableConditionalAccessPolicy(
  client: GraphClient,
  policyId: string
): Promise<ConditionalAccessPolicy> {
  return updateConditionalAccessPolicy(client, policyId, { state: "disabled" });
}

/**
 * Delete a conditional access policy by ID
 * Only deletes if:
 * 1. The policy was created by Intune Hydration Kit
 * 2. The policy is in DISABLED state
 */
export async function deleteConditionalAccessPolicy(
  client: GraphClient,
  policyId: string
): Promise<void> {
  // First, verify the policy has the hydration marker and is disabled
  const policy = await getConditionalAccessPolicyById(client, policyId);

  if (!hasHydrationMarker(policy.displayName)) {
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

/**
 * Batch create multiple conditional access policies
 * All policies are created in DISABLED state
 * Returns array of results with success/failure status
 */
export async function batchCreateConditionalAccessPolicies(
  client: GraphClient,
  policies: ConditionalAccessPolicy[]
): Promise<
  Array<{ policy: ConditionalAccessPolicy; success: boolean; error?: string; id?: string }>
> {
  const results: Array<{
    policy: ConditionalAccessPolicy;
    success: boolean;
    error?: string;
    id?: string;
  }> = [];

  for (const policy of policies) {
    try {
      // Check if policy already exists
      const exists = await conditionalAccessPolicyExists(client, policy.displayName);
      if (exists) {
        results.push({
          policy,
          success: false,
          error: "Policy already exists",
        });
        continue;
      }

      // Create the policy (will be forced to disabled state)
      const createdPolicy = await createConditionalAccessPolicy(client, policy);
      results.push({
        policy,
        success: true,
        id: createdPolicy.id,
      });
    } catch (error) {
      results.push({
        policy,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Batch delete multiple conditional access policies created by Intune Hydration Kit
 * Only deletes policies that are in DISABLED state
 */
export async function batchDeleteConditionalAccessPolicies(
  client: GraphClient,
  policyIds: string[]
): Promise<Array<{ policyId: string; success: boolean; error?: string }>> {
  const results: Array<{ policyId: string; success: boolean; error?: string }> = [];

  for (const policyId of policyIds) {
    try {
      await deleteConditionalAccessPolicy(client, policyId);
      results.push({ policyId, success: true });
    } catch (error) {
      results.push({
        policyId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Batch disable multiple conditional access policies
 * Useful before deletion or for emergency disable
 */
export async function batchDisableConditionalAccessPolicies(
  client: GraphClient,
  policyIds: string[]
): Promise<Array<{ policyId: string; success: boolean; error?: string }>> {
  const results: Array<{ policyId: string; success: boolean; error?: string }> = [];

  for (const policyId of policyIds) {
    try {
      await disableConditionalAccessPolicy(client, policyId);
      results.push({ policyId, success: true });
    } catch (error) {
      results.push({
        policyId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Get named locations (used in conditional access policies)
 */
export async function getNamedLocations(client: GraphClient): Promise<unknown[]> {
  return client.getCollection("/identity/conditionalAccess/namedLocations");
}

/**
 * Validate conditional access policy configuration
 * Checks for common issues before creation
 */
export function validateConditionalAccessPolicy(
  policy: ConditionalAccessPolicy
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!policy.displayName) {
    errors.push("Policy must have a display name");
  }

  if (!policy.conditions) {
    errors.push("Policy must have conditions defined");
  }

  if (!policy.grantControls && !policy.sessionControls) {
    errors.push("Policy must have either grant controls or session controls");
  }

  if (policy.state !== "disabled") {
    errors.push("Policy state must be 'disabled' for safety");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
