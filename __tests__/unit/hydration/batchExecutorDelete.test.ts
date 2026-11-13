import { describe, expect, it, vi } from "vitest";

import {
  executeDeletesInParallel,
  isBatchableCategory,
} from "@/lib/hydration/batchExecutor";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";
import { serveCachedObjects } from "../../helpers/tenantObjectReads";

describe("executeDeletesInParallel", () => {
  it("keeps Conditional Access batchable for create execution", () => {
    expect(isBatchableCategory("conditionalAccess")).toBe(true);
  });

  it("stops assignment checks when cancellation arrives during preparation", async () => {
    const tasks: HydrationTask[] = ["One", "Two"].map((name) => ({
      id: `baseline-${name.toLowerCase()}`,
      category: "baseline",
      operation: "delete",
      itemName: `[IHD] Baseline ${name}`,
      status: "pending",
    }));
    let resolveAssignmentCheck!: (value: { value: unknown[] }) => void;
    let cancelled = false;
    const client = {
      delete: vi.fn(),
      get: vi.fn(
        () =>
          new Promise<{ value: unknown[] }>((resolve) => {
            resolveAssignmentCheck = resolve;
          }),
      ),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
    } as unknown as ExecutionContext["client"];
    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      shouldCancel: () => cancelled,
      cachedSettingsCatalogPolicies: tasks.map((task, index) => ({
        id: `policy-${index}`,
        name: task.itemName,
        description: "Imported by Intune Hydration Kit",
      })),
    };

    const execution = executeDeletesInParallel(tasks, context);
    await vi.waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
    cancelled = true;
    resolveAssignmentCheck({ value: [] });
    const results = await execution;

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.delete).not.toHaveBeenCalled();
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.skipKind === "cancelled")).toBe(
      true,
    );
    for (const task of tasks) {
      expect(task.startTime).toBeInstanceOf(Date);
      expect(task.endTime).toBe(task.startTime);
    }
  });

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
      get: vi.fn().mockResolvedValue({ value: [] }),
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

    const results = await executeDeletesInParallel([task], serveCachedObjects(context));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/groupPolicyConfigurations/group-policy-id",
      "beta"
    );
  });

  it("deletes CIS security intent policies when they exist in the security intent cache", async () => {
    const task: HydrationTask = {
      id: "cis-security-intent-delete",
      category: "cisBaseline",
      operation: "delete",
      itemName: "[IHD] Baseline - MacOS - Firewall",
      status: "pending",
    };

    const client = {
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ value: [] }),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSecurityIntents: [
        {
          id: "security-intent-id",
          displayName: "[IHD] Baseline - MacOS - Firewall",
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const results = await executeDeletesInParallel([task], serveCachedObjects(context));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/intents/security-intent-id",
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
      get: vi.fn().mockResolvedValue({ value: [] }),
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

    const results = await executeDeletesInParallel([task], serveCachedObjects(context));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceAppManagement/androidManagedAppProtections/android-app-protection-id",
      "beta"
    );
  });

  it("skips conditional access policies in the parallel delete path", async () => {
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

    const results = await executeDeletesInParallel([task], serveCachedObjects(context));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: false,
      skipped: true,
      error: "Conditional Access deletion must use the sequential safety check",
    });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("fails without deleting when assignment lookup fails", async () => {
    const task: HydrationTask = {
      id: "assigned-policy-read-failure",
      category: "baseline",
      operation: "delete",
      itemName: "Assigned settings policy",
      status: "pending",
    };
    const client = {
      delete: vi.fn(),
      get: vi.fn().mockRejectedValue(new Error("Graph unavailable")),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
    } as unknown as ExecutionContext["client"];
    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [{
        id: "assigned-policy-id",
        name: "Assigned settings policy",
        description: "Imported by Intune Hydration Kit",
      }],
    };

    const results = await executeDeletesInParallel([task], serveCachedObjects(context));

    expect(results).toEqual([expect.objectContaining({
      success: false,
      skipped: false,
      error: expect.stringContaining("Graph unavailable"),
    })]);
    expect(task.status).toBe("failed");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips a device filter that assignments use, and does not count it as a failure", async () => {
    const task: HydrationTask = {
      id: "filter-in-use",
      category: "filters",
      operation: "delete",
      itemName: "[IHD] Windows - Parallels VMs",
      status: "pending",
    };
    const inUse = Object.assign(
      new Error('[400] { "Message": "5001:An assignment filter is associated with existing assignments. Delete all the assignments for the filter and try again." }'),
      { status: 400 },
    );
    const onTaskError = vi.fn();
    const onTaskComplete = vi.fn();
    const client = {
      delete: vi.fn().mockRejectedValue(inUse),
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
      onTaskError,
      onTaskComplete,
      cachedFilters: [{
        id: "filter-id",
        displayName: "[IHD] Windows - Parallels VMs",
        description: "Imported by Intune Hydration Kit",
      }] as never,
    };

    const results = await executeDeletesInParallel([task], serveCachedObjects(context));

    expect(results).toEqual([expect.objectContaining({
      success: false,
      skipped: true,
      skipKind: "blocked",
      error: expect.stringContaining("used by one or more assignments"),
    })]);
    expect(task).toMatchObject({ status: "skipped", skipKind: "blocked" });
    expect(onTaskError).not.toHaveBeenCalled();
    expect(onTaskComplete).toHaveBeenCalledWith(task);
    expect(context.cachedFilters).toHaveLength(1);
  });

  it("deletes Linux compliance policies from the V2 compliance cache", async () => {
    const task: HydrationTask = {
      id: "linux-compliance-delete",
      category: "compliance",
      operation: "delete",
      itemName: "[IHD] Linux Compliance",
      status: "pending",
    };

    const client = {
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ value: [] }),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedV2CompliancePolicies: [
        {
          id: "linux-compliance-id",
          name: "[IHD] Linux Compliance",
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const results = await executeDeletesInParallel([task], serveCachedObjects(context));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/compliancePolicies/linux-compliance-id",
      "beta"
    );
  });

  it("deletes iOS baseline app protection policies from the app protection cache", async () => {
    const task: HydrationTask = {
      id: "baseline-ios-app-protection-delete",
      category: "baseline",
      operation: "delete",
      itemName: "[IHD] iOS Baseline App Protection",
      status: "pending",
    };

    const client = {
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ value: [] }),
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
          id: "ios-app-protection-id",
          "@odata.type": "#microsoft.graph.iosManagedAppProtection",
          displayName: "[IHD] iOS Baseline App Protection",
          description: "Imported by Intune Hydration Kit",
          _platform: "iOS",
        },
      ],
    };

    const results = await executeDeletesInParallel([task], serveCachedObjects(context));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceAppManagement/iosManagedAppProtections/ios-app-protection-id",
      "beta"
    );
  });
});
