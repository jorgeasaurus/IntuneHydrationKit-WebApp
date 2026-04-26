import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchCreateConditionalAccessPolicies,
  batchDeleteConditionalAccessPolicies,
  batchDisableConditionalAccessPolicies,
  createConditionalAccessPolicy,
  deleteConditionalAccessPolicy,
  deleteConditionalAccessPolicyByName,
  enableConditionalAccessPolicy,
  getConditionalAccessPolicyByName,
  getHydrationKitConditionalAccessPolicies,
  validateConditionalAccessPolicy,
} from "@/lib/graph/conditionalAccess";
import { HYDRATION_MARKER } from "@/lib/utils/hydrationMarker";
import type { ConditionalAccessPolicy } from "@/types/graph";

function createPolicy(
  overrides: Partial<ConditionalAccessPolicy> = {}
): ConditionalAccessPolicy {
  return {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    id: "policy-id",
    displayName: "Require MFA",
    state: "disabled",
    conditions: {},
    grantControls: { operator: "OR", builtInControls: ["mfa"] },
    ...overrides,
  };
}

describe("conditionalAccess graph helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters hydration kit policies and matches legacy marker formats by name", async () => {
    const client = {
      getCollection: vi.fn().mockResolvedValue([
        createPolicy({ displayName: "Require MFA" }),
        createPolicy({ displayName: "[IHD] Require compliant device" }),
        createPolicy({ displayName: "Require phishing-resistant MFA [Intune Hydration Kit]" }),
        createPolicy({ displayName: "Block legacy auth [Imported by Intune Hydration Kit]" }),
      ]),
    } as const;

    await expect(getHydrationKitConditionalAccessPolicies(client as never)).resolves.toEqual([
      expect.objectContaining({ displayName: "[IHD] Require compliant device" }),
      expect.objectContaining({
        displayName: "Block legacy auth [Imported by Intune Hydration Kit]",
      }),
    ]);

    await expect(
      getConditionalAccessPolicyByName(client as never, "Block legacy auth")
    ).resolves.toEqual(
      expect.objectContaining({
        displayName: "Block legacy auth [Imported by Intune Hydration Kit]",
      })
    );

    await expect(
      getConditionalAccessPolicyByName(client as never, "Require MFA")
    ).resolves.toBeNull();
  });

  it("forces created policies to disabled state and appends the hydration marker once", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ id: "created-id" }),
    } as const;

    const created = await createConditionalAccessPolicy(
      client as never,
      createPolicy({ displayName: "Block legacy auth", state: "enabled" })
    );

    expect(created).toEqual({ id: "created-id" });
    expect(client.post).toHaveBeenCalledWith(
      "/identity/conditionalAccess/policies",
      expect.objectContaining({
        displayName: `Block legacy auth [${HYDRATION_MARKER}]`,
        state: "disabled",
      })
    );
  });

  it("enables only hydration-kit policies", async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce(createPolicy({ displayName: "Require MFA" }))
        .mockResolvedValueOnce(
          createPolicy({
            displayName: "[IHD] Require compliant device",
          })
        ),
      patch: vi.fn().mockResolvedValue({ id: "policy-id", state: "enabled" }),
    } as const;

    await expect(enableConditionalAccessPolicy(client as never, "policy-id")).rejects.toThrow(
      'Cannot enable policy "Require MFA": Not created by Intune Hydration Kit'
    );

    await expect(enableConditionalAccessPolicy(client as never, "policy-id")).resolves.toEqual({
      id: "policy-id",
      state: "enabled",
    });
    expect(client.patch).toHaveBeenCalledWith(
      "/identity/conditionalAccess/policies/policy-id",
      { state: "enabled" }
    );
  });

  it("enforces marker and disabled-state safety checks before deletion", async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce(createPolicy({ displayName: "Require MFA" }))
        .mockResolvedValueOnce(
          createPolicy({
            displayName: "[IHD] Require compliant device",
            state: "enabled",
          })
        )
        .mockResolvedValueOnce(
          createPolicy({
            id: "delete-me",
            displayName: "[IHD] Block legacy auth",
            state: "disabled",
          })
        ),
      delete: vi.fn().mockResolvedValue(undefined),
    } as const;

    await expect(deleteConditionalAccessPolicy(client as never, "policy-a")).rejects.toThrow(
      'Cannot delete policy "Require MFA": Not created by Intune Hydration Kit'
    );

    await expect(deleteConditionalAccessPolicy(client as never, "policy-b")).rejects.toThrow(
      'Cannot delete policy "[IHD] Require compliant device": Policy must be disabled before deletion. Current state: enabled'
    );

    await expect(deleteConditionalAccessPolicy(client as never, "delete-me")).resolves.toBeUndefined();
    expect(client.delete).toHaveBeenCalledWith(
      "/identity/conditionalAccess/policies/delete-me"
    );
  });

  it("supports delete-by-name and aggregates batch create/delete/disable outcomes", async () => {
    const existingPolicy = createPolicy({
      id: "existing-id",
      displayName: "Existing policy [Imported by Intune Hydration Kit]",
    });
    const createError = new Error("Graph create failed");
    const deleteError = new Error("Delete blocked");
    const disableError = new Error("Patch failed");

    const client = {
      getCollection: vi.fn().mockResolvedValue([existingPolicy]),
      post: vi
        .fn()
        .mockResolvedValueOnce({ id: "created-id" })
        .mockRejectedValueOnce(createError),
      get: vi
        .fn()
        .mockResolvedValueOnce(existingPolicy)
        .mockResolvedValueOnce(
          createPolicy({
            id: "delete-ok",
            displayName: "[IHD] Delete ok",
          })
        )
        .mockResolvedValueOnce(
          createPolicy({
            id: "delete-bad",
            displayName: "[IHD] Delete bad",
          })
        ),
      delete: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(deleteError),
      patch: vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(disableError),
    } as const;

    await expect(
      deleteConditionalAccessPolicyByName(client as never, "Existing policy")
    ).resolves.toBeUndefined();

    const createResults = await batchCreateConditionalAccessPolicies(client as never, [
      createPolicy({ displayName: "Existing policy" }),
      createPolicy({ displayName: "Create ok" }),
      createPolicy({ displayName: "Create bad" }),
    ]);

    expect(createResults).toEqual([
      expect.objectContaining({
        policy: expect.objectContaining({ displayName: "Existing policy" }),
        success: false,
        error: "Policy already exists",
      }),
      expect.objectContaining({
        policy: expect.objectContaining({ displayName: `Create ok [${HYDRATION_MARKER}]` }),
        success: true,
        id: "created-id",
      }),
      expect.objectContaining({
        policy: expect.objectContaining({ displayName: `Create bad [${HYDRATION_MARKER}]` }),
        success: false,
        error: "Graph create failed",
      }),
    ]);

    await expect(
      batchDeleteConditionalAccessPolicies(client as never, ["delete-ok", "delete-bad"])
    ).resolves.toEqual([
      { policyId: "delete-ok", success: true },
      { policyId: "delete-bad", success: false, error: "Delete blocked" },
    ]);

    await expect(
      batchDisableConditionalAccessPolicies(client as never, ["disable-ok", "disable-bad"])
    ).resolves.toEqual([
      { policyId: "disable-ok", success: true },
      { policyId: "disable-bad", success: false, error: "Patch failed" },
    ]);
  });

  it("validates required conditional access policy fields", () => {
    expect(
      validateConditionalAccessPolicy(
        createPolicy({
          displayName: "",
          conditions: undefined as never,
          grantControls: undefined,
          sessionControls: undefined,
          state: "enabled",
        })
      )
    ).toEqual({
      isValid: false,
      errors: [
        "Policy must have a display name",
        "Policy must have conditions defined",
        "Policy must have either grant controls or session controls",
        "Policy state must be 'disabled' for safety",
      ],
    });
  });
});
