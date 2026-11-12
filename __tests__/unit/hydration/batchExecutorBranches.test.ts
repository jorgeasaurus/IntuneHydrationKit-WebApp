import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchConfiguration } from "@/lib/config/batchConfig";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { BaselinePolicy, GroupTemplate } from "@/lib/templates/loader";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockGetAllTemplateCacheKeys,
  mockGetBatchConfig,
  mockSleep,
  mockSleepWithExecutionControl,
  mockWaitWhilePaused,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetAllTemplateCacheKeys: vi.fn(),
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
  executeDeletesInParallel,
  executeTasksInBatches,
} from "@/lib/hydration/batchExecutor";

const defaultBatchConfig: BatchConfiguration = {
  defaultBatchSize: 20,
  delayBetweenBatches: 1000,
  enableBatching: true,
  categoryBatchSizes: {
    cisBaseline: 15,
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
    // Retry-After (1 second) sets the wait.
    expect(mockSleepWithExecutionControl).toHaveBeenCalledWith(1000, context);
    expect(onTaskComplete).toHaveBeenCalledWith(task);
  });

  it("does not resend a create when the batch response omits a prepared request", async () => {
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
        findCreatedObjects: vi.fn().mockResolvedValue([undefined]),
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
        error: expect.stringMatching(/^No response received \(Outcome unknown/),
      }),
    ]);
    expect(context.client.batch).toHaveBeenCalledTimes(1);
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
              headers: { "Retry-After": "1" },
              body: { error: { message: "Service unavailable" } },
            },
            {
              id: "req-1",
              status: 503,
              headers: { "Retry-After": "1" },
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

  it("creates cached filter tasks while skipping existing filters", async () => {
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
            platform: "windows10AndLater",
            rule: '(device.deviceOwnership -eq "Company")',
          },
          {
            displayName: "Existing Filter",
            description: "Existing filter description",
            platform: "windows10AndLater",
            rule: '(device.deviceOwnership -eq "Personal")',
          },
        ];
      }

      return undefined;
    });
    const cachedTask = createTask("filter-cached", "filters", "create", "Cached Filter");
    const existingTask = createTask("filter-existing", "filters", "create", "Existing Filter");

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
                platform: "windows10AndLater",
                rule: '(device.deviceOwnership -eq "Company")',
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
      [cachedTask, existingTask],
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
    ]);
    expect(context.client.batch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "req-0",
          url: "/deviceManagement/assignmentFilters",
          body: expect.objectContaining({
            displayName: "Cached Filter",
            platform: "windows10AndLater",
          }),
        }),
      ],
      "beta"
    );
    expect(context.cachedFilters).toEqual([
      expect.objectContaining({ id: "existing-filter-id", displayName: "existing filter" }),
      expect.objectContaining({ id: "cached-filter-id", displayName: "Cached Filter" }),
    ]);
  });

  it("handles mixed fast-delete outcomes including Conditional Access safety skips and hard failures", async () => {
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
        error: "Not found in tenant",
      }),
      expect.objectContaining({
        task: noMarkerTask,
        success: false,
        skipped: true,
        error: "Not created by Intune Hydration Kit (no marker in the description)",
      }),
      expect.objectContaining({
        task: assignedTask,
        success: false,
        skipped: true,
        error: "Policy has 1 active assignment(s). Remove the assignments before you delete it.",
      }),
      expect.objectContaining({
        task: resourceGoneTask,
        success: false,
        skipped: true,
        error: "Conditional Access deletion must use the sequential safety check",
      }),
      // The Graph client owns the retries, so the executor sends one DELETE per task.
      expect.objectContaining({
        task: retryTask,
        success: false,
        skipped: false,
        error: "[400] transient backend",
      }),
      expect.objectContaining({
        task: forbiddenTask,
        success: false,
        skipped: false,
        error: "[403] forbidden",
      }),
    ]);
    expect(removeCalls).toHaveBeenCalledWith("/groups/retry-group-id", "v1.0");
    expect(deleteCalls.get("/groups/retry-group-id")).toBe(1);
    expect(context.cachedIntuneGroups).toEqual([
      expect.objectContaining({
        id: "no-marker-group-id",
        displayName: "[IHD] No Marker Group",
      }),
      expect.objectContaining({ id: "retry-group-id" }),
    ]);
    expect(context.cachedConditionalAccessPolicies).toEqual([
      expect.objectContaining({ id: "ca-gone-id" }),
    ]);
    expect(context.cachedFilters).toEqual([
      expect.objectContaining({
        id: "filter-blocked-id",
        displayName: "Trusted Filter",
      }),
    ]);
    expect(mockSleepWithExecutionControl).not.toHaveBeenCalled();
  });

  it("cools down after throttled fast-delete failures and cancels the remaining batch", async () => {
    mockSleepWithExecutionControl.mockResolvedValueOnce("cancelled");

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
    // One cooldown after the throttled batch; no second retry loop around client.delete.
    expect(mockSleepWithExecutionControl).toHaveBeenCalledTimes(1);
    expect(mockSleepWithExecutionControl).toHaveBeenCalledWith(5000, context);
    expect(clientDelete).toHaveBeenCalledTimes(3);
    expect(clientDelete).not.toHaveBeenCalledWith("/groups/cancelled-group-id", "v1.0");
  });
});
