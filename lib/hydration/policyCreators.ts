/**
 * Policy Creators
 * Functions for creating different policy types via Graph API
 */

import { GraphClient } from "@/lib/graph/client";
import { addHydrationMarker } from "@/lib/utils/hydrationMarker";
import { cleanSettingsCatalogPolicy, cleanPolicyRecursively } from "./cleaners";
import { containsSecretPlaceholders, escapeODataString, hasODataUnsafeChars } from "./utils";

const CIS_METADATA_KEYS = ["_cisCategory", "_cisSubcategory", "_cisFilePath"] as const;

function normalizePolicyLookupName(name: string | undefined | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove CIS-specific metadata fields from a policy object.
 */
function removeCISMetadata(policy: Record<string, unknown>): void {
  for (const key of CIS_METADATA_KEYS) {
    delete policy[key];
  }
}

/**
 * V1 APIs use `displayName`; ensure it's set from `name` if missing, then remove `name`.
 */
function normalizeToDisplayName(policy: Record<string, unknown>): void {
  if (!policy.displayName && policy.name) {
    policy.displayName = policy.name;
  }
  delete policy.name;
}

/**
 * Settings Catalog APIs use `name`; ensure it's set from `displayName` if missing.
 */
function normalizeToName(policy: Record<string, unknown>): void {
  if (policy.displayName && !policy.name) {
    policy.name = policy.displayName;
  }
}

/**
 * Check if a Settings Catalog policy exists by name
 */
export async function settingsCatalogPolicyExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  // Names with brackets/special chars cause Graph API InternalServerError in $filter
  if (hasODataUnsafeChars(displayName)) {
    console.log(`[Settings Catalog] Skipping API existence check for "${displayName}" (OData-unsafe chars)`);
    return false;
  }
  try {
    const escapedName = escapeODataString(displayName);
    const response = await client.get<{ value: Array<{ name: string }> }>(
      `/deviceManagement/configurationPolicies?$filter=name eq '${encodeURIComponent(escapedName)}'&$select=id,name`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Settings Catalog] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

export async function createSettingsCatalogPolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string; warning?: string }> {
  const settings = policy.settings;
  const policyName = (policy.name || policy.displayName) as string;
  let warning: string | undefined;

  if (settings && containsSecretPlaceholders(settings)) {
    warning = `Policy "${policyName}" contains placeholder values that require manual configuration with actual secrets.`;
  }

  const cleanedPolicy = cleanSettingsCatalogPolicy(policy);
  normalizeToName(cleanedPolicy);
  if (cleanedPolicy.name) delete cleanedPolicy.displayName;

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
  const cleanedPolicy = cleanPolicyRecursively(policy) as Record<string, unknown>;
  cleanedPolicy.description = addHydrationMarker(cleanedPolicy.description as string | undefined);

  return client.post<{ id: string }>(
    "/deviceManagement/deviceConfigurations",
    cleanedPolicy
  );
}

/**
 * Create a Driver Update Profile (WUfB Drivers)
 * Note: The Graph API may return an empty body on success (201 Created),
 * so we fall back to querying by name to get the ID.
 */
export async function createDriverUpdateProfile(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleanedPolicy = cleanPolicyRecursively(policy) as Record<string, unknown>;
  const displayName = cleanedPolicy.displayName as string;
  cleanedPolicy.description = addHydrationMarker(cleanedPolicy.description as string | undefined);

  const result = await client.post<{ id?: string }>(
    "/deviceManagement/windowsDriverUpdateProfiles",
    cleanedPolicy
  );

  if (result.id) {
    return { id: result.id };
  }

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

  console.warn(`[PolicyCreators] Created Driver Update Profile "${displayName}" but could not find ID`);
  return { id: "" };
}

export async function compliancePolicyExistsByName(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  if (hasODataUnsafeChars(displayName)) {
    console.log(`[Compliance] Skipping API existence check for "${displayName}" (OData-unsafe chars)`);
    return false;
  }
  try {
    const escapedName = escapeODataString(displayName);
    const response = await client.get<{ value: Array<{ displayName: string }> }>(
      `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(escapedName)}'&$select=id,displayName`
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

export async function createCISCompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;

  delete cleaned.id;
  removeCISMetadata(cleaned);
  delete cleaned.assignments;
  normalizeToDisplayName(cleaned);

  return client.post<{ id: string }>(
    "/deviceManagement/deviceCompliancePolicies",
    cleaned
  );
}

function normalizeGroupPolicyDefinitionValues(policy: Record<string, unknown>): void {
  const definitionValues = policy.definitionValues;
  if (!definitionValues) {
    return;
  }

  const normalizedDefinitionValues = Array.isArray(definitionValues)
    ? definitionValues
    : [definitionValues];

  policy.definitionValues = normalizedDefinitionValues.map((definitionValue) => {
    if (!definitionValue || typeof definitionValue !== "object") {
      return definitionValue;
    }

    const normalizedDefinitionValue = definitionValue as Record<string, unknown>;
    const presentationValues = normalizedDefinitionValue.presentationValues;

    if (presentationValues) {
      normalizedDefinitionValue.presentationValues = Array.isArray(presentationValues)
        ? presentationValues
        : [presentationValues];
    }

    return normalizedDefinitionValue;
  });
}

export function buildCISGroupPolicyConfigurationPayload(
  policy: Record<string, unknown>
): Record<string, unknown> {
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;

  delete cleaned.id;
  removeCISMetadata(cleaned);
  cleaned.description = addHydrationMarker(cleaned.description as string | undefined);
  normalizeToDisplayName(cleaned);
  normalizeGroupPolicyDefinitionValues(cleaned);

  return cleaned;
}

export async function createCISGroupPolicyConfiguration(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  return client.post<{ id: string }>(
    "/deviceManagement/groupPolicyConfigurations",
    buildCISGroupPolicyConfigurationPayload(policy)
  );
}

export async function groupPolicyConfigurationExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  if (hasODataUnsafeChars(displayName)) {
    console.log(`[Group Policy Configuration] Skipping API existence check for "${displayName}" (OData-unsafe chars)`);
    return false;
  }

  try {
    const escapedName = escapeODataString(displayName);
    const response = await client.get<{ value: Array<{ displayName: string }> }>(
      `/deviceManagement/groupPolicyConfigurations?$filter=displayName eq '${encodeURIComponent(escapedName)}'&$select=id,displayName`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Group Policy Configuration] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

export function buildCISSecurityIntentPayload(
  policy: Record<string, unknown>
): Record<string, unknown> {
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;

  delete cleaned.id;
  removeCISMetadata(cleaned);

  return {
    displayName: cleaned.displayName,
    description: addHydrationMarker(cleaned.description as string | undefined),
    templateId: cleaned.templateId,
    roleScopeTagIds: cleaned.roleScopeTagIds,
    settings: cleaned.settings ?? [],
  };
}

export async function createCISSecurityIntent(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  return client.post<{ id: string }>(
    "/deviceManagement/intents",
    buildCISSecurityIntentPayload(policy)
  );
}

export async function securityIntentExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  if (hasODataUnsafeChars(displayName)) {
    console.log(`[Security Intent] Using collection lookup for "${displayName}" (OData-unsafe chars)`);
    try {
      const intents = await client.getCollection<{ displayName?: string }>(
        "/deviceManagement/intents?$select=id,displayName"
      ) ?? [];
      const normalizedDisplayName = normalizePolicyLookupName(displayName);
      return intents.some(
        (intent) => normalizePolicyLookupName(intent.displayName) === normalizedDisplayName
      );
    } catch (error) {
      console.error(`[Security Intent] Error checking if policy exists: ${displayName}`, error);
      return false;
    }
  }

  try {
    const escapedName = escapeODataString(displayName);
    const response = await client.get<{ value: Array<{ displayName: string }> }>(
      `/deviceManagement/intents?$filter=displayName eq '${escapedName}'&$select=id,displayName`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Security Intent] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}

export async function createV2CompliancePolicy(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;

  delete cleaned.id;
  removeCISMetadata(cleaned);
  cleaned.description = addHydrationMarker(cleaned.description as string | undefined);
  normalizeToName(cleaned);

  const settings = cleaned.settings as Array<Record<string, unknown>> | undefined;
  if (settings && Array.isArray(settings)) {
    cleaned.settings = settings.map((setting) => {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(setting)) {
        if (key === "id" || key === "settingDefinitions") continue;
        if (key.includes("@odata.") && key !== "@odata.type") continue;
        result[key] = value;
      }
      return result;
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
  if (hasODataUnsafeChars(name)) {
    console.log(`[V2 Compliance] Skipping API existence check for "${name}" (OData-unsafe chars)`);
    return false;
  }
  try {
    const escapedName = escapeODataString(name);
    const response = await client.get<{ value: Array<{ name: string }> }>(
      `/deviceManagement/compliancePolicies?$filter=name eq '${encodeURIComponent(escapedName)}'&$select=id,name`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[V2 Compliance] Error checking if policy exists: ${name}`, error);
    return false;
  }
}

export async function createCISDeviceConfiguration(
  client: GraphClient,
  policy: Record<string, unknown>
): Promise<{ id: string }> {
  const cleaned = cleanPolicyRecursively(policy) as Record<string, unknown>;

  delete cleaned.id;
  removeCISMetadata(cleaned);
  cleaned.description = addHydrationMarker(cleaned.description as string | undefined);
  normalizeToDisplayName(cleaned);

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
  if (hasODataUnsafeChars(displayName)) {
    console.log(`[Device Configuration] Skipping API existence check for "${displayName}" (OData-unsafe chars)`);
    return false;
  }
  try {
    const escapedName = escapeODataString(displayName);
    const response = await client.get<{ value: Array<{ displayName: string }> }>(
      `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(escapedName)}'&$select=id,displayName`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[Device Configuration] Error checking if policy exists: ${displayName}`, error);
    return false;
  }
}
