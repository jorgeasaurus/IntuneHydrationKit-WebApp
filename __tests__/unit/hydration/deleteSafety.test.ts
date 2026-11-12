/**
 * Delete-path safety invariants.
 *
 * Every delete path (parallel and sequential) must:
 * (a) delete only objects that carry the hydration marker,
 * (b) delete Conditional Access policies only when the re-read state is "disabled",
 * (c) never delete an object that has assignments,
 * (d) not delete when a marker, state or assignment check cannot complete (fail closed),
 * (e) send only GET requests in preview mode.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext, ExecutionResult } from "@/lib/hydration/types";
import type { HydrationTask, TaskCategory } from "@/types/hydration";

const { mockSleepWithExecutionControl } = vi.hoisted(() => ({
  mockSleepWithExecutionControl: vi.fn(),
}));

vi.mock("@/lib/hydration/utils", async () => {
  const actual = await vi.importActual("@/lib/hydration/utils");
  return { ...actual, sleepWithExecutionControl: mockSleepWithExecutionControl };
});

import { executeDeletesInParallel } from "@/lib/hydration/batchExecutor";
import { executeGroupTask } from "@/lib/hydration/taskExecutors/groupTask";
import { executeFilterTask } from "@/lib/hydration/taskExecutors/filterTask";
import { executeComplianceTask } from "@/lib/hydration/taskExecutors/complianceTask";
import { executeBaselineTask } from "@/lib/hydration/taskExecutors/baselineTask";
import { executeCISBaselineTask } from "@/lib/hydration/taskExecutors/cisBaselineTask";
import { executeConditionalAccessTask } from "@/lib/hydration/taskExecutors/conditionalAccessTask";
import { executeAppProtectionTask } from "@/lib/hydration/taskExecutors/appProtectionTask";
import { executeEnrollmentTask } from "@/lib/hydration/taskExecutors/enrollmentTask";
import { executeWin32AppTask } from "@/lib/hydration/taskExecutors/win32AppTask";
import { hasConditionalAccessHydrationMarker, hasHydrationMarker } from "@/lib/utils/hydrationMarker";

const MARKER = "Imported by Intune Hydration Kit";

type Route = unknown | Error;

/** Fake Graph client: GET responses come from a route table; unknown routes fail. */
function createClient(routes: Record<string, Route>) {
  const respond = (url: string): Promise<unknown> => {
    if (!(url in routes)) {
      return Promise.reject(new Error(`[404] Unexpected GET ${url}`));
    }
    const value = routes[url];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  };
  return {
    get: vi.fn((url: string) => respond(url)),
    getCollection: vi.fn(async (url: string) => (await respond(url)) as unknown[]),
    delete: vi.fn().mockResolvedValue(undefined),
    post: vi.fn(),
    postNoRetry: vi.fn(),
    patch: vi.fn(),
    batch: vi.fn(),
  };
}

type FakeClient = ReturnType<typeof createClient>;

function createContext(client: FakeClient, overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    client: client as unknown as ExecutionContext["client"],
    operationMode: "delete",
    isPreview: false,
    stopOnFirstError: false,
    ...overrides,
  };
}

function createTask(category: TaskCategory, itemName: string): HydrationTask {
  return { id: `${category}-${itemName}`, category, operation: "delete", itemName, status: "pending" };
}

function expectNoMutations(client: FakeClient) {
  expect(client.delete).not.toHaveBeenCalled();
  expect(client.post).not.toHaveBeenCalled();
  expect(client.postNoRetry).not.toHaveBeenCalled();
  expect(client.patch).not.toHaveBeenCalled();
  expect(client.batch).not.toHaveBeenCalled();
}

const noAssignments = { value: [] };
const oneAssignment = { value: [{ id: "assignment-1" }] };

describe("hydration marker rules", () => {
  it("requires the description marker text and does not accept the [IHD] name prefix", () => {
    expect(hasHydrationMarker(`Policy - ${MARKER}`)).toBe(true);
    expect(hasHydrationMarker("Imported by Intune-Hydration-Kit")).toBe(true);
    expect(hasHydrationMarker("[IHD] Windows policy")).toBe(false);
    expect(hasHydrationMarker(undefined)).toBe(false);
  });

  it("accepts the [IHD] prefix or marker suffix only for Conditional Access display names", () => {
    expect(hasConditionalAccessHydrationMarker("[IHD] Require MFA")).toBe(true);
    expect(hasConditionalAccessHydrationMarker(`Require MFA [${MARKER}]`)).toBe(true);
    expect(hasConditionalAccessHydrationMarker("Require MFA [Intune Hydration Kit]")).toBe(true);
    expect(hasConditionalAccessHydrationMarker("Require MFA")).toBe(false);
  });
});

