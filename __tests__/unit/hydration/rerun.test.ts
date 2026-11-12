import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockFetchDynamicGroups, mockFetchStaticGroups, mockFetchFilters, mockCreateGroup } = vi.hoisted(() => ({
  mockFetchDynamicGroups: vi.fn(),
  mockFetchStaticGroups: vi.fn(),
  mockFetchFilters: vi.fn(),
  mockCreateGroup: vi.fn(),
}));

// The real template cache is used. Only the template file fetches are replaced.
vi.mock("@/lib/templates/loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/templates/loader")>()),
  fetchDynamicGroups: mockFetchDynamicGroups,
  fetchStaticGroups: mockFetchStaticGroups,
  fetchFilters: mockFetchFilters,
}));

vi.mock("@/lib/graph/groups", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/graph/groups")>()),
  createGroup: mockCreateGroup,
}));

vi.mock("@/lib/config/batchConfig", () => ({
  getBatchConfig: () => ({ enableBatching: false, defaultBatchSize: 20, delayBetweenBatches: 0 }),
}));

import { executeTasks } from "@/lib/hydration/engine";
import { clearCategoryCache } from "@/lib/templates/loader";
import {
  TEMPLATE_UNAVAILABLE_MESSAGE,
  buildRerunTaskQueue,
  createRerunPlan,
  getRerunBlockReason,
  getResumeTasks,
  getRetryTasks,
  type RerunSource,
} from "@/lib/hydration/rerun";

function task(id: string, status: HydrationTask["status"], overrides: Partial<HydrationTask> = {}): HydrationTask {
  const base = { id, category: "groups", operation: "create", itemName: `Group ${id}`, ...overrides } as const;
  if (status === "skipped") return { ...base, status, skipKind: "noOp" } as HydrationTask;
  return { ...base, status } as HydrationTask;
}

function source(overrides: Partial<RerunSource> = {}): RerunSource {
  return {
    tenantId: "tenant-1",
    homeAccountId: "home-1",
    tenantName: "Contoso",
    cloudEnvironment: "global",
    operationMode: "create",
    isPreview: false,
    tasks: [],
    licenses: { hasConditionalAccessLicense: false, hasPremiumP2License: true, hasWindowsDriverUpdateLicense: true },
    ...overrides,
  };
}

const GROUP_TEMPLATES = [
  { displayName: "[IHD] All Windows Devices", description: "Imported by Intune Hydration Kit", membershipRule: "x" },
  { displayName: "[IHD] All macOS Devices", description: "Imported by Intune Hydration Kit", membershipRule: "y" },
];

describe("rerun task selection", () => {
  const tasks: HydrationTask[] = [
    task("1", "success"),
    task("2", "failed", { error: "403" }),
    task("3", "skipped"),
    { ...task("4", "pending"), status: "skipped", skipKind: "cancelled" },
    task("5", "pending"),
    task("6", "running"),
    task("7", "failed"),
  ];

  it("retries only failed tasks, not skipped or cancelled tasks", () => {
    expect(getRetryTasks(tasks).map((item) => item.id)).toEqual(["2", "7"]);
  });

  it("resumes only pending tasks and the tasks that were running", () => {
    expect(getResumeTasks(tasks).map((item) => item.id)).toEqual(["5", "6"]);
  });
});

describe("getRerunBlockReason", () => {
  it("allows the same account and tenant", () => {
    expect(getRerunBlockReason(source(), { homeAccountId: "home-1", tenantId: "tenant-1" })).toBeNull();
  });

  it.each([
    ["a different account", { homeAccountId: "home-2", tenantId: "tenant-1" }],
    ["a different tenant", { homeAccountId: "home-1", tenantId: "tenant-2" }],
    ["no signed-in account", { homeAccountId: null, tenantId: null }],
  ])("blocks %s", (_label, active) => {
    expect(getRerunBlockReason(source(), active)).toMatch(/sign in/i);
  });
});

