import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import { cacheTemplates, clearCategoryCache } from "@/lib/templates/loader";
import { CheckCancelledError, detectConflicts } from "@/lib/hydration/conflicts";
import { loadTenantCaches } from "@/lib/hydration/drift/scan";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask, TaskCategory } from "@/types/hydration";

const MARKER = "Imported by Intune Hydration Kit";

const groupTemplate = {
  displayName: "[IHD] Intune - Windows Devices",
  description: `Windows devices ${MARKER}`,
  membershipRule: '(device.deviceOSType -eq "Windows")',
};
const staticTemplate = { displayName: "[IHD] Static", description: MARKER, isStaticGroup: true };
const filterTemplate = { displayName: "[IHD] Windows - Corporate", description: MARKER, platform: "windows10AndLater", rule: '(device.deviceOwnership -eq "Corporate")' };
const caTemplate = {
  displayName: "Block legacy authentication",
  state: "enabled",
  conditions: { clientAppTypes: ["exchangeActiveSync", "other"], users: { includeUsers: ["All"], excludeUsers: [] } },
  grantControls: { operator: "OR", builtInControls: ["block"] },
  sessionControls: null,
};

function task(category: TaskCategory, itemName: string, id = `${category}-${itemName}`): HydrationTask {
  return { id, category, operation: "create", itemName, status: "pending" };
}

function graphGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "g-1",
    displayName: groupTemplate.displayName,
    description: groupTemplate.description,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    securityEnabled: true,
    membershipRule: groupTemplate.membershipRule,
    membershipRuleProcessingState: "On",
    ...overrides,
  };
}

function createClient(get: (endpoint: string) => Promise<unknown>) {
  return {
    get: vi.fn(get),
    getCollection: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    batch: vi.fn(),
  };
}

function context(client: ReturnType<typeof createClient>, overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    client: client as unknown as GraphClient,
    operationMode: "create",
    isPreview: true,
    stopOnFirstError: false,
    ...overrides,
  };
}

function expectNoWrites(client: ReturnType<typeof createClient>) {
  expect(client.post).not.toHaveBeenCalled();
  expect(client.patch).not.toHaveBeenCalled();
  expect(client.delete).not.toHaveBeenCalled();
  expect(client.batch).not.toHaveBeenCalled();
}

beforeEach(() => {
  cacheTemplates("groups", [groupTemplate, staticTemplate]);
  cacheTemplates("filters", [filterTemplate]);
  cacheTemplates("conditionalAccess", [caTemplate]);
});

afterEach(() => {
  for (const category of ["groups", "filters", "conditionalAccess"]) clearCategoryCache(category);
});

describe("detectConflicts", () => {
  it("reports existing objects with marker and comparison, using GET requests only", async () => {
    const client = createClient(async (endpoint) => {
      if (endpoint.startsWith("/groups/g-1")) return graphGroup({ membershipRule: '(device.deviceOSType -eq "Linux")' });
      if (endpoint.startsWith("/identity/conditionalAccess/policies/ca-1")) {
        return { ...caTemplate, id: "ca-1", displayName: "Block legacy authentication", state: "disabled", sessionControls: null };
      }
      throw new Error(`Unexpected GET ${endpoint}`);
    });
    const ctx = context(client, {
      cachedIntuneGroups: [{ id: "g-1", displayName: "Intune - Windows Devices", description: groupTemplate.description } as never],
      cachedFilters: [],
      cachedConditionalAccessPolicies: [{ id: "ca-1", displayName: "Block legacy authentication", state: "enabled" }],
    });

    const report = await detectConflicts(
      [task("groups", groupTemplate.displayName), task("groups", staticTemplate.displayName), task("filters", filterTemplate.displayName), task("conditionalAccess", caTemplate.displayName)],
      ctx
    );

    expect(report.checked).toBe(4);
    expect(report.unchecked).toEqual([]);
    expect(report.conflicts).toHaveLength(2);
    const [group, policy] = report.conflicts;
    expect(group).toMatchObject({ category: "groups", existingId: "g-1", marker: "present", comparison: { status: "differs" } });
    expect(group.comparison.differences[0].path).toBe("membershipRule");
    // An administrator's policy with the same name: no marker in the display name. State is not compared.
    expect(policy).toMatchObject({ category: "conditionalAccess", existingId: "ca-1", marker: "missing", comparison: { status: "matches" } });
    expectNoWrites(client);
  });

  it("names the categories that could not be checked when a cache did not load, instead of reporting no conflicts", async () => {
    const client = createClient(async () => graphGroup());
    const ctx = context(client, {
      cachedIntuneGroups: [],
      prefetchErrors: { cachedFilters: "[403] Forbidden" },
    });

    const report = await detectConflicts([task("groups", groupTemplate.displayName), task("filters", filterTemplate.displayName)], ctx);

    expect(report.conflicts).toEqual([]);
    expect(report.checked).toBe(1);
    expect(report.unchecked).toEqual([
      {
        category: "filters",
        itemName: filterTemplate.displayName,
        reason: "Could not read the existing device filters from the tenant ([403] Forbidden).",
      },
    ]);
    expectNoWrites(client);
  });

  it("reports categories that are not checked before the run", async () => {
    const client = createClient(async () => ({}));
    const report = await detectConflicts([task("enrollment", "Autopilot"), task("win32Apps", "7-Zip")], context(client));
    expect(report.unchecked.map((item) => item.category)).toEqual(["enrollment", "win32Apps"]);
    expect(client.get).not.toHaveBeenCalled();
  });

  it("reports cannot compare when the object read fails", async () => {
    const client = createClient(async () => {
      throw new Error("[500] Internal Server Error");
    });
    const ctx = context(client, {
      cachedIntuneGroups: [{ id: "g-1", displayName: groupTemplate.displayName, description: "Admin group" } as never],
    });
    const report = await detectConflicts([task("groups", groupTemplate.displayName)], ctx);
    expect(report.conflicts[0]).toMatchObject({
      marker: "missing",
      comparison: { status: "cannotCompare", reason: "The object could not be read: [500] Internal Server Error" },
    });
  });

  it("stops between reads when cancelled", async () => {
    const client = createClient(async () => graphGroup());
    let cancelled = false;
    const ctx = context(client, {
      cachedIntuneGroups: [{ id: "g-1", displayName: groupTemplate.displayName, description: MARKER } as never],
    });
    client.get.mockImplementation(async () => {
      cancelled = true;
      return graphGroup();
    });
    await expect(
      detectConflicts([task("groups", groupTemplate.displayName, "a"), task("groups", groupTemplate.displayName, "b")], ctx, {
        shouldCancel: () => cancelled,
      })
    ).rejects.toBeInstanceOf(CheckCancelledError);
    expect(client.get).toHaveBeenCalledTimes(1);
  });
});

describe("loadTenantCaches", () => {
  it("loads only the caches of the selected categories and records failures", async () => {
    const client = createClient(async () => ({}));
    client.getCollection.mockImplementation(async (endpoint: string) => {
      if (endpoint.includes("conditionalAccess")) throw new Error("[403] Forbidden");
      return [];
    });
    const ctx = context(client);
    await loadTenantCaches(ctx, ["groups", "conditionalAccess"]);
    expect(ctx.cachedIntuneGroups).toEqual([]);
    expect(ctx.cachedConditionalAccessPolicies).toBeUndefined();
    expect(ctx.prefetchErrors).toEqual({ cachedConditionalAccessPolicies: "[403] Forbidden" });
    expect(ctx.cachedFilters).toBeUndefined();
    expectNoWrites(client);
  });
});