describe("App Protection assignment checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSleepWithExecutionControl.mockResolvedValue("completed");
  });

  const iosPolicy = {
    id: "ios-policy-id",
    displayName: "[IHD] iOS - Baseline - BYOD - App Protection",
    description: MARKER,
    _platform: "iOS" as const,
  };

  it("does not delete an assigned OIB App Protection policy on the parallel path", async () => {
    const client = createClient({
      "/deviceAppManagement/iosManagedAppProtections/ios-policy-id/assignments": oneAssignment,
    });
    const task = createTask("baseline", iosPolicy.displayName);
    const context = createContext(client, { cachedAppProtectionPolicies: [iosPolicy] });

    const [result] = await executeDeletesInParallel([task], context);

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toContain("1 active assignment");
    expectNoMutations(client);
  });

  it("does not delete an App Protection policy when the assignment read fails", async () => {
    const client = createClient({
      "/deviceAppManagement/iosManagedAppProtections/ios-policy-id/assignments": new Error("[503] Service unavailable"),
    });
    const task = createTask("baseline", iosPolicy.displayName);
    const context = createContext(client, { cachedAppProtectionPolicies: [iosPolicy] });

    const [result] = await executeDeletesInParallel([task], context);

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("[503] Service unavailable");
    expectNoMutations(client);
  });

  it("does not delete an App Protection policy whose platform is unknown", async () => {
    const client = createClient({});
    const task = createTask("appProtection", "[IHD] Unknown platform policy");
    const context = createContext(client, {
      cachedAppProtectionPolicies: [{ id: "x", displayName: task.itemName, description: MARKER }],
    });

    const result = await executeAppProtectionTask(task, context);

    expect(result).toMatchObject({ success: false, skipped: false });
    expectNoMutations(client);
  });
});

describe("Win32 app assignment checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  const ownedApp = {
    id: "seven-zip-id",
    displayName: "7-Zip - [IHD]",
    description: `7-Zip - ${MARKER}`,
    notes: "Imported from WinGet. WinGetPackageIdentifier: 7zip.7zip",
  };

  it("does not delete an assigned Win32 app", async () => {
    const client = createClient({
      "/deviceAppManagement/mobileApps/seven-zip-id/assignments": oneAssignment,
    });
    const context = createContext(client, { cachedWin32LobApps: [ownedApp] });

    const result = await executeWin32AppTask(createTask("win32Apps", "7-Zip - [IHD]"), context);

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toContain("1 active assignment");
    expectNoMutations(client);
  });

  it("does not delete a Win32 app when the assignment read fails", async () => {
    const client = createClient({
      "/deviceAppManagement/mobileApps/seven-zip-id/assignments": new Error("[403] Forbidden"),
    });
    const context = createContext(client, { cachedWin32LobApps: [ownedApp] });

    const result = await executeWin32AppTask(createTask("win32Apps", "7-Zip - [IHD]"), context);

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("[403] Forbidden");
    expectNoMutations(client);
  });

  it("checks assignments in preview and sends no mutations", async () => {
    const client = createClient({
      "/deviceAppManagement/mobileApps/seven-zip-id/assignments": oneAssignment,
    });
    const context = createContext(client, { cachedWin32LobApps: [ownedApp], isPreview: true });

    const result = await executeWin32AppTask(createTask("win32Apps", "7-Zip - [IHD]"), context);

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toMatch(/^Would skip: /);
    expectNoMutations(client);
  });
});

