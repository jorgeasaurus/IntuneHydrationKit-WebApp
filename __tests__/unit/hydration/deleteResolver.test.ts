import { describe, expect, it, vi } from "vitest";

import { executeDeleteTask, resolveDeleteTarget } from "@/lib/hydration/deleteResolver";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask, TaskCategory } from "@/types/hydration";

const MARKER = "Imported by Intune Hydration Kit";

function createTask(category: TaskCategory, itemName: string): HydrationTask {
  return { id: `${category}-${itemName}`, category, operation: "delete", itemName, status: "pending" };
}

function createContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    client: {
      get: vi.fn().mockResolvedValue({ value: [] }),
      getCollection: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExecutionContext["client"],
    operationMode: "delete",
    isPreview: false,
    stopOnFirstError: false,
    ...overrides,
  };
}

describe("resolveDeleteTarget", () => {
  it.each([
    ["groups", "cachedIntuneGroups", "displayName", "/groups/obj-id", "v1.0", null],
    ["filters", "cachedFilters", "displayName", "/deviceManagement/assignmentFilters/obj-id", "beta", null],
    ["compliance", "cachedV2CompliancePolicies", "name", "/deviceManagement/compliancePolicies/obj-id", "beta", "assignments"],
    ["compliance", "cachedCompliancePolicies", "displayName", "/deviceManagement/deviceCompliancePolicies/obj-id", "beta", "assignments"],
    ["baseline", "cachedSettingsCatalogPolicies", "name", "/deviceManagement/configurationPolicies/obj-id", "beta", "assignments"],
    ["baseline", "cachedDeviceConfigurations", "displayName", "/deviceManagement/deviceConfigurations/obj-id", "beta", "assignments"],
    ["baseline", "cachedDriverUpdateProfiles", "displayName", "/deviceManagement/windowsDriverUpdateProfiles/obj-id", "beta", "assignments"],
    ["cisBaseline", "cachedGroupPolicyConfigurations", "displayName", "/deviceManagement/groupPolicyConfigurations/obj-id", "beta", "assignments"],
    ["cisBaseline", "cachedSecurityIntents", "displayName", "/deviceManagement/intents/obj-id", "beta", "assignments"],
  ] as const)("resolves %s objects in %s", async (category, cacheKey, nameField, url, apiVersion, assignments) => {
    const task = createTask(category, "[IHD] Policy");
    const context = createContext({
      [cacheKey]: [{ id: "obj-id", [nameField]: task.itemName, description: MARKER }],
    } as Partial<ExecutionContext>);

    const resolution = await resolveDeleteTarget(task, context);

    expect(resolution).toMatchObject({
      action: "delete",
      target: { id: "obj-id", url, apiVersion, assignmentsUrl: assignments ? `${url}/assignments` : null },
    });
    if (assignments) {
      expect(context.client.get).toHaveBeenCalledWith(`${url}/assignments`);
    } else {
      expect(context.client.get).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["iOS", "/deviceAppManagement/iosManagedAppProtections/app-id"],
    ["android", "/deviceAppManagement/androidManagedAppProtections/app-id"],
  ] as const)("resolves %s App Protection policies with an assignment check", async (platform, url) => {
    const task = createTask("appProtection", "[IHD] App policy");
    const context = createContext({
      cachedAppProtectionPolicies: [{ id: "app-id", displayName: task.itemName, description: MARKER, _platform: platform }],
    });

    const resolution = await resolveDeleteTarget(task, context);

    expect(resolution).toMatchObject({ action: "delete", target: { url, assignmentsUrl: `${url}/assignments` } });
  });

  it("matches a legacy object name without the [IHD] prefix", async () => {
    const context = createContext({
      cachedIntuneGroups: [{ id: "legacy-id", displayName: "Windows Devices", description: MARKER }] as never,
    });

    const resolution = await resolveDeleteTarget(createTask("groups", "[IHD] Windows Devices"), context);

    expect(resolution).toMatchObject({ action: "delete", target: { id: "legacy-id" } });
  });

  it("does not use partial name matches", async () => {
    const context = createContext({
      cachedSettingsCatalogPolicies: [{ id: "other-id", name: "[IHD] Defender - Extended", description: MARKER }],
      cachedV2CompliancePolicies: [],
      cachedCompliancePolicies: [],
      cachedDeviceConfigurations: [],
      cachedGroupPolicyConfigurations: [],
      cachedSecurityIntents: [],
      cachedDriverUpdateProfiles: [],
    });

    const resolution = await resolveDeleteTarget(createTask("cisBaseline", "[IHD] Defender"), context);

    expect(resolution).toMatchObject({ action: "skip", skipKind: "noOp" });
    expect(context.client.delete).not.toHaveBeenCalled();
  });

  it("uses a match in a loaded cache when another cache for the category failed to load", async () => {
    const context = createContext({
      prefetchErrors: { cachedSettingsCatalogPolicies: "[403] Forbidden" },
      cachedDeviceConfigurations: [{ id: "dc-id", displayName: "[IHD] Custom", description: MARKER }],
    });

    const resolution = await resolveDeleteTarget(createTask("cisBaseline", "[IHD] Custom"), context);

    expect(resolution).toMatchObject({ action: "delete", target: { id: "dc-id" } });
  });

  it("reports not found only when every cache for the category was loaded", async () => {
    const context = createContext({ cachedV2CompliancePolicies: [], cachedCompliancePolicies: [] });

    const resolution = await resolveDeleteTarget(createTask("compliance", "[IHD] Missing"), context);

    expect(resolution).toEqual({ action: "skip", skipKind: "noOp", reason: "Not found in tenant" });
  });

  it("resolves two tasks with the same item name to different objects", async () => {
    const context = createContext({
      cachedSettingsCatalogPolicies: [
        { id: "first", name: "[IHD] Policy", description: MARKER },
        { id: "second", name: "[IHD] Policy", description: MARKER },
      ],
    } as Partial<ExecutionContext>);
    const taskA = { ...createTask("cisBaseline", "[IHD] Policy"), id: "a", templatePath: "A/Policy.json" };
    const taskB = { ...createTask("cisBaseline", "[IHD] Policy"), id: "b", templatePath: "B/Policy.json" };

    const first = await resolveDeleteTarget(taskA, context);
    const second = await resolveDeleteTarget(taskB, context);
    const firstAgain = await resolveDeleteTarget(taskA, context);

    expect(first).toMatchObject({ action: "delete", target: { id: "first" } });
    expect(second).toMatchObject({ action: "delete", target: { id: "second" } });
    // A task that is resolved again (after a pause, for example) keeps its object.
    expect(firstAgain).toMatchObject({ action: "delete", target: { id: "first" } });
  });

  it("reports the second task as not found when one object matches two tasks", async () => {
    const context = createContext({
      cachedAppProtectionPolicies: [
        { id: "only", displayName: "[IHD] Policy", description: MARKER, "@odata.type": "#microsoft.graph.androidManagedAppProtection" },
      ],
      cachedSettingsCatalogPolicies: [],
      cachedV2CompliancePolicies: [],
      cachedCompliancePolicies: [],
      cachedDeviceConfigurations: [],
      cachedGroupPolicyConfigurations: [],
      cachedSecurityIntents: [],
      cachedDriverUpdateProfiles: [],
    } as Partial<ExecutionContext>);

    const first = await resolveDeleteTarget({ ...createTask("appProtection", "[IHD] Policy"), id: "a" }, context);
    const second = await resolveDeleteTarget({ ...createTask("baseline", "[IHD] Policy"), id: "b" }, context);

    expect(first).toMatchObject({ action: "delete", target: { id: "only" } });
    expect(second).toMatchObject({ action: "skip", skipKind: "noOp" });
  });

  it("fails for a category without a delete resolver", async () => {
    const resolution = await resolveDeleteTarget(createTask("notification", "[IHD] Notice"), createContext());

    expect(resolution).toMatchObject({ action: "fail" });
  });
});

describe("executeDeleteTask", () => {
  it("removes the deleted object from its cache", async () => {
    const context = createContext({
      cachedFilters: [
        { id: "keep-id", displayName: "[IHD] Keep", description: MARKER },
        { id: "delete-id", displayName: "[IHD] Delete", description: MARKER },
      ] as never,
    });

    const result = await executeDeleteTask(createTask("filters", "[IHD] Delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(context.client.delete).toHaveBeenCalledWith("/deviceManagement/assignmentFilters/delete-id", "beta");
    expect(context.cachedFilters?.map((filter) => filter.id)).toEqual(["keep-id"]);
  });

  it("treats ResourceNotFound on delete as deleted", async () => {
    const context = createContext({
      cachedFilters: [{ id: "gone-id", displayName: "[IHD] Gone", description: MARKER }] as never,
    });
    vi.mocked(context.client.delete).mockRejectedValue(new Error("[404] ResourceNotFound"));

    const result = await executeDeleteTask(createTask("filters", "[IHD] Gone"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(context.cachedFilters).toEqual([]);
  });
});
