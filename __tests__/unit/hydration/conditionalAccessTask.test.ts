import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockGetConditionalAccessPolicyByName,
  mockCreateConditionalAccessPolicy,
  mockDeleteConditionalAccessPolicyByName,
  mockConditionalAccessPolicyExists,
  mockPolicyRequiresPremiumP2,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetConditionalAccessPolicyByName: vi.fn(),
  mockCreateConditionalAccessPolicy: vi.fn(),
  mockDeleteConditionalAccessPolicyByName: vi.fn(),
  mockConditionalAccessPolicyExists: vi.fn(),
  mockPolicyRequiresPremiumP2: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/templates", () => ({
  getConditionalAccessPolicyByName: mockGetConditionalAccessPolicyByName,
}));

vi.mock("@/lib/graph/conditionalAccess", () => ({
  createConditionalAccessPolicy: mockCreateConditionalAccessPolicy,
  deleteConditionalAccessPolicyByName: mockDeleteConditionalAccessPolicyByName,
  conditionalAccessPolicyExists: mockConditionalAccessPolicyExists,
}));

vi.mock("@/lib/graph/conditionalAccessP2", () => ({
  policyRequiresPremiumP2: mockPolicyRequiresPremiumP2,
}));

import { executeConditionalAccessTask } from "@/lib/hydration/taskExecutors/conditionalAccessTask";

function createClient() {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    getCollection: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  } as unknown as ExecutionContext["client"];
}

function createTask(itemName: string, operation: HydrationTask["operation"] = "create"): HydrationTask {
  return {
    id: `${operation}-${itemName}`,
    category: "conditionalAccess",
    operation,
    itemName,
    status: "pending",
  };
}

describe("executeConditionalAccessTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedTemplates.mockReturnValue(undefined);
    mockGetConditionalAccessPolicyByName.mockReturnValue(undefined);
    mockConditionalAccessPolicyExists.mockResolvedValue(false);
    mockPolicyRequiresPremiumP2.mockReturnValue(false);
  });

  it("returns a failure when the conditional access template cannot be resolved", async () => {
    const result = await executeConditionalAccessTask(createTask("Missing CA Policy"), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "Template not found",
    });
  });

  it("skips create when the tenant lacks a Premium P1 license", async () => {
    const policyName = "[IHD] Require MFA";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        state: "disabled",
        conditions: {},
        grantControls: { operator: "OR", builtInControls: ["mfa"] },
      },
    ]);

    const result = await executeConditionalAccessTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      hasConditionalAccessLicense: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "No Entra ID Premium (P1) license",
    });
  });

  it("skips create when the policy requires Premium P2 but the tenant does not have it", async () => {
    const policyName = "[IHD] High Risk Users";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        state: "disabled",
        conditions: { userRiskLevels: ["high"] },
        grantControls: { operator: "OR", builtInControls: ["mfa"] },
      },
    ]);
    mockPolicyRequiresPremiumP2.mockReturnValue(true);

    const result = await executeConditionalAccessTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      hasConditionalAccessLicense: true,
      hasPremiumP2License: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Requires Premium P2 license",
    });
  });

  it("creates policies from simplified templates by expanding them to the Graph payload shape", async () => {
    const policyName = "[IHD] Require MFA";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        state: "disabled",
        conditions: { users: { includeUsers: ["All"] } },
        grantControls: { operator: "OR", builtInControls: ["mfa"] },
        sessionControls: { signInFrequency: { value: 1, type: "hours" } },
      },
    ]);
    mockCreateConditionalAccessPolicy.mockResolvedValue({ id: "ca-policy-id" });

    const result = await executeConditionalAccessTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      hasConditionalAccessLicense: true,
      hasPremiumP2License: true,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "ca-policy-id",
    });
    expect(mockCreateConditionalAccessPolicy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
        displayName: policyName,
        state: "disabled",
      })
    );
  });

  it("skips preview create when a normalized cached policy name already exists", async () => {
    const policyName = "[IHD] Require password change for high-risk users";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        state: "disabled",
        conditions: {},
        grantControls: { operator: "OR", builtInControls: ["mfa"] },
      },
    ]);

    const result = await executeConditionalAccessTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
      hasConditionalAccessLicense: true,
      cachedConditionalAccessPolicies: [
        {
          id: "ca-id",
          displayName: `${policyName} [Imported by Intune Hydration Kit]`,
          description: undefined,
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
  });

  it("supports preview deletes after confirming the policy exists in the tenant", async () => {
    const policyName = "[IHD] Require MFA";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        state: "disabled",
        conditions: {},
        grantControls: { operator: "OR", builtInControls: ["mfa"] },
      },
    ]);
    mockConditionalAccessPolicyExists.mockResolvedValue(true);

    const result = await executeConditionalAccessTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
    });
  });

  it("turns delete failures into skipped results with the Graph error message", async () => {
    const policyName = "[IHD] Require MFA";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        state: "disabled",
        conditions: {},
        grantControls: { operator: "OR", builtInControls: ["mfa"] },
      },
    ]);
    mockConditionalAccessPolicyExists.mockResolvedValue(true);
    mockDeleteConditionalAccessPolicyByName.mockRejectedValue(
      new Error("Policy must be disabled before deletion")
    );

    const result = await executeConditionalAccessTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Policy must be disabled before deletion",
    });
  });
});
