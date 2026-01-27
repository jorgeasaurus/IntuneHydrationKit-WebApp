/**
 * Microsoft Graph API operations for App Protection Policies (MAM)
 */

import { GraphClient } from "./client";
import { AppProtectionPolicy } from "@/types/graph";
import { hasHydrationMarker, addHydrationMarker } from "@/lib/utils/hydrationMarker";

/**
 * Get all iOS app protection policies
 */
export async function getiOSAppProtectionPolicies(
  client: GraphClient
): Promise<AppProtectionPolicy[]> {
  return client.getCollection<AppProtectionPolicy>(
    "/deviceAppManagement/iosManagedAppProtections"
  );
}

/**
 * Get all Android app protection policies
 */
export async function getAndroidAppProtectionPolicies(
  client: GraphClient
): Promise<AppProtectionPolicy[]> {
  return client.getCollection<AppProtectionPolicy>(
    "/deviceAppManagement/androidManagedAppProtections"
  );
}

/**
 * Get all app protection policies (iOS and Android)
 * Tags each policy with _platform property for delete operations
 */
export async function getAllAppProtectionPolicies(
  client: GraphClient
): Promise<AppProtectionPolicy[]> {
  const [iosPolicies, androidPolicies] = await Promise.all([
    getiOSAppProtectionPolicies(client),
    getAndroidAppProtectionPolicies(client),
  ]);

  // Tag each policy with its platform (Graph API collection responses don't include @odata.type reliably)
  const taggedIosPolicies = iosPolicies.map(p => ({ ...p, _platform: "iOS" as const }));
  const taggedAndroidPolicies = androidPolicies.map(p => ({ ...p, _platform: "android" as const }));

  return [...taggedIosPolicies, ...taggedAndroidPolicies];
}

/**
 * Get app protection policies created by Intune Hydration Kit
 */
export async function getHydrationKitAppProtectionPolicies(
  client: GraphClient
): Promise<AppProtectionPolicy[]> {
  const policies = await getAllAppProtectionPolicies(client);
  return policies.filter((policy) => hasHydrationMarker(policy.description));
}

/**
 * Get an app protection policy by ID
 */
export async function getAppProtectionPolicyById(
  client: GraphClient,
  policyId: string,
  platform: "iOS" | "android"
): Promise<AppProtectionPolicy> {
  const endpoint =
    platform === "iOS"
      ? `/deviceAppManagement/iosManagedAppProtections/${policyId}`
      : `/deviceAppManagement/androidManagedAppProtections/${policyId}`;

  return client.get<AppProtectionPolicy>(endpoint);
}

/**
 * Get an app protection policy by display name
 */
export async function getAppProtectionPolicyByName(
  client: GraphClient,
  displayName: string
): Promise<AppProtectionPolicy | null> {
  const policies = await getAllAppProtectionPolicies(client);
  const found = policies.find(
    (policy) => policy.displayName.toLowerCase() === displayName.toLowerCase()
  );
  return found || null;
}

/**
 * Check if an app protection policy exists by display name (case-insensitive)
 */
export async function appProtectionPolicyExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const policy = await getAppProtectionPolicyByName(client, displayName);
  return policy !== null;
}

/**
 * Recursively clean a policy object to remove OData metadata
 * Keeps @odata.type but removes all other @odata.* properties, ids, timestamps, etc.
 */
