/**
 * Baseline Task Executor
 * Handles create and delete operations for OpenIntuneBaseline policies
 * Routes to correct API based on policy type (Settings Catalog, Device Configuration, etc.)
 */

import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import {
  createSettingsCatalogPolicy,
  createDeviceConfigurationPolicy,
  createDriverUpdateProfile,
  createBaselineCompliancePolicy,
} from "../policyCreators";
import { requireTenantCache } from "../utils";
import { findBaselineMatch, recordBaselineMatch } from "../baselineEvidence";
import { resolveOIBOrganizationId } from "../templatePlaceholders";
import { createAppProtectionPolicy } from "@/lib/graph/appProtection";
import { getCachedTemplates, BaselinePolicy, AppProtectionTemplate } from "@/lib/templates/loader";

/**
 * Execute a baseline task (create or delete)
 * Routes to correct API based on policy type
 */
export async function executeBaselineTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // Delete uses the shared resolver, so the sequential and parallel paths give the same outcome.
  if (context.operationMode === "delete") {
    return executeDeleteTask(task, context);
  }

  const { client, operationMode: mode, isPreview } = context;

  // Get template from cache
  const cachedBaseline = context.cachedBaselineTemplates || getCachedTemplates("baseline");
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

  template = resolveOIBOrganizationId(template, context.tenantId);

  // Determine the policy type and route accordingly
  const policyType = template._oibPolicyType;
  const policyName = template.name || template.displayName || task.itemName;

  console.log(`[Baseline Task] Processing "${policyName}" (type: ${policyType})`);

  if (mode === "create") {
    try {
      // Route based on policy type
      if (policyType === "CompliancePolicies") {
        // Compliance policies go to deviceCompliancePolicies endpoint
        const compliancePolicies = requireTenantCache(context, "cachedCompliancePolicies");
        const existingCompliancePolicy = findBaselineMatch("CompliancePolicies", policyName, compliancePolicies);

        if (existingCompliancePolicy) {
          await recordBaselineMatch(task, template, existingCompliancePolicy, "CompliancePolicies", client);
          console.log(`[Baseline Task] Compliance policy already exists (cache), skipping: "${policyName}"`);
          return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
        }

        if (isPreview) {
          return { task, success: true, skipped: false };
        }
        const created = await createBaselineCompliancePolicy(client, template as Record<string, unknown>);
        compliancePolicies.push({ id: created.id, displayName: policyName, description: "" });
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "AppProtection") {
        // App Protection policies - use existing app protection handler
        const platform = template["@odata.type"] === "#microsoft.graph.iosManagedAppProtection" ? "iOS" : "android";
        const appProtectionPolicies = requireTenantCache(context, "cachedAppProtectionPolicies");
        const platformPolicies = appProtectionPolicies.filter((policy) => {
          if (policy._platform) return policy._platform === platform;
          const expectedType = platform === "iOS" ? "#microsoft.graph.iosManagedAppProtection" : "#microsoft.graph.androidManagedAppProtection";
          return policy["@odata.type"] === expectedType;
        });
        const existingPolicy = findBaselineMatch("AppProtection", policyName, platformPolicies);
        if (existingPolicy) {
          await recordBaselineMatch(task, template, existingPolicy, "AppProtection", client);
          console.log(`[Baseline Task] App Protection policy already exists, skipping: "${policyName}"`);
          return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
        }
        if (isPreview) {
          return { task, success: true, skipped: false };
        }
        const created = await createAppProtectionPolicy(client, template as AppProtectionTemplate);
        appProtectionPolicies.push(created);
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "DeviceConfiguration" || policyType === "UpdatePolicies") {
        // DeviceConfiguration and UpdatePolicies use deviceConfigurations endpoint
        const policies = requireTenantCache(context, "cachedDeviceConfigurations");
        const existingPolicy = findBaselineMatch("DeviceConfiguration", policyName, policies);
        if (existingPolicy) {
          await recordBaselineMatch(task, template, existingPolicy, "DeviceConfiguration", client);
          console.log(`[Baseline Task] Device Configuration policy already exists, skipping: "${policyName}"`);
          return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
        }
        if (isPreview) {
          return { task, success: true, skipped: false };
        }
        const created = await createDeviceConfigurationPolicy(client, template as Record<string, unknown>);
        policies.push({ id: created.id, displayName: policyName, description: "" });
        return { task, success: true, skipped: false, createdId: created.id };

      } else if (policyType === "DriverUpdateProfiles") {
        const policies = requireTenantCache(context, "cachedDriverUpdateProfiles");
        const existingProfile = findBaselineMatch("DriverUpdateProfiles", policyName, policies);
        if (existingProfile) {
          await recordBaselineMatch(task, template, existingProfile, "DriverUpdateProfiles", client);
          console.log(`[Baseline Task] Driver Update Profile already exists, skipping: "${policyName}"`);
          return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
        }
        if (isPreview) {
          return { task, success: true, skipped: false };
        }
        const created = await createDriverUpdateProfile(client, template as Record<string, unknown>);
        policies.push({ id: created.id, displayName: policyName, description: "" });
        return { task, success: true, skipped: false, createdId: created.id };

      } else {
        // SettingsCatalog (default) - use configurationPolicies endpoint
        const settingsCatalogPolicies = requireTenantCache(context, "cachedSettingsCatalogPolicies");
        const existingSettingsPolicy = findBaselineMatch("SettingsCatalog", policyName, settingsCatalogPolicies);

        if (existingSettingsPolicy) {
          await recordBaselineMatch(task, template, existingSettingsPolicy, "SettingsCatalog", client);
          console.log(`[Baseline Task] Settings Catalog policy already exists (cache), skipping: "${policyName}"`);
          return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
        }

        if (isPreview) {
          return { task, success: true, skipped: false };
        }

        const created = await createSettingsCatalogPolicy(client, template as Record<string, unknown>);

        // Add to cache to prevent duplicate creation
        settingsCatalogPolicies.push({ id: created.id, name: policyName, description: "" });

        return { task, success: true, skipped: false, createdId: created.id, warning: created.warning };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Baseline Task] Failed to create policy: "${policyName}"`, error);
      return { task, success: false, skipped: false, error: errorMessage };
    }

  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
