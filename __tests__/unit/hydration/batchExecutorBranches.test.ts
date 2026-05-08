import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchConfiguration } from "@/lib/config/batchConfig";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { BaselinePolicy, GroupTemplate } from "@/lib/templates/loader";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockGetAllTemplateCacheKeys,
  mockGetDynamicGroupByName,
  mockGetDeviceFilterByName,
  mockGetBatchConfig,
  mockSleep,
  mockSleepWithExecutionControl,
  mockWaitWhilePaused,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetAllTemplateCacheKeys: vi.fn(),
  mockGetDynamicGroupByName: vi.fn(),
  mockGetDeviceFilterByName: vi.fn(),
  mockGetBatchConfig: vi.fn(),
  mockSleep: vi.fn(),
  mockSleepWithExecutionControl: vi.fn(),
  mockWaitWhilePaused: vi.fn(),
}));

vi.mock("@/lib/templates/loader", async () => {
  const actual = await vi.importActual("@/lib/templates/loader");
  return {
    ...actual,
    getCachedTemplates: mockGetCachedTemplates,
    getAllTemplateCacheKeys: mockGetAllTemplateCacheKeys,
  };
});

vi.mock("@/templates", async () => {
  const actual = await vi.importActual("@/templates");
  return {
    ...actual,
    getDynamicGroupByName: mockGetDynamicGroupByName,
    getDeviceFilterByName: mockGetDeviceFilterByName,
  };
});

vi.mock("@/lib/config/batchConfig", async () => {
  const actual = await vi.importActual("@/lib/config/batchConfig");
  return {
    ...actual,
    getBatchConfig: mockGetBatchConfig,
  };
});

vi.mock("@/lib/hydration/utils", async () => {
  const actual = await vi.importActual("@/lib/hydration/utils");
  return {
    ...actual,
    sleep: mockSleep,
    sleepWithExecutionControl: mockSleepWithExecutionControl,
    waitWhilePaused: mockWaitWhilePaused,
  };
});

import {
  executeDeleteTasksInBatches,
  executeDeletesInParallel,
  executeTasksInBatches,
} from "@/lib/hydration/batchExecutor";

const defaultBatchConfig: BatchConfiguration = {
  defaultBatchSize: 20,
  maxBatchSize: 20,
  delayBetweenBatches: 1000,
  enableBatching: true,
  categoryBatchSizes: {
    cisBaseline: 15,
    baseline: 15,
  },
};

function createGroupTemplate(displayName: string): GroupTemplate {
  return {
    displayName,
    description: `${displayName} description`,
    membershipRule: '(device.deviceOSType -eq "Windows")',
  };
}

function createTask(
  id: string,
  category: HydrationTask["category"],
  operation: HydrationTask["operation"],
  itemName: string
): HydrationTask {
  return {
    id,
    category,
    operation,
    itemName,
    status: "pending",
  };
}