function cleanAppProtectionPolicyRecursively(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => cleanAppProtectionPolicyRecursively(item));
  }

  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    const excludeFields = [
      // OData metadata
      "@odata.context", "@odata.id", "@odata.editLink",
      // Timestamps and version
      "createdDateTime", "lastModifiedDateTime", "version",
      // OData actions
      "#microsoft.graph.assign",
      // Read-only properties that cause "The request is invalid" errors
      "isAssigned",
      "deployedAppCount",
      // ID should always be removed (new policies get their own ID)
      "id",
      // Deprecated or read-only properties that cause API errors
      "fingerprintAndBiometricEnabled",
      "mobileThreatDefensePartnerPriority",
      "gracePeriodToBlockAppsDuringOffClockHours",
      "appActionIfDevicePasscodeComplexityLessThanLow",
      "appActionIfDevicePasscodeComplexityLessThanHigh",
      // Navigation/computed properties from OIB templates
      "apps",
      "assignments",
      "deploymentSummary",
      "targetedAppManagementLevels",
      // Custom display name properties that are computed
      "customBrowserDisplayName",
      "customDialerAppDisplayName",
      // Internal platform tag (used for delete operations only)
      "_platform",
    ];

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip excluded fields
      if (excludeFields.includes(key)) {
        continue;
      }

      // Skip any property containing @odata. (except @odata.type)
      if (key.includes("@odata.") && key !== "@odata.type") {
        continue;
      }

      // Skip properties starting with # (OData actions)
      if (key.startsWith("#")) {
        continue;
      }

      // Recursively clean nested objects and arrays
      cleaned[key] = cleanAppProtectionPolicyRecursively(value);
    }

    return cleaned;
  }

  return obj;
}

/**
 * Create a new iOS app protection policy
 */
export async function createiOSAppProtectionPolicy(
  client: GraphClient,
  policy: AppProtectionPolicy
): Promise<AppProtectionPolicy> {
  const policyBody = cleanAppProtectionPolicyRecursively(policy) as AppProtectionPolicy;
  policyBody.description = addHydrationMarker(policyBody.description);

  // Remove empty iOS device model allowlist (per PowerShell script logic)
  if (policyBody.allowedIosDeviceModels === "") {
    delete policyBody.allowedIosDeviceModels;
  }

  return client.post<AppProtectionPolicy>(
    "/deviceAppManagement/iosManagedAppProtections",
    policyBody
  );
}

/**
 * Create a new Android app protection policy
 */
export async function createAndroidAppProtectionPolicy(
  client: GraphClient,
  policy: AppProtectionPolicy
): Promise<AppProtectionPolicy> {
  const policyBody = cleanAppProtectionPolicyRecursively(policy) as AppProtectionPolicy;
  policyBody.description = addHydrationMarker(policyBody.description);

  // Remove empty Android device manufacturer allowlist (per PowerShell script logic)
  if (policyBody.allowedAndroidDeviceManufacturers === "") {
    delete policyBody.allowedAndroidDeviceManufacturers;
  }

  return client.post<AppProtectionPolicy>(
    "/deviceAppManagement/androidManagedAppProtections",
    policyBody
  );
}

/**
 * Create an app protection policy (auto-detects platform from @odata.type)
 */
export async function createAppProtectionPolicy(
  client: GraphClient,
  policy: AppProtectionPolicy
): Promise<AppProtectionPolicy> {
  const isiOS = policy["@odata.type"] === "#microsoft.graph.iosManagedAppProtection";
  return isiOS
    ? createiOSAppProtectionPolicy(client, policy)
    : createAndroidAppProtectionPolicy(client, policy);
}

/**
 * Update an existing app protection policy
 */
export async function updateAppProtectionPolicy(
  client: GraphClient,
  policyId: string,
  platform: "iOS" | "android",
  updates: Partial<AppProtectionPolicy>
): Promise<AppProtectionPolicy> {
  const endpoint =
    platform === "iOS"
      ? `/deviceAppManagement/iosManagedAppProtections/${policyId}`
      : `/deviceAppManagement/androidManagedAppProtections/${policyId}`;

  return client.patch<AppProtectionPolicy>(endpoint, updates);
}

/**
 * Delete an iOS app protection policy by ID
 * Only deletes if the policy was created by Intune Hydration Kit and has no assignments
 */
