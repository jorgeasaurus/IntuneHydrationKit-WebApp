/**
 * App Protection Task Executor
 * Handles create and delete operations for Intune App Protection (MAM) policies
 */

import { HydrationTask } from "@/types/hydration";
import { AppProtectionPolicy } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import { requireTenantCache } from "../utils";
import { createAppProtectionPolicy } from "@/lib/graph/appProtection";
import { getCachedTemplates, AppProtectionTemplate } from "@/lib/templates/loader";

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
  // Delete uses the shared resolver, so the sequential and parallel paths give the same outcome.
  if (context.operationMode === "delete") {
    return executeDeleteTask(task, context);
  }

  const { client, operationMode: mode, isPreview } = context;
  const requestedName = task.itemName;

  // Templates are loaded from the bundled JSON files before execution.
  let template: AppProtectionTemplate | AppProtectionPolicy | undefined;
  const cachedAppProtection = getCachedTemplates("appProtection");
  if (cachedAppProtection && Array.isArray(cachedAppProtection)) {
    template = (cachedAppProtection as AppProtectionTemplate[]).find((ap) =>
      namesMatch(ap.displayName, requestedName)
    );
  }

  if (mode === "create") {
    if (!template) {
      return {
        task,
        success: false,
        skipped: false,
        error: `Template not found for ${requestedName}. Reload templates and try again.`,
      };
    }

    // Check if policy already exists using cached policies
    const existingPolicy = requireTenantCache(context, "cachedAppProtectionPolicies").find(
      (p) => p.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingPolicy) {
      return {
        task,
        success: true,
        skipped: true,
        skipKind: "noOp",
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
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
