/**
 * Compliance Task Executor
 * Handles create and delete operations for Intune compliance policies
 */

import { HydrationTask } from "@/types/hydration";
import { CompliancePolicy } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import {
  createCompliancePolicy,
  deleteCompliancePolicyByName,
  compliancePolicyExists,
} from "@/lib/graph/compliance";
import { getCachedTemplates, ComplianceTemplate } from "@/lib/templates/loader";
import * as Templates from "@/templates";

/**
 * Execute a compliance policy task (create or delete)
 */
export async function executeComplianceTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;

  // Try to get template from cache first, fallback to hardcoded templates
  let template: ComplianceTemplate | CompliancePolicy | undefined;
  const cachedCompliance = getCachedTemplates("compliance");
  if (cachedCompliance && Array.isArray(cachedCompliance)) {
    template = (cachedCompliance as ComplianceTemplate[]).find((c) => c.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getCompliancePolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  if (mode === "create") {
    // Check if policy already exists
    const exists = await compliancePolicyExists(client, template.displayName);
    if (exists) {
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

    // Create the policy with 504 verification
    try {
      const created = await createCompliancePolicy(client, template);
      return {
        task,
        success: true,
        skipped: false,
        createdId: created.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's a 504 timeout error
      if (errorMessage.includes("504") || errorMessage.includes("Gateway Timeout")) {
        console.log(`[Engine:Compliance] Got 504 for "${template.displayName}", verifying if policy was created...`);

        // Wait for async creation to complete
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check if policy was actually created despite 504
        const wasCreated = await compliancePolicyExists(client, template.displayName);
        if (wasCreated) {
          console.log(`[Engine:Compliance] Policy "${template.displayName}" was created despite 504 - marking as success`);
          // Get the policy ID
          const policies = await client.get<{ value: Array<{ id: string; displayName: string }> }>(
            "/deviceManagement/deviceCompliancePolicies"
          );
          const createdPolicy = policies?.value?.find(
            p => p.displayName?.toLowerCase() === template.displayName.toLowerCase()
          );
          return {
            task,
            success: true,
            skipped: false,
            createdId: createdPolicy?.id,
          };
        }

        console.log(`[Engine:Compliance] Policy "${template.displayName}" not found after 504 - creation failed`);
      }

      return {
        task,
        success: false,
        skipped: false,
        error: errorMessage,
      };
    }
  } else if (mode === "delete") {
    // Check if policy exists first
    const exists = await compliancePolicyExists(client, template.displayName);
    if (!exists) {
      return { task, success: true, skipped: true, error: "Not found in tenant" };
    }

    // Preview mode - would delete
    if (isPreview) {
      return { task, success: true, skipped: false };
    }

    // Delete the policy with 504 verification
    try {
      const result = await deleteCompliancePolicyByName(client, template.displayName);

      // Check if skipped due to active assignments
      if (result.skipped) {
        return { task, success: true, skipped: true, error: result.reason };
      }

      return { task, success: true, skipped: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's a 504 timeout error
      if (errorMessage.includes("504") || errorMessage.includes("Gateway Timeout")) {
        console.log(`[Engine:Compliance] Got 504 for delete of "${template.displayName}", verifying if policy was deleted...`);

        // Wait for async deletion to complete
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check if policy was actually deleted despite 504
        const stillExists = await compliancePolicyExists(client, template.displayName);
        if (!stillExists) {
          console.log(`[Engine:Compliance] Policy "${template.displayName}" was deleted despite 504 - marking as success`);
          return { task, success: true, skipped: false };
        }

        console.log(`[Engine:Compliance] Policy "${template.displayName}" still exists after 504 - deletion failed`);
      }

      // Policy not found or not created by hydration kit - skip
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