export async function deleteiOSAppProtectionPolicy(
  client: GraphClient,
  policyId: string
): Promise<void> {
  const policy = await getAppProtectionPolicyById(client, policyId, "iOS");

  if (!hasHydrationMarker(policy.description)) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Not created by Intune Hydration Kit`
    );
  }

  const assignments = await getAppProtectionPolicyAssignments(client, policyId, "iOS");
  if (assignments.length > 0) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Policy has ${assignments.length} assignment(s). Remove all assignments before deleting.`
    );
  }

  await client.delete(`/deviceAppManagement/iosManagedAppProtections/${policyId}`);
}

/**
 * Delete an Android app protection policy by ID
 * Only deletes if the policy was created by Intune Hydration Kit and has no assignments
 */
export async function deleteAndroidAppProtectionPolicy(
  client: GraphClient,
  policyId: string
): Promise<void> {
  const policy = await getAppProtectionPolicyById(client, policyId, "android");

  if (!hasHydrationMarker(policy.description)) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Not created by Intune Hydration Kit`
    );
  }

  const assignments = await getAppProtectionPolicyAssignments(client, policyId, "android");
  if (assignments.length > 0) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Policy has ${assignments.length} assignment(s). Remove all assignments before deleting.`
    );
  }

  await client.delete(`/deviceAppManagement/androidManagedAppProtections/${policyId}`);
}

/**
 * Delete an app protection policy (auto-detects platform)
 */
export async function deleteAppProtectionPolicy(
  client: GraphClient,
  policyId: string,
  platform: "iOS" | "android"
): Promise<void> {
  return platform === "iOS"
    ? deleteiOSAppProtectionPolicy(client, policyId)
    : deleteAndroidAppProtectionPolicy(client, policyId);
}

/**
 * Get assignments for an app protection policy
 */
export async function getAppProtectionPolicyAssignments(
  client: GraphClient,
  policyId: string,
  platform: "iOS" | "android"
): Promise<unknown[]> {
  const endpoint =
    platform === "iOS"
      ? `/deviceAppManagement/iosManagedAppProtections/${policyId}/assignments`
      : `/deviceAppManagement/androidManagedAppProtections/${policyId}/assignments`;

  return client.getCollection(endpoint);
}

/**
 * Assign an app protection policy to a group
 */
export async function assignAppProtectionPolicy(
  client: GraphClient,
  policyId: string,
  platform: "iOS" | "android",
  groupId: string
): Promise<unknown> {
  const endpoint =
    platform === "iOS"
      ? `/deviceAppManagement/iosManagedAppProtections/${policyId}/assignments`
      : `/deviceAppManagement/androidManagedAppProtections/${policyId}/assignments`;

  const assignment = {
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId,
    },
  };

  return client.post(endpoint, assignment);
}

/**
 * Batch create multiple app protection policies
 * Returns array of results with success/failure status
 */
export async function batchCreateAppProtectionPolicies(
  client: GraphClient,
  policies: AppProtectionPolicy[]
): Promise<
  Array<{ policy: AppProtectionPolicy; success: boolean; error?: string; id?: string }>
> {
  const results: Array<{
    policy: AppProtectionPolicy;
    success: boolean;
    error?: string;
    id?: string;
  }> = [];

  for (const policy of policies) {
    try {
      // Check if policy already exists
      const exists = await appProtectionPolicyExists(client, policy.displayName);
      if (exists) {
        results.push({
          policy,
          success: false,
          error: "Policy already exists",
        });
        continue;
      }

      // Create the policy
      const createdPolicy = await createAppProtectionPolicy(client, policy);
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
 * Batch delete multiple app protection policies created by Intune Hydration Kit
 */
export async function batchDeleteAppProtectionPolicies(
  client: GraphClient,
  policies: Array<{ policyId: string; platform: "iOS" | "android" }>
): Promise<Array<{ policyId: string; success: boolean; error?: string }>> {
  const results: Array<{ policyId: string; success: boolean; error?: string }> = [];

  for (const { policyId, platform } of policies) {
    try {
      await deleteAppProtectionPolicy(client, policyId, platform);
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