describe("OpenIntuneBaseline and CIS sequential deletes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes [IHD] OIB compliance policies found in the prefetched cache", async () => {
    const client = createClient({
      "/deviceManagement/deviceCompliancePolicies/v1-id/assignments": noAssignments,
    });
    const task = createTask("baseline", "[IHD] Win - OIB - Compliance - U - Defender for Endpoint - v3.0");
    const context = createContext(client, {
      cachedCompliancePolicies: [{ id: "v1-id", displayName: task.itemName, description: MARKER }],
    });

    const result = await executeBaselineTask(task, context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith("/deviceManagement/deviceCompliancePolicies/v1-id", "beta");
  });

  it("deletes [IHD] CIS device configurations found in the prefetched cache", async () => {
    const client = createClient({
      "/deviceManagement/deviceConfigurations/dc-id/assignments": noAssignments,
    });
    const task = createTask("cisBaseline", "[IHD] CIS: Windows 11 - Custom OMA-URI");
    const context = createContext(client, {
      cachedDeviceConfigurations: [{ id: "dc-id", displayName: task.itemName, description: MARKER }],
    });

    const result = await executeCISBaselineTask(task, context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith("/deviceManagement/deviceConfigurations/dc-id", "beta");
  });

  it("does not delete an assigned driver update profile", async () => {
    const client = createClient({
      "/deviceManagement/windowsDriverUpdateProfiles/driver-id/assignments": oneAssignment,
    });
    const task = createTask("baseline", "[IHD] Win - OIB - WUfB Drivers - D - Automatic - v3.0");
    const context = createContext(client, {
      cachedDriverUpdateProfiles: [{ id: "driver-id", displayName: task.itemName, description: MARKER }],
    });

    const result = await executeBaselineTask(task, context);

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expectNoMutations(client);
  });

  it("does not delete an assigned V2 compliance policy", async () => {
    const client = createClient({
      "/deviceManagement/compliancePolicies/v2-id/assignments": oneAssignment,
    });
    const task = createTask("cisBaseline", "[IHD] CIS: Linux compliance");
    const context = createContext(client, {
      cachedV2CompliancePolicies: [{ id: "v2-id", name: task.itemName, description: MARKER }],
    });

    const result = await executeCISBaselineTask(task, context);

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expectNoMutations(client);
  });

  it.each([
    ["Settings Catalog", "cachedSettingsCatalogPolicies", "/deviceManagement/configurationPolicies/obj-id/assignments", "name"],
    ["Administrative Template", "cachedGroupPolicyConfigurations", "/deviceManagement/groupPolicyConfigurations/obj-id/assignments", "displayName"],
    ["Security Intent", "cachedSecurityIntents", "/deviceManagement/intents/obj-id/assignments", "displayName"],
  ] as const)("does not delete a %s policy when the assignment read fails", async (_label, cacheKey, assignmentsUrl, nameField) => {
    const client = createClient({ [assignmentsUrl]: new Error("[500] Internal error") });
    const task = createTask("cisBaseline", "[IHD] CIS: Some policy");
    const context = createContext(client, {
      [cacheKey]: [{ id: "obj-id", [nameField]: task.itemName, description: MARKER }],
    } as Partial<ExecutionContext>);

    const result = await executeCISBaselineTask(task, context);

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("[500] Internal error");
    expectNoMutations(client);
  });

  it("fails without deleting when a required tenant cache was not loaded", async () => {
    const client = createClient({});
    const task = createTask("baseline", "[IHD] Not in any loaded cache");
    const context = createContext(client, {
      prefetchErrors: { cachedSettingsCatalogPolicies: "[403] Forbidden" },
    });

    const sequential = await executeBaselineTask(task, context);
    const [parallel] = await executeDeletesInParallel([createTask("baseline", task.itemName)], context);

    for (const result of [sequential, parallel]) {
      expect(result).toMatchObject({ success: false, skipped: false });
      expect(result.error).toContain("[403] Forbidden");
    }
    expectNoMutations(client);
  });
});

describe("Device Preparation marker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not delete a Settings Catalog policy named [IHD] whose description has no marker", async () => {
    const name = "[IHD] Windows Autopilot device preparation - User Driven";
    const client = createClient({
      "/deviceManagement/windowsAutopilotDeploymentProfiles": [],
      "/deviceManagement/deviceEnrollmentConfigurations": [],
      "/deviceManagement/configurationPolicies?$select=id,name,description,technologies": [
        { id: "dp-id", name, description: "Created by an administrator", technologies: "enrollment" },
      ],
      "/deviceManagement/configurationPolicies/dp-id/assignments": noAssignments,
    });

    const result = await executeEnrollmentTask(createTask("enrollment", name), createContext(client));

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expectNoMutations(client);
  });
});

