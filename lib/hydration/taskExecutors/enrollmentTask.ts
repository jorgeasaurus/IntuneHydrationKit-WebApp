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
  getEnrollmentProfileName,
  EnrollmentProfile,
} from "@/lib/graph/enrollment";
import { getCachedTemplates } from "@/lib/templates/loader";
import { hasODataUnsafeChars } from "../utils";

function findEnrollmentTemplate(itemName: string): EnrollmentProfile | undefined {
  const cached = getCachedTemplates("enrollment");
  if (!cached || !Array.isArray(cached)) return undefined;

  return (cached as EnrollmentProfile[]).find((e) => {
    const name = getEnrollmentProfileName(e);
    return name === itemName;
  });
}

export async function executeEnrollmentTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const { client, operationMode: mode, isPreview } = context;

  const template = findEnrollmentTemplate(task.itemName);
  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  const profileType = getEnrollmentProfileType(template);
  const profileName = getEnrollmentProfileName(template) || task.itemName;

  if (mode === "create") {
    if (profileType === "devicePreparation") {
      const normalizedProfileName = profileName.toLowerCase().trim();
      let settingsCatalogPolicies = context.cachedSettingsCatalogPolicies;

      if (
        (!settingsCatalogPolicies || settingsCatalogPolicies.length === 0) &&
        hasODataUnsafeChars(profileName)
      ) {
        settingsCatalogPolicies = await client.getCollection<{ id: string; name: string; description?: string }>(
          "/deviceManagement/configurationPolicies?$select=id,name,description"
        );
        context.cachedSettingsCatalogPolicies = settingsCatalogPolicies;
      }

      const existingProfile = settingsCatalogPolicies?.find(
        (policy) => policy.name?.toLowerCase().trim() === normalizedProfileName
      );

      if (existingProfile) {
        return { task, success: true, skipped: true, error: "Already exists" };
      }
    }

    if (await enrollmentProfileExists(client, template)) {
      return { task, success: true, skipped: true, error: "Already exists" };
    }
    if (isPreview) {
      return { task, success: true, skipped: false };
    }
    const created = await createEnrollmentProfile(client, template);

    if (profileType === "devicePreparation" && context.cachedSettingsCatalogPolicies && created.id) {
      context.cachedSettingsCatalogPolicies.push({
        id: created.id,
        name: profileName,
        description: "",
      });
    }

    return { task, success: true, skipped: false, createdId: created.id };
  }

  if (mode === "delete") {
    if (!(await enrollmentProfileExists(client, template))) {
      return { task, success: true, skipped: true, error: "Not found in tenant" };
    }
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
