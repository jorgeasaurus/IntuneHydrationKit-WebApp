/**
 * Filter Task Executor
 * Handles create and delete operations for Intune device filters
 */

import { HydrationTask } from "@/types/hydration";
import { DeviceFilter } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import { requireTenantCache } from "../utils";
import { createFilter } from "@/lib/graph/filters";
import { getCachedTemplates, FilterTemplate } from "@/lib/templates/loader";

/**
 * Execute a filter task (create or delete)
 */
export async function executeFilterTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // Delete uses the shared resolver, so the sequential and parallel paths give the same outcome.
  if (context.operationMode === "delete") {
    return executeDeleteTask(task, context);
  }

  const { client, operationMode: mode, isPreview } = context;

  // Templates are loaded from the bundled JSON files before execution.
  let template: FilterTemplate | DeviceFilter | undefined;
  const cachedFilterTemplates = getCachedTemplates("filters");

  if (cachedFilterTemplates && Array.isArray(cachedFilterTemplates)) {
    template = (cachedFilterTemplates as FilterTemplate[]).find((f) => f.displayName === task.itemName);
  }

  if (mode === "create") {
    if (!template) {
      return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
    }

    // Check if filter already exists using pre-fetched cache
    const existingFilter = requireTenantCache(context, "cachedFilters").find(
      (f) => f.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingFilter) {
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

    // Convert template to full DeviceFilter format if it's a simple template
    let fullFilterTemplate: DeviceFilter = template as DeviceFilter;
    if (!("@odata.type" in template)) {
      const simpleTemplate = template as FilterTemplate;
      fullFilterTemplate = {
        "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
        displayName: simpleTemplate.displayName,
        description: simpleTemplate.description,
        platform: simpleTemplate.platform as "android" | "iOS" | "macOS" | "windows10AndLater",
        rule: simpleTemplate.rule,
      };
    }

    const created = await createFilter(client, fullFilterTemplate);

    // Add the newly created filter to the cache
    if (context.cachedFilters) {
      context.cachedFilters.push(created);
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
