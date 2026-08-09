import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import {
  createWin32AppFromPackage,
  getWin32LobApps,
  isOwnedWin32App,
} from "@/lib/graph/win32Apps";
import { getWin32AppTemplateByName } from "@/templates/win32Apps";
import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";

function getDisplayNameVariants(displayName: string): string[] {
  const suffix = " - [IHD]";
  const trimmedName = displayName.trim();
  const baseName = trimmedName.toLowerCase().endsWith(suffix.toLowerCase())
    ? trimmedName.slice(0, -suffix.length).trimEnd()
    : trimmedName.replace(/^\[IHD\]\s+/i, "");

  return [...new Set([`${baseName}${suffix}`, trimmedName, `[IHD] ${baseName}`, baseName])]
    .map((name) => name.toLowerCase());
}

async function fetchSuppliedPackage(packageUrl: string): Promise<Blob> {
  const response = await fetch(packageUrl);
  if (!response.ok) {
    throw new Error(`Unable to load the supplied Intune package: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

async function fetchTextAsset(assetUrl: string, label: string): Promise<string> {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`Unable to load the supplied ${label}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchOptionalIcon(iconUrl: string | undefined): Promise<string | undefined> {
  if (!iconUrl) {
    return undefined;
  }

  try {
    const response = await fetch(iconUrl);
    if (!response.ok) return undefined;

    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  } catch {
    return undefined;
  }
}

export async function executeWin32AppTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const template = getWin32AppTemplateByName(task.itemName);
  if (!template) {
    return { task, success: false, skipped: false, error: "Win32 app template not found" };
  }

  const displayNameVariants = new Set(getDisplayNameVariants(template.displayName));
  const existingApps = (await getWin32LobApps(context.client)).filter(
    (app) =>
      displayNameVariants.has(app.displayName.toLowerCase()) &&
      isOwnedWin32App(app)
  );

  if (task.operation === "create") {
    if (existingApps.length > 0) {
      return { task, success: true, skipped: true, error: "Already exists" };
    }
    if (context.isPreview) {
      return { task, success: true, skipped: false };
    }

    const suppliedPackage = await fetchSuppliedPackage(template.packageUrl);
    const packageFile = await readIntuneWinPackage(suppliedPackage);
    if (packageFile.setupFile !== template.setupFilePath) {
      throw new Error(
        `The supplied Intune package setup file is ${packageFile.setupFile}; expected ${template.setupFilePath}.`
      );
    }
    const detectionScript = await fetchTextAsset(template.detectionScriptUrl, "WinGet detection script");
    const iconBase64 = await fetchOptionalIcon(template.iconUrl);
    const app = await createWin32AppFromPackage(
      context.client,
      template,
      packageFile,
      detectionScript,
      iconBase64
    );
    return { task, success: true, skipped: false, createdId: app.id };
  }

  if (existingApps.length === 0) {
    return { task, success: true, skipped: true, error: "Not found in tenant" };
  }
  if (context.isPreview) {
    return { task, success: true, skipped: false };
  }

  await existingApps.reduce(
    (previousDelete, existingApp) => previousDelete.then(() =>
      context.client.delete(`/deviceAppManagement/mobileApps/${existingApp.id}`, "beta")
    ),
    Promise.resolve()
  );
  return { task, success: true, skipped: false };
}
