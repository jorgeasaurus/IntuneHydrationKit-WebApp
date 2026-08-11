import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetCachedTemplates, mockDeleteAppProtectionPolicy } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockDeleteAppProtectionPolicy: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/graph/appProtection", () => ({
  createAppProtectionPolicy: vi.fn(),
  deleteAppProtectionPolicy: mockDeleteAppProtectionPolicy,
}));

import { executeAppProtectionTask } from "@/lib/hydration/taskExecutors/appProtectionTask";

describe("executeAppProtectionTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when create mode has no cached template", async () => {
    mockGetCachedTemplates.mockReturnValue(undefined);

    const result = await executeAppProtectionTask(
      {
        id: "create-ios-app-protection",
        category: "appProtection",
        operation: "create",
        itemName: "[IHD] iOS App Protection",
        status: "pending",
      },
      {
        client: {} as ExecutionContext["client"],
        operationMode: "create",
        isPreview: false,
        stopOnFirstError: false,
      }
    );

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "Template not found",
    });
  });

  it("deletes prefixed iOS policies from the tenant cache", async () => {
    mockGetCachedTemplates.mockReturnValue(undefined);
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

    const cachedAppProtectionPolicies: NonNullable<
      ExecutionContext["cachedAppProtectionPolicies"]
    > = [
      {
        id: "ios-policy-id",
        displayName: "[IHD] iOS App Protection",
        description: "Imported by Intune Hydration Kit",
        _platform: "iOS",
      },
    ];
    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedAppProtectionPolicies,
    };

    const result = await executeAppProtectionTask(task, context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockDeleteAppProtectionPolicy).toHaveBeenCalledWith(client, "ios-policy-id", "iOS");
    expect(cachedAppProtectionPolicies).toHaveLength(0);
  });
});
