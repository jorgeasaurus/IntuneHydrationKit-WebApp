/**
 * Enrollment Task Executor
 * Handles create and delete operations for Autopilot Deployment Profiles and ESP configurations
 */

import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import {
  createEnrollmentProfile,
  enrollmentProfileExists,
  deleteEnrollmentProfileByName,
  getEnrollmentProfileType,
  EnrollmentProfile,
} from "@/lib/graph/enrollment";
import { getCachedTemplates } from "@/lib/templates/loader";

/**
 * Execute an enrollment task (create or delete)
 * Handles Autopilot Deployment Profiles and Enrollment Status Page configurations
 */
export async function executeEnrollmentTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;

  // Get template from cache
  let template: EnrollmentProfile | undefined;
  const cachedEnrollment = getCachedTemplates("enrollment");

  if (cachedEnrollment && Array.isArray(cachedEnrollment)) {
    template = (cachedEnrollment as EnrollmentProfile[]).find(
      (e) => ("displayName" in e ? e.displayName : undefined) === task.itemName
            || ("name" in e ? e.name : undefined) === task.itemName
    );
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  const profileType = getEnrollmentProfileType(template);
  const profileName = "displayName" in template && template.displayName
    ? String(template.displayName)
    : "name" in template && template.name
      ? String(template.name)
      : task.itemName;

  if (mode === "create") {
    const exists = await enrollmentProfileExists(client, template);
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

    const created = await createEnrollmentProfile(client, template);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Check if profile exists first
    const exists = await enrollmentProfileExists(client, template);
    if (!exists) {
      return { task, success: true, skipped: true, error: "Not found in tenant" };
    }

    // Preview mode - would delete
    if (isPreview) {
      return { task, success: true, skipped: false };
    }

    try {
      await deleteEnrollmentProfileByName(client, profileName, profileType);
      return { task, success: true, skipped: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { task, success: true, skipped: true, error: errorMessage };
    }
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}
