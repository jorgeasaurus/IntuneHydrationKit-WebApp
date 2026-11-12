import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../setup/msw-handlers";

vi.mock("@/lib/auth/authUtils", () => ({
  assertActiveAccountMatches: vi.fn(),
  getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
}));

import { GraphClient } from "@/lib/graph/client";
import { executeTasks } from "@/lib/hydration/engine";
import { recordCreatedObject } from "@/lib/hydration/createdObject";
import type { ExecutionContext } from "@/lib/hydration/types";
import { cacheTemplates, clearCategoryCache, type BaselinePolicy } from "@/lib/templates/loader";
import type { HydrationTask, TaskCreatedObject } from "@/types/hydration";

const GRAPH_BASE = "https://graph.microsoft.com";
const GROUPS = ["[IHD] Windows Devices", "[IHD] macOS Devices", "[IHD] iOS Devices"];
const FILTER = "[IHD] Corporate Windows";

function task(category: HydrationTask["category"], itemName: string, index = 0): HydrationTask {
  return { id: `${category}-${index}`, category, operation: "create", itemName, status: "pending" };
}

/** Run context that keeps the created object of each task at the moment `onTaskComplete` fires. */
function createContext(overrides: Partial<ExecutionContext> = {}) {
  const atComplete = new Map<string, TaskCreatedObject | undefined>();
  const context: ExecutionContext = {
    client: new GraphClient(),
    operationMode: "create",
    isPreview: false,
    stopOnFirstError: false,
    cachedIntuneGroups: [],
    cachedFilters: [],
    onTaskComplete: (completed) => atComplete.set(completed.id, completed.createdObject),
    ...overrides,
  };
  return { context, atComplete };
}

describe("created objects on tasks", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    cacheTemplates(
      "groups",
      GROUPS.map((displayName) => ({ displayName, description: "d", membershipRule: '(device.deviceOSType -eq "Windows")' })),
    );
    cacheTemplates("filters", [
      { displayName: FILTER, description: "d", platform: "windows10AndLater", rule: '(device.osVersion -startsWith "10")' },
    ]);
  });

  afterEach(() => {
    clearCategoryCache("groups");
    clearCategoryCache("filters");
    vi.restoreAllMocks();
  });

  it("sets the created object in the batch path before onTaskComplete, for successful creates only", async () => {
    server.use(
      http.post(`${GRAPH_BASE}/v1.0/$batch`, () =>
        HttpResponse.json({
          responses: [
            { id: "req-0", status: 201, body: { id: "group-created", displayName: GROUPS[0] } },
            { id: "req-1", status: 409, body: { error: { code: "Conflict", message: "Already exists" } } },
            { id: "req-2", status: 400, body: { error: { code: "BadRequest", message: "Invalid rule" } } },
          ],
        }),
      ),
    );
    const tasks = GROUPS.map((name, index) => task("groups", name, index));
    const { context, atComplete } = createContext();

    await executeTasks(tasks, context);

    expect(tasks.map((item) => item.status)).toEqual(["success", "skipped", "failed"]);
    expect(atComplete.get("groups-0")).toEqual({ id: "group-created" });
    expect(tasks[0].createdObject).toEqual({ id: "group-created" });
    expect(tasks[1].createdObject).toBeUndefined();
    expect(tasks[2].createdObject).toBeUndefined();
  });

  it("sets the created object in the sequential path before onTaskComplete", async () => {
    server.use(
      http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () =>
        HttpResponse.json({ id: "filter-created", displayName: FILTER }, { status: 201 }),
      ),
    );
    // stopOnFirstError turns batching off, so the task goes through the sequential executor.
    const { context, atComplete } = createContext({ stopOnFirstError: true });
    const filterTask = task("filters", FILTER);

    await executeTasks([filterTask], context);

    expect(filterTask.status).toBe("success");
    expect(atComplete.get("filters-0")).toEqual({ id: "filter-created" });
  });

  it("sets nothing for a failed sequential create", async () => {
    server.use(
      http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () =>
        HttpResponse.json({ error: { code: "BadRequest", message: "Invalid rule" } }, { status: 400 }),
      ),
    );
    const { context } = createContext({ stopOnFirstError: true });
    const filterTask = task("filters", FILTER);

    await executeTasks([filterTask], context);

    expect(filterTask.status).toBe("failed");
    expect(filterTask.createdObject).toBeUndefined();
  });

  it.each([
    ["batch", false],
    ["sequential", true],
  ])("sets nothing in a preview run (%s path)", async (_path, stopOnFirstError) => {
    const graphWrites = vi.fn();
    server.use(
      http.post(`${GRAPH_BASE}/*`, () => {
        graphWrites();
        return HttpResponse.json({ id: "must-not-be-used" }, { status: 201 });
      }),
    );
    const tasks = [task("groups", GROUPS[0]), task("filters", FILTER)];
    const { context, atComplete } = createContext({ isPreview: true, stopOnFirstError });

    await executeTasks(tasks, context);

    expect(graphWrites).not.toHaveBeenCalled();
    expect(tasks.map((item) => item.status)).toEqual(["success", "success"]);
    expect(tasks.map((item) => item.createdObject)).toEqual([undefined, undefined]);
    expect([...atComplete.values()]).toEqual([undefined, undefined]);
  });
});

describe("recordCreatedObject", () => {
  const live = { isPreview: false };

  function succeeded(overrides: Partial<HydrationTask> = {}): HydrationTask {
    return { ...task("groups", GROUPS[0]), status: "success", ...overrides } as HydrationTask;
  }

  it("keeps the ID of a successful live create", () => {
    const created = succeeded();
    recordCreatedObject(created, "object-id", live);
    expect(created.createdObject).toEqual({ id: "object-id" });
  });

  it.each<[string, HydrationTask, boolean]>([
    ["preview", succeeded(), true],
    ["delete", succeeded({ operation: "delete" }), false],
    ["failed", succeeded({ status: "failed" }), false],
    ["skipped", { ...task("groups", GROUPS[0]), status: "skipped", skipKind: "noOp" }, false],
  ])("keeps nothing for a %s task", (_kind, target, isPreview) => {
    recordCreatedObject(target, "object-id", { isPreview });
    expect(target.createdObject).toBeUndefined();
  });

  it("keeps nothing without an ID", () => {
    const created = succeeded();
    recordCreatedObject(created, undefined, live);
    expect(created).not.toHaveProperty("createdObject");
  });

  it("adds the OpenIntuneBaseline policy type for a baseline task", () => {
    const templates = [
      { name: "Win - OIB - Defender", _oibPolicyType: "SettingsCatalog", _oibFilePath: "WINDOWS/SettingsCatalog/defender.json" },
    ] as unknown as BaselinePolicy[];
    const created = succeeded({
      category: "baseline",
      itemName: "Win - OIB - Defender",
      templatePath: "WINDOWS/SettingsCatalog/defender.json",
    });

    recordCreatedObject(created, "policy-id", { ...live, cachedBaselineTemplates: templates });

    expect(created.createdObject).toEqual({ id: "policy-id", policyType: "SettingsCatalog" });
  });
});
