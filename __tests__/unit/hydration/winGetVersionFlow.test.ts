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
import { getSelectedWinGetVersions } from "@/lib/winget/selectedVersions";
import { getWin32AppTemplates, WINGET_CATALOG_WIN32_APPS } from "@/templates/win32Apps";
import type { HydrationTask, WizardState } from "@/types/hydration";

const SEVEN_ZIP = "7-Zip - [IHD]";
const NOTEPAD = "Notepad++ - [IHD]";
const versions = { "7-zip": "26.05", "notepad-plus-plus": "8.9.8" };

const scope: RunScope = {
  selectedTargets: ["win32Apps"],
  selectedCISCategories: [],
  categorySelections: { win32Apps: { selectedItems: [SEVEN_ZIP, NOTEPAD], wingetVersions: versions } },
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
    startTime: new Date("2026-11-13T01:00:00.000Z"),
    endTime: new Date("2026-11-13T01:00:02.000Z"),
    outcome: "failed",
    summary: null,
    fatalError: "Stopped",
    ...overrides,
  } as ExecutionRecord;
}

function failedTask(overrides: Partial<HydrationTask> = {}): HydrationTask {
  return {
    id: "task-3",
    category: "win32Apps",
    operation: "create",
    itemName: NOTEPAD,
    status: "failed",
    error: "Upload failed",
    wingetVersion: "8.9.8",
    ...overrides,
  } as HydrationTask;
}

describe("default selection of opt-in WinGet catalog apps", () => {
  it("marks the 15 catalog apps opt-in and keeps the starter apps and Autopilot Branding default", () => {
    const optIn = getWin32AppTemplates().filter((template) => template.optIn).map((template) => template.id);
    expect(optIn).toEqual(WINGET_CATALOG_WIN32_APPS.map((template) => template.id));
    expect(optIn).toHaveLength(15);
    expect(getWin32AppTemplates().filter((template) => !template.optIn).map((template) => template.id)).toEqual([
      "7-zip",
      "google-chrome",
      "mozilla-firefox",
      "visual-studio-code",
      "autopilot-branding",
    ]);
  });

  it("does not queue an opt-in app in a create without a selection", async () => {
    const tasks = await buildTaskQueueAsync(["win32Apps"], "create");
    expect(tasks.map((task) => task.itemName)).toHaveLength(5);
    expect(tasks.map((task) => task.itemName)).not.toContain(NOTEPAD);
  });

  it("queues every app in a delete without a selection, so it can remove an opt-in app", async () => {
    const tasks = await buildTaskQueueAsync(["win32Apps"], "delete");
    expect(tasks).toHaveLength(20);
    expect(tasks.map((task) => task.itemName)).toContain(NOTEPAD);
  });

  it("queues an opt-in app that the user selected", async () => {
    const tasks = await buildTaskQueueAsync(["win32Apps"], "create", {
      categorySelections: { win32Apps: { selectedItems: [NOTEPAD] } },
    });
    expect(tasks.map((task) => task.itemName)).toEqual([NOTEPAD]);
  });
});

describe("pinned WinGet versions in the task queue", () => {
  it("puts the pinned version on the create task of each pinned app only", async () => {
    const tasks = await buildTaskQueueAsync(["win32Apps"], "create", {
      categorySelections: { win32Apps: { selectedItems: [SEVEN_ZIP, NOTEPAD, "Google Chrome - [IHD]"], wingetVersions: versions } },
    });
    expect(tasks.find((task) => task.itemName === SEVEN_ZIP)?.wingetVersion).toBe("26.05");
    expect(tasks.find((task) => task.itemName === NOTEPAD)?.wingetVersion).toBe("8.9.8");
    expect(tasks.find((task) => task.itemName === "Google Chrome - [IHD]")).not.toHaveProperty("wingetVersion");
  });

  it("does not put a version on a delete task", async () => {
    const tasks = await buildTaskQueueAsync(["win32Apps"], "delete", { categorySelections: scope.categorySelections });
    expect(tasks.some((task) => "wingetVersion" in task)).toBe(false);
  });

  it("keeps a version only for a selected WinGet app", () => {
    expect(getSelectedWinGetVersions([NOTEPAD, "Autopilot Branding (Cleanup) - [IHD]"], { ...versions, "autopilot-branding": "1" }))
      .toEqual({ "notepad-plus-plus": "8.9.8" });
    expect(getSelectedWinGetVersions([SEVEN_ZIP], { "notepad-plus-plus": "8.9.8" })).toBeUndefined();
  });
});

