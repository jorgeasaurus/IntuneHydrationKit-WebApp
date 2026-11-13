import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import {
  createWin32AppFromPackage,
  getWin32AppDisplayNameVariants,
  getWin32LobApps,
  isLegacyOwnedWin32App,
  isOwnedWin32App,
} from "@/lib/graph/win32Apps";
import type { Win32LobApp } from "@/lib/graph/win32Apps";
import { AUTOPILOT_BRANDING_WIN32_APP, getWin32AppTemplateByName } from "@/templates/win32Apps";
import type { Win32AppTemplate } from "@/templates/win32Apps";
import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import {
  getCustomizedAutopilotBrandingTemplate,
  isDefaultAutopilotBrandingCustomization,
  parseAutopilotBrandingCustomization,
  type AutopilotBrandingCustomization,
} from "@/lib/win32/autopilotBrandingConfig";
import { fetchCustomizedAutopilotBrandingPackage } from "@/lib/win32/autopilotBrandingPackage";
import { bytesToBase64 } from "@/lib/utils/base64";
import { DELETE_REASONS, deleteResolutionResult, readAssignmentCount } from "../deleteResolver";
import { isRunCancelledError } from "@/lib/utils/retry";

const DELETE_VISIBILITY_RETRY_DELAYS_MS = [2000, 4000, 8000] as const;
const RECENT_WIN32_APPS_STORAGE_KEY = "intune-hydration-recent-win32-apps";
const RECENT_WIN32_APP_TTL_MS = 60 * 60 * 1000;

interface RecentWin32App {
  id: string;
  displayName: string;
  createdAt: number;
}

interface OwnedMatchingAppsResult {
  apps: Win32LobApp[];
  hasNameMatch: boolean;
}

function isRecentWin32App(value: unknown): value is RecentWin32App {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.displayName === "string" &&
    candidate.displayName.length > 0 &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt)
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readRecentWin32Apps(): Record<string, RecentWin32App> {
  if (typeof sessionStorage === "undefined") return {};

  try {
    const stored = sessionStorage.getItem(RECENT_WIN32_APPS_STORAGE_KEY);
    if (!stored) return {};

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const recentApps = Object.values(parsed).filter(isRecentWin32App);
    return Object.fromEntries(
      recentApps.map((app) => [app.displayName.toLowerCase(), app])
    );
  } catch {
    return {};
  }
}

function writeRecentWin32Apps(apps: Record<string, RecentWin32App>): void {
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.setItem(RECENT_WIN32_APPS_STORAGE_KEY, JSON.stringify(apps));
  } catch {
    // A missing session hint only falls back to the Graph collection lookup.
  }
}

function rememberRecentWin32App(app: Pick<RecentWin32App, "id" | "displayName">): void {
  const apps = readRecentWin32Apps();
  apps[app.displayName.toLowerCase()] = { ...app, createdAt: Date.now() };
  writeRecentWin32Apps(apps);
}

function forgetRecentWin32App(displayName: string): void {
  const apps = readRecentWin32Apps();
  delete apps[displayName.toLowerCase()];
  writeRecentWin32Apps(apps);
}

async function getRecentOwnedApp(
  displayName: string,
  context: ExecutionContext
): Promise<Win32LobApp | null> {
  const recent = readRecentWin32Apps()[displayName.toLowerCase()];
  if (!recent) return null;

  if (Date.now() - recent.createdAt > RECENT_WIN32_APP_TTL_MS) {
    forgetRecentWin32App(displayName);
    return null;
  }

  try {
    const app = await context.client.get<Win32LobApp>(
      `/deviceAppManagement/mobileApps/${recent.id}`,
      "beta"
    );
    const displayNameVariants = new Set(getWin32AppDisplayNameVariants(displayName));
    if (displayNameVariants.has(app.displayName.toLowerCase()) && isOwnedWin32App(app)) {
      return app;
    }
  } catch (error) {
    const graphError = error as { status?: number; code?: string };
    if (graphError.status === 404 || graphError.code?.toLowerCase() === "resourcenotfound") {
      // Keep a recent creation hint because Intune may not expose the new app immediately.
      return null;
    }
  }

  forgetRecentWin32App(displayName);
  return null;
}

async function fetchSuppliedPackage(packageUrl: string): Promise<Blob> {
  const response = await fetch(packageUrl);
  if (!response.ok) {
    throw new Error(
      `Unable to load the supplied Intune package from ${packageUrl}: ${response.status} ${response.statusText}`
    );
  }
  return response.blob();
}

async function fetchTextAsset(assetUrl: string, label: string): Promise<string> {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(
      `Unable to load the supplied ${label} from ${assetUrl}: ${response.status} ${response.statusText}`
    );
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
    return bytesToBase64(bytes);
  } catch {
    return undefined;
  }
}

interface CreatePlan {
  template: Win32AppTemplate;
  /** Present when the package is built in the browser for a customized configuration. */
  customization?: AutopilotBrandingCustomization;
}

/**
 * The template and package source of a create task. A task without a customization, or with
 * the default choices, uses the prebuilt package. Throws when the customization is not valid.
 */
function getCreatePlan(template: Win32AppTemplate, task: HydrationTask): CreatePlan {
  if (task.autopilotBranding === undefined) return { template };
  if (template.id !== AUTOPILOT_BRANDING_WIN32_APP.id) {
    throw new Error("Only the Autopilot Branding app can have a configuration customization.");
  }
  const customization = parseAutopilotBrandingCustomization(task.autopilotBranding);
  if (isDefaultAutopilotBrandingCustomization(customization)) return { template };
  return { template: getCustomizedAutopilotBrandingTemplate(customization), customization };
}

