/**
 * Policy Creators
 * Functions for creating different policy types via Graph API
 */

import { GraphClient } from "@/lib/graph/client";
import { addHydrationMarker } from "@/lib/utils/hydrationMarker";
import { cleanSettingsCatalogPolicy, cleanPolicyRecursively } from "./cleaners";
import { containsSecretPlaceholders, escapeODataString } from "./utils";

/**
 * Check if a Settings Catalog policy exists by name
 */
export async function settingsCatalogPolicyExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  try {
    const escapedName = escapeODataString(displayName);
    const response = await client.get<{ value: Array<{ name: string }> }>(
      `/deviceManagement/configurationPolicies?$filter=name eq '${encodeURIComponent(escapedName)}'`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Settings Catalog] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

/**
 * Create a Settings Catalog policy
 * Returns warning if policy contains placeholder secrets that need manual configuration
 */
export async function createSettingsCatalogPolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string; warning?: string }> {
  // Check for placeholder secrets - warn but continue
  const settings = policy.settings;
  const policyName = (policy.name || policy.displayName) as string;
  let warning: string | undefined;

  if (settings && containsSecretPlaceholders(settings)) {
    warning = `Policy "${policyName}" contains placeholder values that require manual configuration with actual secrets.`;
  }

  // Clean the policy before sending
  const cleanedPolicy = cleanSettingsCatalogPolicy(policy);

  // Use 'name' field for Settings Catalog (not 'displayName')
  if (cleanedPolicy.displayName && !cleanedPolicy.name) {
    cleanedPolicy.name = cleanedPolicy.displayName;
    delete cleanedPolicy.displayName;
  }

  const result = await client.post<{ id: string }>(
    "/deviceManagement/configurationPolicies",
    cleanedPolicy
  );

  return { ...result, warning };
}

/**
 * Create a Device Configuration policy (includes UpdatePolicies/WUfB rings)
 */
export async function createDeviceConfigurationPolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy before sending (removes id, OData metadata, read-only fields)
  const cleanedPolicy = cleanPolicyRecursively(policy) as Record<string, unknown>;

  // Ensure hydration marker in description
  cleanedPolicy.description = addHydrationMarker(cleanedPolicy.description as string | undefined);

  return client.post<{ id: string }>(
    "/deviceManagement/deviceConfigurations",
    cleanedPolicy
  );
}

/**
 * Create a Driver Update Profile (WUfB Drivers)
 * Note: The Graph API may return an empty body on success (201 Created)
 * In that case, we query for the created profile by name to get the ID
 */
export async function createDriverUpdateProfile(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy before sending (removes id, OData metadata, read-only fields)
  const cleanedPolicy = cleanPolicyRecursively(policy) as Record<string, unknown>;
  const displayName = cleanedPolicy.displayName as string;

  // Ensure hydration marker in description
  cleanedPolicy.description = addHydrationMarker(cleanedPolicy.description as string | undefined);

  const result = await client.post<{ id?: string }>(
    "/deviceManagement/windowsDriverUpdateProfiles",
    cleanedPolicy
  );

  // If the API returned an ID, use it
  if (result.id) {
    return { id: result.id };
  }

  // Otherwise, query for the created profile by name
  console.log(`[PolicyCreators] Driver Update Profile created but no ID returned, querying by name: "${displayName}"`);
  const response = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
    `/deviceManagement/windowsDriverUpdateProfiles?$select=id,displayName`
  );

  const createdProfile = response.value?.find(
    (p) => p.displayName.toLowerCase() === displayName.toLowerCase()
  );

  if (createdProfile) {
    return { id: createdProfile.id };
  }

  // If we still can't find it, return empty ID (profile was likely created)
  console.warn(`[PolicyCreators] Created Driver Update Profile "${displayName}" but could not find ID`);
  return { id: "" };
}

/**
 * Check if a compliance policy exists by name
 */
