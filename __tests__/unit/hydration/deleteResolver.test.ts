import { afterEach, describe, expect, it, vi } from "vitest";

import { executeDeleteTask, resolveDeleteTarget } from "@/lib/hydration/deleteResolver";
import { cacheTemplates, clearCategoryCache, type BaselinePolicy } from "@/lib/templates/loader";
import { RunCancelledError } from "@/lib/utils/retry";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask, TaskCategory } from "@/types/hydration";
import { serveCachedObjects } from "../../helpers/tenantObjectReads";

const MARKER = "Imported by Intune Hydration Kit";

function createTask(category: TaskCategory, itemName: string): HydrationTask {
  return { id: `${category}-${itemName}`, category, operation: "delete", itemName, status: "pending" };
}

function createContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return serveCachedObjects({
    client: {
      get: vi.fn().mockResolvedValue({ value: [] }),
      getCollection: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExecutionContext["client"],
    operationMode: "delete",
    isPreview: false,
    stopOnFirstError: false,
    ...overrides,
  });
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
      // Only the read of the object itself (the marker is checked on the current object).
      expect(context.client.get).toHaveBeenCalledTimes(1);
    }
    expect(context.client.get).toHaveBeenCalledWith(url, apiVersion);
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

  it("does not delete when the marker was removed after the prefetch", async () => {
    const context = createContext({
      cachedFilters: [{ id: "f-id", displayName: "[IHD] Filter", description: MARKER }],
    } as Partial<ExecutionContext>);
    context.client.get = vi.fn().mockResolvedValue({ id: "f-id", displayName: "[IHD] Filter", description: "Edited by an admin" });

    const resolution = await resolveDeleteTarget(createTask("filters", "[IHD] Filter"), context);

    expect(resolution).toMatchObject({ action: "skip", skipKind: "blocked", checks: { marker: "missing" } });
  });

  it("reports not found when the object was deleted after the prefetch", async () => {
    const context = createContext({
      cachedFilters: [{ id: "f-id", displayName: "[IHD] Filter", description: MARKER }],
    } as Partial<ExecutionContext>);
    context.client.get = vi.fn().mockRejectedValue(Object.assign(new Error("[404] Not found"), { status: 404 }));

    const resolution = await resolveDeleteTarget(createTask("filters", "[IHD] Filter"), context);

    expect(resolution).toMatchObject({ action: "skip", skipKind: "noOp" });
  });

  it("fails closed when the current object cannot be read", async () => {
    const context = createContext({
      cachedFilters: [{ id: "f-id", displayName: "[IHD] Filter", description: MARKER }],
    } as Partial<ExecutionContext>);
    context.client.get = vi.fn().mockRejectedValue(Object.assign(new Error("[403] Forbidden"), { status: 403 }));

    const resolution = await resolveDeleteTarget(createTask("filters", "[IHD] Filter"), context);

    expect(resolution).toMatchObject({ action: "fail" });
    expect(context.client.delete).not.toHaveBeenCalled();
  });

  it("resolves an App Protection policy when another cached policy has no platform", async () => {
    const context = createContext({
      cachedAppProtectionPolicies: [
        { id: "unknown", displayName: "Someone else's policy", description: "Manual" },
        { id: "app-id", displayName: "[IHD] App policy", description: MARKER, _platform: "iOS" },
      ],
    } as Partial<ExecutionContext>);

    const resolution = await resolveDeleteTarget(createTask("appProtection", "[IHD] App policy"), context);

    expect(resolution).toMatchObject({ action: "delete", target: { id: "app-id" } });
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
    const resolution = await resolveDeleteTarget(createTask("win32Apps", "[IHD] App"), createContext());

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

describe("delete retry policy", () => {
  it("sends one DELETE per task; the Graph client owns the retries", async () => {
    const context = createContext({
      cachedFilters: [{ id: "busy-id", displayName: "[IHD] Busy", description: MARKER }] as never,
    });
    vi.mocked(context.client.delete).mockRejectedValue(Object.assign(new Error("[429] TooManyRequests"), { status: 429 }));

    const result = await executeDeleteTask(createTask("filters", "[IHD] Busy"), context);

    expect(result).toMatchObject({ success: false, skipped: false, error: "[429] TooManyRequests" });
    expect(context.client.delete).toHaveBeenCalledTimes(1);
  });

  it("reports a cancelled run as cancelled", async () => {
    const context = createContext({
      cachedFilters: [{ id: "slow-id", displayName: "[IHD] Slow", description: MARKER }] as never,
    });
    vi.mocked(context.client.delete).mockRejectedValue(new RunCancelledError());

    const result = await executeDeleteTask(createTask("filters", "[IHD] Slow"), context);

    expect(result).toMatchObject({ success: false, skipped: true, skipKind: "cancelled" });
  });
});

describe("policy type narrows the caches for baseline deletes", () => {
  const driverCacheFailed = {
    prefetchErrors: { cachedDriverUpdateProfiles: "[403] No Windows Driver Update license" },
  } satisfies Partial<ExecutionContext>;

  afterEach(() => {
    clearCategoryCache("cisBaseline-test");
  });

  it("does not fail an OIB Settings Catalog task because the driver update cache failed", async () => {
    const task = createTask("baseline", "[IHD] Win - OIB - Defender");
    const context = createContext({
      ...driverCacheFailed,
      cachedBaselineTemplates: [
        { name: task.itemName, _oibPolicyType: "SettingsCatalog" } as unknown as BaselinePolicy,
      ],
      cachedSettingsCatalogPolicies: [],
    });

    const resolution = await resolveDeleteTarget(task, context);

    expect(resolution).toEqual({ action: "skip", skipKind: "noOp", reason: "Not found in tenant" });
  });

  it("still fails an OIB driver update task when its cache failed", async () => {
    const task = createTask("baseline", "[IHD] Win - OIB - WUfB Drivers");
    const context = createContext({
      ...driverCacheFailed,
      cachedBaselineTemplates: [
        { displayName: task.itemName, _oibPolicyType: "DriverUpdateProfiles" } as unknown as BaselinePolicy,
      ],
      cachedSettingsCatalogPolicies: [],
    });

    const resolution = await resolveDeleteTarget(task, context);

    expect(resolution).toMatchObject({ action: "fail", reason: expect.stringContaining("Driver Update profiles") });
  });

  it("searches every cache (fail closed) when the policy type is not known", async () => {
    const task = createTask("baseline", "[IHD] Unknown type");
    const context = createContext({
      ...driverCacheFailed,
      cachedBaselineTemplates: [{ name: task.itemName, _oibPolicyType: "" } as unknown as BaselinePolicy],
      cachedSettingsCatalogPolicies: [],
      cachedV2CompliancePolicies: [],
      cachedCompliancePolicies: [],
      cachedDeviceConfigurations: [],
      cachedGroupPolicyConfigurations: [],
      cachedSecurityIntents: [],
      cachedAppProtectionPolicies: [],
    });

    const resolution = await resolveDeleteTarget(task, context);

    expect(resolution).toMatchObject({ action: "fail" });
  });

  it("uses the detected CIS policy type", async () => {
    const task = createTask("cisBaseline", "[IHD] CIS - Device Health");
    cacheTemplates("cisBaseline-test", [
      { name: task.itemName, "@odata.type": "#microsoft.graph.deviceManagementCompliancePolicy" },
    ]);
    const context = createContext({
      prefetchErrors: { cachedDeviceConfigurations: "[500] Internal", cachedDriverUpdateProfiles: "[403] Forbidden" },
      cachedV2CompliancePolicies: [{ id: "v2-id", name: "[IHD] Other", description: MARKER }],
      cachedSettingsCatalogPolicies: [{ id: "sc-id", name: task.itemName, description: MARKER }],
    });

    const resolution = await resolveDeleteTarget(task, context);

    expect(resolution).toMatchObject({ action: "delete", target: { id: "sc-id" } });
  });

  it("reports a CIS task as not found when only unrelated caches failed", async () => {
    const task = createTask("cisBaseline", "[IHD] CIS - Missing");
    cacheTemplates("cisBaseline-test", [{ name: task.itemName, settings: [] }]);
    const context = createContext({ ...driverCacheFailed, cachedSettingsCatalogPolicies: [] });

    const resolution = await resolveDeleteTarget(task, context);

    expect(resolution).toEqual({ action: "skip", skipKind: "noOp", reason: "Not found in tenant" });
  });
});
