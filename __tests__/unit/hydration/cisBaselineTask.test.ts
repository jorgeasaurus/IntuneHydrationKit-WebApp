import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetAllTemplateCacheKeys, mockGetCachedTemplates } = vi.hoisted(() => ({
  mockGetAllTemplateCacheKeys: vi.fn(),
  mockGetCachedTemplates: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getAllTemplateCacheKeys: mockGetAllTemplateCacheKeys,
  getCachedTemplates: mockGetCachedTemplates,
}));

import { executeCISBaselineTask } from "@/lib/hydration/taskExecutors/cisBaselineTask";

describe("executeCISBaselineTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches V1 compliance policies for OData-unsafe CIS names and skips duplicates", async () => {
    const policyName = "[IHD] Baseline - Windows - System Security without Defender";

    mockGetAllTemplateCacheKeys.mockReturnValue([
      "intune-hydration-templates-cisBaseline-cis-windows-11",
    ]);
    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _cisFilePath: "8.0 - Windows 11 Benchmarks/Windows 11 Compliance/Baseline - Windows - System Security without Defender.json",
      },
    ]);

    const client = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: "new-policy-id" }),
      delete: vi.fn(),
      getCollection: vi.fn().mockResolvedValue([
        {
          id: "existing-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ]),
    } as unknown as ExecutionContext["client"];

    const task: HydrationTask = {
      id: "cis-baseline-rerun",
      category: "cisBaseline",
      operation: "create",
      itemName: policyName,
      status: "pending",
    };

    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeCISBaselineTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(client.getCollection).toHaveBeenCalledWith(
      "/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description"
    );
    expect(client.post).not.toHaveBeenCalled();
  });

  it("deletes group policy configurations for unsupported CIS templates when a cached match exists", async () => {
    const policyName = "[IHD] CISv1 - VS Code - L1 - Ensure UpdateMode is set to Enabled";

    mockGetAllTemplateCacheKeys.mockReturnValue([
      "intune-hydration-templates-cisBaseline-cis-visual-studio",
    ]);
    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.groupPolicyConfiguration",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _cisFilePath: "4.0 - CIS Benchmarks/CIS - Visual Studio Code/CISv1 - VS Code - L1 - Ensure UpdateMode is set to Enabled.json",
      },
    ]);

    const client = {
      get: vi.fn().mockResolvedValue({ value: [] }),
      post: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      getCollection: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const task: HydrationTask = {
      id: "cis-baseline-group-policy-delete",
      category: "cisBaseline",
      operation: "delete",
      itemName: policyName,
      status: "pending",
    };

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedGroupPolicyConfigurations: [
        {
          id: "group-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: false,
    });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/groupPolicyConfigurations/group-policy-id"
    );
  });
});