export async function compliancePolicyExistsByName(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  try {
    const escapedName = escapeODataString(displayName);
    const response = await client.get<{ value: Array<{ displayName: string }> }>(
      `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(escapedName)}'`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Compliance] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

/**
 * Create a baseline compliance policy
 */
export async function createBaselineCompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;
  delete cleaned.id;

  return client.post<{ id: string }>(
    "/deviceManagement/deviceCompliancePolicies",
    cleaned
  );
}

/**
 * Create a CIS Baseline compliance policy
 * Cleans the policy payload to remove metadata that Graph API rejects
 */
export async function createCISCompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;

  // Remove id and CIS-specific metadata
  delete cleaned.id;
  delete cleaned._cisCategory;
  delete cleaned._cisSubcategory;
  delete cleaned._cisFilePath;
  delete cleaned.assignments;

  if (!cleaned.displayName && cleaned.name) {
    cleaned.displayName = cleaned.name;
  }

  return client.post<{ id: string }>(
    "/deviceManagement/deviceCompliancePolicies",
    cleaned
  );
}

/**
 * Create a V2 Compliance policy (Settings Catalog compliance)
 */
export async function createV2CompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy recursively
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;

  // Remove root-level id and CIS metadata
  delete cleaned.id;
  delete cleaned._cisCategory;
  delete cleaned._cisSubcategory;
  delete cleaned._cisFilePath;

  // Ensure hydration marker in description
  cleaned.description = addHydrationMarker(cleaned.description as string | undefined);

  // Use 'name' for Settings Catalog compliance (not displayName)
  if (cleaned.displayName && !cleaned.name) {
    cleaned.name = cleaned.displayName;
  }

  // Clean settings array - must have settingInstance structure
  const settings = cleaned.settings as Array<Record<string, unknown>> | undefined;
  if (settings && Array.isArray(settings)) {
    cleaned.settings = settings.map((setting: Record<string, unknown>) => {
      const cleanedSetting: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(setting)) {
        // Skip id and @odata metadata except @odata.type
        if (key === "id") continue;
        if (key.includes("@odata.") && key !== "@odata.type") continue;
        if (key === "settingDefinitions") continue;
        cleanedSetting[key] = value;
      }
      return cleanedSetting;
    });
  }

  console.log(`[V2 Compliance] Creating policy: "${cleaned.name}"`);
  console.log(`[V2 Compliance] Policy payload keys:`, Object.keys(cleaned));

  const result = await client.post<{ id: string }>(
    "/deviceManagement/compliancePolicies",
    cleaned
  );

  console.log(`[V2 Compliance] Policy created with ID: ${result.id}`);
  return result;
}

/**
 * Check if a V2 Compliance policy exists by name
 */
export async function v2CompliancePolicyExists(
  client: GraphClient,
  name: string
): Promise<boolean> {
  try {
    const escapedName = escapeODataString(name);
    const response = await client.get<{ value: Array<{ name: string }> }>(
      `/deviceManagement/compliancePolicies?$filter=name eq '${encodeURIComponent(escapedName)}'`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[V2 Compliance] Error checking if policy exists: ${name}`, error);
    return false;
  }
}

/**
 * Create a CIS Device Configuration policy
 */
export async function createCISDeviceConfiguration(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  // Clean the policy recursively
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;

  // Remove root-level id and CIS metadata
  delete cleaned.id;
  delete cleaned._cisCategory;
  delete cleaned._cisSubcategory;
  delete cleaned._cisFilePath;

  // Ensure hydration marker in description
  cleaned.description = addHydrationMarker(cleaned.description as string | undefined);

  console.log(`[CIS Device Config] Creating policy: "${cleaned.displayName}"`);

  const result = await client.post<{ id: string }>(
    "/deviceManagement/deviceConfigurations",
    cleaned
  );

  console.log(`[CIS Device Config] Policy created with ID: ${result.id}`);
  return result;
}

/**
 * Check if a device configuration exists by name
 */
export async function deviceConfigurationExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  try {
    const escapedName = escapeODataString(displayName);
    const response = await client.get<{ value: Array<{ displayName: string }> }>(
      `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(escapedName)}'`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Device Configuration] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}
