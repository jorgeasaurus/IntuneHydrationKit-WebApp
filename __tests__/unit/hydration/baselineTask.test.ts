import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const { mockGetCachedTemplates } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

import { executeBaselineTask } from "@/lib/hydration/taskExecutors/baselineTask";

describe("executeBaselineTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips recreating OIB V1 compliance policies when a cached tenant match exists for an OData-unsafe name", async () => {
    const policyName = "[IHD] MacOS - OIB - Compliance - U - Device Health - v1.0";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "CompliancePolicies",
      },
    ]);

    const client = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: "new-policy-id" }),
      delete: vi.fn(),
      getCollection: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const task: HydrationTask = {
      id: "baseline-compliance-rerun",
      category: "baseline",
      operation: "create",
      itemName: policyName,
      status: "pending",
    };

    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedCompliancePolicies: [
        {
          id: "existing-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeBaselineTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(client.post).not.toHaveBeenCalled();
  });

  it("fetches V1 compliance policies for OData-unsafe names when the cache is empty and skips the duplicate", async () => {
    const policyName = "[IHD] Win - OIB - Compliance - U - Password - v3.1";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "CompliancePolicies",
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
      id: "baseline-compliance-rerun-fetch",
      category: "baseline",
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

    const result = await executeBaselineTask(task, context);

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
});
