import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetCachedTemplates, mockDeleteAppProtectionPolicy, mockGetAppProtectionPolicyByName } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockDeleteAppProtectionPolicy: vi.fn(),
  mockGetAppProtectionPolicyByName: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/graph/appProtection", () => ({
  createAppProtectionPolicy: vi.fn(),
  deleteAppProtectionPolicy: mockDeleteAppProtectionPolicy,
}));

vi.mock("@/templates", () => ({
  getAppProtectionPolicyByName: mockGetAppProtectionPolicyByName,
}));

import { executeAppProtectionTask } from "@/lib/hydration/taskExecutors/appProtectionTask";

describe("executeAppProtectionTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes prefixed iOS policies even when the template cache is unavailable", async () => {
    mockGetCachedTemplates.mockReturnValue(undefined);
    mockGetAppProtectionPolicyByName
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({
        "@odata.type": "#microsoft.graph.iosManagedAppProtection",
        displayName: "iOS App Protection",
        description: "Imported by Intune Hydration Kit",
      });
    mockDeleteAppProtectionPolicy.mockResolvedValue({ deleted: true, skipped: false });

    const task: HydrationTask = {
      id: "delete-ios-app-protection",
      category: "appProtection",
      operation: "delete",
      itemName: "[IHD] iOS App Protection",
      status: "pending",
    };

    const client = {
      delete: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedAppProtectionPolicies: [
        {
          id: "ios-policy-id",
          "@odata.type": "#microsoft.graph.iosManagedAppProtection",
          displayName: "[IHD] iOS App Protection",
          description: "Imported by Intune Hydration Kit",
          _platform: "iOS",
        },
      ],
    };

    const result = await executeAppProtectionTask(task, context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockGetAppProtectionPolicyByName).toHaveBeenNthCalledWith(1, "[IHD] iOS App Protection");
    expect(mockGetAppProtectionPolicyByName).toHaveBeenNthCalledWith(2, "iOS App Protection");
    expect(mockDeleteAppProtectionPolicy).toHaveBeenCalledWith(client, "ios-policy-id", "iOS");
  });
});
