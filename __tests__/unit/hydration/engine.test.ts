import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext, ExecutionResult, ActivityMessage } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetIntuneGroups,
  mockGetAllFilters,
  mockGetAllAppProtectionPolicies,
  mockGetCachedTemplates,
  mockGetBatchConfig,
  mockExecuteTasksInBatches,
  mockExecuteDeletesInParallel,
  mockIsBatchableCategory,
  mockSleep,
  mockSleepWithExecutionControl,
  mockWaitWhilePaused,
  mockExecuteGroupTask,
  mockExecuteFilterTask,
  mockExecuteComplianceTask,
  mockExecuteConditionalAccessTask,
  mockExecuteAppProtectionTask,
  mockExecuteEnrollmentTask,
  mockExecuteBaselineTask,
  mockExecuteCISBaselineTask,
} = vi.hoisted(() => ({
  mockGetIntuneGroups: vi.fn(),
  mockGetAllFilters: vi.fn(),
  mockGetAllAppProtectionPolicies: vi.fn(),
  mockGetCachedTemplates: vi.fn(),
  mockGetBatchConfig: vi.fn(),
  mockExecuteTasksInBatches: vi.fn(),
  mockExecuteDeletesInParallel: vi.fn(),
  mockIsBatchableCategory: vi.fn(),
  mockSleep: vi.fn(),
  mockSleepWithExecutionControl: vi.fn(),
  mockWaitWhilePaused: vi.fn(),
  mockExecuteGroupTask: vi.fn(),
  mockExecuteFilterTask: vi.fn(),
  mockExecuteComplianceTask: vi.fn(),
  mockExecuteConditionalAccessTask: vi.fn(),
  mockExecuteAppProtectionTask: vi.fn(),
  mockExecuteEnrollmentTask: vi.fn(),
  mockExecuteBaselineTask: vi.fn(),
  mockExecuteCISBaselineTask: vi.fn(),
}));

vi.mock("@/lib/graph/groups", () => ({
  getIntuneGroups: mockGetIntuneGroups,
}));

vi.mock("@/lib/graph/filters", () => ({
  getAllFilters: mockGetAllFilters,
}));

vi.mock("@/lib/graph/appProtection", () => ({
  getAllAppProtectionPolicies: mockGetAllAppProtectionPolicies,
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/config/batchConfig", () => ({
  getBatchConfig: mockGetBatchConfig,
}));

vi.mock("@/lib/hydration/batchExecutor", () => ({
  executeTasksInBatches: mockExecuteTasksInBatches,
  executeDeletesInParallel: mockExecuteDeletesInParallel,
  isBatchableCategory: mockIsBatchableCategory,
}));

vi.mock("@/lib/hydration/utils", () => ({
  sleep: mockSleep,
  sleepWithExecutionControl: mockSleepWithExecutionControl,
  waitWhilePaused: mockWaitWhilePaused,
}));

vi.mock("@/lib/hydration/taskExecutors", () => ({
  executeGroupTask: mockExecuteGroupTask,
  executeFilterTask: mockExecuteFilterTask,
  executeComplianceTask: mockExecuteComplianceTask,
  executeConditionalAccessTask: mockExecuteConditionalAccessTask,
  executeAppProtectionTask: mockExecuteAppProtectionTask,
  executeEnrollmentTask: mockExecuteEnrollmentTask,
  executeBaselineTask: mockExecuteBaselineTask,
  executeCISBaselineTask: mockExecuteCISBaselineTask,
}));

import { executeTasks } from "@/lib/hydration/engine";

