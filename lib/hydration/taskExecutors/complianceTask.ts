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
import {
  createV2CompliancePolicy,
  v2CompliancePolicyExists,
} from "../policyCreators";
import { getCachedTemplates, ComplianceTemplate } from "@/lib/templates/loader";
import { hasHydrationMarker } from "@/lib/utils/hydrationMarker";

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
      const existsInCache = context.cachedV2CompliancePolicies?.some((policy) =>
        namesMatch(policy.name, template.displayName)
      );
      const exists = existsInCache || await v2CompliancePolicyExists(client, template.displayName);
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
      if (context.cachedV2CompliancePolicies && created.id) {
        context.cachedV2CompliancePolicies.push({
          id: created.id,
          name: template.displayName,
          description: template.description,
        });
      }

      return {
        task,
        success: true,
        skipped: false,
        createdId: created.id,
      };
    }

    // Check if policy already exists
    const exists = await compliancePolicyExists(client, template.displayName);
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
    const targetName = template?.displayName ?? requestedName;

    if (!template && !context.cachedV2CompliancePolicies) {
      try {
        context.cachedV2CompliancePolicies = await client.getCollection<{
          id: string;
          name: string;
          description?: string;
        }>("/deviceManagement/compliancePolicies?$select=id,name,description");
      } catch (error) {
        console.warn("[Engine:Compliance] V2 policy lookup failed; continuing with V1 deletion", error);
        context.cachedV2CompliancePolicies = [];
      }
    }

    const v2Policy = context.cachedV2CompliancePolicies?.find((existingPolicy) =>
      namesMatch(existingPolicy.name, targetName)
    );

    if ((template && isV2ComplianceTemplate(template)) || v2Policy) {
      let policy = v2Policy;

      if (!policy) {
        const allPolicies = await client.getCollection<{ id: string; name: string; description?: string }>(
          "/deviceManagement/compliancePolicies?$select=id,name,description"
        );
        context.cachedV2CompliancePolicies = allPolicies;
        policy = allPolicies.find((existingPolicy) =>
          namesMatch(existingPolicy.name, targetName)
        );
      }

      if (!policy) {
        return { task, success: true, skipped: true, skipKind: "noOp", error: "Not found in tenant" };
      }

      if (!hasHydrationMarker(policy.description)) {
        return { task, success: true, skipped: true, skipKind: "blocked", error: "Not created by Hydration Kit" };
      }

      if (isPreview) {
        return { task, success: true, skipped: false };
      }

      const assignmentsResponse = await client.get<{ value?: Array<{ id: string }> }>(
        `/deviceManagement/compliancePolicies/${policy.id}/assignments`
      );
      const assignmentCount = assignmentsResponse.value?.length ?? 0;
      if (assignmentCount > 0) {
        return {
          task,
          success: true,
          skipped: true,
          skipKind: "blocked",
          error: `Policy has ${assignmentCount} active assignment(s)`,
        };
      }

      await client.delete(`/deviceManagement/compliancePolicies/${policy.id}`);
      if (context.cachedV2CompliancePolicies) {
        context.cachedV2CompliancePolicies = context.cachedV2CompliancePolicies.filter(
          (existingPolicy) => existingPolicy.id !== policy.id
        );
      }
      return { task, success: true, skipped: false };
    }

    // Check if policy exists first
    const exists = await compliancePolicyExists(client, targetName);
    if (!exists) {
      return { task, success: true, skipped: true, skipKind: "noOp", error: "Not found in tenant" };
    }

    // Preview mode - would delete
    if (isPreview) {
      return { task, success: true, skipped: false };
    }

    // Delete the policy with 504 verification
    try {
      const result = await deleteCompliancePolicyByName(client, targetName);

      // Check if skipped due to active assignments
      if (result.skipped) {
        return { task, success: true, skipped: true, skipKind: "blocked", error: result.reason };
      }

      return { task, success: true, skipped: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's a 504 timeout error
      if (errorMessage.includes("504") || errorMessage.includes("Gateway Timeout")) {
        console.log(`[Engine:Compliance] Got 504 for delete of "${targetName}", verifying if policy was deleted...`);

        // Wait for async deletion to complete
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check if policy was actually deleted despite 504
        const stillExists = await compliancePolicyExists(client, targetName);
        if (!stillExists) {
          console.log(`[Engine:Compliance] Policy "${targetName}" was deleted despite 504 - marking as success`);
          return { task, success: true, skipped: false };
        }

        console.log(`[Engine:Compliance] Policy "${targetName}" still exists after 504 - deletion failed`);
      }

      // Policy not found or not created by hydration kit - skip
      return { task, success: true, skipped: true, skipKind: "blocked", error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
