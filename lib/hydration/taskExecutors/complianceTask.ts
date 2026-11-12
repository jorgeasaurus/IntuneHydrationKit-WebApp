/**
 * Compliance Task Executor
 * Handles create and delete operations for Intune compliance policies
 */

import { HydrationTask } from "@/types/hydration";
import { CompliancePolicy } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import {
  createCompliancePolicy,
  compliancePolicyExists,
} from "@/lib/graph/compliance";
import { createV2CompliancePolicy } from "../policyCreators";
import { requireTenantCache } from "../utils";
import { getCachedTemplates, ComplianceTemplate } from "@/lib/templates/loader";

type V2ComplianceTemplate = ComplianceTemplate & {
  name?: string;
  platforms?: string;
  technologies?: string;
};

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

function isV2ComplianceTemplate(
  template: ComplianceTemplate | CompliancePolicy
): template is V2ComplianceTemplate {
  return !template["@odata.type"] && ("platforms" in template || "technologies" in template);
}

/**
 * Execute a compliance policy task (create or delete)
 */
export async function executeComplianceTask(
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
  let template: ComplianceTemplate | CompliancePolicy | undefined;
  const cachedCompliance = getCachedTemplates("compliance");
  if (cachedCompliance && Array.isArray(cachedCompliance)) {
    template = (cachedCompliance as ComplianceTemplate[]).find((c) =>
      namesMatch(c.displayName, requestedName)
    );
  }

  if (mode === "create") {
    if (!template) {
      return { task, success: false, skipped: false, error: "Template not found" };
    }

    if (isV2ComplianceTemplate(template)) {
      const v2CompliancePolicies = requireTenantCache(context, "cachedV2CompliancePolicies");
      const exists = v2CompliancePolicies.some((policy) => namesMatch(policy.name, template.displayName));
      if (exists) {
        return {
          task,
          success: true,
          skipped: true,
          skipKind: "noOp",
          error: "Already exists",
        };
      }

      if (isPreview) {
        return { task, success: true, skipped: false };
      }

      const created = await createV2CompliancePolicy(client, template as Record<string, unknown>);
      v2CompliancePolicies.push({
        id: created.id,
        name: template.displayName,
        description: template.description,
      });

      return {
        task,
        success: true,
        skipped: false,
        createdId: created.id,
      };
    }

    // Check if policy already exists
    const compliancePolicies = requireTenantCache(context, "cachedCompliancePolicies");
    const exists = compliancePolicies.some((policy) => namesMatch(policy.displayName, template.displayName));
    if (exists) {
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

    // Create the policy with 504 verification
    try {
      const created = await createCompliancePolicy(client, template as CompliancePolicy);
      compliancePolicies.push({ id: created.id ?? "", displayName: template.displayName, description: template.description });
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
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
