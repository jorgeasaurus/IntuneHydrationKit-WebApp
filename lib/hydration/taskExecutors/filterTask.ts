/**
 * Filter Task Executor
 * Handles create and delete operations for Intune device filters
 */

import { HydrationTask } from "@/types/hydration";
import { DeviceFilter } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { createFilter } from "@/lib/graph/filters";
import { hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import { getCachedTemplates, FilterTemplate } from "@/lib/templates/loader";
import * as Templates from "@/templates";

/**
 * Execute a filter task (create or delete)
 */
export async function executeFilterTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;

  // Try to get template from cache first, fallback to hardcoded templates
  let template: FilterTemplate | DeviceFilter | undefined;
  const cachedFilterTemplates = getCachedTemplates("filters");

  if (cachedFilterTemplates && Array.isArray(cachedFilterTemplates)) {
    template = (cachedFilterTemplates as FilterTemplate[]).find((f) => f.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getDeviceFilterByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if filter already exists using pre-fetched cache
    const existingFilter = context.cachedFilters?.find(
      (f) => f.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingFilter) {
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
  } else if (mode === "delete") {
    // Check if filter exists in tenant using pre-fetched cache
    const existingFilter = context.cachedFilters?.find(
      (f) => f.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (!existingFilter) {
      return { task, success: true, skipped: true, error: "Not found in tenant" };
    }

    // Check if it was created by the hydration kit
    if (!hasHydrationMarker(existingFilter.description)) {
      return { task, success: true, skipped: true, error: "Not created by Hydration Kit" };
    }

    // Preview mode - would delete
    if (isPreview) {
      return { task, success: true, skipped: false };
    }

    await client.delete(`/deviceManagement/assignmentFilters/${existingFilter.id}`);

    // Remove from cache
    if (context.cachedFilters) {
      const index = context.cachedFilters.findIndex((f) => f.id === existingFilter.id);
      if (index !== -1) {
        context.cachedFilters.splice(index, 1);
      }
    }

    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
