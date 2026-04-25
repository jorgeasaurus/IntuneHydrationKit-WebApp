import { describe, expect, it, vi } from "vitest";

import { executeDeletesInParallel } from "@/lib/hydration/batchExecutor";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

describe("executeDeletesInParallel", () => {
  it("deletes baseline group policy configurations when they exist in the group policy cache", async () => {
    const task: HydrationTask = {
      id: "baseline-group-policy-delete",
      category: "cisBaseline",
      operation: "delete",
      itemName: "[IHD] Baseline - Configure Outlook profile ",
      status: "pending",
    };

    const client = {
      delete: vi.fn().mockResolvedValue(undefined),
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
      cachedGroupPolicyConfigurations: [
        {
          id: "group-policy-id",
          displayName: "[IHD] Baseline - Configure Outlook profile ",
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const results = await executeDeletesInParallel([task], context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/groupPolicyConfigurations/group-policy-id",
      "beta"
    );
  });

  it("deletes baseline app protection policies when they exist in the app protection cache", async () => {
    const task: HydrationTask = {
      id: "baseline-app-protection-delete",
      category: "baseline",
      operation: "delete",
      itemName: "[IHD] Android - Baseline - BYOD - App Protection",
      status: "pending",
    };

    const client = {
      delete: vi.fn().mockResolvedValue(undefined),
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
          id: "android-app-protection-id",
          "@odata.type": "#microsoft.graph.androidManagedAppProtection",
          displayName: "[IHD] Android - Baseline - BYOD - App Protection",
          description: "Imported by Intune Hydration Kit",
          _platform: "android",
        },
      ],
    };

    const results = await executeDeletesInParallel([task], context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceAppManagement/androidManagedAppProtections/android-app-protection-id",
      "beta"
    );
  });

  it("deletes conditional access policies that are marked only by the [IHD] prefix", async () => {
    const task: HydrationTask = {
      id: "conditional-access-delete",
      category: "conditionalAccess",
      operation: "delete",
      itemName: "[IHD] Require multifactor authentication for all users",
      status: "pending",
    };

    const client = {
      delete: vi.fn().mockResolvedValue(undefined),
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
      cachedConditionalAccessPolicies: [
        {
          id: "ca-policy-id",
          displayName: "[IHD] Require multifactor authentication for all users",
        },
      ],
    };

    const results = await executeDeletesInParallel([task], context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/identity/conditionalAccess/policies/ca-policy-id",
      "beta"
    );
  });
});
