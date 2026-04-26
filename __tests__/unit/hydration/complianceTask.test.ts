import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockGetCompliancePolicyByName,
  mockCreateV2CompliancePolicy,
  mockV2CompliancePolicyExists,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetCompliancePolicyByName: vi.fn(),
  mockCreateV2CompliancePolicy: vi.fn(),
  mockV2CompliancePolicyExists: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/templates", () => ({
  getCompliancePolicyByName: mockGetCompliancePolicyByName,
}));

vi.mock("@/lib/graph/compliance", () => ({
  createCompliancePolicy: vi.fn(),
  deleteCompliancePolicyByName: vi.fn(),
  compliancePolicyExists: vi.fn(),
}));

vi.mock("@/lib/hydration/policyCreators", () => ({
  createV2CompliancePolicy: mockCreateV2CompliancePolicy,
  v2CompliancePolicyExists: mockV2CompliancePolicyExists,
}));

import { executeComplianceTask } from "@/lib/hydration/taskExecutors/complianceTask";

describe("executeComplianceTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates Linux compliance policies through the V2 compliance endpoint", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Linux Compliance",
        description: "Linux Compliance, non-custom Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);
    mockCreateV2CompliancePolicy.mockResolvedValue({ id: "linux-policy-id" });
    mockV2CompliancePolicyExists.mockResolvedValue(false);

    const task: HydrationTask = {
      id: "create-linux-compliance",
      category: "compliance",
      operation: "create",
      itemName: "[IHD] Linux Compliance",
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
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedV2CompliancePolicies: [],
    };

    const result = await executeComplianceTask(task, context);

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "linux-policy-id",
    });
    expect(mockCreateV2CompliancePolicy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        displayName: "[IHD] Linux Compliance",
        platforms: "linux",
      })
    );
    expect(context.cachedV2CompliancePolicies).toContainEqual({
      id: "linux-policy-id",
      name: "[IHD] Linux Compliance",
      description: "Linux Compliance, non-custom Imported by Intune Hydration Kit",
    });
  });
});