async function getMatchingApps(
  template: Win32AppTemplate,
  context: ExecutionContext
): Promise<Win32LobApp[]> {
  const recentApp = await getRecentOwnedApp(template.displayName, context);
  const displayNameVariants = new Set(getWin32AppDisplayNameVariants(template.displayName));
  if (!context.cachedWin32LobApps) {
    context.cachedWin32LobApps = await getWin32LobApps(context.client);
  }
  const matchingApps = context.cachedWin32LobApps.filter((app) =>
    displayNameVariants.has(app.displayName.toLowerCase())
  );

  if (recentApp && !matchingApps.some((app) => app.id === recentApp.id)) {
    matchingApps.unshift(recentApp);
  }
  return matchingApps;
}

async function getOwnedMatchingApps(
  template: Win32AppTemplate,
  context: ExecutionContext
): Promise<OwnedMatchingAppsResult> {
  const matchingApps = await getMatchingApps(template, context);
  const ownershipResults = await Promise.all(matchingApps.map(async (app) => {
    if (isOwnedWin32App(app)) return app;
    if (!template.legacyOwnership) return null;

    try {
      const appDetails = await context.client.get<typeof app>(
        `/deviceAppManagement/mobileApps/${app.id}`,
        "beta"
      );
      return isLegacyOwnedWin32App(appDetails, template) ? appDetails : null;
    } catch (error) {
      const graphError = error as { status?: number; code?: string };
      if (graphError.status === 404 || graphError.code?.toLowerCase() === "resourcenotfound") {
        return null;
      }
      throw error;
    }
  }));
  return {
    apps: ownershipResults.filter((app) => app !== null),
    hasNameMatch: matchingApps.length > 0,
  };
}

async function getDeleteCandidates(
  template: Win32AppTemplate,
  context: ExecutionContext
): Promise<OwnedMatchingAppsResult> {
  let result = await getOwnedMatchingApps(template, context);
  let hasNameMatch = result.hasNameMatch;

  for (const delay of DELETE_VISIBILITY_RETRY_DELAYS_MS) {
    if (result.apps.length > 0) break;
    await sleep(delay);
    result = await getOwnedMatchingApps(template, context);
    hasNameMatch ||= result.hasNameMatch;
  }

  return { apps: result.apps, hasNameMatch };
}

export async function executeWin32AppTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const template = getWin32AppTemplateByName(task.itemName);
  if (!template) {
    return { task, success: false, skipped: false, error: "Win32 app template not found" };
  }

  const deleteCandidates = task.operation === "delete"
    ? await getDeleteCandidates(template, context)
    : null;
  const existingApps = deleteCandidates?.apps ?? await getMatchingApps(template, context);

  if (task.operation === "create") {
    let createPlan: CreatePlan;
    try {
      createPlan = getCreatePlan(template, task);
    } catch (error) {
      // Fail closed: nothing is fetched, built, or uploaded.
      return { task, success: false, skipped: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (existingApps.length > 0) {
      return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
    }
    if (context.isPreview) {
      return { task, success: true, skipped: false };
    }

    const createTemplate = createPlan.template;
    const suppliedPackage = createPlan.customization
      ? await fetchCustomizedAutopilotBrandingPackage(createPlan.customization)
      : await fetchSuppliedPackage(template.packageUrl);
    const packageFile = await readIntuneWinPackage(suppliedPackage);
    if (packageFile.setupFile !== template.setupFilePath) {
      throw new Error(
        `The supplied Intune package setup file is ${packageFile.setupFile}; expected ${template.setupFilePath}.`
      );
    }
    const detectionScript = await fetchTextAsset(template.detectionScriptUrl, "Win32 detection script");
    const iconBase64 = await fetchOptionalIcon(template.iconUrl);
    const app = await createWin32AppFromPackage(
      context.client,
      createTemplate,
      packageFile,
      detectionScript,
      iconBase64
    );
    if (context.cachedWin32LobApps && app.displayName) {
      context.cachedWin32LobApps.push(app);
    }
    rememberRecentWin32App({ id: app.id, displayName: template.displayName });
    return { task, success: true, skipped: false, createdId: app.id };
  }

  if (existingApps.length === 0) {
    return deleteResolutionResult(
      task,
      deleteCandidates?.hasNameMatch
        ? { action: "skip", skipKind: "blocked", reason: "Matching app is not owned by Intune Hydration Kit" }
        : { action: "skip", skipKind: "noOp", reason: DELETE_REASONS.notFound },
      context.isPreview
    );
  }

  // Do not delete any app when one of them is assigned or its assignments cannot be read.
  let assignmentCounts: number[];
  try {
    assignmentCounts = await Promise.all(
      existingApps.map((existingApp) =>
        readAssignmentCount(context, `/deviceAppManagement/mobileApps/${existingApp.id}/assignments`)
      )
    );
  } catch (error) {
    // A cancelled run is not a failed safety check. The engine marks the task cancelled.
    if (isRunCancelledError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return deleteResolutionResult(
      task,
      { action: "fail", reason: `Safety checks did not complete, so the app was not deleted: ${message}` },
      context.isPreview
    );
  }
  const assignmentCount = assignmentCounts.reduce((total, count) => total + count, 0);
  if (assignmentCount > 0) {
    return deleteResolutionResult(
      task,
      { action: "skip", skipKind: "blocked", reason: DELETE_REASONS.assigned(assignmentCount) },
      context.isPreview
    );
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
  const deletedIds = new Set(existingApps.map((app) => app.id));
  if (context.cachedWin32LobApps) {
    context.cachedWin32LobApps = context.cachedWin32LobApps.filter(
      (app) => !deletedIds.has(app.id)
    );
  }
  forgetRecentWin32App(template.displayName);
  return { task, success: true, skipped: false };
}