describe("createRerunPlan", () => {
  it("retries the failed tasks with the same tenant, account, mode, and licenses, and no wizard scope", () => {
    const plan = createRerunPlan(
      "retry",
      source({
        tasks: [task("1", "success"), task("2", "failed")],
        scope: { selectedTargets: ["groups"], selectedCISCategories: [] },
      }),
    );
    expect(plan.sourceTasks.map((item) => item.id)).toEqual(["2"]);
    expect(plan.configuration).toEqual({
      tenantId: "tenant-1",
      homeAccountId: "home-1",
      tenantName: "Contoso",
      cloudEnvironment: "global",
      operationMode: "create",
      isPreview: false,
      selectedObjectCount: 1,
      licenses: source().licenses,
    });
  });

  it("refuses a retry without failed tasks", () => {
    expect(() => createRerunPlan("retry", source({ tasks: [task("1", "success")] }))).toThrow(/no failed tasks/);
  });

  it("runs a preview for real with the same scope and mode, as a live run", () => {
    const scope = {
      selectedTargets: ["groups" as const],
      selectedCISCategories: [],
      categorySelections: { groups: { selectedItems: ["[IHD] All Windows Devices"] } },
    };
    const plan = createRerunPlan("live", source({ isPreview: true, operationMode: "delete", scope }));
    expect(plan.sourceTasks).toEqual([]);
    expect(plan.configuration).toMatchObject({ isPreview: false, operationMode: "delete", scope, selectedObjectCount: 1 });
  });

  it("does not run a live run or a preview without a scope for real", () => {
    const scope = { selectedTargets: ["groups" as const], selectedCISCategories: [] };
    expect(() => createRerunPlan("live", source({ isPreview: false, scope }))).toThrow();
    expect(() => createRerunPlan("live", source({ isPreview: true }))).toThrow();
  });
});

describe("buildRerunTaskQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCategoryCache("groups");
    clearCategoryCache("filters");
    mockFetchDynamicGroups.mockResolvedValue(GROUP_TEMPLATES);
    mockFetchStaticGroups.mockResolvedValue([]);
    mockFetchFilters.mockResolvedValue([]);
  });

  it("queues each earlier task again as a new pending task with the same identity", async () => {
    const earlier = [
      task("task-9", "failed", { itemName: "[IHD] All macOS Devices", error: "403", startTime: new Date() }),
    ];
    const queue = await buildRerunTaskQueue(earlier, "create");
    expect(queue).toEqual([
      { id: "task-1", category: "groups", operation: "create", itemName: "[IHD] All macOS Devices", status: "pending" },
    ]);
    // The templates are loaded again through the normal queue builder.
    expect(mockFetchDynamicGroups).toHaveBeenCalledTimes(1);
  });

  it("reports a create task without a template as failed, and does not drop it", async () => {
    const earlier = [
      task("a", "failed", { itemName: "[IHD] Removed Group" }),
      task("b", "failed", { itemName: "[IHD] All Windows Devices" }),
    ];
    const queue = await buildRerunTaskQueue(earlier, "create");
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({ itemName: "[IHD] Removed Group", status: "failed", error: TEMPLATE_UNAVAILABLE_MESSAGE });
    expect(queue[1]).toMatchObject({ itemName: "[IHD] All Windows Devices", status: "pending" });
  });

  it("queues a delete task without a template by name, so the delete resolver checks it", async () => {
    const earlier = [task("a", "failed", { operation: "delete", itemName: "Tenant-only group" })];
    const queue = await buildRerunTaskQueue(earlier, "delete");
    expect(queue).toEqual([
      { id: "task-1", category: "groups", operation: "delete", itemName: "Tenant-only group", status: "pending" },
    ]);
  });

  it("goes through the normal existence check: a retried create whose object now exists is skipped", async () => {
    const queue = await buildRerunTaskQueue([task("x", "failed", { itemName: "[IHD] All Windows Devices" })], "create");
    const getCollection = vi.fn().mockResolvedValue([
      { id: "existing", displayName: "[IHD] All Windows Devices", description: "Imported by Intune Hydration Kit" },
    ]);
    const context = {
      client: { getCollection, get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    } as unknown as ExecutionContext;

    await executeTasks(queue, context);

    // Fresh tenant prefetch for the existence check, then a skip instead of a create.
    expect(getCollection).toHaveBeenCalledWith(expect.stringContaining("/groups?$filter="));
    expect(mockCreateGroup).not.toHaveBeenCalled();
    expect(queue[0]).toMatchObject({ status: "skipped", skipKind: "noOp", error: "Already exists" });
  });
});
