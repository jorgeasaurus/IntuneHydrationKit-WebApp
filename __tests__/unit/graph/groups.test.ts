import { describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import {
  createGroup,
  deleteGroupByName,
  getIntuneGroups,
} from "@/lib/graph/groups";
import { HYDRATION_MARKER } from "@/lib/utils/hydrationMarker";
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
  it("gets prefixed Intune groups through the expected collection query", async () => {
    const getCollection = vi.fn().mockResolvedValue([makeGroup({ id: "intune-1" })]);
    const client = { getCollection } as unknown as GraphClient;

    await expect(getIntuneGroups(client)).resolves.toEqual([makeGroup({ id: "intune-1" })]);

    expect(getCollection).toHaveBeenCalledWith(
      `/groups?$filter=${encodeURIComponent(
        "startswith(displayName,'[IHD] ') or startswith(displayName,'Intune - ') or startswith(displayName,'Entra - ')"
      )}&$select=id,displayName,description,membershipRule`
    );
  });

  it("creates groups while appending the hydration marker only when needed", async () => {
    const post = vi.fn().mockResolvedValue(makeGroup({ id: "created" }));
    const client = { post } as unknown as GraphClient;
    const withoutMarker = makeGroup({ description: "Existing description" });
    const withMarker = makeGroup({ description: `Already tagged ${HYDRATION_MARKER}` });

    await createGroup(client, withoutMarker);
    await createGroup(client, withMarker);

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
  });

  it("deletes a hydration-marked group by escaped display name", async () => {
    const get = vi.fn().mockResolvedValue(makeGroup({ id: "named-delete", displayName: "O'Hara Group" }));
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([makeGroup({ id: "named-delete", displayName: "O'Hara Group" })])
      .mockResolvedValueOnce([]);
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { get, getCollection, delete: del } as unknown as GraphClient;

    await expect(deleteGroupByName(client, "O'Hara Group")).resolves.toBeUndefined();
    await expect(deleteGroupByName(client, "Missing Group")).rejects.toThrow('Group "Missing Group" not found');

    expect(getCollection).toHaveBeenNthCalledWith(
      1,
      `/groups?$filter=${encodeURIComponent("displayName eq 'O''Hara Group'")}&$select=id,displayName,description`
    );
    expect(del).toHaveBeenCalledWith("/groups/named-delete");
  });

  it("rejects deletion for groups without a hydration marker", async () => {
    const get = vi.fn().mockResolvedValue(makeGroup({ description: "Manually created" }));
    const del = vi.fn();
    const getCollection = vi.fn().mockResolvedValue([makeGroup({ description: "Manually created" })]);
    const client = { get, getCollection, delete: del } as unknown as GraphClient;

    await expect(deleteGroupByName(client, "[IHD] Test Group")).rejects.toThrow(
      'Cannot delete group "[IHD] Test Group": Not created by Intune Hydration Kit'
    );
    expect(del).not.toHaveBeenCalled();
  });

  it("uses the group id when an unsafe deletion response has no display name", async () => {
    const get = vi.fn().mockResolvedValue(
      makeGroup({ displayName: undefined, description: "Manually created" })
    );
    const getCollection = vi.fn().mockResolvedValue([
      makeGroup({ id: "sparse-group", displayName: "Sparse Group" }),
    ]);
    const client = { get, getCollection, delete: vi.fn() } as unknown as GraphClient;

    await expect(deleteGroupByName(client, "Sparse Group")).rejects.toThrow(
      'Cannot delete group "sparse-group": Not created by Intune Hydration Kit'
    );
  });
});
