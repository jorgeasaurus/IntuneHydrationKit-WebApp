/**
 * Group Task Executor
 * Handles create and delete operations for Entra ID groups
 */

import { HydrationTask } from "@/types/hydration";
import { DeviceGroup } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import { requireTenantCache } from "../utils";
import { buildGroupCreateBody, findExistingGroup } from "../existingObjects";
import { createGroup } from "@/lib/graph/groups";
import { getCachedTemplates, GroupTemplate } from "@/lib/templates/loader";

/**
 * Execute a group task (create or delete)
 */
export async function executeGroupTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // Delete uses the shared resolver, so the sequential and parallel paths give the same outcome.
  if (context.operationMode === "delete") {
    return executeDeleteTask(task, context);
  }

  const { client, operationMode: mode, isPreview } = context;

  // Templates are loaded from the bundled JSON files before execution.
  let template: GroupTemplate | DeviceGroup | undefined;
  const cachedGroups = getCachedTemplates("groups");

  if (cachedGroups && Array.isArray(cachedGroups)) {
    template = (cachedGroups as GroupTemplate[]).find((g) => g.displayName === task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if group already exists using pre-fetched cache (match with or without [IHD] prefix)
    const existingGroup = findExistingGroup(requireTenantCache(context, "cachedIntuneGroups"), template.displayName);

    if (existingGroup) {
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

    // Convert template to full DeviceGroup format if it's a simple template
    const fullGroupTemplate = buildGroupCreateBody(template);

    const created = await createGroup(client, fullGroupTemplate);

    // Add the newly created group to the cache
    if (context.cachedIntuneGroups) {
      context.cachedIntuneGroups.push(created);
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
