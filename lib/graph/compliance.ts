/**
 * Microsoft Graph API operations for Compliance Policies
 */

import { GraphClient } from "./client";
import { CompliancePolicy } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

/**
 * Get all compliance policies in the tenant
 */
export async function getAllCompliancePolicies(
  client: GraphClient
): Promise<CompliancePolicy[]> {
  return client.getCollection<CompliancePolicy>("/deviceManagement/deviceCompliancePolicies");
}

/**
 * Get compliance policies created by Intune Hydration Kit
 */
export async function getHydrationKitCompliancePolicies(
  client: GraphClient
): Promise<CompliancePolicy[]> {
  const policies = await getAllCompliancePolicies(client);
  return policies.filter((policy) => policy.description?.includes(HYDRATION_MARKER));
}

/**
 * Get a compliance policy by ID
 */
export async function getCompliancePolicyById(
  client: GraphClient,
  policyId: string
): Promise<CompliancePolicy> {
  return client.get<CompliancePolicy>(
    `/deviceManagement/deviceCompliancePolicies/${policyId}`
  );
}

/**
 * Get a compliance policy by display name
 */
export async function getCompliancePolicyByName(
  client: GraphClient,
  displayName: string
): Promise<CompliancePolicy | null> {
  const policies = await getAllCompliancePolicies(client);
  const found = policies.find(
    (policy) => policy.displayName.toLowerCase() === displayName.toLowerCase()
  );
  return found || null;
}

/**
 * Check if a compliance policy exists by display name (case-insensitive)
 */
export async function compliancePolicyExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const policy = await getCompliancePolicyByName(client, displayName);
  return policy !== null;
}

/**
 * Get compliance policies by platform type
 */
export async function getCompliancePoliciesByPlatform(
  client: GraphClient,
  odataType: string
): Promise<CompliancePolicy[]> {
  const policies = await getAllCompliancePolicies(client);
  return policies.filter((policy) => policy["@odata.type"] === odataType);
}

/**
 * Create a new compliance policy
 */
export async function createCompliancePolicy(
  client: GraphClient,
  policy: CompliancePolicy
): Promise<CompliancePolicy> {
  // Ensure the hydration marker is in the description
  if (!policy.description?.includes(HYDRATION_MARKER)) {
    policy.description = `${policy.description || ""} ${HYDRATION_MARKER}`.trim();
  }

  return client.post<CompliancePolicy>(
    "/deviceManagement/deviceCompliancePolicies",
    policy
  );
}

/**
 * Update an existing compliance policy
 */
export async function updateCompliancePolicy(
  client: GraphClient,
  policyId: string,
  updates: Partial<CompliancePolicy>
): Promise<CompliancePolicy> {
  return client.patch<CompliancePolicy>(
    `/deviceManagement/deviceCompliancePolicies/${policyId}`,
    updates
  );
}

/**
 * Delete a compliance policy by ID
 * Only deletes if the policy was created by Intune Hydration Kit
 */
export async function deleteCompliancePolicy(
  client: GraphClient,
  policyId: string
): Promise<void> {
  // First, verify the policy has the hydration marker
  const policy = await getCompliancePolicyById(client, policyId);

  if (!policy.description?.includes(HYDRATION_MARKER)) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Not created by Intune Hydration Kit`
    );
  }

  await client.delete(`/deviceManagement/deviceCompliancePolicies/${policyId}`);
}

/**
 * Delete a compliance policy by display name
 * Only deletes if the policy was created by Intune Hydration Kit
 */
export async function deleteCompliancePolicyByName(
  client: GraphClient,
  displayName: string
): Promise<void> {
  const policy = await getCompliancePolicyByName(client, displayName);

  if (!policy) {
    throw new Error(`Compliance policy "${displayName}" not found`);
  }

  if (!policy.description?.includes(HYDRATION_MARKER)) {
    throw new Error(
      `Cannot delete policy "${displayName}": Not created by Intune Hydration Kit`
    );
  }

  if (!policy.id) {
    throw new Error(`Policy "${displayName}" has no ID`);
  }

  await client.delete(`/deviceManagement/deviceCompliancePolicies/${policy.id}`);
}

/**
 * Get assignments for a compliance policy
 */
export async function getCompliancePolicyAssignments(
  client: GraphClient,
  policyId: string
): Promise<unknown[]> {
  return client.getCollection(
    `/deviceManagement/deviceCompliancePolicies/${policyId}/assignments`
  );
}

/**
 * Assign a compliance policy to a group
 */
export async function assignCompliancePolicy(
  client: GraphClient,
  policyId: string,
  groupId: string,
  filterId?: string,
  filterMode?: "include" | "exclude"
): Promise<unknown> {
  const assignment = {
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId,
      deviceAndAppManagementAssignmentFilterId: filterId || null,
      deviceAndAppManagementAssignmentFilterType: filterMode || "none",
    },
  };

  return client.post(
    `/deviceManagement/deviceCompliancePolicies/${policyId}/assignments`,
    assignment
  );
}

/**
 * Get compliance policy device status
 */
export async function getCompliancePolicyDeviceStatus(
  client: GraphClient,
  policyId: string
): Promise<{
  compliantDeviceCount: number;
  nonCompliantDeviceCount: number;
  errorDeviceCount: number;
  conflictDeviceCount: number;
}> {
  try {
    const status = await client.get<{
      compliantDeviceCount: number;
      nonCompliantDeviceCount: number;
      errorDeviceCount: number;
      conflictDeviceCount: number;
    }>(`/deviceManagement/deviceCompliancePolicies/${policyId}/deviceStatuses`);
    return status;
  } catch {
    // Return zeros if status not available
    return {
      compliantDeviceCount: 0,
      nonCompliantDeviceCount: 0,
      errorDeviceCount: 0,
      conflictDeviceCount: 0,
    };
  }
}

/**
 * Batch create multiple compliance policies
 * Returns array of results with success/failure status
 */
export async function batchCreateCompliancePolicies(
  client: GraphClient,
  policies: CompliancePolicy[]
): Promise<
  Array<{ policy: CompliancePolicy; success: boolean; error?: string; id?: string }>
> {
  const results: Array<{
    policy: CompliancePolicy;
    success: boolean;
    error?: string;
    id?: string;
  }> = [];

  for (const policy of policies) {
    try {
      // Check if policy already exists
      const exists = await compliancePolicyExists(client, policy.displayName);
      if (exists) {
        results.push({
          policy,
          success: false,
          error: "Policy already exists",
        });
        continue;
      }

      // Create the policy
      const createdPolicy = await createCompliancePolicy(client, policy);
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
 * Batch delete multiple compliance policies created by Intune Hydration Kit
 */
export async function batchDeleteCompliancePolicies(
  client: GraphClient,
  policyIds: string[]
): Promise<Array<{ policyId: string; success: boolean; error?: string }>> {
  const results: Array<{ policyId: string; success: boolean; error?: string }> = [];

  for (const policyId of policyIds) {
    try {
      await deleteCompliancePolicy(client, policyId);
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
