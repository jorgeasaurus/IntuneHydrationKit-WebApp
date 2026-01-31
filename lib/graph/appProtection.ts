/**
 * Microsoft Graph API operations for App Protection Policies (MAM)
 */

import { GraphClient } from "./client";
import { AppProtectionPolicy, DeletionResult } from "@/types/graph";
import { hasHydrationMarker, addHydrationMarker } from "@/lib/utils/hydrationMarker";

type AppProtectionPlatform = "iOS" | "android";

const PLATFORM_ENDPOINTS: Record<AppProtectionPlatform, string> = {
  iOS: "/deviceAppManagement/iosManagedAppProtections",
  android: "/deviceAppManagement/androidManagedAppProtections",
};

function getPlatformEndpoint(platform: AppProtectionPlatform, policyId?: string): string {
  const base = PLATFORM_ENDPOINTS[platform];
  return policyId ? `${base}/${policyId}` : base;
}

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
  platform: AppProtectionPlatform
): Promise<AppProtectionPolicy> {
  return client.get<AppProtectionPolicy>(getPlatformEndpoint(platform, policyId));
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

    // Fields where empty string should be removed entirely
    const removeIfEmptyString = [
      "customBrowserProtocol",
      "customDialerAppProtocol",
      "customBrowserPackageId",
      "customDialerAppPackageId",
      "allowedIosDeviceModels",
      "allowedAndroidDeviceManufacturers",
    ];

    // Fields where empty array should be removed entirely
    const removeIfEmptyArray = [
      "allowedAndroidDeviceModels",
      "exemptedAppPackages",
      "approvedKeyboards",
    ];

    // Fields where null value should be removed entirely (optional properties)
    const removeIfNull = [
      "maximumRequiredOsVersion",
      "maximumWarningOsVersion",
      "maximumWipeOsVersion",
      "minimumRequiredOsVersion",
      "minimumWarningOsVersion",
      "minimumRequiredAppVersion",
      "minimumWarningAppVersion",
      "minimumWipeOsVersion",
      "minimumWipeAppVersion",
      "minimumRequiredSdkVersion",
      "minimumWipeSdkVersion",
      "minimumWarningSdkVersion",
      "minimumRequiredCompanyPortalVersion",
      "minimumWarningCompanyPortalVersion",
      "minimumWipeCompanyPortalVersion",
      "allowedIosDeviceModels",
      "allowedAndroidDeviceManufacturers",
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

      // Skip empty strings for specific fields
      if (removeIfEmptyString.includes(key) && value === "") {
        continue;
      }

      // Skip empty arrays for specific fields
      if (removeIfEmptyArray.includes(key) && Array.isArray(value) && value.length === 0) {
        continue;
      }

      // Skip null values for optional properties
      if (removeIfNull.includes(key) && value === null) {
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
  platform: AppProtectionPlatform,
  updates: Partial<AppProtectionPolicy>
): Promise<AppProtectionPolicy> {
  return client.patch<AppProtectionPolicy>(getPlatformEndpoint(platform, policyId), updates);
}

/**
 * Delete an app protection policy by ID
 * Only deletes if created by Intune Hydration Kit and has no active assignments
 */
export async function deleteAppProtectionPolicy(
  client: GraphClient,
  policyId: string,
  platform: AppProtectionPlatform
): Promise<DeletionResult> {
  const policy = await getAppProtectionPolicyById(client, policyId, platform);

  if (!hasHydrationMarker(policy.description)) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Not created by Intune Hydration Kit`
    );
  }

  const assignments = await getAppProtectionPolicyAssignments(client, policyId, platform);
  if (assignments.length > 0) {
    console.log(`[AppProtection] Skipping deletion of ${platform} policy "${policy.displayName}" - has ${assignments.length} active assignment(s)`);
    return {
      deleted: false,
      skipped: true,
      reason: `Policy has ${assignments.length} active assignment(s)`
    };
  }

  await client.delete(`${PLATFORM_ENDPOINTS[platform]}/${policyId}`);
  return { deleted: true, skipped: false };
}

/**
 * Get assignments for an app protection policy
 */
export async function getAppProtectionPolicyAssignments(
  client: GraphClient,
  policyId: string,
  platform: AppProtectionPlatform
): Promise<unknown[]> {
  return client.getCollection(`${getPlatformEndpoint(platform, policyId)}/assignments`);
}

/**
 * Assign an app protection policy to a group
 */
export async function assignAppProtectionPolicy(
  client: GraphClient,
  policyId: string,
  platform: AppProtectionPlatform,
  groupId: string
): Promise<unknown> {
  const assignment = {
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId,
    },
  };

  return client.post(`${getPlatformEndpoint(platform, policyId)}/assignments`, assignment);
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
