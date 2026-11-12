import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import { cacheTemplates, clearCategoryCache } from "@/lib/templates/loader";
import { executeTasks } from "@/lib/hydration/engine";
import { createSummary, generateCSVReport, generateJSONReport, generateMarkdownReport, summaryMatchesExecution } from "@/lib/hydration/reporter";
import { readExecutionRecord, writeExecutionRecord, type ExecutionRecord } from "@/lib/hydration/executionRecord";
import {
  UPDATE_REASONS,
  getExistingSkipReason,
  updateExistingObject,
} from "@/lib/hydration/updateResolver";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask, TaskCategory } from "@/types/hydration";

const MARKER = "Imported by Intune Hydration Kit";

const groupTemplate = {
  displayName: "[IHD] Intune - Windows Devices",
  description: `Windows devices ${MARKER}`,
  membershipRule: '(device.deviceOSType -eq "Windows")',
};
const filterTemplate = {
  displayName: "[IHD] Windows - Corporate",
  description: MARKER,
  platform: "windows10AndLater",
  rule: '(device.deviceOwnership -eq "Corporate")',
};
const caTemplate = {
  displayName: "Block legacy authentication",
  state: "enabled",
  conditions: { clientAppTypes: ["exchangeActiveSync", "other"], users: { includeUsers: ["All"] } },
  grantControls: { operator: "OR", builtInControls: ["block"] },
  sessionControls: null,
};

function task(category: TaskCategory, itemName: string): HydrationTask {
  return { id: `${category}-1`, category, operation: "create", itemName, status: "pending" };
}

function freshGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "g-1",
    displayName: groupTemplate.displayName,
    description: groupTemplate.description,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "Linux")',
    membershipRuleProcessingState: "On",
    ...overrides,
  };
}

function freshFilter(overrides: Record<string, unknown> = {}) {
  return {
    id: "f-1",
    displayName: filterTemplate.displayName,
    description: filterTemplate.description,
    platform: "windows10AndLater",
    rule: '(device.deviceOwnership -eq "Personal")',
    roleScopeTags: ["0"],
    ...overrides,
  };
}

function createClient(get: (endpoint: string, version?: string) => Promise<unknown>) {
  return {
    get: vi.fn(get),
    getCollection: vi.fn(async () => []),
    post: vi.fn(),
    postNoRetry: vi.fn(),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(),
    batch: vi.fn(),
    setExecutionControls: vi.fn(),
  };
}

type Client = ReturnType<typeof createClient>;

function context(client: Client, overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    client: client as unknown as GraphClient,
    operationMode: "create",
    isPreview: false,
    stopOnFirstError: false,
    updateExisting: true,
    cachedIntuneGroups: [{ id: "g-1", displayName: groupTemplate.displayName, description: groupTemplate.description } as never],
    cachedFilters: [{ id: "f-1", displayName: filterTemplate.displayName, description: MARKER } as never],
    cachedConditionalAccessPolicies: [{ id: "ca-1", displayName: `${caTemplate.displayName} [${MARKER}]`, state: "enabled" }],
    ...overrides,
  };
}

beforeEach(() => {
  cacheTemplates("groups", [groupTemplate]);
  cacheTemplates("filters", [filterTemplate]);
  cacheTemplates("conditionalAccess", [caTemplate]);
});

afterEach(() => {
  for (const category of ["groups", "filters", "conditionalAccess"]) clearCategoryCache(category);
});

