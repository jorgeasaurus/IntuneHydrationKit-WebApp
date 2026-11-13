/**
 * Conditional Access Task Executor
 * Handles create and delete operations for Entra ID Conditional Access policies
 */

import { getConditionalAccessBlockReason } from "../conditionalAccessBatch";
import { HydrationTask } from "@/types/hydration";
import { ConditionalAccessPolicy } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import { createConditionalAccessPolicy } from "@/lib/graph/conditionalAccess";
import { getCachedTemplates, ConditionalAccessTemplate } from "@/lib/templates/loader";
import { requireTenantCache } from "../utils";
import { findExistingConditionalAccessPolicy } from "../existingObjects";

/**
 * Execute a conditional access policy task (create or delete)
 */
export async function executeConditionalAccessTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // Delete uses the shared resolver, so the sequential and parallel paths give the same outcome.
  if (context.operationMode === "delete") {
    return executeDeleteTask(task, context);
  }

  const { client, operationMode: mode, isPreview } = context;

  // Templates are loaded from the bundled JSON files before execution.
  let template: ConditionalAccessTemplate | ConditionalAccessPolicy | undefined;
  const cachedCA = getCachedTemplates("conditionalAccess");
  if (cachedCA && Array.isArray(cachedCA)) {
    template = (cachedCA as ConditionalAccessTemplate[]).find((ca) => ca.displayName === task.itemName);
  }

  if (mode === "create") {
    if (!template) {
      return { task, success: false, skipped: false, error: "Template not found" };
    }

    // The Premium P1/P2 license checks run before dispatch (getLicenseSkipReason in utils.ts).
    const existingPolicy = findExistingConditionalAccessPolicy(
      template.displayName,
      requireTenantCache(context, "cachedConditionalAccessPolicies")
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

    // Convert template to full ConditionalAccessPolicy format if needed
    let fullCATemplate: ConditionalAccessPolicy = template as ConditionalAccessPolicy;
    if (!("@odata.type" in template)) {
      const simpleTemplate = template as ConditionalAccessTemplate;
      fullCATemplate = {
        "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
        displayName: simpleTemplate.displayName,
        state: simpleTemplate.state as "enabled" | "disabled" | "enabledForReportingButNotEnforced",
        conditions: simpleTemplate.conditions as { [key: string]: unknown },
        grantControls: simpleTemplate.grantControls,
        sessionControls: simpleTemplate.sessionControls,
      };
    }

    // Create the policy (will be forced to disabled state)
    let created: Awaited<ReturnType<typeof createConditionalAccessPolicy>>;
    try {
      created = await createConditionalAccessPolicy(client, fullCATemplate);
    } catch (error) {
      // A license or service refusal is not a failure of the run. Graph created nothing.
      const blockReason = error instanceof Error ? getConditionalAccessBlockReason({ message: error.message }) : null;
      if (!blockReason) throw error;
      return { task, success: false, skipped: true, skipKind: "blocked", error: blockReason };
    }
    requireTenantCache(context, "cachedConditionalAccessPolicies").push({
      id: created.id ?? "",
      displayName: template.displayName,
    });
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
