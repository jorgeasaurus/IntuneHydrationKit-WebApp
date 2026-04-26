/**
 * CIS Baseline Task Executor
 * Handles create and delete operations for CIS Intune Baseline policies
 * Routes to correct API based on policy type (V2Compliance, V1Compliance, DeviceConfiguration, SettingsCatalog)
 */

import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import { hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import { detectCISPolicyType } from "../policyDetection";
import {
  settingsCatalogPolicyExists,
  createSettingsCatalogPolicy,
  v2CompliancePolicyExists,
  createV2CompliancePolicy,
  compliancePolicyExistsByName,
  createCISCompliancePolicy,
  deviceConfigurationExists,
  createCISDeviceConfiguration,
  groupPolicyConfigurationExists,
  createCISGroupPolicyConfiguration,
  securityIntentExists,
  createCISSecurityIntent,
} from "../policyCreators";
import { escapeODataString, hasODataUnsafeChars } from "../utils";
import { getCachedTemplates, getAllTemplateCacheKeys, CISBaselinePolicy } from "@/lib/templates/loader";

function findCachedGroupPolicyConfiguration(
  policyName: string,
  context: ExecutionContext
): { id: string; displayName?: string; description?: string } | undefined {
  const normalizedPolicyName = policyName.toLowerCase().trim();
  return context.cachedGroupPolicyConfigurations?.find(
    (policy) => policy.displayName?.toLowerCase().trim() === normalizedPolicyName
  );
}

/**
 * Execute a CIS Baseline task (create or delete)
 * Routes to correct endpoint based on policy type
 */
export async function executeCISBaselineTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;

  // Get template from cache - need to find the right cache key
  let template: CISBaselinePolicy | undefined;

  // Try to find in any CIS baseline cache (includes both sessionStorage and in-memory fallback)
  // Task itemName can be displayName, name, or _cisFilePath (file path), so check all three
  const cacheKeys = getAllTemplateCacheKeys().filter(k => k.startsWith("intune-hydration-templates-cisBaseline"));
  for (const key of cacheKeys) {
    const cacheKey = key.replace("intune-hydration-templates-", "");
    const cached = getCachedTemplates(cacheKey);
    if (cached && Array.isArray(cached)) {
      template = (cached as CISBaselinePolicy[]).find(
        (b) => b.displayName === task.itemName ||
               (b as Record<string, unknown>).name === task.itemName ||
               b._cisFilePath === task.itemName
      );
      if (template) break;
    }
  }

  if (!template) {
    console.error(`[CIS Baseline Task] Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  // Detect the policy type for proper routing
  const policyType = detectCISPolicyType(template as Record<string, unknown>);
  const odataType = template["@odata.type"] as string || "";
  const normalizedODataType = odataType.toLowerCase();
  const policyName = template.displayName || (template as Record<string, unknown>).name as string || task.itemName;

  console.log(`[CIS Baseline Task] Processing "${policyName}" (type: ${policyType}, @odata.type: ${odataType})`);

  if (mode === "create") {
    try {
      switch (policyType) {
        case "Unsupported":
          // Security Intents and other unsupported types
          console.log(`[CIS Baseline Task] Skipping unsupported policy type: "${policyName}" (@odata.type: ${odataType})`);
          // Provide specific error message based on policy type
          let unsupportedReason = "This policy type is not supported for automated creation.";
          if (odataType.includes("devicemanagementintent")) {
            unsupportedReason = "Security Intents require template instance creation. Please create manually in Intune.";
          }
          return {
            task,
            success: true,
            skipped: true,
            error: `Unsupported policy type: ${odataType}. ${unsupportedReason}`
          };

        case "GroupPolicyConfiguration": {
          const normalizedPolicyName = policyName.toLowerCase().trim();
          let groupPolicyConfigurations = context.cachedGroupPolicyConfigurations;

          if (
            (!groupPolicyConfigurations || groupPolicyConfigurations.length === 0) &&
            hasODataUnsafeChars(policyName)
          ) {
            groupPolicyConfigurations = await client.getCollection<{ id: string; displayName?: string; description?: string }>(
              "/deviceManagement/groupPolicyConfigurations?$select=id,displayName,description"
            );
            context.cachedGroupPolicyConfigurations = groupPolicyConfigurations;
          }

          const existingGroupPolicyConfiguration = groupPolicyConfigurations?.find(
            (policy) => policy.displayName?.toLowerCase().trim() === normalizedPolicyName
          );

          if (existingGroupPolicyConfiguration) {
            console.log(`[CIS Baseline Task] Group Policy Configuration already exists (cache), skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }

          const groupPolicyExists = await groupPolicyConfigurationExists(client, policyName);
          if (groupPolicyExists) {
            console.log(`[CIS Baseline Task] Group Policy Configuration already exists, skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const createdGroupPolicy = await createCISGroupPolicyConfiguration(client, template as Record<string, unknown>);
          if (context.cachedGroupPolicyConfigurations && createdGroupPolicy.id) {
            context.cachedGroupPolicyConfigurations.push({
              id: createdGroupPolicy.id,
              displayName: policyName,
              description: "",
            });
          }
          return { task, success: true, skipped: false, createdId: createdGroupPolicy.id };
        }

        case "SecurityIntent": {
          const normalizedPolicyName = policyName.toLowerCase().trim();
          let securityIntents = context.cachedSecurityIntents;

          if (
            (!securityIntents || securityIntents.length === 0) &&
            hasODataUnsafeChars(policyName)
          ) {
            securityIntents = await client.getCollection<{ id: string; displayName?: string; description?: string }>(
              "/deviceManagement/intents?$select=id,displayName,description"
            );
            context.cachedSecurityIntents = securityIntents;
          }

          const existingSecurityIntent = securityIntents?.find(
            (policy) => policy.displayName?.toLowerCase().trim() === normalizedPolicyName
          );

          if (existingSecurityIntent) {
            console.log(`[CIS Baseline Task] Security Intent already exists (cache), skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }

          const intentExists = await securityIntentExists(client, policyName);
          if (intentExists) {
            console.log(`[CIS Baseline Task] Security Intent already exists, skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const createdIntent = await createCISSecurityIntent(client, template as Record<string, unknown>);
          if (context.cachedSecurityIntents && createdIntent.id) {
            context.cachedSecurityIntents.push({
              id: createdIntent.id,
              displayName: policyName,
              description: "",
            });
          }
          return { task, success: true, skipped: false, createdId: createdIntent.id };
        }

        case "V2Compliance": {
          // Settings Catalog compliance -> /compliancePolicies
          const v2Exists = await v2CompliancePolicyExists(client, policyName);
          if (v2Exists) {
            console.log(`[CIS Baseline Task] V2 Compliance policy already exists, skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const v2Created = await createV2CompliancePolicy(client, template as Record<string, unknown>);
          return { task, success: true, skipped: false, createdId: v2Created.id };
        }

        case "V1Compliance": {
          // Legacy compliance -> /deviceCompliancePolicies
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

          const existingV1Policy = compliancePolicies?.find(
            (policy) => policy.displayName?.toLowerCase().trim() === normalizedPolicyName
          );

          if (existingV1Policy) {
            console.log(`[CIS Baseline Task] V1 Compliance policy already exists (cache), skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }

          const v1Exists = await compliancePolicyExistsByName(client, policyName);
          if (v1Exists) {
            console.log(`[CIS Baseline Task] V1 Compliance policy already exists, skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const v1Created = await createCISCompliancePolicy(client, template as Record<string, unknown>);
          if (context.cachedCompliancePolicies && v1Created.id) {
            context.cachedCompliancePolicies.push({
              id: v1Created.id,
              displayName: policyName,
              description: "",
            });
          }
          return { task, success: true, skipped: false, createdId: v1Created.id };
        }

        case "DeviceConfiguration": {
          // Device configuration -> /deviceConfigurations
          const dcExists = await deviceConfigurationExists(client, policyName);
          if (dcExists) {
            console.log(`[CIS Baseline Task] Device Configuration already exists, skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const dcCreated = await createCISDeviceConfiguration(client, template as Record<string, unknown>);
          return { task, success: true, skipped: false, createdId: dcCreated.id };
        }

        case "SettingsCatalog":
        default: {
          // Settings Catalog -> /configurationPolicies
          const scExists = await settingsCatalogPolicyExists(client, policyName);
          if (scExists) {
            console.log(`[CIS Baseline Task] Settings Catalog policy already exists, skipping: "${policyName}"`);
            return { task, success: true, skipped: true, error: "Already exists" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const scCreated = await createSettingsCatalogPolicy(client, template as Record<string, unknown>);
          return { task, success: true, skipped: false, createdId: scCreated.id, warning: scCreated.warning };
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CIS Baseline Task] Failed to create policy: "${policyName}"`, error);
      return { task, success: false, skipped: false, error: errorMessage };
    }
  } else if (mode === "delete") {
    try {
        switch (policyType) {
          case "GroupPolicyConfiguration":
          case "SecurityIntent":
          case "Unsupported":
          if (policyType === "GroupPolicyConfiguration" || normalizedODataType.includes("grouppolicyconfiguration")) {
            let policy = findCachedGroupPolicyConfiguration(policyName, context);

            if (!policy) {
              const allPolicies = await client.getCollection<{ id: string; displayName?: string; description?: string }>(
                `/deviceManagement/groupPolicyConfigurations?$select=id,displayName,description`
              );
              context.cachedGroupPolicyConfigurations = allPolicies;
              policy = findCachedGroupPolicyConfiguration(policyName, context);
            }

            if (!policy) {
              return { task, success: true, skipped: true, error: "Not found in tenant" };
            }

            if (!hasHydrationMarker(policy.description)) {
              return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
            }

            try {
              const assignmentsResponse = await client.get<{ value: Array<{ id: string }> }>(
                `/deviceManagement/groupPolicyConfigurations/${policy.id}/assignments`
              );
              const assignmentCount = assignmentsResponse.value?.length ?? 0;
              if (assignmentCount > 0) {
                return { task, success: true, skipped: true, error: `Policy has ${assignmentCount} active assignment(s)` };
              }
            } catch {
              // Continue if assignments can't be checked
            }

            if (isPreview) {
              return { task, success: true, skipped: false };
            }

            await client.delete(`/deviceManagement/groupPolicyConfigurations/${policy.id}`);

            if (context.cachedGroupPolicyConfigurations) {
              context.cachedGroupPolicyConfigurations = context.cachedGroupPolicyConfigurations.filter(
                (cachedPolicy) => cachedPolicy.id !== policy.id
              );
            }

            return { task, success: true, skipped: false };
          }

          if (policyType === "SecurityIntent" || normalizedODataType.includes("devicemanagementintent")) {
            let policy = context.cachedSecurityIntents?.find(
              (intent) => intent.displayName?.toLowerCase().trim() === policyName.toLowerCase().trim()
            );

            if (!policy) {
              const allIntents = await client.getCollection<{ id: string; displayName?: string; description?: string }>(
                "/deviceManagement/intents?$select=id,displayName,description"
              );
              context.cachedSecurityIntents = allIntents;
              policy = context.cachedSecurityIntents?.find(
                (intent) => intent.displayName?.toLowerCase().trim() === policyName.toLowerCase().trim()
              );
            }

            if (!policy) {
              return { task, success: true, skipped: true, error: "Not found in tenant" };
            }

            if (!hasHydrationMarker(policy.description)) {
              return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
            }

            try {
              const assignmentsResponse = await client.get<{ value: Array<{ id: string }> }>(
                `/deviceManagement/intents/${policy.id}/assignments`
              );
              const assignmentCount = assignmentsResponse.value?.length ?? 0;
              if (assignmentCount > 0) {
                return { task, success: true, skipped: true, error: `Policy has ${assignmentCount} active assignment(s)` };
              }
            } catch {
              // Continue if assignments can't be checked
            }

            if (isPreview) {
              return { task, success: true, skipped: false };
            }

            await client.delete(`/deviceManagement/intents/${policy.id}`);

            if (context.cachedSecurityIntents) {
              context.cachedSecurityIntents = context.cachedSecurityIntents.filter(
                (cachedPolicy) => cachedPolicy.id !== policy.id
              );
            }

            return { task, success: true, skipped: false };
          }

          // Can't delete what we can't create
          return { task, success: true, skipped: true, error: "Unsupported policy type" };

        case "V2Compliance": {
          // Delete from /compliancePolicies
          if (hasODataUnsafeChars(policyName)) {
            console.log(`[CIS Baseline Task] Cannot query V2 Compliance for "${policyName}" (OData-unsafe chars) - skipping`);
            return { task, success: true, skipped: true, error: "Cannot query by name (special characters)" };
          }
          const escapedV2Name = escapeODataString(policyName);
          const v2Response = await client.get<{ value: Array<{ id: string; name: string; description?: string }> }>(
            `/deviceManagement/compliancePolicies?$filter=name eq '${encodeURIComponent(escapedV2Name)}'&$select=id,name,description`
          );
          if (!v2Response.value || v2Response.value.length === 0) {
            console.log(`[CIS Baseline Task] V2 Compliance policy "${policyName}" not found in tenant`);
            return { task, success: true, skipped: true, error: "Not found in tenant" };
          }
          const v2Policy = v2Response.value[0];
          if (!hasHydrationMarker(v2Policy.description)) {
            console.log(`[CIS Baseline Task] V2 Compliance policy "${v2Policy.name}" exists but was not created by Intune Hydration Kit`);
            return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          await client.delete(`/deviceManagement/compliancePolicies/${v2Policy.id}`);
          console.log(`[CIS Baseline Task] Deleted V2 Compliance policy: "${policyName}"`);
          return { task, success: true, skipped: false };
        }

        case "V1Compliance": {
          // Delete from /deviceCompliancePolicies
          if (hasODataUnsafeChars(policyName)) {
            console.log(`[CIS Baseline Task] Cannot query V1 Compliance for "${policyName}" (OData-unsafe chars) - skipping`);
            return { task, success: true, skipped: true, error: "Cannot query by name (special characters)" };
          }
          const escapedV1Name = escapeODataString(policyName);
          const v1Response = await client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
            `/deviceManagement/deviceCompliancePolicies?$filter=displayName eq '${encodeURIComponent(escapedV1Name)}'&$select=id,displayName,description`
          );
          if (!v1Response.value || v1Response.value.length === 0) {
            console.log(`[CIS Baseline Task] V1 Compliance policy "${policyName}" not found in tenant`);
            return { task, success: true, skipped: true, error: "Not found in tenant" };
          }
          const v1Policy = v1Response.value[0];
          if (!hasHydrationMarker(v1Policy.description)) {
            console.log(`[CIS Baseline Task] V1 Compliance policy "${v1Policy.displayName}" exists but was not created by Intune Hydration Kit`);
            return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          await client.delete(`/deviceManagement/deviceCompliancePolicies/${v1Policy.id}`);
          console.log(`[CIS Baseline Task] Deleted V1 Compliance policy: "${policyName}"`);
          return { task, success: true, skipped: false };
        }

        case "DeviceConfiguration": {
          // Delete from /deviceConfigurations
          if (hasODataUnsafeChars(policyName)) {
            console.log(`[CIS Baseline Task] Cannot query Device Configuration for "${policyName}" (OData-unsafe chars) - skipping`);
            return { task, success: true, skipped: true, error: "Cannot query by name (special characters)" };
          }
          const escapedDcName = escapeODataString(policyName);
          const dcResponse = await client.get<{ value: Array<{ id: string; displayName: string; description?: string }> }>(
            `/deviceManagement/deviceConfigurations?$filter=displayName eq '${encodeURIComponent(escapedDcName)}'&$select=id,displayName,description`
          );
          if (!dcResponse.value || dcResponse.value.length === 0) {
            console.log(`[CIS Baseline Task] Device Configuration policy "${policyName}" not found in tenant`);
            return { task, success: true, skipped: true, error: "Not found in tenant" };
          }
          const dcPolicy = dcResponse.value[0];
          if (!hasHydrationMarker(dcPolicy.description)) {
            console.log(`[CIS Baseline Task] Device Configuration policy "${dcPolicy.displayName}" exists but was not created by Intune Hydration Kit`);
            return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          await client.delete(`/deviceManagement/deviceConfigurations/${dcPolicy.id}`);
          console.log(`[CIS Baseline Task] Deleted Device Configuration policy: "${policyName}"`);
          return { task, success: true, skipped: false };
        }

        case "SettingsCatalog":
        default: {
          // Use pre-fetched cache for Settings Catalog policies
          let allPolicies = context.cachedSettingsCatalogPolicies || [];

          if (allPolicies.length === 0) {
            console.log(`[CIS Baseline Task] No cached Settings Catalog policies - fetching now...`);
            allPolicies = await client.getCollection<{ id: string; name: string; description?: string }>(
              `/deviceManagement/configurationPolicies?$select=id,name,description`
            );
            context.cachedSettingsCatalogPolicies = allPolicies;
          }

          // Find matching policy by name (case-insensitive)
          let policy = allPolicies.find(
            (p) => p.name?.toLowerCase() === policyName.toLowerCase()
          );

          // If not found by exact name match, try partial match as fallback
          if (!policy) {
            console.log(`[CIS Baseline Task] Policy "${policyName}" not found by exact match, trying partial match...`);
            policy = allPolicies.find(
              (p) => p.name?.toLowerCase().includes(policyName.toLowerCase()) ||
                     policyName.toLowerCase().includes(p.name?.toLowerCase() || "")
            );
            if (policy) {
              console.log(`[CIS Baseline Task] Found partial match: "${policy.name}" for "${policyName}"`);
            }
          }

          if (!policy) {
            console.log(`[CIS Baseline Task] Policy "${policyName}" not found in ${allPolicies.length} cached policies`);
            return { task, success: true, skipped: true, error: "Not found in tenant" };
          }

          console.log(`[CIS Baseline Task] Found Settings Catalog policy: "${policy.name}" (ID: ${policy.id})`);

          if (!hasHydrationMarker(policy.description)) {
            console.log(`[CIS Baseline Task] Policy "${policy.name}" exists but was not created by Intune Hydration Kit (no marker in description)`);
            return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
          }

          // Check for active assignments - skip deletion if assigned
          try {
            const assignmentsResponse = await client.get<{ value: Array<{ id: string }> }>(
              `/deviceManagement/configurationPolicies/${policy.id}/assignments`
            );
            const assignmentCount = assignmentsResponse.value?.length ?? 0;
            if (assignmentCount > 0) {
              console.log(`[CIS Baseline Task] Skipping deletion of "${policy.name}" - has ${assignmentCount} active assignment(s)`);
              return { task, success: true, skipped: true, error: `Policy has ${assignmentCount} active assignment(s)` };
            }
          } catch {
            // Continue if assignments can't be checked
          }

          if (isPreview) {
            return { task, success: true, skipped: false };
          }

          // Retry delete up to 5 times with delay (Intune backend can be flaky)
          let deleteAttempts = 0;
          const maxDeleteAttempts = 5;
          let lastDeleteError: Error | null = null;

          while (deleteAttempts < maxDeleteAttempts) {
            try {
              await client.delete(`/deviceManagement/configurationPolicies/${policy.id}`);
              console.log(`[CIS Baseline Task] Deleted settings catalog policy: "${policyName}"`);
              lastDeleteError = null;
              break;
            } catch (deleteError) {
              deleteAttempts++;
              lastDeleteError = deleteError instanceof Error ? deleteError : new Error(String(deleteError));
              console.warn(`[CIS Baseline Task] Delete attempt ${deleteAttempts}/${maxDeleteAttempts} failed for "${policyName}": ${lastDeleteError.message}`);

              if (deleteAttempts < maxDeleteAttempts) {
                // Wait longer between retries (2s, 4s)
                await new Promise(resolve => setTimeout(resolve, 2000 * deleteAttempts));
              }
            }
          }

          if (lastDeleteError) {
            // Provide more helpful error message for Microsoft backend errors
            let errorMsg = lastDeleteError.message;
            if (errorMsg.includes("[400]") || errorMsg.includes("An error has occurred")) {
              errorMsg = `Microsoft Intune backend error - some Settings Catalog policies cannot be deleted via Graph API. Delete manually in Intune portal.`;
            }
            return { task, success: false, skipped: false, error: errorMsg };
          }

          // Remove from cache
          if (context.cachedSettingsCatalogPolicies) {
            context.cachedSettingsCatalogPolicies = context.cachedSettingsCatalogPolicies.filter(
              (p) => p.id !== policy.id
            );
          }
          return { task, success: true, skipped: false };
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: false, skipped: false, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
