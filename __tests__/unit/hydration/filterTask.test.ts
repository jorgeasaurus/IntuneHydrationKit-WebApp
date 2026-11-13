import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetCachedTemplates, mockCreateFilter } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockCreateFilter: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
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