describe("Errors are failures, safety blocks are skips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a group delete 403 as failed", async () => {
    const client = createClient({});
    client.delete.mockRejectedValue(new Error("[403] Insufficient privileges"));
    const task = createTask("groups", "[IHD] Windows Devices");
    const context = createContext(client, {
      cachedIntuneGroups: [
        { id: "group-id", displayName: task.itemName, description: MARKER } as never,
      ],
    });

    const result = await executeGroupTask(task, context);

    expect(result).toMatchObject({ success: false, skipped: false, error: "[403] Insufficient privileges" });
  });

  it("reports a compliance delete 5xx as failed", async () => {
    const client = createClient({
      "/deviceManagement/deviceCompliancePolicies/c-id/assignments": noAssignments,
    });
    client.delete.mockRejectedValue(new Error("[500] Internal error"));
    const task = createTask("compliance", "[IHD] Windows Compliance");
    const context = createContext(client, {
      cachedV2CompliancePolicies: [],
      cachedCompliancePolicies: [{ id: "c-id", displayName: task.itemName, description: MARKER }],
    });

    const result = await executeComplianceTask(task, context);

    expect(result).toMatchObject({ success: false, skipped: false, error: "[500] Internal error" });
  });

  it("reports an enrollment profile delete 403 as failed", async () => {
    const name = "[IHD] Windows Autopilot Profile";
    const client = createClient({
      "/deviceManagement/windowsAutopilotDeploymentProfiles": [{ id: "ap-id", displayName: name, description: MARKER }],
      "/deviceManagement/windowsAutopilotDeploymentProfiles/ap-id/assignments": noAssignments,
    });
    client.delete.mockRejectedValue(new Error("[403] Forbidden"));

    const result = await executeEnrollmentTask(createTask("enrollment", name), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: false, error: "[403] Forbidden" });
  });

  it("reports a group without the marker as a blocked skip", async () => {
    const client = createClient({});
    const task = createTask("groups", "[IHD] Manual Group");
    const context = createContext(client, {
      cachedIntuneGroups: [{ id: "group-id", displayName: task.itemName, description: "Manual" } as never],
    });

    const result = await executeGroupTask(task, context);

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expectNoMutations(client);
  });
});

describe("Conditional Access deletes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const name = "[IHD] Require multifactor authentication for all users";
  const cached = () => [{ id: "ca-id", displayName: name, state: "disabled" }];

  it("deletes a disabled kit policy after it re-reads the state", async () => {
    const client = createClient({
      "/identity/conditionalAccess/policies/ca-id": { id: "ca-id", displayName: name, state: "disabled" },
    });

    const result = await executeConditionalAccessTask(
      createTask("conditionalAccess", name),
      createContext(client, { cachedConditionalAccessPolicies: cached() })
    );

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.get).toHaveBeenCalledWith("/identity/conditionalAccess/policies/ca-id");
    expect(client.delete).toHaveBeenCalledWith("/identity/conditionalAccess/policies/ca-id", "beta");
  });

  it("does not delete a policy that was enabled after the prefetch", async () => {
    const client = createClient({
      "/identity/conditionalAccess/policies/ca-id": { id: "ca-id", displayName: name, state: "enabled" },
    });

    const result = await executeConditionalAccessTask(
      createTask("conditionalAccess", name),
      createContext(client, { cachedConditionalAccessPolicies: cached() })
    );

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toContain("enabled");
    expectNoMutations(client);
  });

  it("does not delete when the state re-read fails", async () => {
    const client = createClient({
      "/identity/conditionalAccess/policies/ca-id": new Error("[429] TooManyRequests"),
    });

    const result = await executeConditionalAccessTask(
      createTask("conditionalAccess", name),
      createContext(client, { cachedConditionalAccessPolicies: cached() })
    );

    expect(result).toMatchObject({ success: false, skipped: false });
    expectNoMutations(client);
  });

  it("does not match a policy without the kit marker", async () => {
    const client = createClient({});

    const result = await executeConditionalAccessTask(
      createTask("conditionalAccess", name),
      createContext(client, {
        cachedConditionalAccessPolicies: [
          { id: "manual-id", displayName: "Require multifactor authentication for all users", state: "disabled" },
        ],
      })
    );

    expect(result).toMatchObject({ skipped: true, skipKind: "noOp" });
    expectNoMutations(client);
  });

  it("reports in preview that an enabled policy would be skipped", async () => {
    const client = createClient({
      "/identity/conditionalAccess/policies/ca-id": { id: "ca-id", displayName: name, state: "enabledForReportingButNotEnforced" },
    });

    const result = await executeConditionalAccessTask(
      createTask("conditionalAccess", name),
      createContext(client, { cachedConditionalAccessPolicies: cached(), isPreview: true })
    );

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toMatch(/^Would skip: /);
    expectNoMutations(client);
  });
});

