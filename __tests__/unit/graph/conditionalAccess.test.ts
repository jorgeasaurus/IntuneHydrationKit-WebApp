import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildConditionalAccessCreatePlan,
  createConditionalAccessPolicy,
  findHydrationConditionalAccessPolicy,
  getConditionalAccessDeleteBlockReason,
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

  it("preserves the legacy short marker in create plans", () => {
    const { payload } = buildConditionalAccessCreatePlan(
      createPolicy({ displayName: "Legacy policy [Intune Hydration Kit]" }) as unknown as Record<string, unknown>
    );

    expect(payload.displayName).toBe("Legacy policy [Intune Hydration Kit]");
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

  it("sends the agent users template to beta with the agents condition, not the retired users value", () => {
    const template = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "public/IntuneTemplates/ConditionalAccess/Block all agent users from accessing resources.json"),
        "utf8"
      )
    ) as Record<string, unknown>;

    const plan = buildConditionalAccessCreatePlan({ ...template, displayName: "[IHD] Block all agent users from accessing resources" });
    const conditions = plan.payload.conditions as { users: { includeUsers: string[] }; agents: Record<string, unknown> };

    expect(plan.apiVersion).toBe("beta");
    expect(plan.payload.state).toBe("disabled");
    // Graph error 1342: 'AllAgentIdUsers' in the users condition is no longer supported.
    expect(JSON.stringify(plan.payload)).not.toContain("AllAgentIdUsers");
    expect(conditions.users.includeUsers).toEqual(["None"]);
    expect(conditions.agents).toEqual({ includeAgentUsers: ["All"], excludeAgentUsers: [] });
  });

  it.each([
    ["Block all agent identities from accessing resources.json"],
    ["Block high risk agent identities from accessing resources.json"],
  ])("sends %s to beta, because v1.0 has no agent conditions", (file) => {
    const template = JSON.parse(
      readFileSync(path.join(process.cwd(), "public/IntuneTemplates/ConditionalAccess", file), "utf8")
    ) as Record<string, unknown>;

    expect(buildConditionalAccessCreatePlan({ ...template, displayName: "[IHD] Agent policy" }).apiVersion).toBe("beta");
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

  it("matches current and legacy marker formats and rejects unmarked name collisions", () => {
    const policies = [
      createPolicy({ id: "unmarked", displayName: "Require MFA" }),
      createPolicy({ id: "current", displayName: "Block legacy auth [Imported by Intune Hydration Kit]" }),
      createPolicy({ id: "legacy", displayName: "Legacy policy [Imported by Intune-Hydration-Kit]" }),
      createPolicy({ id: "short", displayName: "Short legacy policy [Intune Hydration Kit]" }),
      createPolicy({ id: "prefix", displayName: "[IHD] Prefix policy" }),
    ];

    expect(findHydrationConditionalAccessPolicy(policies, "Block legacy auth")?.id).toBe("current");
    expect(findHydrationConditionalAccessPolicy(policies, "Require MFA")).toBeNull();
    expect(findHydrationConditionalAccessPolicy(policies, "Legacy policy")?.id).toBe("legacy");
    expect(findHydrationConditionalAccessPolicy(policies, "Short legacy policy")?.id).toBe("short");
    expect(findHydrationConditionalAccessPolicy(policies, "[IHD] Prefix policy")?.id).toBe("prefix");
  });

  it("prefers the current marker when duplicate legacy names exist", () => {
    const policies = [
      createPolicy({ id: "legacy", displayName: "Duplicate policy [Imported by Intune-Hydration-Kit]" }),
      createPolicy({ id: "current", displayName: "Duplicate policy [Imported by Intune Hydration Kit]" }),
    ];

    expect(findHydrationConditionalAccessPolicy(policies, "Duplicate policy")?.id).toBe("current");
  });

  it("reads the policy again and blocks delete unless it is marked and disabled", async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce(createPolicy({ displayName: "Unsafe policy" }))
        .mockResolvedValueOnce(createPolicy({ displayName: "[IHD] Enabled policy", state: "enabled" }))
        .mockResolvedValueOnce(createPolicy({ displayName: "[IHD] Safe policy", state: "disabled" }))
        .mockRejectedValueOnce(new Error("[503] Service unavailable")),
    } as const;

    await expect(getConditionalAccessDeleteBlockReason(client as never, "unsafe")).resolves.toContain(
      "Not created by Intune Hydration Kit"
    );
    await expect(getConditionalAccessDeleteBlockReason(client as never, "enabled")).resolves.toContain(
      'Policy state is "enabled"'
    );
    await expect(getConditionalAccessDeleteBlockReason(client as never, "safe")).resolves.toBeNull();
    await expect(getConditionalAccessDeleteBlockReason(client as never, "error")).rejects.toThrow("[503]");

    expect(client.get).toHaveBeenCalledWith("/identity/conditionalAccess/policies/unsafe");
  });
});