describe("updateExistingObject safety rules", () => {
  it("skips an object without the kit marker without reading or writing it", async () => {
    const client = createClient(async () => freshGroup());
    const ctx = context(client, {
      cachedIntuneGroups: [{ id: "g-1", displayName: groupTemplate.displayName, description: "Created by an administrator" } as never],
    });
    const result = await updateExistingObject(task("groups", groupTemplate.displayName), ctx);
    expect(result).toMatchObject({ skipped: true, skipKind: "blocked", error: UPDATE_REASONS.noMarker });
    expect(client.get).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("re-reads the object by ID and skips it when the marker was removed after the prefetch", async () => {
    const client = createClient(async () => freshGroup({ description: "Marker removed by an administrator" }));
    const result = await updateExistingObject(task("groups", groupTemplate.displayName), context(client));
    expect(client.get).toHaveBeenCalledWith(expect.stringMatching(/^\/groups\/g-1\?\$select=/), "v1.0");
    expect(result).toMatchObject({ skipped: true, skipKind: "blocked", error: UPDATE_REASONS.noMarker });
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("fails the task without a write when the re-read fails", async () => {
    const client = createClient(async () => {
      throw Object.assign(new Error("[404] ResourceNotFound"), { status: 404 });
    });
    const result = await updateExistingObject(task("groups", groupTemplate.displayName), context(client));
    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("could not be read again before the update");
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("reports an object that already matches as a skip, without a write", async () => {
    const client = createClient(async () => freshGroup({ membershipRule: groupTemplate.membershipRule }));
    const result = await updateExistingObject(task("groups", groupTemplate.displayName), context(client));
    expect(result).toMatchObject({ skipped: true, skipKind: "noOp", error: UPDATE_REASONS.matches });
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("patches only the differing template-owned setting: no name, description, assignments, or scope tags", async () => {
    const client = createClient(async () => freshGroup());
    const current = task("groups", groupTemplate.displayName);
    const result = await updateExistingObject(current, context(client));
    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.patch).toHaveBeenCalledTimes(1);
    expect(client.patch).toHaveBeenCalledWith("/groups/g-1", { membershipRule: groupTemplate.membershipRule }, "v1.0");
    expect(current.update).toEqual({
      objectId: "g-1",
      applied: true,
      differences: [
        `membershipRule: tenant "(device.deviceostype -eq \\"linux\\")" -> template "(device.deviceostype -eq \\"windows\\")"`,
      ],
    });
    expect(client.post).not.toHaveBeenCalled();
    expect(client.get.mock.calls.some(([endpoint]) => String(endpoint).includes("assignments"))).toBe(false);
  });

  it("does not change a group between dynamic and static membership", async () => {
    const client = createClient(async () => freshGroup({ groupTypes: [], membershipRule: null, membershipRuleProcessingState: null }));
    const result = await updateExistingObject(task("groups", groupTemplate.displayName), context(client));
    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toContain("groupTypes");
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("shows what would be updated in preview mode with GET requests only", async () => {
    const client = createClient(async () => freshGroup());
    const current = task("groups", groupTemplate.displayName);
    const result = await updateExistingObject(current, context(client, { isPreview: true }));
    expect(result).toMatchObject({ success: true, skipped: false });
    expect(current.update).toMatchObject({ objectId: "g-1", applied: false });
    expect(current.update?.differences).toHaveLength(1);
    expect(client.patch).not.toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("patches a device filter rule with the beta endpoint, without scope tags", async () => {
    const client = createClient(async () => freshFilter());
    const result = await updateExistingObject(task("filters", filterTemplate.displayName), context(client));
    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.get).toHaveBeenCalledWith("/deviceManagement/assignmentFilters/f-1", "beta");
    expect(client.patch).toHaveBeenCalledWith("/deviceManagement/assignmentFilters/f-1", { rule: filterTemplate.rule }, "beta");
  });

  it("does not change the platform of a device filter", async () => {
    const client = createClient(async () => freshFilter({ platform: "iOS", rule: filterTemplate.rule }));
    const result = await updateExistingObject(task("filters", filterTemplate.displayName), context(client));
    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toContain("platform");
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("does not update a type without update support", async () => {
    const client = createClient(async () => ({}));
    const result = await updateExistingObject(task("conditionalAccess", caTemplate.displayName), context(client));
    expect(result).toMatchObject({ skipped: true, skipKind: "noOp", error: UPDATE_REASONS.notSupported });
    expect(client.get).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
  });
});

describe("getExistingSkipReason", () => {
  it("names unsupported types and unmarked objects only when update was chosen", () => {
    const client = createClient(async () => ({}));
    const caTask = task("conditionalAccess", caTemplate.displayName);
    expect(getExistingSkipReason(caTask, "Already exists", context(client))).toBe(UPDATE_REASONS.notSupported);
    expect(getExistingSkipReason(caTask, "Already exists", context(client, { updateExisting: false }))).toBe("Already exists");
    expect(getExistingSkipReason(caTask, "No Entra ID Premium (P1) license", context(client))).toBe("No Entra ID Premium (P1) license");
    const unmarked = context(client, {
      cachedConditionalAccessPolicies: [{ id: "ca-1", displayName: caTemplate.displayName, state: "enabled" }],
    });
    expect(getExistingSkipReason(caTask, "Already exists", unmarked)).toBe(UPDATE_REASONS.noMarker);
  });
});

describe("create run with update existing", () => {
  it("updates a kit group, never writes to an existing Conditional Access policy, and keeps its state", async () => {
    const client = createClient(async (endpoint) => {
      if (endpoint.startsWith("/groups/g-1")) return freshGroup();
      throw new Error(`Unexpected GET ${endpoint}`);
    });
    const tasks = [task("groups", groupTemplate.displayName), task("conditionalAccess", caTemplate.displayName)];
    const results = await executeTasks(tasks, context(client));

    expect(tasks[0]).toMatchObject({ status: "success", update: { objectId: "g-1", applied: true } });
    expect(tasks[1]).toMatchObject({ status: "skipped", skipKind: "noOp", error: UPDATE_REASONS.notSupported });
    expect(results).toHaveLength(2);
    expect(client.patch).toHaveBeenCalledTimes(1);
    expect(client.patch).toHaveBeenCalledWith("/groups/g-1", expect.not.objectContaining({ state: expect.anything() }), "v1.0");
    expect(client.post).not.toHaveBeenCalled();
    expect(client.batch).not.toHaveBeenCalled();
  });

  it("keeps the default: existing objects are skipped and not read or written", async () => {
    const client = createClient(async () => freshGroup());
    const tasks = [task("groups", groupTemplate.displayName)];
    await executeTasks(tasks, context(client, { updateExisting: false }));
    expect(tasks[0]).toMatchObject({ status: "skipped", skipKind: "noOp" });
    expect(tasks[0].update).toBeUndefined();
    expect(client.patch).not.toHaveBeenCalled();
  });
});

describe("updated stats and reports", () => {
  const start = new Date("2026-08-17T01:00:00.000Z");
  const end = new Date("2026-08-17T01:00:02.000Z");
  const updatedTask = (applied: boolean): HydrationTask => ({
    id: "g", category: "groups", operation: "create", itemName: "Group", status: "success",
    update: { objectId: "g-1", applied, differences: ["membershipRule: tenant a -> template b"] },
    startTime: start, endTime: end,
  });
  const createdTask: HydrationTask = { id: "f", category: "filters", operation: "create", itemName: "Filter", status: "success", startTime: start, endTime: end };

  it("counts updated separately from created and omits the field when nothing was updated", () => {
    const summary = createSummary("tenant", "create", start, end, [updatedTask(true), createdTask]);
    expect(summary.stats).toMatchObject({ total: 2, created: 1, updated: 1 });
    expect(createSummary("tenant", "create", start, end, [createdTask]).stats).not.toHaveProperty("updated");
  });

  it("labels updates in every report format, and as would-update in preview", () => {
    const live = createSummary("tenant", "create", start, end, [updatedTask(true)]);
    expect(generateMarkdownReport(live, [updatedTask(true)], "succeeded", false)).toContain("- **Updated**: 1");
    expect(JSON.parse(generateJSONReport(live, [updatedTask(true)], "succeeded", false)).tasks[0].outcome).toBe("updated");
    const preview = createSummary("tenant", "create", start, end, [updatedTask(false)]);
    const json = JSON.parse(generateJSONReport(preview, [updatedTask(false)], "succeeded", true));
    expect(json.tasks[0].outcome).toBe("wouldUpdate");
    expect(json.summary.stats).toMatchObject({ updated: 0, wouldUpdate: 1, created: 0 });
    const [headers, row] = generateCSVReport([updatedTask(true)], "succeeded", false, live).split("\n").map((line) => JSON.parse(`[${line}]`));
    expect(headers.at(-1)).toBe("Created Object Portal URL");
    expect(row).toHaveLength(headers.length);
    const values = Object.fromEntries(headers.map((header: string, index: number) => [header, row[index]]));
    expect(values).toMatchObject({ Outcome: "updated", Updated: "1", "Updated Settings": "membershipRule: tenant a -> template b" });
  });

  function record(tasks: HydrationTask[]): ExecutionRecord {
    const summary = createSummary("tenant-1", "create", start, end, tasks);
    return {
      tenantId: "tenant-1", homeAccountId: "home", operationMode: "create", isPreview: false, selectedObjectCount: tasks.length,
      outcome: "succeeded", fatalError: null, startTime: start, endTime: end, tasks, activityLog: [], summary,
    };
  }

  it("stores and restores a run record with an updated task", () => {
    sessionStorage.clear();
    writeExecutionRecord(sessionStorage, record([updatedTask(true), createdTask]));
    const restored = readExecutionRecord(sessionStorage);
    expect(restored?.tasks[0].update).toEqual(updatedTask(true).update);
    expect(restored?.summary?.stats.updated).toBe(1);
  });

  it("still loads a record saved before the updated field existed", () => {
    sessionStorage.clear();
    const old = record([createdTask]);
    expect(old.summary?.stats).not.toHaveProperty("updated");
    writeExecutionRecord(sessionStorage, old);
    expect(readExecutionRecord(sessionStorage)?.summary?.stats).toEqual({ total: 1, created: 1, deleted: 0, skipped: 0, failed: 0 });
    expect(summaryMatchesExecution(old.summary!, { ...old, startTime: start, tasks: old.tasks })).toBe(true);
  });
});
