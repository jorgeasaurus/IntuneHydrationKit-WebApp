import { describe, expect, it, vi } from "vitest";

import {
  executeDeleteTasksInBatches,
  executeDeletesInParallel,
} from "@/lib/hydration/batchExecutor";
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
      cachedSecurityIntents: [
        {
          id: "security-intent-id",
          displayName: "[IHD] Baseline - MacOS - Firewall",
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const results = await executeDeletesInParallel([task], context);

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

    const results = await executeDeletesInParallel([task], context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/compliancePolicies/linux-compliance-id",
      "beta"
    );
  });

  it("skips batched baseline deletion when the matched policy still has assignments", async () => {
    const task: HydrationTask = {
      id: "baseline-settings-assigned",
      category: "baseline",
      operation: "delete",
      itemName: "Network security LAN Manager authentication level",
      status: "pending",
    };

    const client = {
      delete: vi.fn(),
      get: vi.fn().mockResolvedValue({ value: [{ id: "assignment-id" }] }),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
      batch: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-policy-id",
          name: "Network security: LAN Manager authentication level",
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const results = await executeDeleteTasksInBatches([task], context);

    expect(results).toEqual([
      expect.objectContaining({
        success: false,
        skipped: true,
        error: "Policy has 1 active assignment(s) - remove assignments before deleting",
      }),
    ]);
    expect(client.get).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies/settings-policy-id/assignments"
    );
    expect(client.batch).not.toHaveBeenCalled();
  });

  it("simulates batched preview deletions without calling Graph", async () => {
    const task: HydrationTask = {
      id: "conditional-access-preview-delete",
      category: "conditionalAccess",
      operation: "delete",
      itemName: "Require MFA",
      status: "pending",
    };

    const client = {
      delete: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
      batch: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
      cachedConditionalAccessPolicies: [
        {
          id: "ca-policy-id",
          displayName: "Require MFA [Imported by Intune Hydration Kit]",
        },
      ],
    };

    const results = await executeDeleteTasksInBatches([task], context);

    expect(results).toEqual([
      expect.objectContaining({
        success: true,
        skipped: false,
      }),
    ]);
    expect(task.status).toBe("success");
    expect(client.batch).not.toHaveBeenCalled();
  });

  it("treats batched 404 delete responses as already deleted", async () => {
    const task: HydrationTask = {
      id: "group-delete-404",
      category: "groups",
      operation: "delete",
      itemName: "[IHD] All Windows Devices",
      status: "pending",
    };

    const client = {
      delete: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
      batch: vi.fn().mockResolvedValue({
        responses: [{ id: "del-0", status: 404, headers: {} }],
      }),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedIntuneGroups: [
        {
          id: "group-id",
          "@odata.type": "#microsoft.graph.group",
          displayName: "[IHD] All Windows Devices",
          description: "Imported by Intune Hydration Kit",
          groupTypes: [],
          mailEnabled: false,
          mailNickname: "allwindowsdevices",
          securityEnabled: true,
        },
      ],
    };

    const results = await executeDeleteTasksInBatches([task], context);

    expect(results).toEqual([
      expect.objectContaining({
        success: false,
        skipped: true,
        error: "Already deleted",
      }),
    ]);
    expect(task.status).toBe("skipped");
    expect(client.batch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "del-0",
          method: "DELETE",
          url: "/groups/group-id",
        }),
      ],
      "v1.0"
    );
  });

  it("deletes baseline resources across endpoint types in a single batch", async () => {
    const tasks: HydrationTask[] = [
      {
        id: "baseline-v2-delete",
        category: "baseline",
        operation: "delete",
        itemName: "[IHD] Baseline V2 Compliance",
        status: "pending",
      },
      {
        id: "baseline-v1-delete",
        category: "baseline",
        operation: "delete",
        itemName: "[IHD] Baseline V1 Compliance",
        status: "pending",
      },
      {
        id: "baseline-device-config-delete",
        category: "baseline",
        operation: "delete",
        itemName: "[IHD] Baseline Device Configuration",
        status: "pending",
      },
      {
        id: "baseline-group-policy-delete-batch",
        category: "baseline",
        operation: "delete",
        itemName: "[IHD] Baseline Group Policy",
        status: "pending",
      },
      {
        id: "baseline-security-intent-delete-batch",
        category: "baseline",
        operation: "delete",
        itemName: "[IHD] Baseline Security Intent",
        status: "pending",
      },
      {
        id: "baseline-driver-update-delete",
        category: "baseline",
        operation: "delete",
        itemName: "[IHD] Baseline Driver Update",
        status: "pending",
      },
    ];

    const client = {
      delete: vi.fn(),
      get: vi.fn().mockResolvedValue({ value: [] }),
      post: vi.fn(),
      getCollection: vi.fn(),
      patch: vi.fn(),
      batch: vi.fn().mockResolvedValue({
        responses: tasks.map((_, index) => ({
          id: `del-${index}`,
          status: 204,
          headers: {},
        })),
      }),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedV2CompliancePolicies: [
        {
          id: "v2-compliance-id",
          name: "[IHD] Baseline V2 Compliance",
          description: "Imported by Intune Hydration Kit",
        },
      ],
      cachedCompliancePolicies: [
        {
          id: "v1-compliance-id",
          displayName: "[IHD] Baseline V1 Compliance",
          description: "Imported by Intune Hydration Kit",
        },
      ],
      cachedDeviceConfigurations: [
        {
          id: "device-config-id",
          displayName: "[IHD] Baseline Device Configuration",
          description: "Imported by Intune Hydration Kit",
        },
      ],
      cachedGroupPolicyConfigurations: [
        {
          id: "group-policy-id",
          displayName: "[IHD] Baseline Group Policy",
          description: "Imported by Intune Hydration Kit",
        },
      ],
      cachedSecurityIntents: [
        {
          id: "security-intent-id",
          displayName: "[IHD] Baseline Security Intent",
          description: "Imported by Intune Hydration Kit",
        },
      ],
      cachedDriverUpdateProfiles: [
        {
          id: "driver-update-id",
          displayName: "[IHD] Baseline Driver Update",
          description: "Imported by Intune Hydration Kit",
        },
      ],
      cachedAppProtectionPolicies: [
        ],
    };

    const results = await executeDeleteTasksInBatches(tasks, context);

    expect(results).toEqual(
      tasks.map((task) =>
        expect.objectContaining({
          task,
          success: true,
          skipped: false,
        })
      )
    );
    expect(client.get).toHaveBeenCalledTimes(6);
    expect(client.get).toHaveBeenCalledWith(
      "/deviceManagement/compliancePolicies/v2-compliance-id/assignments"
    );
    expect(client.get).toHaveBeenCalledWith(
      "/deviceManagement/deviceCompliancePolicies/v1-compliance-id/assignments"
    );
    expect(client.get).toHaveBeenCalledWith(
      "/deviceManagement/deviceConfigurations/device-config-id/assignments"
    );
    expect(client.get).toHaveBeenCalledWith(
      "/deviceManagement/groupPolicyConfigurations/group-policy-id/assignments"
    );
    expect(client.get).toHaveBeenCalledWith(
      "/deviceManagement/intents/security-intent-id/assignments"
    );
    expect(client.get).toHaveBeenCalledWith(
      "/deviceManagement/windowsDriverUpdateProfiles/driver-update-id/assignments"
    );
    expect(client.batch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "del-0",
          method: "DELETE",
          url: "/deviceManagement/compliancePolicies/v2-compliance-id",
        }),
        expect.objectContaining({
          id: "del-1",
          method: "DELETE",
          url: "/deviceManagement/deviceCompliancePolicies/v1-compliance-id",
        }),
        expect.objectContaining({
          id: "del-2",
          method: "DELETE",
          url: "/deviceManagement/deviceConfigurations/device-config-id",
        }),
        expect.objectContaining({
          id: "del-3",
          method: "DELETE",
          url: "/deviceManagement/groupPolicyConfigurations/group-policy-id",
        }),
        expect.objectContaining({
          id: "del-4",
          method: "DELETE",
          url: "/deviceManagement/intents/security-intent-id",
        }),
        expect.objectContaining({
          id: "del-5",
          method: "DELETE",
          url: "/deviceManagement/windowsDriverUpdateProfiles/driver-update-id",
        }),
      ],
      "beta"
    );
    expect(context.cachedV2CompliancePolicies).toEqual([]);
    expect(context.cachedCompliancePolicies).toEqual([]);
    expect(context.cachedDeviceConfigurations).toEqual([]);
    expect(context.cachedGroupPolicyConfigurations).toEqual([]);
    expect(context.cachedSecurityIntents).toEqual([]);
    expect(context.cachedDriverUpdateProfiles).toEqual([]);
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
          id: "ios-app-protection-id",
          "@odata.type": "#microsoft.graph.iosManagedAppProtection",
          displayName: "[IHD] iOS Baseline App Protection",
          description: "Imported by Intune Hydration Kit",
          _platform: "iOS",
        },
      ],
    };

    const results = await executeDeletesInParallel([task], context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceAppManagement/iosManagedAppProtections/ios-app-protection-id",
      "beta"
    );
  });
});
