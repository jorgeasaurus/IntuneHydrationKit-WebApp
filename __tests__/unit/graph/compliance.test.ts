import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import {
  assignCompliancePolicy,
  batchCreateCompliancePolicies,
  batchDeleteCompliancePolicies,
  compliancePolicyExists,
  createCompliancePolicy,
  createDeviceComplianceScript,
  deleteCompliancePolicy,
  deleteCompliancePolicyByName,
  getAllCompliancePolicies,
  getAllDeviceComplianceScripts,
  getCompliancePoliciesByPlatform,
  getCompliancePolicyAssignments,
  getCompliancePolicyById,
  getCompliancePolicyByName,
  getCompliancePolicyDeviceStatus,
  getDeviceComplianceScriptByName,
  getHydrationKitCompliancePolicies,
  updateCompliancePolicy,
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
  it("gets compliance policies, hydration-marked subsets, platform subsets, and case-insensitive lookups", async () => {
    const allPolicies = [
      makePolicy({ id: "1" }),
      makePolicy({ id: "2", displayName: "Manual Policy", description: "Manual", "@odata.type": "#manual" }),
      makePolicy({ id: "3", displayName: "ANDROID BASELINE", "@odata.type": "#android" }),
    ];
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce(allPolicies)
      .mockResolvedValueOnce(allPolicies)
      .mockResolvedValueOnce(allPolicies)
      .mockResolvedValueOnce(allPolicies)
      .mockResolvedValueOnce(allPolicies);
    const get = vi.fn().mockResolvedValue(allPolicies[0]);
    const client = { getCollection, get } as unknown as GraphClient;

    await expect(getAllCompliancePolicies(client)).resolves.toEqual(allPolicies);
    await expect(getHydrationKitCompliancePolicies(client)).resolves.toEqual([allPolicies[0], allPolicies[2]]);
    await expect(getCompliancePoliciesByPlatform(client, "#android")).resolves.toEqual([allPolicies[2]]);
    await expect(getCompliancePolicyByName(client, "android baseline")).resolves.toEqual(allPolicies[2]);
    await expect(compliancePolicyExists(client, "missing policy")).resolves.toBe(false);
    await expect(getCompliancePolicyById(client, "policy-id")).resolves.toEqual(allPolicies[0]);

    expect(getCollection).toHaveBeenNthCalledWith(1, "/deviceManagement/deviceCompliancePolicies");
    expect(get).toHaveBeenCalledWith("/deviceManagement/deviceCompliancePolicies/policy-id");
  });

  it("gets device compliance scripts, supports case-insensitive lookup, and creates scripts with defaults", async () => {
    const scripts = [{ id: "script-1", displayName: "Custom Script", description: "existing" }];
    const getCollection = vi.fn().mockResolvedValue(scripts);
    const post = vi.fn().mockResolvedValue({ id: "script-2", displayName: "Created Script" });
    const client = { getCollection, post } as unknown as GraphClient;

    await expect(getAllDeviceComplianceScripts(client)).resolves.toEqual(scripts);
    await expect(getDeviceComplianceScriptByName(client, "custom script")).resolves.toEqual(scripts[0]);
    await expect(
      createDeviceComplianceScript(
        client,
        {
          detectionScriptContentBase64: "ZGV0ZWN0",
          runAs32Bit: true,
          enforceSignatureCheck: true,
        },
        "Fallback"
      )
    ).resolves.toEqual({ id: "script-2", displayName: "Created Script" });

    expect(post).toHaveBeenCalledWith("/deviceManagement/deviceComplianceScripts", {
      displayName: "Fallback Script",
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

  it("updates, assigns, and reads assignments for compliance policies", async () => {
    const patch = vi.fn().mockResolvedValue(makePolicy({ id: "updated", displayName: "Updated Policy" }));
    const post = vi.fn().mockResolvedValue({ ok: true });
    const getCollection = vi.fn().mockResolvedValue([{ id: "assignment-1" }]);
    const client = { patch, post, getCollection } as unknown as GraphClient;

    await expect(updateCompliancePolicy(client, "updated", { displayName: "Updated Policy" })).resolves.toEqual(
      makePolicy({ id: "updated", displayName: "Updated Policy" })
    );
    await expect(assignCompliancePolicy(client, "updated", "group-1", "filter-1", "include")).resolves.toEqual({ ok: true });
    await expect(getCompliancePolicyAssignments(client, "updated")).resolves.toEqual([{ id: "assignment-1" }]);

    expect(patch).toHaveBeenCalledWith("/deviceManagement/deviceCompliancePolicies/updated", {
      displayName: "Updated Policy",
    });
    expect(post).toHaveBeenCalledWith("/deviceManagement/deviceCompliancePolicies/updated/assignments", {
      target: {
        "@odata.type": "#microsoft.graph.groupAssignmentTarget",
        groupId: "group-1",
        deviceAndAppManagementAssignmentFilterId: "filter-1",
        deviceAndAppManagementAssignmentFilterType: "include",
      },
    });
  });

  it("deletes only hydration-marked unassigned compliance policies and supports deletion by name", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const get = vi
      .fn()
      .mockResolvedValueOnce(makePolicy({ id: "delete-me" }))
      .mockResolvedValueOnce(makePolicy({ id: "skip-me", displayName: "Assigned Policy" }))
      .mockResolvedValueOnce(makePolicy({ id: "unsafe", displayName: "Unsafe Policy", description: "Manual" }))
      .mockResolvedValueOnce(makePolicy({ id: "named-delete", displayName: "Named Policy" }));
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "assignment-1" }])
      .mockResolvedValueOnce([makePolicy({ id: "named-delete", displayName: "Named Policy" })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { get, getCollection, delete: del } as unknown as GraphClient;

    await expect(deleteCompliancePolicy(client, "delete-me")).resolves.toEqual({ deleted: true, skipped: false });
    await expect(deleteCompliancePolicy(client, "skip-me")).resolves.toEqual({
      deleted: false,
      skipped: true,
      reason: "Policy has 1 active assignment(s)",
    });
    await expect(deleteCompliancePolicy(client, "unsafe")).rejects.toThrow(
      'Cannot delete policy "Unsafe Policy": Not created by Intune Hydration Kit'
    );
    await expect(deleteCompliancePolicyByName(client, "Named Policy")).resolves.toEqual({ deleted: true, skipped: false });
    await expect(deleteCompliancePolicyByName(client, "Missing Policy")).rejects.toThrow(
      'Compliance policy "Missing Policy" not found'
    );

    expect(del).toHaveBeenNthCalledWith(1, "/deviceManagement/deviceCompliancePolicies/delete-me");
    expect(del).toHaveBeenNthCalledWith(2, "/deviceManagement/deviceCompliancePolicies/named-delete");
  });

  it("returns device status counts when available and zeroes when the status query fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        compliantDeviceCount: 4,
        nonCompliantDeviceCount: 1,
        errorDeviceCount: 2,
        conflictDeviceCount: 3,
      })
      .mockRejectedValueOnce(new Error("Unavailable"));
    const client = { get } as unknown as GraphClient;

    await expect(getCompliancePolicyDeviceStatus(client, "policy-1")).resolves.toEqual({
      compliantDeviceCount: 4,
      nonCompliantDeviceCount: 1,
      errorDeviceCount: 2,
      conflictDeviceCount: 3,
    });
    await expect(getCompliancePolicyDeviceStatus(client, "policy-2")).resolves.toEqual({
      compliantDeviceCount: 0,
      nonCompliantDeviceCount: 0,
      errorDeviceCount: 0,
      conflictDeviceCount: 0,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("batch creates and deletes compliance policies while preserving per-item outcomes", async () => {
    const existing = makePolicy({ displayName: "Existing Policy" });
    const toCreate = makePolicy({ displayName: "Create Policy", description: "Needs marker" });
    const failing = makePolicy({ displayName: "Fail Policy" });
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Lookup failed"))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const postNoRetry = vi.fn().mockResolvedValueOnce(makePolicy({ id: "created-id", displayName: "Create Policy" }));
    const get = vi
      .fn()
      .mockResolvedValueOnce(makePolicy({ id: "safe-delete" }))
      .mockResolvedValueOnce(makePolicy({ id: "unsafe-delete", displayName: "Unsafe Delete", description: "Manual" }));
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { getCollection, postNoRetry, get, delete: del } as unknown as GraphClient;

    await expect(batchCreateCompliancePolicies(client, [existing, toCreate, failing])).resolves.toEqual([
      { policy: existing, success: false, error: "Policy already exists" },
      { policy: toCreate, success: true, id: "created-id" },
      { policy: failing, success: false, error: "Lookup failed" },
    ]);
    await expect(batchDeleteCompliancePolicies(client, ["safe-delete", "unsafe-delete"])).resolves.toEqual([
      { policyId: "safe-delete", success: true },
      {
        policyId: "unsafe-delete",
        success: false,
        error: 'Cannot delete policy "Unsafe Delete": Not created by Intune Hydration Kit',
      },
    ]);
    expect(del).toHaveBeenCalledTimes(1);
  });
});
