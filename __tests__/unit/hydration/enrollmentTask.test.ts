import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetCachedTemplates } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

import { executeEnrollmentTask } from "@/lib/hydration/taskExecutors/enrollmentTask";

describe("executeEnrollmentTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips recreating device preparation profiles when an OData-unsafe cached policy already exists", async () => {
    const profileName = "[IHD] Windows Autopilot device preparation - User Driven";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationPolicy",
        technologies: "enrollment",
        name: profileName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: "new-profile-id" }),
      delete: vi.fn(),
      getCollection: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const task: HydrationTask = {
      id: "enrollment-rerun",
      category: "enrollment",
      operation: "create",
      itemName: profileName,
      status: "pending",
    };

    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "existing-profile-id",
          name: profileName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeEnrollmentTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(client.post).not.toHaveBeenCalled();
  });

  it("fetches settings catalog policies for OData-unsafe device preparation profiles and skips duplicates", async () => {
    const profileName = "[IHD] Windows Autopilot device preparation - User Driven";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationPolicy",
        technologies: "enrollment",
        name: profileName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: "new-profile-id" }),
      delete: vi.fn(),
      getCollection: vi.fn().mockResolvedValue([
        {
          id: "existing-profile-id",
          name: profileName,
          description: "Imported by Intune Hydration Kit",
        },
      ]),
    } as unknown as ExecutionContext["client"];

    const task: HydrationTask = {
      id: "enrollment-rerun-fetch",
      category: "enrollment",
      operation: "create",
      itemName: profileName,
      status: "pending",
    };

    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeEnrollmentTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(client.getCollection).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies?$select=id,name,description"
    );
    expect(client.post).not.toHaveBeenCalled();
  });

  it("deletes ESP profiles when the tenant object uses the legacy [IHD] - name format", async () => {
    const templateName = "[IHD] Intune Default Enrollment Status Page";
    const tenantName = "[IHD] - Intune Default Enrollment Status Page";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration",
        displayName: templateName,
        description: "Default Enrollment Status Page configuration for Windows devices Imported by Intune Hydration Kit",
      },
    ]);

    const client = {
      get: vi.fn().mockResolvedValue({
        id: "esp-id",
        displayName: tenantName,
        description: "Default Enrollment Status Page configuration for Windows devices - Imported by Intune Hydration Kit",
      }),
      post: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      getCollection: vi.fn()
        .mockResolvedValueOnce([
          {
            id: "esp-id",
            "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration",
            displayName: tenantName,
            description: "Default Enrollment Status Page configuration for Windows devices - Imported by Intune Hydration Kit",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "esp-id",
            "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration",
            displayName: tenantName,
            description: "Default Enrollment Status Page configuration for Windows devices - Imported by Intune Hydration Kit",
          },
        ])
        .mockResolvedValueOnce([]),
    } as unknown as ExecutionContext["client"];

    const task: HydrationTask = {
      id: "enrollment-esp-delete",
      category: "enrollment",
      operation: "delete",
      itemName: templateName,
      status: "pending",
    };

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeEnrollmentTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: false,
    });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/deviceEnrollmentConfigurations/esp-id"
    );
  });

  it("deletes device preparation profiles with [IHD] names via settings catalog lookups", async () => {
    const profileName = "[IHD] Windows Autopilot device preparation - User Driven";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationPolicy",
        technologies: "enrollment",
        name: profileName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      getCollection: vi.fn()
        .mockResolvedValueOnce([
          {
            id: "device-prep-id",
            name: profileName,
            description: "Imported by Intune Hydration Kit",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "device-prep-id",
            name: profileName,
            description: "Imported by Intune Hydration Kit",
          },
        ])
        .mockResolvedValueOnce([]),
    } as unknown as ExecutionContext["client"];

    const task: HydrationTask = {
      id: "enrollment-device-prep-delete",
      category: "enrollment",
      operation: "delete",
      itemName: profileName,
      status: "pending",
    };

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeEnrollmentTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: false,
    });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies/device-prep-id"
    );
  });

  it("skips deleting device preparation profiles that still have assignments", async () => {
    const profileName = "[IHD] Windows Autopilot device preparation - User Driven";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationPolicy",
        technologies: "enrollment",
        name: profileName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      getCollection: vi.fn()
        .mockResolvedValueOnce([
          {
            id: "device-prep-id",
            name: profileName,
            description: "Imported by Intune Hydration Kit",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "device-prep-id",
            name: profileName,
            description: "Imported by Intune Hydration Kit",
          },
        ])
        .mockResolvedValueOnce([{ id: "assignment-id" }]),
    } as unknown as ExecutionContext["client"];

    const task: HydrationTask = {
      id: "enrollment-device-prep-assignment-delete",
      category: "enrollment",
      operation: "delete",
      itemName: profileName,
      status: "pending",
    };

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeEnrollmentTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: `Cannot delete Device Preparation policy "${profileName}": Has 1 assignment(s). Remove all assignments before deleting.`,
    });
    expect(client.delete).not.toHaveBeenCalled();
  });
});
