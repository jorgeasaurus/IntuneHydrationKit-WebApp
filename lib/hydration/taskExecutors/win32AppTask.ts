import { HydrationTask } from "@/types/hydration";
import { ExecutionContext, ExecutionResult } from "../types";
import {
  createWin32AppFromPackage,
  getIncompleteWin32AppId,
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
import { getWinGetVersionTemplate } from "@/lib/win32/wingetVersionTemplate";
import {
  fetchWinGetVersionCatalog,
  resolvePinnedVersion,
  winGetVersionChoiceSchema,
} from "@/lib/winget/versionCatalog";
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

function isNotFoundError(error: unknown): boolean {
  const graphError = error as { status?: number; code?: string } | null;
  return graphError?.status === 404 || graphError?.code?.toLowerCase() === "resourcenotfound";
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

interface RecentOwnedAppResult {
  app: Win32LobApp | null;
  /** True when this session created the app a short time ago, but Graph does not return it (yet). */
  notVisible: boolean;
}

const NO_RECENT_APP: RecentOwnedAppResult = { app: null, notVisible: false };

async function getRecentOwnedApp(
  displayName: string,
  context: ExecutionContext
): Promise<RecentOwnedAppResult> {
  const recent = readRecentWin32Apps()[displayName.toLowerCase()];
  if (!recent) return NO_RECENT_APP;

  if (Date.now() - recent.createdAt > RECENT_WIN32_APP_TTL_MS) {
    forgetRecentWin32App(displayName);
    return NO_RECENT_APP;
  }

  try {
    const app = await context.client.get<Win32LobApp>(
      `/deviceAppManagement/mobileApps/${recent.id}`,
      "beta"
    );
    const displayNameVariants = new Set(getWin32AppDisplayNameVariants(displayName));
    if (displayNameVariants.has(app.displayName.toLowerCase()) && isOwnedWin32App(app)) {
      return { app, notVisible: false };
    }
  } catch (error) {
    if (isNotFoundError(error)) {
      // Keep a recent creation hint because Intune may not expose the new app immediately.
      return { app: null, notVisible: true };
    }
    // Fail closed: a cancelled run stays cancelled, and a read that failed does not prove that
    // the app is gone. The hint stays for the next attempt.
    throw error;
  }

  forgetRecentWin32App(displayName);
  return NO_RECENT_APP;
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

type CreatePlan =
  /** The prebuilt package of the template. */
  | { kind: "prebuilt"; template: Win32AppTemplate; packageUrl: string; detectionScriptUrl: string }
  /** A package built in the browser for a customized Autopilot Branding configuration. */
  | { kind: "autopilotBranding"; template: Win32AppTemplate; customization: AutopilotBrandingCustomization }
  /** A package built in the browser from generated WinGet scripts. `version` undefined is latest. */
  | { kind: "winget"; template: Win32AppTemplate; version: string | undefined };

function prebuiltPlan(template: Win32AppTemplate): CreatePlan {
  if (!template.packageUrl || !template.detectionScriptUrl) {
    throw new Error(`${template.displayName} has no prebuilt package.`);
  }
  return {
    kind: "prebuilt",
    template,
    packageUrl: template.packageUrl,
    detectionScriptUrl: template.detectionScriptUrl,
  };
}

/**
 * The template and package source of a create task. A starter WinGet app without a pinned
 * version, and an Autopilot Branding app without a customization or with the default choices,
 * use the prebuilt package. Throws when a choice on the task is not valid.
 */
function getCreatePlan(template: Win32AppTemplate, task: HydrationTask): CreatePlan {
  if (task.autopilotBranding !== undefined && task.wingetVersion !== undefined) {
    throw new Error("A Win32 app task cannot have both a configuration customization and a WinGet version.");
  }
  if (task.autopilotBranding !== undefined) {
    if (template.id !== AUTOPILOT_BRANDING_WIN32_APP.id) {
      throw new Error("Only the Autopilot Branding app can have a configuration customization.");
    }
    const customization = parseAutopilotBrandingCustomization(task.autopilotBranding);
    if (isDefaultAutopilotBrandingCustomization(customization)) return prebuiltPlan(template);
    return {
      kind: "autopilotBranding",
      template: getCustomizedAutopilotBrandingTemplate(customization),
      customization,
    };
  }
  if (task.wingetVersion !== undefined) {
    if (!template.winget) {
      throw new Error(`${template.displayName} is not a WinGet app, so it cannot have a WinGet version.`);
    }
    const parsed = winGetVersionChoiceSchema.safeParse(task.wingetVersion);
    if (!parsed.success) {
      throw new Error(`The WinGet version of ${template.displayName} is not valid, so the app was not created.`);
    }
    return { kind: "winget", template: getWinGetVersionTemplate(template, parsed.data), version: parsed.data };
  }
  if (template.packageUrl) return prebuiltPlan(template);
  if (template.winget) return { kind: "winget", template, version: undefined };
  throw new Error(`${template.displayName} has no package.`);
}

/** A pinned version must be a version of the app in the catalog that the kit can pin. */
async function assertPinnedVersionInCatalog(plan: CreatePlan): Promise<void> {
  if (plan.kind !== "winget" || plan.version === undefined) return;
  const catalog = await fetchWinGetVersionCatalog();
  resolvePinnedVersion(catalog, plan.template.packageIdentifier, plan.version);
}

interface CreatePackage {
  packageFile: Blob | ArrayBuffer;
  detectionScript: string;
}

/**
 * The package and the detection script of a create plan. The prebuilt package and the Autopilot
 * Branding package use the committed detection script of the template.
 */
async function getCreatePackage(plan: CreatePlan, template: Win32AppTemplate): Promise<CreatePackage> {
  switch (plan.kind) {
    case "prebuilt": {
      const packageFile = await fetchSuppliedPackage(plan.packageUrl);
      return { packageFile, detectionScript: await fetchTemplateDetectionScript(plan.detectionScriptUrl) };
    }
    case "autopilotBranding": {
      if (!template.detectionScriptUrl) throw new Error(`${template.displayName} has no detection script.`);
      const packageFile = await fetchCustomizedAutopilotBrandingPackage(plan.customization);
      return { packageFile, detectionScript: await fetchTemplateDetectionScript(template.detectionScriptUrl) };
    }
    case "winget": {
      // Loaded on demand: the script generator is large and only a WinGet build needs it.
      const { buildWinGetPackage } = await import("@/lib/win32/wingetPackage");
      const build = await buildWinGetPackage(plan.template, plan.version);
      return { packageFile: build.packageBytes.buffer, detectionScript: build.detectionScript };
    }
  }
}

function fetchTemplateDetectionScript(url: string): Promise<string> {
  return fetchTextAsset(url, "Win32 detection script");
}

interface MatchingAppsResult {
  apps: Win32LobApp[];
  /** True when an app that this session created is in no Graph answer yet. */
  recentAppNotVisible: boolean;
}

async function getMatchingApps(
  template: Win32AppTemplate,
  context: ExecutionContext
): Promise<MatchingAppsResult> {
  const recent = await getRecentOwnedApp(template.displayName, context);
  const displayNameVariants = new Set(getWin32AppDisplayNameVariants(template.displayName));
  if (!context.cachedWin32LobApps) {
    context.cachedWin32LobApps = await getWin32LobApps(context.client);
  }
  const matchingApps = context.cachedWin32LobApps.filter((app) =>
    displayNameVariants.has(app.displayName.toLowerCase())
  );

  const recentApp = recent.app;
  if (recentApp && !matchingApps.some((app) => app.id === recentApp.id)) {
    matchingApps.unshift(recentApp);
  }
  return { apps: matchingApps, recentAppNotVisible: recent.notVisible && matchingApps.length === 0 };
}

/**
 * Apps that a create must not duplicate.
 *
 * When this session created the app a short time ago and Graph does not return it yet, a new
 * POST would make a second app. So the lookup waits and reads Graph again before the create
 * continues. After the last wait the app counts as deleted.
 */
async function getCreateConflicts(
  template: Win32AppTemplate,
  context: ExecutionContext
): Promise<Win32LobApp[]> {
  let result = await getMatchingApps(template, context);
  for (const delay of DELETE_VISIBILITY_RETRY_DELAYS_MS) {
    if (!result.recentAppNotVisible) break;
    await sleep(delay);
    context.cachedWin32LobApps = undefined;
    result = await getMatchingApps(template, context);
  }
  return result.apps;
}

async function getOwnedMatchingApps(
  template: Win32AppTemplate,
  context: ExecutionContext
): Promise<OwnedMatchingAppsResult> {
  const { apps: matchingApps } = await getMatchingApps(template, context);
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
      if (isNotFoundError(error)) return null;
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
    // Read the collection again: the cached one is from before the wait.
    context.cachedWin32LobApps = undefined;
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
  const existingApps = deleteCandidates?.apps ?? await getCreateConflicts(template, context);

  if (task.operation === "create") {
    let createPlan: CreatePlan;
    try {
      createPlan = getCreatePlan(template, task);
      await assertPinnedVersionInCatalog(createPlan);
    } catch (error) {
      // A cancelled run is not an invalid choice. The engine marks the task cancelled.
      if (isRunCancelledError(error)) throw error;
      // Fail closed: no package is fetched, built, or uploaded.
      return { task, success: false, skipped: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (existingApps.length > 0) {
      return { task, success: true, skipped: true, skipKind: "noOp", error: "Already exists" };
    }
    if (context.isPreview) {
      return { task, success: true, skipped: false };
    }

    const createTemplate = createPlan.template;
    const createPackage = await getCreatePackage(createPlan, template);
    const packageFile = await readIntuneWinPackage(createPackage.packageFile);
    if (packageFile.setupFile !== template.setupFilePath) {
      throw new Error(
        `The supplied Intune package setup file is ${packageFile.setupFile}; expected ${template.setupFilePath}.`
      );
    }
    const detectionScript = createPackage.detectionScript;
    const iconBase64 = await fetchOptionalIcon(template.iconUrl);
    let app: Win32LobApp;
    try {
      app = await createWin32AppFromPackage(
        context.client,
        createTemplate,
        packageFile,
        detectionScript,
        iconBase64
      );
    } catch (error) {
      // The failed create left its app in the tenant. Remember it, so a retry finds it by ID
      // and does not make a second app before the collection lists the first.
      const incompleteAppId = getIncompleteWin32AppId(error);
      if (incompleteAppId) rememberRecentWin32App({ id: incompleteAppId, displayName: template.displayName });
      throw error;
    }
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

  // Fail closed: read each app again immediately before the DELETE. The match can be from a
  // prefetch before a pause, and the kit marker can be gone since then. Delete no app when
  // one of them is not a kit app any more or cannot be read.
  const appsToDelete: Win32LobApp[] = [];
  for (const existingApp of existingApps) {
    let currentApp: Win32LobApp;
    try {
      currentApp = await context.client.get<Win32LobApp>(
        `/deviceAppManagement/mobileApps/${existingApp.id}`,
        "beta"
      );
    } catch (error) {
      if (isRunCancelledError(error)) throw error;
      // The app is gone already.
      if (isNotFoundError(error)) continue;
      const message = error instanceof Error ? error.message : String(error);
      return deleteResolutionResult(
        task,
        { action: "fail", reason: `Safety checks did not complete, so the app was not deleted: ${message}` },
        context.isPreview
      );
    }
    if (!isOwnedWin32App(currentApp) && !isLegacyOwnedWin32App(currentApp, template)) {
      return deleteResolutionResult(
        task,
        { action: "skip", skipKind: "blocked", reason: DELETE_REASONS.noMarker },
        context.isPreview
      );
    }
    appsToDelete.push(existingApp);
  }

  await appsToDelete.reduce(
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
