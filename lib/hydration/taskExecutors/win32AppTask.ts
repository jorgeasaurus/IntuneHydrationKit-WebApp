import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import {
  createWin32AppFromPackage,
  getWin32LobApps,
  isOwnedWin32App,
} from "@/lib/graph/win32Apps";
import { getWin32AppTemplateByName } from "@/templates/win32Apps";
import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";

async function fetchSuppliedPackage(packageUrl: string): Promise<Blob> {
  const response = await fetch(packageUrl);
  if (!response.ok) {
    throw new Error(`Unable to load the supplied Intune package: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

export async function executeWin32AppTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const template = getWin32AppTemplateByName(task.itemName);
  if (!template) {
    return { task, success: false, skipped: false, error: "Win32 app template not found" };
  }

  const existingApp = (await getWin32LobApps(context.client)).find(
    (app) => app.displayName.toLowerCase() === template.displayName.toLowerCase()
  );

  if (task.operation === "create") {
    if (existingApp) {
      return { task, success: true, skipped: true, error: "Already exists" };
    }
    if (context.isPreview) {
      return { task, success: true, skipped: false };
    }

    const suppliedPackage = await fetchSuppliedPackage(template.packageUrl);
    const packageFile = await readIntuneWinPackage(suppliedPackage);
    const app = await createWin32AppFromPackage(context.client, template, packageFile);
    return { task, success: true, skipped: false, createdId: app.id };
  }

  if (!existingApp) {
    return { task, success: true, skipped: true, error: "Not found in tenant" };
  }
  if (!isOwnedWin32App(existingApp)) {
    return { task, success: true, skipped: true, error: "Not created by Intune Hydration Kit" };
  }
  if (context.isPreview) {
    return { task, success: true, skipped: false };
  }

  await context.client.delete(`/deviceAppManagement/mobileApps/${existingApp.id}`, "beta");
  return { task, success: true, skipped: false };
}
