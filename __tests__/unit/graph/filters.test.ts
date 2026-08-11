import { describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import { createFilter, getAllFilters } from "@/lib/graph/filters";
import { HYDRATION_MARKER } from "@/lib/utils/hydrationMarker";
import type { DeviceFilter } from "@/types/graph";

function makeFilter(overrides: Partial<DeviceFilter> = {}): DeviceFilter {
  return {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    id: "filter-id",
    displayName: "Corporate Windows",
    description: HYDRATION_MARKER,
    platform: "windows10AndLater",
    rule: '(device.deviceOwnership -eq "Corporate")',
    roleScopeTags: ["0"],
    ...overrides,
  };
}

describe("graph/filters", () => {
  it("gets all tenant filters with the fields required by execution", async () => {
    const filters = [makeFilter()];
    const getCollection = vi.fn().mockResolvedValue(filters);
    const client = { getCollection } as unknown as GraphClient;

    await expect(getAllFilters(client)).resolves.toEqual(filters);
    expect(getCollection).toHaveBeenCalledWith(
      "/deviceManagement/assignmentFilters?$select=id,displayName,description,platform,rule"
    );
  });

  it("creates filters while appending the hydration marker only when needed", async () => {
    const post = vi.fn().mockResolvedValue(makeFilter({ id: "created" }));
    const client = { post } as unknown as GraphClient;
    const withoutMarker = makeFilter({ description: "Scoped filter" });
    const withMarker = makeFilter({ description: `Tagged ${HYDRATION_MARKER}` });

    await createFilter(client, withoutMarker);
    await createFilter(client, withMarker);

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/deviceManagement/assignmentFilters",
      expect.objectContaining({ description: `Scoped filter ${HYDRATION_MARKER}` })
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/deviceManagement/assignmentFilters",
      expect.objectContaining({ description: `Tagged ${HYDRATION_MARKER}` })
    );
  });
});