describe("Preview deletes run the live checks with GET requests only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSleepWithExecutionControl.mockResolvedValue("completed");
  });

  it("reports would-skip for an assigned policy on the parallel path", async () => {
    const client = createClient({
      "/deviceManagement/configurationPolicies/sc-id/assignments": oneAssignment,
    });
    const task = createTask("baseline", "[IHD] Assigned policy");
    const context = createContext(client, {
      isPreview: true,
      cachedSettingsCatalogPolicies: [{ id: "sc-id", name: task.itemName, description: MARKER }],
    });

    const [result] = await executeDeletesInParallel([task], context);

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toMatch(/^Would skip: .*1 active assignment/);
    expectNoMutations(client);
  });

  it.each([
    ["groups", executeGroupTask, { cachedIntuneGroups: [{ id: "g", displayName: "[IHD] Group", description: "Manual" }] }],
    ["appProtection", executeAppProtectionTask, {
      cachedAppProtectionPolicies: [{ id: "a", displayName: "[IHD] Group", description: "Manual", _platform: "iOS" }],
    }],
  ] as const)("reports would-skip for a %s object without the marker", async (category, executor, caches) => {
    const client = createClient({});
    const task = createTask(category, "[IHD] Group");

    const result = await executor(task, createContext(client, { isPreview: true, ...(caches as unknown as Partial<ExecutionContext>) }));

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toMatch(/^Would skip: /);
    expectNoMutations(client);
  });

  it("reports would-skip for a marker-less enrollment profile", async () => {
    const name = "[IHD] Windows ESP";
    const client = createClient({
      "/deviceManagement/windowsAutopilotDeploymentProfiles": [],
      "/deviceManagement/deviceEnrollmentConfigurations": [
        { id: "esp-id", displayName: name, description: "Manual", "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration" },
      ],
    });

    const result = await executeEnrollmentTask(createTask("enrollment", name), createContext(client, { isPreview: true }));

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toMatch(/^Would skip: /);
    expectNoMutations(client);
  });

  it("reports would-delete for a safe policy without a DELETE request", async () => {
    const client = createClient({
      "/deviceManagement/configurationPolicies/sc-id/assignments": noAssignments,
    });
    const task = createTask("baseline", "[IHD] Safe policy");
    const context = createContext(client, {
      isPreview: true,
      cachedSettingsCatalogPolicies: [{ id: "sc-id", name: task.itemName, description: MARKER }],
    });

    const [result] = await executeDeletesInParallel([task], context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.get).toHaveBeenCalledWith("/deviceManagement/configurationPolicies/sc-id/assignments");
    expectNoMutations(client);
  });
});