describe("pinned WinGet versions in the run scope, the record, and reruns", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps the versions of the wizard and through storage, for run-for-real", () => {
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
    expect(plan.configuration.scope?.categorySelections?.win32Apps?.wingetVersions).toEqual(versions);
  });

  it.each([
    ["an unsafe version", { "7-zip": "1.0 --force" }],
    ["an invalid app key", { "7 Zip": "1.0" }],
    ["a version that is not text", { "7-zip": 1 }],
  ])("drops a scope with %s", (_, wingetVersions) => {
    expect(
      toStoredRunScope({
        ...scope,
        categorySelections: { win32Apps: { selectedItems: [SEVEN_ZIP], wingetVersions: wingetVersions as never } },
      }),
    ).toBeUndefined();
  });

  it("keeps the task version through the saved record and the retry queue", async () => {
    writeExecutionRecord(sessionStorage, record({ isPreview: false, tasks: [failedTask()] }));
    const restored = readExecutionRecord(sessionStorage)!;
    const plan = createRerunPlan("retry", { ...restored });
    const queue = await buildRerunTaskQueue(plan.sourceTasks, "create");

    expect(queue).toEqual([
      { id: "task-1", category: "win32Apps", operation: "create", itemName: NOTEPAD, wingetVersion: "8.9.8", status: "pending" },
    ]);
    expect(await buildRerunTaskQueue(plan.sourceTasks, "delete")).toEqual([
      expect.not.objectContaining({ wingetVersion: expect.anything() }),
    ]);
  });

  it("does not restore a record whose task version is invalid", () => {
    expect(() => writeExecutionRecord(sessionStorage, record({ tasks: [failedTask({ wingetVersion: "1;calc" })] })))
      .toThrow();
    writeExecutionRecord(sessionStorage, record({ isPreview: false, tasks: [failedTask()] }));
    const stored = JSON.parse(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)!);
    stored.tasks[0].wingetVersion = "1.0'";
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, JSON.stringify(stored));
    expect(readExecutionRecord(sessionStorage)).toBeNull();
  });
});

describe("pinned WinGet versions in scope profiles", () => {
  const selection: ScopeSelection = {
    targets: ["win32Apps"],
    items: { win32Apps: [NOTEPAD, SEVEN_ZIP] },
    wingetVersions: { "notepad-plus-plus": "8.9.8", "7-zip": "26.05" },
  };

  it("saves, exports, and imports the versions sorted by app", () => {
    const profiles = addProfile([], "Pinned tools", selection, new Date("2026-11-13T00:00:00.000Z"));
    expect(Object.keys(profiles[0].selection.wingetVersions!)).toEqual(["7-zip", "notepad-plus-plus"]);
    expect(writeProfiles(localStorage, profiles)).toEqual({ ok: true });
    expect(readProfiles(localStorage)[0].selection.wingetVersions).toEqual(selection.wingetVersions);
    expect(parseProfilesExport(serializeProfilesExport(profiles))[0].selection.wingetVersions).toEqual(
      selection.wingetVersions,
    );
  });

  it("keeps a version only while its app is selected", () => {
    expect(normalizeSelection({ ...selection, items: { win32Apps: [SEVEN_ZIP] } }).wingetVersions).toEqual({
      "7-zip": "26.05",
    });
    expect(normalizeSelection({ ...selection, items: { win32Apps: ["Google Chrome - [IHD]"] } })).not.toHaveProperty(
      "wingetVersions",
    );
    const resolved = resolveSelection(selection, { win32Apps: new Set([NOTEPAD]) });
    expect(resolved.selection.wingetVersions).toEqual({ "notepad-plus-plus": "8.9.8" });
  });

  it("rejects an invalid version in a profile file and in storage", () => {
    const profiles = addProfile([], "Pinned tools", selection);
    const exported = JSON.parse(serializeProfilesExport(profiles));
    exported.profiles[0].selection.wingetVersions = { "7-zip": "1.0 --force" };
    expect(() => parseProfilesExport(JSON.stringify(exported))).toThrow(ProfileError);

    localStorage.setItem(SCOPE_PROFILES_STORAGE_KEY, JSON.stringify({ version: 1, profiles: exported.profiles }));
    expect(readProfiles(localStorage)).toEqual([]);
  });
});
