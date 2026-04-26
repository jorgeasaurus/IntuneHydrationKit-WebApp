import { describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import {
  batchCreateGroups,
  batchDeleteGroups,
  createGroup,
  deleteGroup,
  deleteGroupByName,
  getAllGroups,
  getGroupById,
  getGroupByName,
  getGroupMemberCount,
  getHydrationKitGroups,
  getIntuneGroups,
  groupExists,
  updateGroup,
  validateMembershipRule,
} from "@/lib/graph/groups";
import { HYDRATION_MARKER, HYDRATION_MARKER_LEGACY } from "@/lib/utils/hydrationMarker";
import type { DeviceGroup } from "@/types/graph";

function makeGroup(overrides: Partial<DeviceGroup> = {}): DeviceGroup {
  return {
    "@odata.type": "#microsoft.graph.group",
    id: "group-id",
    displayName: "[IHD] Test Group",
    description: HYDRATION_MARKER,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "test-group",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "Windows")',
    membershipRuleProcessingState: "On",
    ...overrides,
  };
}

describe("graph/groups", () => {
  it("gets all groups and prefixed Intune groups through the expected collection queries", async () => {
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([makeGroup({ id: "all-1" })])
      .mockResolvedValueOnce([makeGroup({ id: "intune-1" })]);
    const client = { getCollection } as unknown as GraphClient;

    await expect(getAllGroups(client)).resolves.toEqual([makeGroup({ id: "all-1" })]);
    await expect(getIntuneGroups(client)).resolves.toEqual([makeGroup({ id: "intune-1" })]);

    expect(getCollection).toHaveBeenNthCalledWith(1, "/groups");
    expect(getCollection).toHaveBeenNthCalledWith(
      2,
      `/groups?$filter=${encodeURIComponent(
        "startswith(displayName,'[IHD] ') or startswith(displayName,'Intune - ') or startswith(displayName,'Entra - ')"
      )}&$select=id,displayName,description,membershipRule`
    );
  });

  it("merges hydration-kit group lookups across current and legacy markers without duplicates", async () => {
    const shared = makeGroup({ id: "shared", description: `${HYDRATION_MARKER_LEGACY} legacy` });
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([makeGroup({ id: "current" }), shared])
      .mockResolvedValueOnce([shared, makeGroup({ id: "legacy", description: HYDRATION_MARKER_LEGACY })]);
    const client = { getCollection } as unknown as GraphClient;

    const groups = await getHydrationKitGroups(client);

    expect(groups).toEqual([
      makeGroup({ id: "current" }),
      shared,
      makeGroup({ id: "legacy", description: HYDRATION_MARKER_LEGACY }),
    ]);
    expect(getCollection).toHaveBeenCalledTimes(2);
    expect(getCollection).toHaveBeenCalledWith(
      `/groups?$filter=${encodeURIComponent(
        `contains(description,'${HYDRATION_MARKER}')`
      )}&$select=id,displayName,description`
    );
    expect(getCollection).toHaveBeenCalledWith(
      `/groups?$filter=${encodeURIComponent(
        `contains(description,'${HYDRATION_MARKER_LEGACY}')`
      )}&$select=id,displayName,description`
    );
  });

  it("looks up groups by id and escaped display name and reports existence", async () => {
    const found = makeGroup({ id: "found", displayName: "O'Hara Devices" });
    const get = vi.fn().mockResolvedValue(found);
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([found])
      .mockResolvedValueOnce([]);
    const client = { get, getCollection } as unknown as GraphClient;

    await expect(getGroupById(client, "found")).resolves.toEqual(found);
    await expect(getGroupByName(client, "O'Hara Devices")).resolves.toEqual(found);
    await expect(groupExists(client, "Missing Group")).resolves.toBe(false);

    expect(get).toHaveBeenCalledWith("/groups/found");
    expect(getCollection).toHaveBeenNthCalledWith(
      1,
      `/groups?$filter=${encodeURIComponent("displayName eq 'O''Hara Devices'")}&$select=id,displayName,description`
    );
    expect(getCollection).toHaveBeenNthCalledWith(
      2,
      `/groups?$filter=${encodeURIComponent("displayName eq 'Missing Group'")}&$select=id,displayName,description`
    );
  });

  it("creates and updates groups while appending the hydration marker only when needed", async () => {
    const post = vi.fn().mockResolvedValue(makeGroup({ id: "created" }));
    const patch = vi.fn().mockResolvedValue(makeGroup({ id: "updated", displayName: "Updated Group" }));
    const client = { post, patch } as unknown as GraphClient;
    const withoutMarker = makeGroup({ description: "Existing description" });
    const withMarker = makeGroup({ description: `Already tagged ${HYDRATION_MARKER}` });

    await createGroup(client, withoutMarker);
    await createGroup(client, withMarker);
    await expect(updateGroup(client, "updated", { displayName: "Updated Group" })).resolves.toEqual(
      makeGroup({ id: "updated", displayName: "Updated Group" })
    );

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/groups",
      expect.objectContaining({ description: `Existing description ${HYDRATION_MARKER}` })
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/groups",
      expect.objectContaining({ description: `Already tagged ${HYDRATION_MARKER}` })
    );
    expect(patch).toHaveBeenCalledWith("/groups/updated", { displayName: "Updated Group" });
  });

  it("deletes only hydration-marked groups and supports deletion by name", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(makeGroup({ id: "delete-me" }))
      .mockResolvedValueOnce(makeGroup({ id: "named-delete", displayName: "Named Group" }));
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([makeGroup({ id: "named-delete", displayName: "Named Group" })])
      .mockResolvedValueOnce([]);
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { get, getCollection, delete: del } as unknown as GraphClient;

    await expect(deleteGroup(client, "delete-me")).resolves.toBeUndefined();
    await expect(deleteGroupByName(client, "Named Group")).resolves.toBeUndefined();
    await expect(deleteGroupByName(client, "Missing Group")).rejects.toThrow('Group "Missing Group" not found');

    expect(del).toHaveBeenNthCalledWith(1, "/groups/delete-me");
    expect(del).toHaveBeenNthCalledWith(2, "/groups/named-delete");
  });

  it("rejects deletion for groups without a hydration marker", async () => {
    const get = vi.fn().mockResolvedValue(makeGroup({ description: "Manually created" }));
    const del = vi.fn();
    const client = { get, delete: del } as unknown as GraphClient;

    await expect(deleteGroup(client, "unsafe-group")).rejects.toThrow(
      'Cannot delete group "[IHD] Test Group": Not created by Intune Hydration Kit'
    );
    expect(del).not.toHaveBeenCalled();
  });

  it("reports member counts and membership rule validation results", async () => {
    const get = vi.fn().mockResolvedValue({ value: [{ id: 1 }, { id: 2 }] });
    const post = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Rule syntax error"));
    const client = { get, post } as unknown as GraphClient;

    await expect(getGroupMemberCount(client, "group-1")).resolves.toBe(2);
    await expect(validateMembershipRule(client, "(device.deviceOSType -eq \"Windows\")")).resolves.toEqual({
      isValid: true,
    });
    await expect(validateMembershipRule(client, "invalid-rule")).resolves.toEqual({
      isValid: false,
      error: "Rule syntax error",
    });

    expect(get).toHaveBeenCalledWith("/groups/group-1/members/$count");
    expect(post).toHaveBeenNthCalledWith(
      1,
      "/groups/validateProperties",
      { entityType: "group", membershipRule: '(device.deviceOSType -eq "Windows")' },
      "v1.0"
    );
  });

  it("batch creates groups with existing, created, and errored outcomes", async () => {
    const existing = makeGroup({ displayName: "Existing Group" });
    const toCreate = makeGroup({ displayName: "Create Group", description: "Needs marker" });
    const failing = makeGroup({ displayName: "Fail Group" });
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Lookup failed"));
    const post = vi.fn().mockResolvedValue(makeGroup({ id: "created-id", displayName: "Create Group" }));
    const client = { getCollection, post } as unknown as GraphClient;

    const results = await batchCreateGroups(client, [existing, toCreate, failing]);

    expect(results).toEqual([
      { group: existing, success: false, error: "Group already exists" },
      { group: toCreate, success: true, id: "created-id" },
      { group: failing, success: false, error: "Lookup failed" },
    ]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("batch deletes groups and preserves per-item errors", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(makeGroup({ id: "safe-delete" }))
      .mockResolvedValueOnce(makeGroup({ id: "unsafe-delete", description: "Manual group" }));
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { get, delete: del } as unknown as GraphClient;

    const results = await batchDeleteGroups(client, ["safe-delete", "unsafe-delete"]);

    expect(results).toEqual([
      { groupId: "safe-delete", success: true },
      {
        groupId: "unsafe-delete",
        success: false,
        error: 'Cannot delete group "[IHD] Test Group": Not created by Intune Hydration Kit',
      },
    ]);
    expect(del).toHaveBeenCalledTimes(1);
  });
});
