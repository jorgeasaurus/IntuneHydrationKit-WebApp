import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildConditionalAccessCreatePlan,
  conditionalAccessPolicyExists,
  createConditionalAccessPolicy,
  deleteConditionalAccessPolicyByName,
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

  it("matches current marker formats and rejects unmarked name collisions", async () => {
    const client = {
      getCollection: vi.fn().mockResolvedValue([
        createPolicy({ displayName: "Require MFA" }),
        createPolicy({ displayName: "Block legacy auth [Imported by Intune Hydration Kit]" }),
        createPolicy({ displayName: "Legacy policy [Imported by Intune-Hydration-Kit]" }),
        createPolicy({ displayName: "[IHD] Prefix policy" }),
      ]),
    } as const;

    await expect(
      conditionalAccessPolicyExists(client as never, "Block legacy auth")
    ).resolves.toBe(true);
    await expect(
      conditionalAccessPolicyExists(client as never, "Require MFA")
    ).resolves.toBe(false);
    await expect(
      conditionalAccessPolicyExists(client as never, "Legacy policy")
    ).resolves.toBe(true);
    await expect(
      conditionalAccessPolicyExists(client as never, "Prefix policy")
    ).resolves.toBe(true);
  });

  it("forces created policies to disabled state and appends the marker once", async () => {
    const client = { post: vi.fn().mockResolvedValue({ id: "created-id" }) } as const;

    await createConditionalAccessPolicy(
      client as never,
      createPolicy({ displayName: "Block legacy auth", state: "enabled" })
    );

    expect(client.post).toHaveBeenCalledWith(
      "/identity/conditionalAccess/policies",
      expect.objectContaining({
        displayName: `Block legacy auth [${HYDRATION_MARKER}]`,
        state: "disabled",
      }),
      "v1.0"
    );
  });

  it("uses beta only for beta-only create features", () => {
    const stablePlan = buildConditionalAccessCreatePlan(
      createPolicy({ displayName: "Require compliant device (Preview)" }) as unknown as Record<string, unknown>
    );
    const betaPlan = buildConditionalAccessCreatePlan(
      createPolicy({
        displayName: "Secure account recovery with identity verification (Preview)",
        conditions: {
          applications: { includeUserActions: ["urn:user:accountrecovery"] },
        },
        grantControls: { operator: "AND", builtInControls: ["verifiedID"] },
      }) as unknown as Record<string, unknown>
    );

    expect(stablePlan.apiVersion).toBe("v1.0");
    expect(betaPlan.apiVersion).toBe("beta");
  });

  it("strips exported Graph response metadata from create plans", () => {
    const { payload } = buildConditionalAccessCreatePlan({
      "@odata.context": "metadata",
      "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
      id: "exported-policy-id",
      createdDateTime: "2026-05-30T18:00:00Z",
      modifiedDateTime: null,
      displayName: "Secure account recovery",
      state: "enabled",
      sessionControls: null,
      conditions: {
        locations: null,
        applications: {
          includeUserActions: ["urn:user:accountrecovery"],
          networkAccess: null,
        },
      },
      grantControls: {
        "authenticationStrength@odata.context": "metadata",
        authenticationStrength: null,
        operator: "AND",
        builtInControls: ["verifiedID"],
      },
    });

    expect(payload).not.toHaveProperty("@odata.context");
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("createdDateTime");
    expect(payload).not.toHaveProperty("modifiedDateTime");
    expect(payload).not.toHaveProperty("sessionControls");
    expect(payload).toHaveProperty("@odata.type", "#microsoft.graph.conditionalAccessPolicy");
    expect(payload).toHaveProperty("state", "disabled");

    const grantControls = payload.grantControls as Record<string, unknown>;
    expect(grantControls).not.toHaveProperty("authenticationStrength@odata.context");
    expect(grantControls).not.toHaveProperty("authenticationStrength");
  });

  it("enforces marker and disabled-state safety before deletion by name", async () => {
    const markedUnsafe = createPolicy({
      id: "unsafe",
      displayName: "Unsafe policy [Imported by Intune Hydration Kit]",
    });
    const enabled = createPolicy({
      id: "enabled",
      displayName: "Enabled policy [Imported by Intune Hydration Kit]",
      state: "enabled",
    });
    const safe = createPolicy({
      id: "safe",
      displayName: "Safe policy [Imported by Intune Hydration Kit]",
    });
    const client = {
      getCollection: vi
        .fn()
        .mockResolvedValueOnce([markedUnsafe])
        .mockResolvedValueOnce([enabled])
        .mockResolvedValueOnce([safe])
        .mockResolvedValueOnce([]),
      get: vi
        .fn()
        .mockResolvedValueOnce(createPolicy({ id: "unsafe", displayName: "Unsafe policy" }))
        .mockResolvedValueOnce(enabled)
        .mockResolvedValueOnce(safe),
      delete: vi.fn().mockResolvedValue(undefined),
    } as const;

    await expect(
      deleteConditionalAccessPolicyByName(client as never, "Unsafe policy")
    ).rejects.toThrow('Cannot delete policy "Unsafe policy": Not created by Intune Hydration Kit');
    await expect(
      deleteConditionalAccessPolicyByName(client as never, "Enabled policy")
    ).rejects.toThrow("Policy must be disabled before deletion");
    await expect(
      deleteConditionalAccessPolicyByName(client as never, "Safe policy")
    ).resolves.toBeUndefined();
    await expect(
      deleteConditionalAccessPolicyByName(client as never, "Missing policy")
    ).rejects.toThrow('Conditional access policy "Missing policy" not found');

    expect(client.delete).toHaveBeenCalledWith(
      "/identity/conditionalAccess/policies/safe"
    );
  });
});
