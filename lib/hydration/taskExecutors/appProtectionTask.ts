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

function stripImportPrefix(name: string): string {
  return name.replace(/^\[ihd\]\s/i, "");
}

function namesMatch(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  return (
    normalizedLeft === normalizedRight ||
    stripImportPrefix(normalizedLeft) === stripImportPrefix(normalizedRight)
  );
}

/**
 * Execute an app protection policy task (create or delete)
 */
export async function executeAppProtectionTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;
  const requestedName = task.itemName;
  const normalizedRequestedName = stripImportPrefix(requestedName);

  // Try to get template from cache first, fallback to hardcoded templates
  let template: AppProtectionTemplate | AppProtectionPolicy | undefined;
  const cachedAppProtection = getCachedTemplates("appProtection");
  if (cachedAppProtection && Array.isArray(cachedAppProtection)) {
    template = (cachedAppProtection as AppProtectionTemplate[]).find((ap) =>
      namesMatch(ap.displayName, requestedName)
    );
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template =
      Templates.getAppProtectionPolicyByName(requestedName) ??
      Templates.getAppProtectionPolicyByName(normalizedRequestedName);
  }

  if (mode === "create") {
    if (!template) {
      return { task, success: false, skipped: false, error: "Template not found" };
    }

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
    const policy = context.cachedAppProtectionPolicies?.find((p) =>
      namesMatch(p.displayName, template?.displayName ?? requestedName)
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
      const templateOdataType = template?.["@odata.type"];
      if (templateOdataType === "#microsoft.graph.iosManagedAppProtection") {
        platform = "iOS";
      } else if (templateOdataType === "#microsoft.graph.androidManagedAppProtection") {
        platform = "android";
      } else {
        throw new Error(`Unable to determine platform for policy "${policy.displayName}"`);
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
