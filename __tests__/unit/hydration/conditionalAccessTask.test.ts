import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockCreateConditionalAccessPolicy,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockCreateConditionalAccessPolicy: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/graph/conditionalAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/graph/conditionalAccess")>()),
  createConditionalAccessPolicy: mockCreateConditionalAccessPolicy,
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

  // The Premium P1/P2 license skips run before dispatch; see licenseGating.test.ts.

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
      cachedConditionalAccessPolicies: [],
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

  it("reports a policy that the tenant has no license for as blocked, and rethrows other errors", async () => {
    const policyName = "[IHD] Block all agent identities from accessing resources";
    const context: ExecutionContext = {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      hasConditionalAccessLicense: true,
      hasPremiumP2License: true,
      cachedConditionalAccessPolicies: [],
    };
    mockGetCachedTemplates.mockReturnValue([
      { displayName: policyName, state: "disabled", conditions: {}, grantControls: { operator: "OR", builtInControls: ["block"] } },
    ]);

    mockCreateConditionalAccessPolicy.mockRejectedValueOnce(
      new Error("[400] 1267: Cannot create or update Conditional Access policies that target agents. This capability requires a Microsoft Agent 365 or Microsoft 365 E7 license.")
    );
    await expect(executeConditionalAccessTask(createTask(policyName), context)).resolves.toMatchObject({
      success: false,
      skipped: true,
      skipKind: "blocked",
      error: "Requires a Microsoft Agent 365 or Microsoft 365 E7 license",
    });
    expect(context.cachedConditionalAccessPolicies).toEqual([]);

    mockCreateConditionalAccessPolicy.mockRejectedValueOnce(new Error("[403] Insufficient privileges"));
    await expect(executeConditionalAccessTask(createTask(policyName), context)).rejects.toThrow("Insufficient privileges");
  });

  it("skips create when a kit policy with the other marker format exists", async () => {
    const policyName = "[IHD] Require MFA";
    mockGetCachedTemplates.mockReturnValue([
      { displayName: policyName, state: "disabled", conditions: {}, grantControls: { operator: "OR", builtInControls: ["mfa"] } },
    ]);

    const result = await executeConditionalAccessTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedConditionalAccessPolicies: [{ id: "old", displayName: "Require MFA [Imported by Intune Hydration Kit]" }],
    });

    expect(result).toMatchObject({ skipped: true, skipKind: "noOp", error: "Already exists" });
    expect(mockCreateConditionalAccessPolicy).not.toHaveBeenCalled();
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
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
  });

});