describe("Parallel and sequential delete paths give the same outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSleepWithExecutionControl.mockResolvedValue("completed");
  });

  const sequentialExecutors: Partial<Record<TaskCategory, (task: HydrationTask, context: ExecutionContext) => Promise<ExecutionResult>>> = {
    groups: executeGroupTask,
    filters: executeFilterTask,
    compliance: executeComplianceTask,
    baseline: executeBaselineTask,
    cisBaseline: executeCISBaselineTask,
  };

  function buildTenant(isPreview: boolean) {
    const client = createClient({
      "/deviceManagement/configurationPolicies/sc-safe/assignments": noAssignments,
      "/deviceManagement/configurationPolicies/sc-assigned/assignments": oneAssignment,
      "/deviceManagement/configurationPolicies/sc-cis/assignments": noAssignments,
      "/deviceManagement/configurationPolicies/sc-error/assignments": new Error("[503] Service unavailable"),
      "/deviceManagement/deviceCompliancePolicies/oib-compliance/assignments": noAssignments,
      "/deviceManagement/windowsDriverUpdateProfiles/driver-assigned/assignments": oneAssignment,
      "/deviceManagement/compliancePolicies/v2-safe/assignments": noAssignments,
      "/deviceAppManagement/androidManagedAppProtections/app-assigned/assignments": oneAssignment,
    });
    const context = createContext(client, {
      isPreview,
      cachedIntuneGroups: [
        { id: "group-safe", displayName: "[IHD] Safe Group", description: MARKER },
        { id: "group-manual", displayName: "[IHD] Manual Group", description: "Manual" },
      ] as never,
      cachedFilters: [
        { id: "filter-safe", displayName: "[IHD] Safe Filter", description: MARKER },
        { id: "filter-manual", displayName: "[IHD] Manual Filter", description: "Manual" },
      ] as never,
      cachedSettingsCatalogPolicies: [
        { id: "sc-safe", name: "[IHD] Safe Settings", description: MARKER },
        { id: "sc-assigned", name: "[IHD] Assigned Settings", description: MARKER },
        { id: "sc-error", name: "[IHD] Error Settings", description: MARKER },
        { id: "sc-manual", name: "[IHD] Manual Settings", description: "Manual" },
        { id: "sc-cis", name: "[IHD] CIS Settings", description: MARKER },
      ],
      cachedCompliancePolicies: [{ id: "oib-compliance", displayName: "[IHD] OIB Compliance", description: MARKER }],
      cachedV2CompliancePolicies: [{ id: "v2-safe", name: "[IHD] Linux Compliance", description: MARKER }],
      cachedDriverUpdateProfiles: [{ id: "driver-assigned", displayName: "[IHD] Drivers", description: MARKER }],
      cachedDeviceConfigurations: [],
      cachedGroupPolicyConfigurations: [],
      cachedSecurityIntents: [],
      cachedAppProtectionPolicies: [
        { id: "app-assigned", displayName: "[IHD] Android BYOD", description: MARKER, _platform: "android" },
      ],
    });
    const tasks = [
      createTask("groups", "[IHD] Safe Group"),
      createTask("groups", "[IHD] Manual Group"),
      createTask("groups", "[IHD] Missing Group"),
      createTask("filters", "[IHD] Safe Filter"),
      createTask("filters", "[IHD] Manual Filter"),
      createTask("baseline", "[IHD] Safe Settings"),
      createTask("baseline", "[IHD] Assigned Settings"),
      createTask("baseline", "[IHD] Error Settings"),
      createTask("baseline", "[IHD] Manual Settings"),
      createTask("baseline", "[IHD] OIB Compliance"),
      createTask("baseline", "[IHD] Drivers"),
      createTask("baseline", "[IHD] Android BYOD"),
      createTask("cisBaseline", "[IHD] CIS Settings"),
      createTask("compliance", "[IHD] Linux Compliance"),
    ];
    return { client, context, tasks };
  }

  const outcome = (result: ExecutionResult) => ({
    task: result.task.itemName,
    category: result.task.category,
    deleted: !result.skipped && result.success,
    skipKind: result.skipped ? result.skipKind : undefined,
    failed: !result.skipped && !result.success,
    error: result.error,
  });

  it.each([false, true])("matches for preview=%s", async (isPreview) => {
    const parallel = buildTenant(isPreview);
    const parallelResults = await executeDeletesInParallel(parallel.tasks, parallel.context);

    const sequential = buildTenant(isPreview);
    const sequentialResults: ExecutionResult[] = [];
    for (const task of sequential.tasks) {
      sequentialResults.push(await sequentialExecutors[task.category]!(task, sequential.context));
    }

    const byTask = (results: ExecutionResult[]) =>
      results.map(outcome).sort((a, b) => `${a.category}${a.task}`.localeCompare(`${b.category}${b.task}`));
    expect(byTask(sequentialResults)).toEqual(byTask(parallelResults));

    const deletedTasks = byTask(parallelResults).filter((result) => result.deleted).map((result) => result.task);
    expect(deletedTasks.sort()).toEqual(
      ["[IHD] CIS Settings", "[IHD] Linux Compliance", "[IHD] OIB Compliance", "[IHD] Safe Filter", "[IHD] Safe Group", "[IHD] Safe Settings"].sort()
    );
    expect(byTask(parallelResults).find((result) => result.task === "[IHD] Error Settings")).toMatchObject({ failed: true });

    if (isPreview) {
      expectNoMutations(parallel.client);
      expectNoMutations(sequential.client);
    } else {
      expect(parallel.client.delete.mock.calls.map(([url]) => url).sort()).toEqual(
        sequential.client.delete.mock.calls.map(([url]) => url).sort()
      );
    }
  });
});