describe("batchExecutor branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedTemplates.mockReset();
    mockGetAllTemplateCacheKeys.mockReset();
    mockGetDynamicGroupByName.mockReset();
    mockGetDeviceFilterByName.mockReset();
    mockGetBatchConfig.mockReturnValue(defaultBatchConfig);
    mockSleep.mockResolvedValue(undefined);
    mockSleepWithExecutionControl.mockResolvedValue("completed");
    mockWaitWhilePaused.mockResolvedValue("resumed");
    mockGetCachedTemplates.mockImplementation((category?: string) => {
      if (category === "groups") {
        return [
          createGroupTemplate("[IHD] Retry Group"),
          createGroupTemplate("[IHD] Missing Response Group"),
          createGroupTemplate("[IHD] Cancelled Retry Group"),
          createGroupTemplate("[IHD] Pending Cancelled Group"),
        ];
      }

      return undefined;
    });
    mockGetDeviceFilterByName.mockReturnValue(undefined);
  });

  it("retries throttled create responses and updates the group cache after success", async () => {
    const task = createTask("retry-group", "groups", "create", "[IHD] Retry Group");
    const onTaskComplete = vi.fn();
    const shouldCancel = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi
          .fn()
          .mockResolvedValueOnce({
            responses: [
              {
                id: "req-0",
                status: 429,
                headers: { "Retry-After": "1" },
                body: { error: { message: "TooManyRequests" } },
              },
            ],
          })
          .mockResolvedValueOnce({
            responses: [
              {
                id: "req-0",
                status: 201,
                headers: {},
                body: {
                  id: "group-1",
                  "@odata.type": "#microsoft.graph.group",
                  displayName: "[IHD] Retry Group",
                  description: "Imported by Intune Hydration Kit",
                  groupTypes: [],
                  mailEnabled: false,
                  mailNickname: "ihdretrygroup",
                  securityEnabled: true,
                },
              },
            ],
          }),
      } as unknown as ExecutionContext["client"],
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [],
      onTaskComplete,
      shouldCancel,
    };

    const results = await executeTasksInBatches([task], context);

    expect(results).toEqual([
      expect.objectContaining({
        success: true,
        skipped: false,
        createdId: "group-1",
      }),
    ]);
    expect(context.cachedIntuneGroups).toEqual([
      expect.objectContaining({
        id: "group-1",
        displayName: "[IHD] Retry Group",
      }),
    ]);
    expect(mockSleepWithExecutionControl).toHaveBeenCalledWith(2000, context);
    expect(onTaskComplete).toHaveBeenCalledWith(task);
  });

  it("fails create tasks when the batch response omits a prepared request", async () => {
    const task = createTask("missing-response", "groups", "create", "[IHD] Missing Response Group");
    const onTaskError = vi.fn();

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi.fn().mockResolvedValue({ responses: [] }),
      } as unknown as ExecutionContext["client"],
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [],
      onTaskError,
    };

    const results = await executeTasksInBatches([task], context);

    expect(results).toEqual([
      expect.objectContaining({
        success: false,
        skipped: false,
        error: "No response received",
      }),
    ]);
    expect(task.status).toBe("failed");
    expect(onTaskError).toHaveBeenCalledWith(task, expect.any(Error));
  });

  it("marks retried and remaining create tasks as cancelled when backoff is cancelled", async () => {
    mockGetBatchConfig.mockReturnValue({
      ...defaultBatchConfig,
      defaultBatchSize: 2,
    });
    mockSleepWithExecutionControl.mockResolvedValueOnce("cancelled");

    const retryTask = createTask(
      "cancelled-retry",
      "groups",
      "create",
      "[IHD] Cancelled Retry Group"
    );
    const pendingTask = createTask(
      "pending-cancelled",
      "groups",
      "create",
      "[IHD] Pending Cancelled Group"
    );
    const onTaskComplete = vi.fn();

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi.fn().mockResolvedValue({
          responses: [
            {
              id: "req-0",
              status: 503,
              headers: {},
              body: { error: { message: "Service unavailable" } },
            },
            {
              id: "req-1",
              status: 503,
              headers: {},
              body: { error: { message: "Service unavailable" } },
            },
          ],
        }),
      } as unknown as ExecutionContext["client"],
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [],
      onTaskComplete,
    };

    const results = await executeTasksInBatches([retryTask, pendingTask], context);

    expect(results).toEqual([
      expect.objectContaining({
        task: retryTask,
        success: false,
        skipped: true,
        error: "Cancelled",
      }),
      expect.objectContaining({
        task: pendingTask,
        success: false,
        skipped: true,
        error: "Cancelled",
      }),
    ]);
    expect(retryTask.status).toBe("skipped");
    expect(pendingTask.status).toBe("skipped");
    expect(onTaskComplete).toHaveBeenCalledTimes(2);
  });

  it("trusts 504 compliance deletes and keeps unmatched delete responses as failures", async () => {
    const deletedTask = createTask("delete-504", "compliance", "delete", "[IHD] Compliance One");
    const failedTask = createTask("delete-missing", "compliance", "delete", "[IHD] Compliance Two");
    const onTaskComplete = vi.fn();
    const onTaskError = vi.fn();

    const context: ExecutionContext = {
      client: {
        get: vi.fn().mockResolvedValue({ value: [] }),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi.fn().mockResolvedValue({
          responses: [
            {
              id: "del-0",
              status: 504,
              headers: {},
              body: { error: { message: "Gateway Timeout" } },
            },
          ],
        }),
      } as unknown as ExecutionContext["client"],
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedCompliancePolicies: [
        {
          id: "compliance-1",
          displayName: "[IHD] Compliance One",
          description: "Imported by Intune Hydration Kit",
        },
        {
          id: "compliance-2",
          displayName: "[IHD] Compliance Two",
          description: "Imported by Intune Hydration Kit",
        },
      ],
      onTaskComplete,
      onTaskError,
    };

    const results = await executeDeleteTasksInBatches([deletedTask, failedTask], context);

    expect(results).toEqual([
      expect.objectContaining({
        task: deletedTask,
        success: true,
        skipped: false,
      }),
      expect.objectContaining({
        task: failedTask,
        success: false,
        skipped: false,
        error: "No response received",
      }),
    ]);
    expect(context.cachedCompliancePolicies).toEqual([
      expect.objectContaining({
        id: "compliance-2",
        displayName: "[IHD] Compliance Two",
      }),
    ]);
    expect(onTaskComplete).toHaveBeenCalledWith(deletedTask);
    expect(onTaskError).toHaveBeenCalledWith(failedTask, expect.any(Error));
  });

  it("marks delete tasks as cancelled when retry delay is cancelled after a batch failure", async () => {
    mockGetBatchConfig.mockReturnValue({
      ...defaultBatchConfig,
      defaultBatchSize: 2,
    });
    mockSleepWithExecutionControl.mockResolvedValueOnce("cancelled");

    const firstTask = createTask("delete-cancel-1", "groups", "delete", "[IHD] Group Delete One");
    const secondTask = createTask("delete-cancel-2", "groups", "delete", "[IHD] Group Delete Two");

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi.fn().mockRejectedValue(new Error("Network failure")),
      } as unknown as ExecutionContext["client"],
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [
        {
          id: "group-delete-1",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Group Delete One",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "groupdeleteone",
          securityEnabled: true,
        },
        {
          id: "group-delete-2",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Group Delete Two",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "groupdeletetwo",
          securityEnabled: true,
        },
      ],
    };

    const results = await executeDeleteTasksInBatches([firstTask, secondTask], context);

    expect(results).toEqual([
      expect.objectContaining({
        task: firstTask,
        success: false,
        skipped: true,
        error: "Cancelled",
      }),
      expect.objectContaining({
        task: secondTask,
        success: false,
        skipped: true,
        error: "Cancelled",
      }),
    ]);
    expect(firstTask.status).toBe("skipped");
    expect(secondTask.status).toBe("skipped");
  });

  it("skips conditional access without a license and routes unsupported baseline creates to sequential execution", async () => {
    const conditionalAccessTask = createTask(
      "ca-no-license",
      "conditionalAccess",
      "create",
      "[IHD] Require MFA"
    );
    const baselineTask = createTask(
      "baseline-app-protection",
      "baseline",
      "create",
      "[IHD] Android Baseline App Protection"
    );

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi.fn(),
      } as unknown as ExecutionContext["client"],
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      hasConditionalAccessLicense: false,
      cachedBaselineTemplates: [
        {
          name: "[IHD] Android Baseline App Protection",
          description: "App protection baseline",
          _oibPolicyType: "AppProtection",
        } as BaselinePolicy,
      ],
    };

    const results = await executeTasksInBatches(
      [conditionalAccessTask, baselineTask],
      context
    );

    expect(results).toEqual([
      expect.objectContaining({
        task: conditionalAccessTask,
        success: false,
        skipped: true,
        error: "No Entra ID Premium (P1) license",
      }),
      expect.objectContaining({
        task: baselineTask,
        success: false,
        skipped: false,
        error: "NEEDS_SEQUENTIAL_EXECUTION",
      }),
    ]);
    expect(context.client.batch).not.toHaveBeenCalled();
  });

  it("marks remaining delete tasks cancelled during inter-batch delay after a successful batch", async () => {
    mockGetBatchConfig.mockReturnValue({
      ...defaultBatchConfig,
      defaultBatchSize: 1,
    });
    mockSleepWithExecutionControl.mockResolvedValueOnce("cancelled");

    const firstTask = createTask("delete-success-1", "groups", "delete", "[IHD] Delay Group One");
    const secondTask = createTask("delete-success-2", "groups", "delete", "[IHD] Delay Group Two");

    const batch = vi.fn().mockResolvedValue({
      responses: [{ id: "del-0", status: 204, headers: {} }],
    });

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch,
      } as unknown as ExecutionContext["client"],
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [
        {
          id: "delay-group-1",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Delay Group One",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "delaygroupone",
          securityEnabled: true,
        },
        {
          id: "delay-group-2",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Delay Group Two",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "delaygrouptwo",
          securityEnabled: true,
        },
      ],
    };

    const results = await executeDeleteTasksInBatches([firstTask, secondTask], context);

    expect(results).toEqual([
      expect.objectContaining({
        task: firstTask,
        success: true,
        skipped: false,
      }),
      expect.objectContaining({
        task: secondTask,
        success: false,
        skipped: true,
        error: "Cancelled",
      }),
    ]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(context.cachedIntuneGroups).toEqual([
      expect.objectContaining({
        id: "delay-group-2",
        displayName: "[IHD] Delay Group Two",
      }),
    ]);
  });

  it("marks delete tasks cancelled before execution when pause handling returns cancelled", async () => {
    mockWaitWhilePaused.mockResolvedValueOnce("cancelled");

    const task = createTask("delete-paused-cancel", "groups", "delete", "[IHD] Paused Group");
    const batch = vi.fn();

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch,
      } as unknown as ExecutionContext["client"],
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [
        {
          id: "paused-group",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Paused Group",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "pausedgroup",
          securityEnabled: true,
        },
      ],
    };

    const results = await executeDeleteTasksInBatches([task], context);

    expect(results).toEqual([
      expect.objectContaining({
        task,
        success: false,
        skipped: true,
        error: "Cancelled",
      }),
    ]);
    expect(batch).not.toHaveBeenCalled();
  });

  it("creates filter tasks from cached and fallback templates while skipping existing filters", async () => {
    mockGetCachedTemplates.mockImplementation((category?: string) => {
      if (category === "groups") {
        return [
          createGroupTemplate("[IHD] Retry Group"),
          createGroupTemplate("[IHD] Missing Response Group"),
          createGroupTemplate("[IHD] Cancelled Retry Group"),
          createGroupTemplate("[IHD] Pending Cancelled Group"),
        ];
      }

      if (category === "filters") {
        return [
          {
            displayName: "Cached Filter",
            description: "Cached filter description",
            platform: "windows",
            rule: '(device.deviceOwnership -eq "Company")',
          },
          {
            displayName: "Existing Filter",
            description: "Existing filter description",
            platform: "windows",
            rule: '(device.deviceOwnership -eq "Personal")',
          },
        ];
      }

      return undefined;
    });
    mockGetDeviceFilterByName.mockImplementation((name: string) => {
      if (name === "Fallback Filter") {
        return {
          "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
          displayName: "Fallback Filter",
          description: "Fallback filter description",
          platform: "androidForWork",
          rule: '(device.enrollmentProfileName -eq "BYOD")',
        };
      }

      return undefined;
    });

    const cachedTask = createTask("filter-cached", "filters", "create", "Cached Filter");
    const existingTask = createTask("filter-existing", "filters", "create", "Existing Filter");
    const fallbackTask = createTask("filter-fallback", "filters", "create", "Fallback Filter");

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi.fn().mockResolvedValue({
          responses: [
            {
              id: "req-0",
              status: 201,
              headers: {},
              body: {
                id: "cached-filter-id",
                "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
                displayName: "Cached Filter",
                description: "Cached filter description. Imported by Intune Hydration Kit",
                platform: "windows",
                rule: '(device.deviceOwnership -eq "Company")',
              },
            },
            {
              id: "req-2",
              status: 201,
              headers: {},
              body: {
                id: "fallback-filter-id",
                "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
                displayName: "Fallback Filter",
                description: "Fallback filter description. Imported by Intune Hydration Kit",
                platform: "androidForWork",
                rule: '(device.enrollmentProfileName -eq "BYOD")',
              },
            },
          ],
        }),
      } as unknown as ExecutionContext["client"],
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedFilters: [
        {
          id: "existing-filter-id",
          "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
          displayName: "existing filter",
          description: "Imported by Intune Hydration Kit",
          platform: "windows10AndLater",
          rule: '(device.deviceOwnership -eq "Personal")',
        },
      ],
    };

    const results = await executeTasksInBatches(
      [cachedTask, existingTask, fallbackTask],
      context
    );

    expect(results).toEqual([
      expect.objectContaining({
        task: existingTask,
        success: false,
        skipped: true,
        error: "Filter already exists",
      }),
      expect.objectContaining({
        task: cachedTask,
        success: true,
        skipped: false,
        createdId: "cached-filter-id",
      }),
      expect.objectContaining({
        task: fallbackTask,
        success: true,
        skipped: false,
        createdId: "fallback-filter-id",
      }),
    ]);
    expect(context.client.batch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "req-0",
          url: "/deviceManagement/assignmentFilters",
          body: expect.objectContaining({
            displayName: "Cached Filter",
            platform: "windows",
          }),
        }),
        expect.objectContaining({
          id: "req-2",
          url: "/deviceManagement/assignmentFilters",
          body: expect.objectContaining({
            displayName: "Fallback Filter",
            platform: "androidForWork",
          }),
        }),
      ],
      "beta"
    );
    expect(context.cachedFilters).toEqual([
      expect.objectContaining({ id: "existing-filter-id", displayName: "existing filter" }),
      expect.objectContaining({ id: "cached-filter-id", displayName: "Cached Filter" }),
      expect.objectContaining({ id: "fallback-filter-id", displayName: "Fallback Filter" }),
    ]);
  });

  it("handles mixed fast-delete outcomes including skips, retries, resource-not-found success, and hard failures", async () => {
    const missingTask = createTask("fast-missing", "groups", "delete", "[IHD] Missing Group");
    const noMarkerTask = createTask("fast-no-marker", "groups", "delete", "[IHD] No Marker Group");
    const assignedTask = createTask("fast-assigned", "baseline", "delete", "[IHD] Assigned Settings Policy");
    const retryTask = createTask("fast-retry", "groups", "delete", "[IHD] Retry Group");
    const resourceGoneTask = createTask("fast-gone", "conditionalAccess", "delete", "Require MFA");
    const forbiddenTask = createTask("fast-forbidden", "filters", "delete", "Trusted Filter");

    const deleteCalls = new Map<string, number>();
    const removeCalls = vi.fn(
      async (url: string, _version: "v1.0" | "beta") => {
        const currentCount = (deleteCalls.get(url) ?? 0) + 1;
        deleteCalls.set(url, currentCount);

        if (url === "/groups/retry-group-id" && currentCount === 1) {
          throw new Error("[400] transient backend");
        }

        if (url === "/identity/conditionalAccess/policies/ca-gone-id") {
          throw new Error("ResourceNotFound: already removed");
        }

        if (url === "/deviceManagement/assignmentFilters/filter-blocked-id") {
          throw new Error("[403] forbidden");
        }
      }
    );

    const context: ExecutionContext = {
      client: {
        get: vi.fn().mockImplementation((endpoint: string) => {
          if (
            endpoint ===
            "/deviceManagement/configurationPolicies/assigned-settings-id/assignments"
          ) {
            return Promise.resolve({ value: [{ id: "assignment-1" }] });
          }

          return Promise.resolve({ value: [] });
        }),
        post: vi.fn(),
        delete: removeCalls,
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi.fn(),
      } as unknown as ExecutionContext["client"],
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [
        {
          id: "no-marker-group-id",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] No Marker Group",
          description: "Manual group",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "nomarkergroup",
          securityEnabled: true,
        },
        {
          id: "retry-group-id",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Retry Group",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "retrygroup",
          securityEnabled: true,
        },
      ],
      cachedSettingsCatalogPolicies: [
        {
          id: "assigned-settings-id",
          name: "[IHD] Assigned Settings Policy",
          description: "Imported by Intune Hydration Kit",
        },
      ],
      cachedConditionalAccessPolicies: [
        {
          id: "ca-gone-id",
          displayName: "Require MFA [Imported by Intune Hydration Kit]",
        },
      ],
      cachedFilters: [
        {
          id: "filter-blocked-id",
          "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
          displayName: "Trusted Filter",
          description: "Imported by Intune Hydration Kit",
          platform: "windows10AndLater",
          rule: '(device.deviceOwnership -eq "Company")',
        },
      ],
    };

    const results = await executeDeletesInParallel(
      [
        missingTask,
        noMarkerTask,
        assignedTask,
        retryTask,
        resourceGoneTask,
        forbiddenTask,
      ],
      context
    );

    expect(results).toEqual([
      expect.objectContaining({
        task: missingTask,
        success: false,
        skipped: true,
        error: "Resource not found in tenant",
      }),
      expect.objectContaining({
        task: noMarkerTask,
        success: false,
        skipped: true,
        error: "Missing hydration marker - not created by this tool",
      }),
      expect.objectContaining({
        task: assignedTask,
        success: false,
        skipped: true,
        error: "Policy has 1 active assignment(s) - remove assignments before deleting",
      }),
      expect.objectContaining({
        task: retryTask,
        success: true,
        skipped: false,
      }),
      expect.objectContaining({
        task: resourceGoneTask,
        success: true,
        skipped: false,
      }),
      expect.objectContaining({
        task: forbiddenTask,
        success: false,
        skipped: false,
        error: "[403] forbidden",
      }),
    ]);
    expect(removeCalls).toHaveBeenCalledWith("/groups/retry-group-id", "v1.0");
    expect(removeCalls).toHaveBeenCalledWith(
      "/identity/conditionalAccess/policies/ca-gone-id",
      "beta"
    );
    expect(context.cachedIntuneGroups).toEqual([
      expect.objectContaining({
        id: "no-marker-group-id",
        displayName: "[IHD] No Marker Group",
      }),
    ]);
    expect(context.cachedConditionalAccessPolicies).toEqual([]);
    expect(context.cachedFilters).toEqual([
      expect.objectContaining({
        id: "filter-blocked-id",
        displayName: "Trusted Filter",
      }),
    ]);
    expect(mockSleepWithExecutionControl).toHaveBeenCalledWith(500, context);
  });

  it("cools down after throttled fast-delete failures and cancels the remaining batch", async () => {
    mockSleepWithExecutionControl
      .mockResolvedValueOnce("completed")
      .mockResolvedValueOnce("completed")
      .mockResolvedValueOnce("cancelled");

    const throttledTask = createTask("fast-throttle", "groups", "delete", "[IHD] Throttled Group");
    const successOne = createTask("fast-success-1", "groups", "delete", "[IHD] Success Group One");
    const successTwo = createTask("fast-success-2", "groups", "delete", "[IHD] Success Group Two");
    const cancelledTask = createTask("fast-cancelled", "groups", "delete", "[IHD] Cancelled Group");

    const clientDelete = vi.fn(
      async (url: string) => {
        if (url === "/groups/throttled-group-id") {
          throw new Error("[429] TooManyRequests");
        }
      }
    );

    const context: ExecutionContext = {
      client: {
        get: vi.fn(),
        post: vi.fn(),
        delete: clientDelete,
        patch: vi.fn(),
        getCollection: vi.fn(),
        batch: vi.fn(),
      } as unknown as ExecutionContext["client"],
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [
        {
          id: "throttled-group-id",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Throttled Group",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "throttledgroup",
          securityEnabled: true,
        },
        {
          id: "success-group-one-id",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Success Group One",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "successgroupone",
          securityEnabled: true,
        },
        {
          id: "success-group-two-id",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Success Group Two",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "successgrouptwo",
          securityEnabled: true,
        },
        {
          id: "cancelled-group-id",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] Cancelled Group",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "cancelledgroup",
          securityEnabled: true,
        },
      ],
    };

    const results = await executeDeletesInParallel(
      [throttledTask, successOne, successTwo, cancelledTask],
      context
    );

    expect(results).toEqual([
      expect.objectContaining({
        task: throttledTask,
        success: false,
        skipped: false,
        error: "[429] TooManyRequests",
      }),
      expect.objectContaining({
        task: successOne,
        success: true,
        skipped: false,
      }),
      expect.objectContaining({
        task: successTwo,
        success: true,
        skipped: false,
      }),
      expect.objectContaining({
        task: cancelledTask,
        success: false,
        skipped: true,
        error: "Cancelled",
      }),
    ]);
    expect(mockSleepWithExecutionControl).toHaveBeenNthCalledWith(1, 3000, context);
    expect(mockSleepWithExecutionControl).toHaveBeenNthCalledWith(2, 6000, context);
    expect(mockSleepWithExecutionControl).toHaveBeenNthCalledWith(3, 5000, context);
    expect(clientDelete).not.toHaveBeenCalledWith("/groups/cancelled-group-id", "v1.0");
  });
});
