/**
 * Group Task Executor
 * Handles create and delete operations for Entra ID groups
 */

import { HydrationTask } from "@/types/hydration";
import { DeviceGroup } from "@/types/graph";
import { ExecutionContext, ExecutionResult } from "../types";
import { createGroup, deleteGroupByName } from "@/lib/graph/groups";
import { getCachedTemplates, GroupTemplate } from "@/lib/templates/loader";
import * as Templates from "@/templates";

/**
 * Execute a group task (create or delete)
 */
export async function executeGroupTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;

  // Try to get template from cache first, fallback to hardcoded templates
  let template: GroupTemplate | DeviceGroup | undefined;
  const cachedGroups = getCachedTemplates("groups");

  if (cachedGroups && Array.isArray(cachedGroups)) {
    template = (cachedGroups as GroupTemplate[]).find((g) => g.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getDynamicGroupByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if group already exists using pre-fetched cache
    const existingGroup = context.cachedIntuneGroups?.find(
      (g) => g.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (existingGroup) {
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

    // Convert template to full DeviceGroup format if it's a simple template
    let fullGroupTemplate: DeviceGroup = template as DeviceGroup;
    if (!("@odata.type" in template)) {
      const simpleTemplate = template as GroupTemplate;
      const isStaticGroup = simpleTemplate.isStaticGroup === true || !simpleTemplate.membershipRule;

      if (isStaticGroup) {
        fullGroupTemplate = {
          "@odata.type": "#microsoft.graph.group",
          displayName: simpleTemplate.displayName,
          description: simpleTemplate.description,
          groupTypes: [],
          mailEnabled: false,
          mailNickname: simpleTemplate.displayName.replace(/[^a-zA-Z0-9]/g, ""),
          securityEnabled: true,
        };
      } else {
        fullGroupTemplate = {
          "@odata.type": "#microsoft.graph.group",
          displayName: simpleTemplate.displayName,
          description: simpleTemplate.description,
          groupTypes: ["DynamicMembership"],
          mailEnabled: false,
          mailNickname: simpleTemplate.displayName.replace(/[^a-zA-Z0-9]/g, ""),
          securityEnabled: true,
          membershipRule: simpleTemplate.membershipRule,
          membershipRuleProcessingState: "On",
        };
      }
    }

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
  } else if (mode === "delete") {
    // Check if group exists using pre-fetched cache
    const existingGroup = context.cachedIntuneGroups?.find(
      (g) => g.displayName.toLowerCase() === template!.displayName.toLowerCase()
    );

    if (!existingGroup) {
      return { task, success: true, skipped: true, error: "Not found in tenant" };
    }

    // Preview mode - would delete
    if (isPreview) {
      return { task, success: true, skipped: false };
    }

    // Delete the group
    try {
      await deleteGroupByName(client, template.displayName);
      return { task, success: true, skipped: false };
    } catch (error) {
      // Group not found or not created by hydration kit - skip
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
