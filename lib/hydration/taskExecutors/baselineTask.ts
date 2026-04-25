/**
 * Baseline Task Executor
 * Handles create and delete operations for OpenIntuneBaseline policies
 * Routes to correct API based on policy type (Settings Catalog, Device Configuration, etc.)
 */

import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import { hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import {
  createSettingsCatalogPolicy,
  createDeviceConfigurationPolicy,
  createDriverUpdateProfile,
  compliancePolicyExistsByName,
  createBaselineCompliancePolicy,
} from "../policyCreators";
import { escapeODataString, hasODataUnsafeChars } from "../utils";
import { createAppProtectionPolicy, deleteAppProtectionPolicy } from "@/lib/graph/appProtection";
import { getCachedTemplates, BaselinePolicy, AppProtectionTemplate } from "@/lib/templates/loader";

/**
 * Execute a baseline task (create or delete)
 * Routes to correct API based on policy type
 */
export async function executeBaselineTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;

  // Get template from cache
  const cachedBaseline = getCachedTemplates("baseline");
  let template: BaselinePolicy | undefined;

  if (cachedBaseline && Array.isArray(cachedBaseline)) {
    template = (cachedBaseline as BaselinePolicy[]).find(
      (b) => b.displayName === task.itemName || b.name === task.itemName
    );
  }

  if (!template) {
    console.error(`[Baseline Task] Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  // Determine the policy type and route accordingly
  const policyType = template._oibPolicyType;
  const policyName = template.name || template.displayName || task.itemName;

  console.log(`[Baseline Task] Processing "${policyName}" (type: ${policyType})`);

  if (mode === "create") {
    try {
      // Route based on policy type
      if (policyType === "CompliancePolicies") {
        // Compliance policies go to deviceCompliancePolicies endpoint
        const normalizedPolicyName = policyName.toLowerCase().trim();
        let compliancePolicies = context.cachedCompliancePolicies;

        if (
          (!compliancePolicies || compliancePolicies.length === 0) &&
          hasODataUnsafeChars(policyName)
        ) {
          compliancePolicies = await client.getCollection<{ id: string; displayName?: string; description?: string }>(
            "/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description"
          );
          context.cachedCompliancePolicies = compliancePolicies;
        }

        const existingCompliancePolicy = compliancePolicies?.find(
          (policy) => policy.displayName?.toLowerCase().trim() === normalizedPolicyName
        );

        if (existingCompliancePolicy) {
          console.log(`[Baseline Task] Compliance policy already exists (cache), skipping: "${policyName}"`);
          return { task, success: true, skipped: true, error: "Already exists" };
        }

        const exists = await compliancePolicyExistsByName(client, policyName);
        if (exists) {
          console.log(`[Baseline Task] Compliance policy already exists, skipping: "${policyName}"`);
          return { task, success: true, skipped: true, error: "Already exists" };
        }
        if (isPreview) {
          return { task, success: true, skipped: false };
        }
        const created = await createBaselineCompliancePolicy(client, template as Record<string, unknown>);
        if (context.cachedCompliancePolicies && created.id) {
          context.cachedCompliancePolicies.push({
            id: created.id,
            displayName: policyName,
            description: "",
          });
        }
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "AppProtection") {
        // App Protection policies - use existing app protection handler
        const existingPolicy = context.cachedAppProtectionPolicies?.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (existingPolicy) {
          console.log(`[Baseline Task] App Protection policy already exists, skipping: "${policyName}"`);
          return { task, success: true, skipped: true, error: "Already exists" };
        }
        if (isPreview) {
          return { task, success: true, skipped: false };
        }
        const created = await createAppProtectionPolicy(client, template as AppProtectionTemplate);
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "DeviceConfiguration" || policyType === "UpdatePolicies") {
        // DeviceConfiguration and UpdatePolicies use deviceConfigurations endpoint
        const escapedPolicyName = escapeODataString(policyName);
        const existsResponse = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
          `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(escapedPolicyName)}'&$select=id,displayName`
        );
        if (existsResponse.value && existsResponse.value.length > 0) {
          console.log(`[Baseline Task] Device Configuration policy already exists, skipping: "${policyName}"`);
          return { task, success: true, skipped: true, error: "Already exists" };
        }
        if (isPreview) {
          return { task, success: true, skipped: false };
        }
        const created = await createDeviceConfigurationPolicy(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "DriverUpdateProfiles") {
        // DriverUpdateProfiles endpoint doesn't support $filter, fetch all and filter client-side
        const existsResponse = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
          `/deviceManagement/windowsDriverUpdateProfiles?$select=id,displayName`
        );
        const existingProfile = existsResponse.value?.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (existingProfile) {
          console.log(`[Baseline Task] Driver Update Profile already exists, skipping: "${policyName}"`);
          return { task, success: true, skipped: true, error: "Already exists" };
        }
        if (isPreview) {
          return { task, success: true, skipped: false };
        }
        const created = await createDriverUpdateProfile(client, template as Record<string, unknown>);
        return { task, success: true, skipped: false, createdId: created.id };

      } else {
        // SettingsCatalog (default) - use configurationPolicies endpoint
        // Use cache-based existence check for consistency with batch executor
        // The $filter API is unreliable for this endpoint
        let existsInCache = false;
        if (context.cachedSettingsCatalogPolicies && context.cachedSettingsCatalogPolicies.length > 0) {
          const normalizedPolicyName = policyName.toLowerCase().trim();
          existsInCache = context.cachedSettingsCatalogPolicies.some(
            (p) => p.name?.toLowerCase().trim() === normalizedPolicyName
          );
        }

        if (existsInCache) {
          console.log(`[Baseline Task] Settings Catalog policy already exists (cache), skipping: "${policyName}"`);
          return { task, success: true, skipped: true, error: "Already exists" };
        }

        if (isPreview) {
          return { task, success: true, skipped: false };
        }

        const created = await createSettingsCatalogPolicy(client, template as Record<string, unknown>);

        // Add to cache to prevent duplicate creation
        if (context.cachedSettingsCatalogPolicies && created.id) {
          context.cachedSettingsCatalogPolicies.push({
            id: created.id,
            name: policyName,
            description: ""
          });
        }

        return { task, success: true, skipped: false, createdId: created.id, warning: created.warning };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Baseline Task] Failed to create policy: "${policyName}"`, error);
      return { task, success: false, skipped: false, error: errorMessage };
    }

  } else if (mode === "delete") {
    try {
      if (policyType === "CompliancePolicies") {
        // Find compliance policy by name first (to get ID)
        if (hasODataUnsafeChars(policyName)) {
          console.log(`[Baseline Task] Cannot query compliance for "${policyName}" (OData-unsafe chars) — skipping`);
          return { task, success: true, skipped: true, error: "Cannot query by name (special characters)" };
        }
        const escapedPolicyName = escapeODataString(policyName);
        const response = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
          `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(escapedPolicyName)}'&$select=id,displayName`
        );
        if (!response.value || response.value.length === 0) {
          return { task, success: true, skipped: true, error: "Not found in tenant" };
        }
        const policyId = response.value[0].id;

        // Fetch full policy by ID to get description
        const fullPolicy = await client.get<{ id: string; displayName: string; description?: string }>(
          `/deviceManagement/deviceCompliancePolicies/${policyId}?$select=id,displayName,description`
        );
        if (!hasHydrationMarker(fullPolicy.description)) {
          return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
        }

        if (isPreview) {
          return { task, success: true, skipped: false };
        }

        await client.delete(`/deviceManagement/deviceCompliancePolicies/${policyId}`);
        console.log(`[Baseline Task] Deleted compliance policy: "${policyName}"`);
        return { task, success: true, skipped: false };

      } else if (policyType === "AppProtection") {
        // Find app protection policy in cache (includes platform info)
        const cachedPolicy = context.cachedAppProtectionPolicies?.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (!cachedPolicy || !cachedPolicy.id) {
          return { task, success: true, skipped: true, error: "Not found in tenant" };
        }

        if (isPreview) {
          return { task, success: true, skipped: false };
        }

        // Determine platform from the cached policy's _platform property
        const platform = cachedPolicy._platform as "iOS" | "android" || "android";

        // Fetch full policy to check the marker (deleteAppProtectionPolicy does this internally)
        try {
          await deleteAppProtectionPolicy(client, cachedPolicy.id, platform);
          console.log(`[Baseline Task] Deleted app protection policy: "${policyName}"`);
          return { task, success: true, skipped: false };
        } catch (deleteError) {
          const errMsg = deleteError instanceof Error ? deleteError.message : String(deleteError);
          if (errMsg.includes("Not created by Intune Hydration Kit")) {
            return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
          }
          throw deleteError;
        }

      } else if (policyType === "DeviceConfiguration" || policyType === "UpdatePolicies") {
        // DeviceConfiguration and UpdatePolicies use /deviceManagement/deviceConfigurations endpoint
        if (hasODataUnsafeChars(policyName)) {
          console.log(`[Baseline Task] Cannot query device config for "${policyName}" (OData-unsafe chars) — skipping`);
          return { task, success: true, skipped: true, error: "Cannot query by name (special characters)" };
        }
        const escapedPolicyNameDel = escapeODataString(policyName);
        const response = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
          `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(escapedPolicyNameDel)}'&$select=id,displayName`
        );
        if (!response.value || response.value.length === 0) {
          return { task, success: true, skipped: true, error: "Not found in tenant" };
        }
        const policyId = response.value[0].id;

        // Fetch full policy by ID to get description
        const fullPolicy = await client.get<{ id: string; displayName: string; description?: string }>(
          `/deviceManagement/deviceConfigurations/${policyId}?$select=id,displayName,description`
        );
        if (!hasHydrationMarker(fullPolicy.description)) {
          return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
        }

        if (isPreview) {
          return { task, success: true, skipped: false };
        }

        await client.delete(`/deviceManagement/deviceConfigurations/${policyId}`);
        console.log(`[Baseline Task] Deleted device configuration policy: "${policyName}"`);
        return { task, success: true, skipped: false };

      } else if (policyType === "DriverUpdateProfiles") {
        // Use pre-fetched cache for Driver Update Profiles
        let profiles = context.cachedDriverUpdateProfiles;

        if (!profiles || profiles.length === 0) {
          console.log(`[Baseline Task] No cached Driver Update Profiles - fetching now...`);
          const response = await client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
            `/deviceManagement/windowsDriverUpdateProfiles?$select=id,displayName,description`
          );
          profiles = response.value || [];
          context.cachedDriverUpdateProfiles = profiles;
        }

        const matchingProfile = profiles.find(
          (p) => p.displayName.toLowerCase() === policyName.toLowerCase()
        );
        if (!matchingProfile) {
          return { task, success: true, skipped: true, error: "Not found in tenant" };
        }

        console.log(`[Baseline Task] Found Driver Update Profile: "${matchingProfile.displayName}" (ID: ${matchingProfile.id})`);

        // Check hydration marker
        if (!hasHydrationMarker(matchingProfile.description)) {
          return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
        }

        if (isPreview) {
          return { task, success: true, skipped: false };
        }

        await client.delete(`/deviceManagement/windowsDriverUpdateProfiles/${matchingProfile.id}`);
        console.log(`[Baseline Task] Deleted driver update profile: "${policyName}"`);
        return { task, success: true, skipped: false };

      } else {
        // Settings Catalog (default) - use pre-fetched cache to avoid repeated API calls
        const allPolicies = context.cachedSettingsCatalogPolicies || [];

        if (allPolicies.length === 0) {
          console.log(`[Baseline Task] No cached Settings Catalog policies - fetching now...`);
          const fetched = await client.getCollection<{ id: string; name: string; description?: string }>(
            `/deviceManagement/configurationPolicies?$select=id,name,description`
          );
          context.cachedSettingsCatalogPolicies = fetched;
        }

        // Find matching policy by name (case-insensitive)
        const matchingPolicy = (context.cachedSettingsCatalogPolicies || []).find(
          (p) => p.name?.toLowerCase() === policyName.toLowerCase()
        );

        // If not found in Settings Catalog, try V2 Compliance
        if (!matchingPolicy) {
          const v2Policy = (context.cachedV2CompliancePolicies || []).find(
            (p) => p.name?.toLowerCase() === policyName.toLowerCase()
          );

          if (v2Policy) {
            console.log(`[Baseline Task] Found V2 Compliance policy: "${v2Policy.name}" (ID: ${v2Policy.id})`);

            if (!hasHydrationMarker(v2Policy.description)) {
              return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
            }

            if (isPreview) {
              return { task, success: true, skipped: false };
            }

            await client.delete(`/deviceManagement/compliancePolicies/${v2Policy.id}`);
            console.log(`[Baseline Task] Deleted V2 Compliance policy: "${policyName}"`);

            // Remove from cache
            if (context.cachedV2CompliancePolicies) {
              context.cachedV2CompliancePolicies = context.cachedV2CompliancePolicies.filter(
                (p) => p.id !== v2Policy.id
              );
            }
            return { task, success: true, skipped: false };
          }

          return { task, success: true, skipped: true, error: "Not found in tenant" };
        }

        console.log(`[Baseline Task] Found Settings Catalog policy: "${matchingPolicy.name}" (ID: ${matchingPolicy.id})`);

        // Check hydration marker
        if (!hasHydrationMarker(matchingPolicy.description)) {
          return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
        }

        // Check if the policy has any assignments - skip deletion if assigned
        try {
          const assignmentsResponse = await client.get<{ value: Array<{ id: string }> }>(
            `/deviceManagement/configurationPolicies/${matchingPolicy.id}/assignments`
          );
          const assignmentCount = assignmentsResponse.value?.length ?? 0;
          if (assignmentCount > 0) {
            console.log(`[Baseline Task] Skipping deletion of "${policyName}" - has ${assignmentCount} active assignment(s)`);
            return { task, success: true, skipped: true, error: `Policy has ${assignmentCount} active assignment(s)` };
          }
        } catch {
          console.log(`[Baseline Task] Could not check assignments for "${policyName}", will try delete directly`);
        }

        if (isPreview) {
          return { task, success: true, skipped: false };
        }

        try {
          await client.delete(`/deviceManagement/configurationPolicies/${matchingPolicy.id}`);
          console.log(`[Baseline Task] Deleted settings catalog policy: "${policyName}"`);
          // Remove from cache after successful delete
          if (context.cachedSettingsCatalogPolicies) {
            context.cachedSettingsCatalogPolicies = context.cachedSettingsCatalogPolicies.filter(
              (p) => p.id !== matchingPolicy.id
            );
          }
          return { task, success: true, skipped: false };
        } catch (deleteError) {
          // Delete returned an error, but policy might still be deleted (Intune backend quirk)
          console.log(`[Baseline Task] Delete returned error for "${policyName}", verifying if policy was actually deleted...`);

          try {
            await client.get(`/deviceManagement/configurationPolicies/${matchingPolicy.id}?$select=id`);
            // If we get here, the policy still exists
            console.error(`[Baseline Task] Policy "${policyName}" still exists - delete truly failed`);
            throw deleteError;
          } catch (verifyError) {
            const verifyErrorMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
            if (verifyErrorMsg.includes("404") || verifyErrorMsg.toLowerCase().includes("not found")) {
              console.log(`[Baseline Task] Policy "${policyName}" confirmed deleted (verified via 404)`);
              if (context.cachedSettingsCatalogPolicies) {
                context.cachedSettingsCatalogPolicies = context.cachedSettingsCatalogPolicies.filter(
                  (p) => p.id !== matchingPolicy.id
                );
              }
              return { task, success: true, skipped: false };
            }
            throw deleteError;
          }
        }
      }
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Baseline Task] Delete failed for "${policyName}":`, errorMessage);

      if (errorMessage.includes("[400]") || errorMessage.includes("An error has occurred")) {
        errorMessage = `Microsoft Intune backend error - some Settings Catalog policies cannot be deleted via Graph API. Delete manually in Intune portal.`;
      }
      return { task, success: false, skipped: false, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
