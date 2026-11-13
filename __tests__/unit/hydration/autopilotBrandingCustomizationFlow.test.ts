import { beforeEach, describe, expect, it } from "vitest";

import { readExecutionRecord, writeExecutionRecord, type ExecutionRecord } from "@/lib/hydration/executionRecord";
import { buildRerunTaskQueue, createRerunPlan } from "@/lib/hydration/rerun";
import { getWizardRunScope, toStoredRunScope, type RunScope } from "@/lib/hydration/runScope";
import { buildTaskQueueAsync } from "@/lib/hydration/taskQueue";
import {
  addProfile,
  normalizeSelection,
  parseProfilesExport,
  ProfileError,
  readProfiles,
  resolveSelection,
  serializeProfilesExport,
  writeProfiles,
  type ScopeSelection,
} from "@/lib/profiles/scopeProfiles";
import { EXECUTION_RECORD_STORAGE_KEY, SCOPE_PROFILES_STORAGE_KEY } from "@/lib/storageKeys";
import type { AutopilotBrandingCustomization } from "@/lib/win32/autopilotBrandingConfig";
import { AUTOPILOT_BRANDING_WIN32_APP } from "@/templates/win32Apps";
import type { HydrationTask, WizardState } from "@/types/hydration";

const AB = AUTOPILOT_BRANDING_WIN32_APP.displayName;
const customization: AutopilotBrandingCustomization = {
  removedApps: ["Clipchamp.Clipchamp", "MSTeams"],
  enabledTasks: ["Hide-ABWidgets"],
};
const invalid = { removedApps: ["Contoso.App"], enabledTasks: [] } as unknown as AutopilotBrandingCustomization;

const scope: RunScope = {
  selectedTargets: ["win32Apps"],
  selectedCISCategories: [],
  categorySelections: { win32Apps: { selectedItems: [AB, "7-Zip - [IHD]"], autopilotBranding: customization } },
};

function record(overrides: Partial<ExecutionRecord>): ExecutionRecord {
  return {
    tenantId: "tenant-1",
    homeAccountId: "home-1",
    operationMode: "create",
    isPreview: true,
    selectedObjectCount: 2,
    tasks: [],
    activityLog: [],
    startTime: new Date("2026-11-12T01:00:00.000Z"),
    endTime: new Date("2026-11-12T01:00:02.000Z"),
    outcome: "failed",
    summary: null,
    fatalError: "Stopped",
    ...overrides,
  } as ExecutionRecord;
}

function failedTask(overrides: Partial<HydrationTask> = {}): HydrationTask {
  return {
    id: "task-7",
    category: "win32Apps",
    operation: "create",
    itemName: AB,
    status: "failed",
    error: "Upload failed",
    autopilotBranding: customization,
    ...overrides,
  } as HydrationTask;
}

describe("Autopilot Branding customization in the run scope", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps the customization of the wizard and through storage, for run-for-real", () => {
    const state = {
      currentStep: 4,
      confirmed: true,
      isPreview: true,
      selectedTargets: ["win32Apps"],
      selectedCISCategories: [],
      categorySelections: scope.categorySelections,
    } satisfies WizardState;
    expect(getWizardRunScope(state)).toEqual(scope);

    writeExecutionRecord(sessionStorage, record({ scope }));
    const restored = readExecutionRecord(sessionStorage)!;
    expect(restored.scope).toEqual(scope);
    const plan = createRerunPlan("live", { ...restored, tasks: [] });
    expect(plan.configuration.scope?.categorySelections?.win32Apps?.autopilotBranding).toEqual(customization);
  });

  it("drops a scope with an invalid customization, so run-for-real is not offered", () => {
    expect(
      toStoredRunScope({
        ...scope,
        categorySelections: { win32Apps: { selectedItems: [AB], autopilotBranding: invalid } },
      }),
    ).toBeUndefined();
    expect(
      toStoredRunScope({
        ...scope,
        categorySelections: {
          win32Apps: { selectedItems: [AB], autopilotBranding: { ...customization, wallpaper: "a.jpg" } as never },
        },
      }),
    ).toBeUndefined();
  });
});

