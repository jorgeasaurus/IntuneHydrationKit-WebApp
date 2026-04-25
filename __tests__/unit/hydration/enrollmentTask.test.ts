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
});
