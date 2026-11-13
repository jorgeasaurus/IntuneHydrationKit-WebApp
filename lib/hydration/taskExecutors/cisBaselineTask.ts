/* oxlint-disable react-doctor/async-await-in-loop -- polling waits for Graph propagation and must remain sequential. */
/**
 * CIS Baseline Task Executor
 * Handles create and delete operations for CIS Intune Baseline policies
 * Routes to correct API based on policy type (V2Compliance, V1Compliance, DeviceConfiguration, SettingsCatalog)
 */

import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import { detectCISPolicyType } from "../policyDetection";
import {
  createSettingsCatalogPolicy,
  createV2CompliancePolicy,
  createCISCompliancePolicy,
  createCISDeviceConfiguration,
  createCISGroupPolicyConfiguration,
  createCISSecurityIntent,
} from "../policyCreators";
import { findExistingByName, requireTenantCache } from "../utils";
import { getCachedTemplates, getAllTemplateCacheKeys, CISBaselinePolicy } from "@/lib/templates/loader";

function alreadyExists(task: HydrationTask, label: string, policyName: string): ExecutionResult {
  console.log(`[CIS Baseline Task] ${label} already exists, skipping: "${policyName}"`);
  return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
}

/**
 * Execute a CIS Baseline task (create or delete)
 * Routes to correct endpoint based on policy type
 */
export async function executeCISBaselineTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // Delete uses the shared resolver, so the sequential and parallel paths give the same outcome.
  if (context.operationMode === "delete") {
    return executeDeleteTask(task, context);
  }

  const { client, operationMode: mode, isPreview } = context;

  // Get template from cache - need to find the right cache key
  let template: CISBaselinePolicy | undefined;

  // Try to find in any CIS baseline cache (includes both sessionStorage and in-memory fallback)
  // Task identity is the manifest file path when available; fall back to legacy display names.
  const cisLookupKey = task.templatePath || task.itemName;
  const cacheKeys = getAllTemplateCacheKeys().filter(k => k.startsWith("intune-hydration-templates-cisBaseline"));
  for (const key of cacheKeys) {
    const cacheKey = key.replace("intune-hydration-templates-", "");
    const cached = getCachedTemplates(cacheKey);
    if (cached && Array.isArray(cached)) {
      for (const baseline of cached as CISBaselinePolicy[]) {
        if (
          baseline._cisFilePath === cisLookupKey ||
          baseline.displayName === cisLookupKey ||
          (baseline as Record<string, unknown>).name === cisLookupKey
        ) {
          template = baseline;
          break;
        }
      }
      if (template) break;
    }
  }

  if (!template) {
    console.error(`[CIS Baseline Task] Template not found for: "${cisLookupKey}"`);
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  // Detect the policy type for proper routing
  const policyType = detectCISPolicyType(template as Record<string, unknown>);
  const odataType = template["@odata.type"] as string || "";
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
            skipKind: "blocked",
            error: `Unsupported policy type: ${odataType}. ${unsupportedReason}`
          };

        case "GroupPolicyConfiguration": {
          const groupPolicyConfigurations = requireTenantCache(context, "cachedGroupPolicyConfigurations");
          if (findExistingByName(groupPolicyConfigurations, policyName, (policy) => policy.displayName)) {
            return alreadyExists(task, "Group Policy Configuration", policyName);
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const createdGroupPolicy = await createCISGroupPolicyConfiguration(client, template as Record<string, unknown>);
          groupPolicyConfigurations.push({ id: createdGroupPolicy.id, displayName: policyName, description: "" });
          return { task, success: true, skipped: false, createdId: createdGroupPolicy.id };
        }

        case "SecurityIntent": {
          const securityIntents = requireTenantCache(context, "cachedSecurityIntents");
          if (findExistingByName(securityIntents, policyName, (policy) => policy.displayName)) {
            return alreadyExists(task, "Security Intent", policyName);
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const createdIntent = await createCISSecurityIntent(client, template as Record<string, unknown>);
          securityIntents.push({ id: createdIntent.id, displayName: policyName, description: "" });
          return { task, success: true, skipped: false, createdId: createdIntent.id };
        }

        case "V2Compliance": {
          // Settings Catalog compliance -> /compliancePolicies
          const v2CompliancePolicies = requireTenantCache(context, "cachedV2CompliancePolicies");
          // V2 policies can also appear in the Settings Catalog list
          const existingV2Policy =
            findExistingByName(v2CompliancePolicies, policyName, (policy) => policy.name) ??
            findExistingByName(context.cachedSettingsCatalogPolicies ?? [], policyName, (policy) => policy.name);
          if (existingV2Policy) {
            return alreadyExists(task, "V2 Compliance policy", policyName);
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const v2Created = await createV2CompliancePolicy(client, template as Record<string, unknown>);
          v2CompliancePolicies.push({ id: v2Created.id, name: policyName, description: "" });
          return { task, success: true, skipped: false, createdId: v2Created.id };
        }

        case "V1Compliance": {
          // Legacy compliance -> /deviceCompliancePolicies
          const compliancePolicies = requireTenantCache(context, "cachedCompliancePolicies");
          if (findExistingByName(compliancePolicies, policyName, (policy) => policy.displayName)) {
            return alreadyExists(task, "V1 Compliance policy", policyName);
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const v1Created = await createCISCompliancePolicy(client, template as Record<string, unknown>);
          compliancePolicies.push({ id: v1Created.id, displayName: policyName, description: "" });
          return { task, success: true, skipped: false, createdId: v1Created.id };
        }

        case "DeviceConfiguration": {
          // Device configuration -> /deviceConfigurations
          const deviceConfigurations = requireTenantCache(context, "cachedDeviceConfigurations");
          if (findExistingByName(deviceConfigurations, policyName, (policy) => policy.displayName)) {
            return alreadyExists(task, "Device Configuration", policyName);
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const dcCreated = await createCISDeviceConfiguration(client, template as Record<string, unknown>);
          deviceConfigurations.push({ id: dcCreated.id, displayName: policyName, description: "" });
          return { task, success: true, skipped: false, createdId: dcCreated.id };
        }

        case "SettingsCatalog":
        default: {
          // Settings Catalog -> /configurationPolicies
          const settingsCatalogPolicies = requireTenantCache(context, "cachedSettingsCatalogPolicies");
          if (findExistingByName(settingsCatalogPolicies, policyName, (policy) => policy.name)) {
            return alreadyExists(task, "Settings Catalog policy", policyName);
          }
          if (isPreview) {
            return { task, success: true, skipped: false };
          }
          const scCreated = await createSettingsCatalogPolicy(client, template as Record<string, unknown>);
          settingsCatalogPolicies.push({ id: scCreated.id, name: policyName, description: "" });
          return { task, success: true, skipped: false, createdId: scCreated.id, warning: scCreated.warning };
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CIS Baseline Task] Failed to create policy: "${policyName}"`, error);
      return { task, success: false, skipped: false, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
