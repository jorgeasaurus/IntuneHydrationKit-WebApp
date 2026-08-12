import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import {
  compliancePolicyExists,
  createCompliancePolicy,
  deleteCompliancePolicyByName,
} from "@/lib/graph/compliance";
import { HYDRATION_MARKER } from "@/lib/utils/hydrationMarker";
import type { CompliancePolicy } from "@/types/graph";

function makePolicy(overrides: Partial<CompliancePolicy> = {}): CompliancePolicy {
  return {
    "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
    id: "policy-id",
    displayName: "Windows 11 - Security Baseline",
    description: HYDRATION_MARKER,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("graph/compliance", () => {
  it("checks policy existence with a case-insensitive display name", async () => {
    const allPolicies = [
      makePolicy({ id: "1" }),
      makePolicy({ id: "2", displayName: "Manual Policy", description: "Manual", "@odata.type": "#manual" }),
      makePolicy({ id: "3", displayName: "ANDROID BASELINE", "@odata.type": "#android" }),
    ];
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce(allPolicies)
      .mockResolvedValueOnce(allPolicies);
    const client = { getCollection } as unknown as GraphClient;

    await expect(compliancePolicyExists(client, "android baseline")).resolves.toBe(true);
    await expect(compliancePolicyExists(client, "missing policy")).resolves.toBe(false);

    expect(getCollection).toHaveBeenNthCalledWith(1, "/deviceManagement/deviceCompliancePolicies");
  });

  it("creates a missing custom compliance script with defaults", async () => {
    const getCollection = vi.fn().mockResolvedValue([]);
    const post = vi.fn().mockResolvedValue({ id: "script-2", displayName: "Created Script" });
    const postNoRetry = vi.fn().mockResolvedValue(makePolicy({ id: "created" }));
    const client = { getCollection, post, postNoRetry } as unknown as GraphClient;

    await createCompliancePolicy(
      client,
      makePolicy({
        deviceCompliancePolicyScript: {},
        deviceCompliancePolicyScriptDefinition: {
          detectionScriptContentBase64: "ZGV0ZWN0",
          runAs32Bit: true,
          enforceSignatureCheck: true,
          rules: { setting: "value" },
        },
      })
    );

    expect(post).toHaveBeenCalledWith("/deviceManagement/deviceComplianceScripts", {
      displayName: "Windows 11 - Security Baseline Script",
      description: "",
      publisher: "Publisher",
      runAs32Bit: true,
      runAsAccount: "system",
      enforceSignatureCheck: true,
      detectionScriptContent: "ZGV0ZWN0",
    });
  });

  it("creates a compliance policy without mutating the original payload and cleans invalid script references", async () => {
    const postNoRetry = vi.fn().mockResolvedValue(makePolicy({ id: "created" }));
    const client = { postNoRetry } as unknown as GraphClient;
    const policy = makePolicy({
      description: "Existing description",
      deviceCompliancePolicyScript: {
        deviceComplianceScriptId: "script-id",
        rulesContent: "cnVsZXM=",
        displayName: "remove-me",
      },
    });

    await createCompliancePolicy(client, policy);

    expect(postNoRetry).toHaveBeenCalledWith(
      "/deviceManagement/deviceCompliancePolicies",
      expect.objectContaining({
        description: `Existing description ${HYDRATION_MARKER}`,
        deviceCompliancePolicyScript: {
          deviceComplianceScriptId: "script-id",
          rulesContent: "cnVsZXM=",
        },
      })
    );
    expect(policy).toEqual(
      makePolicy({
        description: "Existing description",
        deviceCompliancePolicyScript: {
          deviceComplianceScriptId: "script-id",
          rulesContent: "cnVsZXM=",
          displayName: "remove-me",
        },
      })
    );
  });

  it("reuses an existing custom compliance script and posts resolved rules content", async () => {
    const postNoRetry = vi.fn().mockResolvedValue(makePolicy({ id: "created" }));
    const getCollection = vi.fn().mockResolvedValue([{ id: "script-123", displayName: "Baseline Script" }]);
    const client = { getCollection, postNoRetry } as unknown as GraphClient;
    const policy = makePolicy({
      description: "",
      deviceCompliancePolicyScript: { displayName: "ignore-me" },
      deviceCompliancePolicyScriptDefinition: {
        displayName: "Baseline Script",
        detectionScriptContentBase64: "ZGV0ZWN0",
        rules: { setting: "value" },
      },
    });

    await createCompliancePolicy(client, policy);

    expect(postNoRetry).toHaveBeenCalledWith(
      "/deviceManagement/deviceCompliancePolicies",
      expect.objectContaining({
        description: HYDRATION_MARKER,
        deviceCompliancePolicyScript: {
          deviceComplianceScriptId: "script-123",
          rulesContent: Buffer.from(JSON.stringify({ setting: "value" }), "utf8").toString("base64"),
        },
      })
    );
    expect(postNoRetry.mock.calls[0]?.[1]).not.toHaveProperty("deviceCompliancePolicyScriptDefinition");
  });

  it("throws helpful errors for incomplete custom compliance script definitions", async () => {
    const client = {
      getCollection: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({ id: "script-created" }),
      postNoRetry: vi.fn(),
    } as unknown as GraphClient;

    await expect(
      createCompliancePolicy(
        client,
        makePolicy({
          deviceCompliancePolicyScript: {},
          deviceCompliancePolicyScriptDefinition: {
            rules: { setting: "value" },
          },
        })
      )
    ).rejects.toThrow('Custom Compliance policy "Windows 11 - Security Baseline" missing detectionScriptContentBase64');

    await expect(
      createCompliancePolicy(
        client,
        makePolicy({
          deviceCompliancePolicyScript: {},
          deviceCompliancePolicyScriptDefinition: {
            detectionScriptContentBase64: "ZGV0ZWN0",
          },
        })
      )
    ).rejects.toThrow('Custom Compliance policy "Windows 11 - Security Baseline" missing rules');
  });

  it("deletes only hydration-marked unassigned compliance policies and supports deletion by name", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const get = vi
      .fn()
      .mockResolvedValueOnce(makePolicy({ id: "safe", displayName: "Safe Policy" }))
      .mockResolvedValueOnce(makePolicy({ id: "assigned", displayName: "Assigned Policy" }))
      .mockResolvedValueOnce(makePolicy({ id: "unsafe", displayName: "Unsafe Policy", description: "Manual" }));
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([makePolicy({ id: "safe", displayName: "Safe Policy" })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makePolicy({ id: "assigned", displayName: "Assigned Policy" })])
      .mockResolvedValueOnce([{ id: "assignment-1" }])
      .mockResolvedValueOnce([makePolicy({ id: "unsafe", displayName: "Unsafe Policy", description: "Manual" })])
      .mockResolvedValueOnce([]);
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { get, getCollection, delete: del } as unknown as GraphClient;

    await expect(deleteCompliancePolicyByName(client, "Safe Policy")).resolves.toEqual({ deleted: true, skipped: false });
    await expect(deleteCompliancePolicyByName(client, "Assigned Policy")).resolves.toEqual({
      deleted: false,
      skipped: true,
      reason: "Policy has 1 active assignment(s)",
    });
    await expect(deleteCompliancePolicyByName(client, "Unsafe Policy")).rejects.toThrow(
      'Cannot delete policy "Unsafe Policy": Not created by Intune Hydration Kit'
    );
    await expect(deleteCompliancePolicyByName(client, "Missing Policy")).rejects.toThrow(
      'Compliance policy "Missing Policy" not found'
    );

    expect(del).toHaveBeenCalledWith("/deviceManagement/deviceCompliancePolicies/safe");
  });
});
