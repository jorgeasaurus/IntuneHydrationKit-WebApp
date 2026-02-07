/**
 * App Protection Task Executor
 * Handles create and delete operations for Intune App Protection (MAM) policies
 */

import { HydrationTask } from "@/types/hydration";
import { AppProtectionPolicy } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import {
  createAppProtectionPolicy,
  deleteAppProtectionPolicy,
} from "@/lib/graph/appProtection";
import { getCachedTemplates, AppProtectionTemplate } from "@/lib/templates/loader";
import * as Templates from "@/templates";

/**
 * Execute an app protection policy task (create or delete)
 */
export async function executeAppProtectionTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;

  // Try to get template from cache first, fallback to hardcoded templates
  let template: AppProtectionTemplate | AppProtectionPolicy | undefined;
  const cachedAppProtection = getCachedTemplates("appProtection");
  if (cachedAppProtection && Array.isArray(cachedAppProtection)) {
    template = (cachedAppProtection as AppProtectionTemplate[]).find((ap) => ap.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getAppProtectionPolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  if (mode === "create") {
    // Check if policy already exists using cached policies
    const existingPolicy = context.cachedAppProtectionPolicies?.find(
      (p) => p.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingPolicy) {
      return {
        task,
        success: true,
        skipped: true,
        error: "Already exists",
      };
    }

    // Preview mode - would create
    if (isPreview) {
      return { task, success: true, skipped: false };
    }

    // Create the policy
    const created = await createAppProtectionPolicy(client, template);

    // Add the newly created policy to the cache
    if (context.cachedAppProtectionPolicies) {
      context.cachedAppProtectionPolicies.push(created);
    }

    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Get the policy from cache instead of making an API call
    const policy = context.cachedAppProtectionPolicies?.find(
      (p) => p.displayName.toLowerCase() === template.displayName.toLowerCase()
    );

    if (!policy || !policy.id) {
      // Policy doesn't exist, skip deletion
      return { task, success: true, skipped: true, error: "Not found in tenant" };
    }

    // Preview mode - would delete
    if (isPreview) {
      return { task, success: true, skipped: false };
    }

    // Determine platform from @odata.type
    const odataType = policy["@odata.type"];
    let platform: "iOS" | "android";

    if (odataType === "#microsoft.graph.iosManagedAppProtection") {
      platform = "iOS";
    } else if (odataType === "#microsoft.graph.androidManagedAppProtection") {
      platform = "android";
    } else {
      // Fallback: check template's @odata.type if policy doesn't have it
      const templateOdataType = template["@odata.type"];
      if (templateOdataType === "#microsoft.graph.iosManagedAppProtection") {
        platform = "iOS";
      } else if (templateOdataType === "#microsoft.graph.androidManagedAppProtection") {
        platform = "android";
      } else {
        throw new Error(`Unable to determine platform for policy "${template.displayName}"`);
      }
    }

    // Delete the policy
    const result = await deleteAppProtectionPolicy(client, policy.id, platform);

    // Check if skipped due to active assignments
    if (result.skipped) {
      return { task, success: true, skipped: true, error: result.reason };
    }

    // Remove the deleted policy from the cache
    if (context.cachedAppProtectionPolicies) {
      const index = context.cachedAppProtectionPolicies.findIndex((p) => p.id === policy.id);
      if (index !== -1) {
        context.cachedAppProtectionPolicies.splice(index, 1);
      }
    }

    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