describe("executeTasks", () => {
  const createTask = (
    id: string,
    category: HydrationTask["category"],
    itemName: string,
    operation: HydrationTask["operation"] = "create"
  ): HydrationTask => ({
    id,
    category,
    operation,
    itemName,
    status: "pending",
  });

  const createClient = () => ({
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    getCollection: vi.fn(),
    patch: vi.fn(),
    batch: vi.fn(),
  });

  const createContext = (
    overrides: Partial<ExecutionContext> = {}
  ): ExecutionContext => {
    const client = createClient();

    return {
      client: client as unknown as ExecutionContext["client"],
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      ...overrides,
    };
  };

  const expectSuccess = (task: HydrationTask): ExecutionResult => ({
    task,
    success: true,
    skipped: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetBatchConfig.mockReturnValue({
      enableBatching: false,
      defaultBatchSize: 20,
      maxBatchSize: 20,
      delayBetweenBatches: 0,
    });
    mockIsBatchableCategory.mockImplementation((category: string) =>
      ["groups", "filters", "compliance", "conditionalAccess", "baseline", "cisBaseline"].includes(category)
    );

    mockSleep.mockResolvedValue(undefined);
    mockSleepWithExecutionControl.mockResolvedValue("completed");
    mockWaitWhilePaused.mockResolvedValue("resumed");

    mockGetIntuneGroups.mockResolvedValue([]);
    mockGetAllFilters.mockResolvedValue([]);
    mockGetAllAppProtectionPolicies.mockResolvedValue([]);
    mockGetCachedTemplates.mockReturnValue(undefined);

    mockExecuteTasksInBatches.mockResolvedValue([]);
    mockExecuteDeletesInParallel.mockResolvedValue([]);

    mockExecuteGroupTask.mockImplementation((task: HydrationTask) => Promise.resolve(expectSuccess(task)));
    mockExecuteFilterTask.mockImplementation((task: HydrationTask) => Promise.resolve(expectSuccess(task)));
    mockExecuteComplianceTask.mockImplementation((task: HydrationTask) => Promise.resolve(expectSuccess(task)));
    mockExecuteConditionalAccessTask.mockImplementation((task: HydrationTask) => Promise.resolve(expectSuccess(task)));
    mockExecuteAppProtectionTask.mockImplementation((task: HydrationTask) => Promise.resolve(expectSuccess(task)));
    mockExecuteEnrollmentTask.mockImplementation((task: HydrationTask) => Promise.resolve(expectSuccess(task)));
    mockExecuteBaselineTask.mockImplementation((task: HydrationTask) => Promise.resolve(expectSuccess(task)));
    mockExecuteCISBaselineTask.mockImplementation((task: HydrationTask) => Promise.resolve(expectSuccess(task)));
  });

  it("prefetches relevant caches and routes sequential fallbacks after batch create setup", async () => {
    const baselineTemplates = [{ displayName: "[IHD] Baseline Template" }];
    const batchFallbackTask = createTask("group-fallback", "groups", "[IHD] Group Fallback");
    const filterTask = createTask("filter-batch", "filters", "[IHD] Filter");
    const complianceTask = createTask("compliance-batch", "compliance", "[IHD] Compliance");
    const conditionalAccessTask = createTask("ca-batch", "conditionalAccess", "[IHD] Conditional Access");
    const baselineTask = createTask("baseline-batch", "baseline", "[IHD] Baseline");
    const enrollmentTask = createTask("enrollment-sequential", "enrollment", "[IHD] Enrollment");
    const tasks = [
      batchFallbackTask,
      filterTask,
      complianceTask,
      conditionalAccessTask,
      baselineTask,
      enrollmentTask,
    ];

    mockGetBatchConfig.mockReturnValue({
      enableBatching: true,
      defaultBatchSize: 3,
      maxBatchSize: 20,
      delayBetweenBatches: 0,
    });
    mockGetIntuneGroups.mockResolvedValue([{ id: "existing-group" }]);
    mockGetAllFilters.mockResolvedValue([{ id: "existing-filter" }]);
    mockGetAllAppProtectionPolicies.mockResolvedValue([{ id: "existing-app-protection" }]);
    mockGetCachedTemplates.mockImplementation((category?: string) =>
      category === "baseline" ? baselineTemplates : undefined
    );
    mockExecuteTasksInBatches.mockResolvedValue([
      { task: batchFallbackTask, success: false, skipped: false, error: "NEEDS_SEQUENTIAL_EXECUTION" },
      expectSuccess(filterTask),
      expectSuccess(complianceTask),
      expectSuccess(conditionalAccessTask),
      expectSuccess(baselineTask),
    ]);

    const client = createClient();
    client.getCollection.mockImplementation((endpoint: string) => {
      if (endpoint === "/identity/conditionalAccess/policies?$select=id,displayName,state") {
        return Promise.resolve([{ id: "ca-1", displayName: "[IHD] Conditional Access", state: "disabled" }]);
      }
      if (endpoint === "/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description") {
        return Promise.resolve([{ id: "compliance-1", displayName: "[IHD] Compliance" }]);
      }
      if (endpoint === "/deviceManagement/configurationPolicies?$select=id,name,description") {
        return Promise.resolve([{ id: "settings-1", name: "[IHD] Settings Catalog" }]);
      }
      if (endpoint === "/deviceManagement/compliancePolicies?$select=id,name,description") {
        return Promise.resolve([{ id: "v2-1", name: "[IHD] V2 Compliance" }]);
      }
      if (endpoint === "/deviceManagement/deviceConfigurations?$select=id,displayName,description") {
        return Promise.resolve([{ id: "device-config-1", displayName: "[IHD] Device Config" }]);
      }
      if (endpoint === "/deviceManagement/groupPolicyConfigurations?$select=id,displayName,description") {
        return Promise.resolve([{ id: "group-policy-1", displayName: "[IHD] Administrative Template" }]);
      }
      if (endpoint === "/deviceManagement/intents?$select=id,displayName,description") {
        return Promise.resolve([{ id: "intent-1", displayName: "[IHD] Endpoint Security" }]);
      }
      return Promise.resolve([]);
    });
    client.get.mockResolvedValue({
      value: [{ id: "driver-profile-1", displayName: "[IHD] WUfB Drivers" }],
    });

    const statusUpdates: ActivityMessage[] = [];
    const context = createContext({
      client: client as unknown as ExecutionContext["client"],
      onStatusUpdate: (message) => statusUpdates.push(message),
    });

    const results = await executeTasks(tasks, context);

    expect(results).toHaveLength(6);
    expect(mockGetIntuneGroups).toHaveBeenCalledWith(context.client);
    expect(mockGetAllFilters).toHaveBeenCalledWith(context.client);
    expect(mockGetAllAppProtectionPolicies).toHaveBeenCalledWith(context.client);
    expect(client.getCollection).toHaveBeenCalledWith("/identity/conditionalAccess/policies?$select=id,displayName,state");
    expect(client.getCollection).toHaveBeenCalledWith("/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description");
    expect(client.getCollection).toHaveBeenCalledWith("/deviceManagement/configurationPolicies?$select=id,name,description");
    expect(client.getCollection).toHaveBeenCalledWith("/deviceManagement/compliancePolicies?$select=id,name,description");
    expect(client.getCollection).toHaveBeenCalledWith("/deviceManagement/deviceConfigurations?$select=id,displayName,description");
    expect(client.getCollection).toHaveBeenCalledWith("/deviceManagement/groupPolicyConfigurations?$select=id,displayName,description");
    expect(client.getCollection).toHaveBeenCalledWith("/deviceManagement/intents?$select=id,displayName,description");
    expect(client.get).toHaveBeenCalledWith("/deviceManagement/windowsDriverUpdateProfiles?$select=id,displayName,description");
    expect(context.cachedBaselineTemplates).toEqual(baselineTemplates);
    expect(mockExecuteTasksInBatches).toHaveBeenCalledWith(
      [batchFallbackTask, filterTask, complianceTask, conditionalAccessTask, baselineTask],
      context
    );
    expect(mockExecuteEnrollmentTask).toHaveBeenCalledWith(enrollmentTask, context);
    expect(mockExecuteGroupTask).toHaveBeenCalledWith(batchFallbackTask, context);
    expect(mockSleepWithExecutionControl).toHaveBeenCalledTimes(1);
    expect(statusUpdates.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        "Checking tenant for existing resources (6 items selected)...",
        "Tenant check complete — starting execution...",
        "Starting batch creation (3 items per batch)...",
      ])
    );
  });

  it("stops batch create execution after the first failed batch result when configured", async () => {
    const batchTask = createTask("group-batch", "groups", "[IHD] Batch Group");
    const sequentialTask = createTask("enrollment-sequential", "enrollment", "[IHD] Enrollment");

    mockGetBatchConfig.mockReturnValue({
      enableBatching: true,
      defaultBatchSize: 2,
      maxBatchSize: 20,
      delayBetweenBatches: 0,
    });
    mockExecuteTasksInBatches.mockResolvedValue([
      { task: batchTask, success: false, skipped: false, error: "Graph failure" },
    ]);

    const results = await executeTasks(
      [batchTask, sequentialTask],
      createContext({ stopOnFirstError: true })
    );

    expect(results).toEqual([
      expect.objectContaining({
        task: batchTask,
        success: false,
        skipped: false,
        error: "Graph failure",
      }),
    ]);
    expect(mockExecuteEnrollmentTask).not.toHaveBeenCalled();
    expect(mockExecuteGroupTask).not.toHaveBeenCalled();
    expect(mockSleepWithExecutionControl).not.toHaveBeenCalled();
  });

  it("marks remaining non-batchable delete tasks as cancelled after parallel deletes pause-cancel", async () => {
    const batchTask = createTask("group-delete", "groups", "[IHD] Batch Group", "delete");
    const sequentialTask = createTask("enrollment-delete", "enrollment", "[IHD] Enrollment", "delete");

    mockGetBatchConfig.mockReturnValue({
      enableBatching: true,
      defaultBatchSize: 2,
      maxBatchSize: 20,
      delayBetweenBatches: 0,
    });
    mockExecuteDeletesInParallel.mockResolvedValue([expectSuccess(batchTask)]);
    mockWaitWhilePaused.mockResolvedValueOnce("cancelled");

    const results = await executeTasks(
      [batchTask, sequentialTask],
      createContext({ operationMode: "delete" })
    );

    expect(mockExecuteDeletesInParallel).toHaveBeenCalledWith([batchTask], expect.objectContaining({ operationMode: "delete" }));
    expect(results).toEqual([
      expect.objectContaining({ task: batchTask, success: true, skipped: false }),
      expect.objectContaining({
        task: sequentialTask,
        success: false,
        skipped: true,
        error: "Cancelled by user",
      }),
    ]);
    expect(sequentialTask.status).toBe("skipped");
    expect(mockExecuteEnrollmentTask).not.toHaveBeenCalled();
  });

  it("emits preview status and marks all remaining tasks cancelled when pause-cancelled in sequential mode", async () => {
    const firstTask = createTask("group-preview-1", "groups", "[IHD] Preview Group 1");
    const secondTask = createTask("group-preview-2", "groups", "[IHD] Preview Group 2");
    const statusUpdates: ActivityMessage[] = [];

    mockWaitWhilePaused.mockResolvedValueOnce("cancelled");

    const results = await executeTasks(
      [firstTask, secondTask],
      createContext({
        isPreview: true,
        onStatusUpdate: (message) => statusUpdates.push(message),
      })
    );

    expect(results).toEqual([
      expect.objectContaining({ task: firstTask, success: false, skipped: true, error: "Cancelled by user" }),
      expect.objectContaining({ task: secondTask, success: false, skipped: true, error: "Cancelled by user" }),
    ]);
    expect(mockExecuteGroupTask).not.toHaveBeenCalled();
    expect(statusUpdates.map(({ message }) => message)).toContain(
      "Running preview (create mode) - no changes will be made..."
    );
  });

  it("skips driver update tasks without a license and then stops on the next failure", async () => {
    const driverUpdateTask = createTask(
      "driver-update",
      "baseline",
      "[IHD] WUfB Drivers - Windows 11"
    );
    const failingGroupTask = createTask("group-failure", "groups", "[IHD] Group Failure");
    const untouchedTask = createTask("group-untouched", "groups", "[IHD] Group Untouched");

    mockExecuteGroupTask.mockResolvedValueOnce({
      task: failingGroupTask,
      success: false,
      skipped: false,
      error: "Group creation failed",
    });

    const results = await executeTasks(
      [driverUpdateTask, failingGroupTask, untouchedTask],
      createContext({
        stopOnFirstError: true,
        hasWindowsDriverUpdateLicense: false,
      })
    );

    expect(results).toEqual([
      expect.objectContaining({
        task: driverUpdateTask,
        success: true,
        skipped: true,
        error: "No Windows Driver Update license (Windows E3/E5, Microsoft 365 E3/E5, etc.)",
      }),
      expect.objectContaining({
        task: failingGroupTask,
        success: false,
        skipped: false,
        error: "Group creation failed",
      }),
    ]);
    expect(mockExecuteBaselineTask).not.toHaveBeenCalled();
    expect(mockExecuteGroupTask).toHaveBeenCalledTimes(1);
    expect(untouchedTask.status).toBe("pending");
  });
});
