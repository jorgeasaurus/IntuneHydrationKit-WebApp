import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetCachedTemplates, mockGetDynamicGroupByName, mockCreateGroup, mockDeleteGroupByName } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetDynamicGroupByName: vi.fn(),
  mockCreateGroup: vi.fn(),
  mockDeleteGroupByName: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/templates", () => ({
  getDynamicGroupByName: mockGetDynamicGroupByName,
}));

vi.mock("@/lib/graph/groups", () => ({
  createGroup: mockCreateGroup,
  deleteGroupByName: mockDeleteGroupByName,
}));

import { executeGroupTask } from "@/lib/hydration/taskExecutors/groupTask";

describe("executeGroupTask", () => {
  const task: HydrationTask = {
    id: "group-task",
    category: "groups",
    operation: "create",
    itemName: "[IHD] All Windows Devices",
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

  it("returns an error when no matching group template exists", async () => {
    mockGetCachedTemplates.mockReturnValue(undefined);
    mockGetDynamicGroupByName.mockReturnValue(undefined);

    const result = await executeGroupTask(task, {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "Template not found for [IHD] All Windows Devices",
    });
  });

  it("skips create when a cached tenant group matches after stripping the hydration prefix", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] All Windows Devices",
        description: "Imported by Intune Hydration Kit",
        membershipRule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const result = await executeGroupTask(task, {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [
        {
          id: "existing-group-id",
          "@odata.type": "#microsoft.graph.group",
          displayName: "All Windows Devices",
          description: "Imported by Intune Hydration Kit",
          groupTypes: ["DynamicMembership"],
          mailEnabled: false,
          mailNickname: "AllWindowsDevices",
          securityEnabled: true,
          membershipRule: '(device.deviceOSType -eq "Windows")',
          membershipRuleProcessingState: "On",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(mockCreateGroup).not.toHaveBeenCalled();
  });



  it("returns success for preview create without calling Graph", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] All Windows Devices",
        description: "Imported by Intune Hydration Kit",
        membershipRule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const result = await executeGroupTask(task, {
      client: createClient(),
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
      cachedIntuneGroups: [],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockCreateGroup).not.toHaveBeenCalled();
  });

  it("creates dynamic groups from simple templates and updates the cache", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] All Windows Devices",
        description: "Imported by Intune Hydration Kit",
        membershipRule: '(device.deviceOSType -eq "Windows")',
      },
    ]);
    mockCreateGroup.mockResolvedValue({
      id: "created-group-id",
      "@odata.type": "#microsoft.graph.group",
      displayName: "[IHD] All Windows Devices",
      description: "Imported by Intune Hydration Kit",
      groupTypes: ["DynamicMembership"],
      mailEnabled: false,
      mailNickname: "IHDAllWindowsDevices",
      securityEnabled: true,
      membershipRule: '(device.deviceOSType -eq "Windows")',
      membershipRuleProcessingState: "On",
    });

    const cachedIntuneGroups: NonNullable<ExecutionContext["cachedIntuneGroups"]> = [];
    const client = createClient();

    const result = await executeGroupTask(task, {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "created-group-id",
    });
    expect(mockCreateGroup).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        displayName: "[IHD] All Windows Devices",
        groupTypes: ["DynamicMembership"],
        membershipRule: '(device.deviceOSType -eq "Windows")',
        membershipRuleProcessingState: "On",
        mailNickname: "IHDAllWindowsDevices",
      })
    );
    expect(cachedIntuneGroups).toContainEqual(
      expect.objectContaining({ id: "created-group-id", displayName: "[IHD] All Windows Devices" })
    );
  });

  it("creates static groups without dynamic membership settings", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Windows 365 Users",
        description: "Imported by Intune Hydration Kit",
        isStaticGroup: true,
      },
    ]);
    mockCreateGroup.mockResolvedValue({
      id: "static-group-id",
      "@odata.type": "#microsoft.graph.group",
      displayName: "[IHD] Windows 365 Users",
      description: "Imported by Intune Hydration Kit",
      groupTypes: [],
      mailEnabled: false,
      mailNickname: "IHDWindows365Users",
      securityEnabled: true,
    });

    const client = createClient();

    const result = await executeGroupTask(
      { ...task, itemName: "[IHD] Windows 365 Users" },
      {
        client,
        operationMode: "create",
        isPreview: false,
        stopOnFirstError: false,
      }
    );

    expect(result).toMatchObject({ success: true, skipped: false, createdId: "static-group-id" });
    expect(mockCreateGroup).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        displayName: "[IHD] Windows 365 Users",
        groupTypes: [],
        mailNickname: "IHDWindows365Users",
      })
    );
    expect(mockCreateGroup).toHaveBeenCalledWith(
      client,
      expect.not.objectContaining({
        membershipRule: expect.anything(),
      })
    );
  });



  it("skips delete when the group is not cached in the tenant", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] All Windows Devices",
        description: "Imported by Intune Hydration Kit",
        membershipRule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const result = await executeGroupTask(
      { ...task, operation: "delete" },
      {
        client: createClient(),
        operationMode: "delete",
        isPreview: false,
        stopOnFirstError: false,
        cachedIntuneGroups: [],
      }
    );

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not found in tenant",
    });
    expect(mockDeleteGroupByName).not.toHaveBeenCalled();
  });

  it("uses fallback templates for preview delete without mutating Graph", async () => {
    mockGetCachedTemplates.mockReturnValue(undefined);
    mockGetDynamicGroupByName.mockReturnValue({
      "@odata.type": "#microsoft.graph.group",
      displayName: "[IHD] All Windows Devices",
      description: "Imported by Intune Hydration Kit",
      groupTypes: ["DynamicMembership"],
      mailEnabled: false,
      mailNickname: "IHDAllWindowsDevices",
      securityEnabled: true,
      membershipRule: '(device.deviceOSType -eq "Windows")',
      membershipRuleProcessingState: "On",
    });

    const result = await executeGroupTask(
      { ...task, operation: "delete" },
      {
        client: createClient(),
        operationMode: "delete",
        isPreview: true,
        stopOnFirstError: false,
        cachedIntuneGroups: [
          {
            id: "tenant-group-id",
            "@odata.type": "#microsoft.graph.group",
            displayName: "All Windows Devices",
            description: "Imported by Intune Hydration Kit",
            groupTypes: ["DynamicMembership"],
            mailEnabled: false,
            mailNickname: "AllWindowsDevices",
            securityEnabled: true,
            membershipRule: '(device.deviceOSType -eq "Windows")',
            membershipRuleProcessingState: "On",
          },
        ],
      }
    );

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockDeleteGroupByName).not.toHaveBeenCalled();
  });

  it("deletes matching groups by template display name", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] All Windows Devices",
        description: "Imported by Intune Hydration Kit",
        membershipRule: '(device.deviceOSType -eq "Windows")',
      },
    ]);
    mockDeleteGroupByName.mockResolvedValue(undefined);
    const client = createClient();

    const result = await executeGroupTask(
      { ...task, operation: "delete" },
      {
        client,
        operationMode: "delete",
        isPreview: false,
        stopOnFirstError: false,
        cachedIntuneGroups: [
          {
            id: "tenant-group-id",
            "@odata.type": "#microsoft.graph.group",
            displayName: "All Windows Devices",
            description: "Imported by Intune Hydration Kit",
            groupTypes: ["DynamicMembership"],
            mailEnabled: false,
            mailNickname: "AllWindowsDevices",
            securityEnabled: true,
            membershipRule: '(device.deviceOSType -eq "Windows")',
            membershipRuleProcessingState: "On",
          },
        ],
      }
    );

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockDeleteGroupByName).toHaveBeenCalledWith(client, "[IHD] All Windows Devices");
  });

  it("surfaces delete errors as skipped results", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] All Windows Devices",
        description: "Imported by Intune Hydration Kit",
        membershipRule: '(device.deviceOSType -eq "Windows")',
      },
    ]);
    mockDeleteGroupByName.mockRejectedValue(new Error("Not created by Hydration Kit"));

    const result = await executeGroupTask(
      { ...task, operation: "delete" },
      {
        client: createClient(),
        operationMode: "delete",
        isPreview: false,
        stopOnFirstError: false,
        cachedIntuneGroups: [
          {
            id: "tenant-group-id",
            "@odata.type": "#microsoft.graph.group",
            displayName: "[IHD] All Windows Devices",
            description: "Imported by Intune Hydration Kit",
            groupTypes: ["DynamicMembership"],
            mailEnabled: false,
            mailNickname: "IHDAllWindowsDevices",
            securityEnabled: true,
            membershipRule: '(device.deviceOSType -eq "Windows")',
            membershipRuleProcessingState: "On",
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

  it("returns an invalid mode error for unsupported operations", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] All Windows Devices",
        description: "Imported by Intune Hydration Kit",
        membershipRule: '(device.deviceOSType -eq "Windows")',
      },
    ]);

    const result = await executeGroupTask(task, {
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
