import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetCachedTemplates } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/graph/appProtection", () => ({
  createAppProtectionPolicy: vi.fn(),
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
      error: "Template not found for [IHD] iOS App Protection. Reload templates and try again.",
    });
  });

});
