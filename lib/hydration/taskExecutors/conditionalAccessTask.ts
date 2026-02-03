/**
 * Conditional Access Task Executor
 * Handles create and delete operations for Entra ID Conditional Access policies
 */

import { HydrationTask } from "@/types/hydration";
import { ConditionalAccessPolicy } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import {
  createConditionalAccessPolicy,
  deleteConditionalAccessPolicyByName,
  conditionalAccessPolicyExists,
} from "@/lib/graph/conditionalAccess";
import { policyRequiresPremiumP2 } from "@/lib/graph/conditionalAccessP2";
import { getCachedTemplates, ConditionalAccessTemplate } from "@/lib/templates/loader";
import * as Templates from "@/templates";

/**
 * Execute a conditional access policy task (create or delete)
 */
export async function executeConditionalAccessTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode } = context;

  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: ConditionalAccessTemplate | ConditionalAccessPolicy | undefined;
  const cachedCA = getCachedTemplates("conditionalAccess");
  if (cachedCA && Array.isArray(cachedCA)) {
    template = (cachedCA as ConditionalAccessTemplate[]).find((ca) => ca.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getConditionalAccessPolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  // Check if tenant has Entra ID Premium P1 license (required for ALL CA policies)
  if (mode === "create" && context.hasConditionalAccessLicense === false) {
    console.log(
      `[Conditional Access] Skipped: ${template.displayName} - no Entra ID Premium (P1) license`
    );
    return {
      task,
      success: false,
      skipped: true,
      error: "No Entra ID Premium (P1) license",
    };
  }

  // Check if policy requires Premium P2 and tenant doesn't have it (PowerShell parity)
  if (mode === "create" && context.hasPremiumP2License === false) {
    if (policyRequiresPremiumP2(template as ConditionalAccessPolicy)) {
      console.log(
        `[Conditional Access] Skipped: ${template.displayName} - requires Azure AD Premium P2 license (uses risk-based conditions)`
      );
      return {
        task,
        success: false,
        skipped: true,
        error: "Requires Premium P2 license",
      };
    }
  }

  if (mode === "create") {
    // Check if policy already exists
    const exists = await conditionalAccessPolicyExists(client, template.displayName);
    if (exists) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Policy already exists",
      };
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
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Delete the policy (must be disabled first)
    try {
      await deleteConditionalAccessPolicyByName(client, template.displayName);
      return { task, success: true, skipped: false };
    } catch (error) {
      // Policy not found or not created by hydration kit - skip
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