describe("Autopilot Branding customization in the task queue", () => {
  it("puts the customization on the Autopilot Branding create task only", async () => {
    const tasks = await buildTaskQueueAsync(["win32Apps"], "create", { categorySelections: scope.categorySelections });

    expect(tasks.find((task) => task.itemName === AB)?.autopilotBranding).toEqual(customization);
    expect(tasks.find((task) => task.itemName === "7-Zip - [IHD]")).not.toHaveProperty("autopilotBranding");
  });

  it("does not put a customization on a delete task", async () => {
    const tasks = await buildTaskQueueAsync(["win32Apps"], "delete", { categorySelections: scope.categorySelections });
    expect(tasks.some((task) => "autopilotBranding" in task)).toBe(false);
  });
});

describe("Autopilot Branding customization in retries and resumes", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps the task customization through the saved record and the retry queue", async () => {
    writeExecutionRecord(sessionStorage, record({ isPreview: false, tasks: [failedTask()] }));
    const restored = readExecutionRecord(sessionStorage)!;
    const plan = createRerunPlan("retry", { ...restored });
    const queue = await buildRerunTaskQueue(plan.sourceTasks, "create");

    expect(queue).toEqual([
      { id: "task-1", category: "win32Apps", operation: "create", itemName: AB, autopilotBranding: customization, status: "pending" },
    ]);
  });

  it("does not restore a record whose task customization is invalid", () => {
    expect(() => writeExecutionRecord(sessionStorage, record({ tasks: [failedTask({ autopilotBranding: invalid })] })))
      .toThrow();
    const valid = record({ isPreview: false, tasks: [failedTask()] });
    writeExecutionRecord(sessionStorage, valid);
    expect(readExecutionRecord(sessionStorage)).not.toBeNull();
    const stored = JSON.parse(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)!);
    stored.tasks[0].autopilotBranding = invalid;
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, JSON.stringify(stored));
    expect(readExecutionRecord(sessionStorage)).toBeNull();
  });
});

describe("Autopilot Branding customization in scope profiles", () => {
  const selection: ScopeSelection = {
    targets: ["win32Apps"],
    items: { win32Apps: [AB] },
    autopilotBranding: { removedApps: ["MSTeams", "Clipchamp.Clipchamp"], enabledTasks: ["Hide-ABWidgets"] },
  };

  it("saves, exports, and imports the customization in catalog order", () => {
    const profiles = addProfile([], "Lean cleanup", selection, new Date("2026-11-12T00:00:00.000Z"));
    expect(profiles[0].selection.autopilotBranding).toEqual(customization);
    expect(writeProfiles(localStorage, profiles)).toEqual({ ok: true });
    expect(readProfiles(localStorage)[0].selection.autopilotBranding).toEqual(customization);
    expect(parseProfilesExport(serializeProfilesExport(profiles))[0].selection.autopilotBranding).toEqual(customization);
  });

  it("keeps the customization only while the Autopilot Branding app is selected", () => {
    expect(normalizeSelection({ ...selection, items: { win32Apps: ["7-Zip - [IHD]"] } })).not.toHaveProperty(
      "autopilotBranding",
    );
    const resolved = resolveSelection(selection, { win32Apps: new Set(["7-Zip - [IHD]"]) });
    expect(resolved.selection).not.toHaveProperty("autopilotBranding");
    expect(resolveSelection(selection, { win32Apps: new Set([AB]) }).selection.autopilotBranding).toEqual(
      selection.autopilotBranding,
    );
  });

  it("rejects an invalid customization in a profile file and in storage", () => {
    const profiles = addProfile([], "Lean cleanup", selection);
    const exported = JSON.parse(serializeProfilesExport(profiles));
    exported.profiles[0].selection.autopilotBranding = { removedApps: ["Contoso.App"], enabledTasks: [] };
    expect(() => parseProfilesExport(JSON.stringify(exported))).toThrow(ProfileError);

    localStorage.setItem(
      SCOPE_PROFILES_STORAGE_KEY,
      JSON.stringify({ version: 1, profiles: exported.profiles }),
    );
    expect(readProfiles(localStorage)).toEqual([]);
    expect(() => addProfile([], "Bad", { ...selection, autopilotBranding: invalid })).toThrow();
  });
});
