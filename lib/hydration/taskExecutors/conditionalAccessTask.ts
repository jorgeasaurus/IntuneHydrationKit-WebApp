/**
 * Conditional Access Task Executor
 * Handles create and delete operations for Entra ID Conditional Access policies
 */

import { HydrationTask } from "@/types/hydration";
import { ConditionalAccessPolicy } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import { createConditionalAccessPolicy } from "@/lib/graph/conditionalAccess";
import { policyRequiresPremiumP2 } from "@/lib/graph/conditionalAccessP2";
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

  return policies?.find((policy) => {
    const policyLower = policy.displayName?.toLowerCase();
    return (
      policyLower === lowerName ||
      policyLower === suffixedLowerName ||
      policyLower === fullMarkerLowerName ||
      normalizeName(policy.displayName) === normalizedDisplayName
    );
  });
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

    // Check if tenant has Entra ID Premium P1 license (required for ALL CA policies)
    if (context.hasConditionalAccessLicense === false) {
      console.log(
        `[Conditional Access] Skipped: ${template.displayName} - no Entra ID Premium (P1) license`
      );
      return {
        task,
        success: true,
        skipped: true,
        skipKind: "blocked",
        error: "No Entra ID Premium (P1) license",
      };
    }

    // Check if policy requires Premium P2 and tenant doesn't have it (PowerShell parity)
    if (
      context.hasPremiumP2License === false &&
      policyRequiresPremiumP2(template as ConditionalAccessPolicy)
    ) {
      console.log(
        `[Conditional Access] Skipped: ${template.displayName} - requires Azure AD Premium P2 license (uses risk-based conditions)`
      );
      return {
        task,
        success: true,
        skipped: true,
        skipKind: "blocked",
        error: "Requires Premium P2 license",
      };
    }

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
