import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetCachedTemplates, mockGetDeviceFilterByName, mockCreateFilter } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetDeviceFilterByName: vi.fn(),
  mockCreateFilter: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/templates", () => ({
  getDeviceFilterByName: mockGetDeviceFilterByName,
}));

vi.mock("@/lib/graph/filters", () => ({
  createFilter: mockCreateFilter,
}));

import { executeFilterTask } from "@/lib/hydration/taskExecutors/filterTask";

describe("executeFilterTask", () => {
  const task: HydrationTask = {
    id: "filter-task",
    category: "filters",
    operation: "create",
    itemName: "[IHD] Windows Filter",
    status: "pending",
  };

  const createClient = () => ({
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    getCollection: vi.fn(),
    patch: vi.fn(),
  }) as unknown as ExecutionContext["client"];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when no matching filter template exists", async () => {
    mockGetCachedTemplates.mockReturnValue(undefined);
    mockGetDeviceFilterByName.mockReturnValue(undefined);

    const result = await executeFilterTask(task, {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "Template not found for [IHD] Windows Filter",
    });
  });

  it("skips create when a case-insensitive cached filter match already exists", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Windows Filter",
        description: "Imported by Intune Hydration Kit",
        platform: "windows10AndLater",
        rule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const result = await executeFilterTask(task, {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedFilters: [
        {
          id: "existing-filter-id",
          "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
          displayName: "[ihd] windows filter",
          description: "Imported by Intune Hydration Kit",
          platform: "windows10AndLater",
          rule: '(device.deviceOSType -eq "Windows")',
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(mockCreateFilter).not.toHaveBeenCalled();
  });

  it("creates a filter from a simple cached template and updates the cache", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Windows Filter",
        description: "Imported by Intune Hydration Kit",
        platform: "windows10AndLater",
        rule: '(device.deviceOSType -eq "Windows")',
      },
    ]);
    mockCreateFilter.mockResolvedValue({
      id: "created-filter-id",
      "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
      displayName: "[IHD] Windows Filter",
      description: "Imported by Intune Hydration Kit",
      platform: "windows10AndLater",
      rule: '(device.deviceOSType -eq "Windows")',
    });

    const cachedFilters: NonNullable<ExecutionContext["cachedFilters"]> = [];
    const client = createClient();

    const result = await executeFilterTask(task, {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedFilters,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "created-filter-id",
    });
    expect(mockCreateFilter).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
        displayName: "[IHD] Windows Filter",
        platform: "windows10AndLater",
      })
    );
    expect(cachedFilters).toContainEqual(
      expect.objectContaining({
        id: "created-filter-id",
        displayName: "[IHD] Windows Filter",
      })
    );
  });

  it("uses fallback templates during preview create without mutating Graph", async () => {
    mockGetCachedTemplates.mockReturnValue(undefined);
    mockGetDeviceFilterByName.mockReturnValue({
      "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
      displayName: "[IHD] Windows Filter",
      description: "Imported by Intune Hydration Kit",
      platform: "windows10AndLater",
      rule: '(device.deviceOSType -eq "Windows")',
    });

    const result = await executeFilterTask(task, {
      client: createClient(),
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockCreateFilter).not.toHaveBeenCalled();
  });



  it("skips delete when the filter is not cached in the tenant", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Windows Filter",
        description: "Imported by Intune Hydration Kit",
        platform: "windows10AndLater",
        rule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const result = await executeFilterTask(
      { ...task, operation: "delete" },
      {
        client: createClient(),
        operationMode: "delete",
        isPreview: false,
        stopOnFirstError: false,
        cachedFilters: [],
      }
    );

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not found in tenant",
    });
  });

  it("skips delete when the tenant filter lacks the hydration marker", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Windows Filter",
        description: "Imported by Intune Hydration Kit",
        platform: "windows10AndLater",
        rule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const result = await executeFilterTask(
      { ...task, operation: "delete" },
      {
        client: createClient(),
        operationMode: "delete",
        isPreview: false,
        stopOnFirstError: false,
        cachedFilters: [
          {
            id: "tenant-filter-id",
            "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
            displayName: "[IHD] Windows Filter",
            description: "Manually created filter",
            platform: "windows10AndLater",
            rule: '(device.deviceOSType -eq "Windows")',
          },
        ],
      }
    );

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not created by Hydration Kit",
    });
  });



  it("returns success for preview delete without mutating Graph", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Windows Filter",
        description: "Imported by Intune Hydration Kit",
        platform: "windows10AndLater",
        rule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const client = createClient();
    const result = await executeFilterTask(
      { ...task, operation: "delete" },
      {
        client,
        operationMode: "delete",
        isPreview: true,
        stopOnFirstError: false,
        cachedFilters: [
          {
            id: "tenant-filter-id",
            "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
            displayName: "[IHD] Windows Filter",
            description: "Imported by Intune Hydration Kit",
            platform: "windows10AndLater",
            rule: '(device.deviceOSType -eq "Windows")',
          },
        ],
      }
    );

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("deletes hydrated filters and removes them from the cache", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Windows Filter",
        description: "Imported by Intune Hydration Kit",
        platform: "windows10AndLater",
        rule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const cachedFilters: NonNullable<ExecutionContext["cachedFilters"]> = [
      {
        id: "tenant-filter-id",
        "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
        displayName: "[IHD] Windows Filter",
        description: "Imported by Intune Hydration Kit",
        platform: "windows10AndLater",
        rule: '(device.deviceOSType -eq "Windows")',
      },
    ];
    const client = createClient();

    const result = await executeFilterTask(
      { ...task, operation: "delete" },
      {
        client,
        operationMode: "delete",
        isPreview: false,
        stopOnFirstError: false,
        cachedFilters,
      }
    );

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith("/deviceManagement/assignmentFilters/tenant-filter-id");
    expect(cachedFilters).toHaveLength(0);
  });

  it("returns an invalid mode error for unsupported operations", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Windows Filter",
        description: "Imported by Intune Hydration Kit",
        platform: "windows10AndLater",
        rule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const result = await executeFilterTask(task, {
      client: createClient(),
      operationMode: "preview" as never,
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "Invalid operation mode",
    });
  });

});
