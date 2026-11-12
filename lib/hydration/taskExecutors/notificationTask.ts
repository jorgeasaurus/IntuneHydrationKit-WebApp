/**
 * Notification Template Task Executor
 * Handles create and delete operations for Intune notification message templates
 */

import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import { executeDeleteTask } from "../deleteResolver";
import { findExistingByName, requireTenantCache } from "../utils";
import { createNotificationTemplate, type NotificationTemplate } from "@/lib/graph/notifications";
import { getCachedTemplates } from "@/lib/templates/loader";
import { IMPORT_PREFIX } from "@/lib/utils/hydrationMarker";

/**
 * Find the kit notification template of a task, by display name (case-insensitive).
 */
export function findNotificationTemplate(name: string): NotificationTemplate | undefined {
  const templates = getCachedTemplates("notification");
  if (!Array.isArray(templates)) return undefined;
  const lowerName = name.toLowerCase();
  return (templates as NotificationTemplate[]).find((template) => template.displayName?.toLowerCase() === lowerName);
}

function withoutImportPrefix(name: string): string {
  return name.startsWith(IMPORT_PREFIX) ? name.slice(IMPORT_PREFIX.length) : name;
}

/**
 * Execute a notification template task (create or delete)
 */
export async function executeNotificationTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // Delete uses the shared resolver, so every delete path gives the same outcome.
  if (context.operationMode === "delete") {
    return executeDeleteTask(task, context);
  }

  const template = findNotificationTemplate(task.itemName);
  if (!template) {
    return {
      task,
      success: false,
      skipped: false,
      error: `Template not found for ${task.itemName}. Reload templates and try again.`,
    };
  }

  // Same name check as the PowerShell module: the prefixed name, then the name without
  // the [IHD] prefix (a template from an older version). Both prevent a duplicate.
  const existingTemplates = requireTenantCache(context, "cachedNotificationTemplates");
  const getName = (item: { displayName?: string }) => item.displayName;
  const existing =
    findExistingByName(existingTemplates, template.displayName, getName) ??
    findExistingByName(existingTemplates, withoutImportPrefix(template.displayName), getName);
  if (existing) {
    return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
  }

  if (context.isPreview) {
    return { task, success: true, skipped: false };
  }

  const { created, failedMessages } = await createNotificationTemplate(context.client, template);
  context.cachedNotificationTemplates?.push({ id: created.id, displayName: created.displayName ?? template.displayName });

  if (failedMessages.length > 0) {
    const details = failedMessages.map((failure) => `${failure.locale}: ${failure.error}`).join("; ");
    return {
      task,
      success: false,
      skipped: false,
      createdId: created.id,
      error:
        `Notification template was created (ID: ${created.id}), but ${failedMessages.length} localized message(s) failed (${details}). ` +
        "The template is incomplete. Add the missing messages in the Intune admin center, or delete the template and run again.",
    };
  }

  return { task, success: true, skipped: false, createdId: created.id };
}
