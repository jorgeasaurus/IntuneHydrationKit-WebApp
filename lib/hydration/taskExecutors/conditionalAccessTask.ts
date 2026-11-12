/**
 * Conditional Access Task Executor
 * Handles create and delete operations for Entra ID Conditional Access policies
 */

import { HydrationTask } from "@/types/hydration";
import { ConditionalAccessPolicy } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import { createConditionalAccessPolicy, findHydrationConditionalAccessPolicy } from "@/lib/graph/conditionalAccess";
import { getCachedTemplates, ConditionalAccessTemplate } from "@/lib/templates/loader";
import { normalizeName, requireTenantCache } from "../utils";

function findCachedConditionalAccessPolicy(
  displayName: string,
  policies: ExecutionContext["cachedConditionalAccessPolicies"]
): { id: string; displayName?: string; description?: string } | undefined {
  const lowerName = displayName.toLowerCase();
  const suffixedLowerName = `${lowerName} [intune hydration kit]`;
  const fullMarkerLowerName = `${lowerName} [imported by intune hydration kit]`;
  const normalizedDisplayName = normalizeName(displayName);

  const match = policies?.find((policy) => {
    const policyLower = policy.displayName?.toLowerCase();
    return (
      policyLower === lowerName ||
      policyLower === suffixedLowerName ||
      policyLower === fullMarkerLowerName ||
      normalizeName(policy.displayName) === normalizedDisplayName
    );
  });
  if (match) return match;
  // A kit policy can carry the other marker format, for example
  // "Require MFA [Imported by Intune Hydration Kit]" for the template "[IHD] Require MFA".
  return (policies && findHydrationConditionalAccessPolicy(policies, displayName)) ?? undefined;
}

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
    const existingPolicy = findCachedConditionalAccessPolicy(
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
    const created = await createConditionalAccessPolicy(client, fullCATemplate);
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
