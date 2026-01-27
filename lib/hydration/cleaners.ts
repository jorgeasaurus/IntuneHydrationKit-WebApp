/**
 * Policy Cleaners
 * Functions for cleaning policy objects before sending to Graph API
 */

import { addHydrationMarker } from "@/lib/utils/hydrationMarker";
import { isActualSecretField } from "./utils";

/**
 * Recursively clean a setting instance for Settings Catalog policies
 * Handles nested children and password type conversion
 */
export function cleanSettingInstance(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => cleanSettingInstance(item));
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      // Skip id and @odata metadata except @odata.type
      if (key === "id") continue;
      if (key.includes("@odata.") && key !== "@odata.type") continue;
      if (key === "settingDefinitions") continue;

      // Check if this is an actual secret/password VALUE field that needs type conversion
      const settingDefId = record.settingDefinitionId as string || "";
      const isSecretField = isActualSecretField(settingDefId);

      if (key === "simpleSettingValue" && isSecretField && typeof value === "object" && value !== null) {
        const simpleValue = value as Record<string, unknown>;
        const odataType = simpleValue["@odata.type"] as string || "";

        // Convert StringSettingValue to SecretSettingValue for actual credential fields
        if (odataType.includes("StringSettingValue")) {
          cleaned[key] = {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
            value: simpleValue.value,
            valueState: "notEncrypted"
          };
          continue;
        }
      }

      // Recursively clean nested objects and arrays
      cleaned[key] = cleanSettingInstance(value);
    }

    return cleaned;
  }

  return obj;
}

/**
 * Clean a Settings Catalog policy for creation
 * Removes metadata fields that shouldn't be sent when creating
 */
export function cleanSettingsCatalogPolicy(policy: Record<string, unknown>): Record<string, unknown> {
  // Ensure hydration marker in description
  const description = addHydrationMarker(policy.description as string | undefined);

  // Build a clean body with only required properties (matches PowerShell approach)
  const cleaned: Record<string, unknown> = {
    name: policy.name || policy.displayName,
    description,
    platforms: policy.platforms,
    technologies: policy.technologies,
    settings: [],
  };

  // Add optional roleScopeTagIds if present
  if (policy.roleScopeTagIds && Array.isArray(policy.roleScopeTagIds)) {
    cleaned.roleScopeTagIds = policy.roleScopeTagIds;
  }

  // Add templateReference if present with a templateId (matches PowerShell)
  const templateRef = policy.templateReference as Record<string, unknown> | undefined;
  if (templateRef && templateRef.templateId) {
    cleaned.templateReference = {
      templateId: templateRef.templateId,
    };
  }

  // Clean settings array recursively - handles nested children and password type conversion
  const settings = policy.settings as Array<Record<string, unknown>> | undefined;
  if (settings && Array.isArray(settings)) {
    cleaned.settings = settings.map(cleanSettingInstance);
  }

  return cleaned;
}

/**
 * Recursively clean an object by removing OData metadata and other fields that Graph API rejects
 * Keeps @odata.type but removes all other @odata.* properties, ids, timestamps, etc.
 */
export function cleanPolicyRecursively(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => cleanPolicyRecursively(item));
  }

  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    const excludeFields = [
      // OData metadata
      "@odata.context", "@odata.id", "@odata.editLink",
      // Timestamps and version
      "createdDateTime", "lastModifiedDateTime", "version",
      // Internal metadata
      "_oibPlatform", "_oibPolicyType", "_oibFilePath",
      // OData actions
      "#microsoft.graph.assign", "#microsoft.graph.scheduleActionsForRules",
      // Read-only properties (matches PowerShell Remove-ReadOnlyGraphProperties)
      "supportsScopeTags",
      "deviceManagementApplicabilityRuleOsEdition",
      "deviceManagementApplicabilityRuleOsVersion",
      "deviceManagementApplicabilityRuleDeviceMode",
      "creationSource",
      "settingCount",
      "priorityMetaData",
      "isAssigned",
      // Assignment-related (handled separately if needed)
      "assignments",
      // Driver Update Profile read-only fields
      "deviceReporting",
      "newUpdates",
      "inventorySyncStatus",
      "driverInventories",
      // Windows Update for Business read-only/complex fields
      "installationSchedule",
      "updateWeeks",
      // ID should always be removed when creating new resources
      "id",
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
      cleaned[key] = cleanPolicyRecursively(value);
    }

    return cleaned;
  }

  return obj;
}
