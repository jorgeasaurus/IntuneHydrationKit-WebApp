import { describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import {
  batchCreateFilters,
  batchDeleteFilters,
  createFilter,
  deleteFilter,
  deleteFilterByName,
  filterExists,
  getAllFilters,
  getDevicesMatchingFilter,
  getFilterById,
  getFilterByName,
  getFiltersByPlatform,
  getHydrationKitFilters,
  updateFilter,
  validateFilterRule,
} from "@/lib/graph/filters";
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
  it("gets all filters, hydration-marked filters, and platform subsets", async () => {
    const allFilters = [
      makeFilter({ id: "1" }),
      makeFilter({ id: "2", description: "Manual filter", platform: "android" }),
      makeFilter({ id: "3", description: `[IHD] prefixed`, platform: "android" }),
    ];
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce(allFilters)
      .mockResolvedValueOnce(allFilters)
      .mockResolvedValueOnce(allFilters);
    const client = { getCollection } as unknown as GraphClient;

    await expect(getAllFilters(client)).resolves.toEqual(allFilters);
    await expect(getHydrationKitFilters(client)).resolves.toEqual([allFilters[0], allFilters[2]]);
    await expect(getFiltersByPlatform(client, "android")).resolves.toEqual([allFilters[1], allFilters[2]]);

    expect(getCollection).toHaveBeenNthCalledWith(
      1,
      "/deviceManagement/assignmentFilters?$select=id,displayName,description,platform,rule"
    );
  });

  it("looks up filters by id and case-insensitive display name and reports existence", async () => {
    const named = makeFilter({ id: "named", displayName: "Corporate iOS", platform: "iOS" });
    const get = vi.fn().mockResolvedValue(named);
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([named])
      .mockResolvedValueOnce([named])
      .mockResolvedValueOnce([]);
    const client = { get, getCollection } as unknown as GraphClient;

    await expect(getFilterById(client, "named")).resolves.toEqual(named);
    await expect(getFilterByName(client, "corporate ios")).resolves.toEqual(named);
    await expect(filterExists(client, "Corporate iOS")).resolves.toBe(true);
    await expect(filterExists(client, "Missing Filter")).resolves.toBe(false);

    expect(get).toHaveBeenCalledWith("/deviceManagement/assignmentFilters/named");
  });

  it("creates and updates filters while appending the hydration marker only when needed", async () => {
    const post = vi.fn().mockResolvedValue(makeFilter({ id: "created" }));
    const patch = vi.fn().mockResolvedValue(makeFilter({ id: "updated", displayName: "Updated Filter" }));
    const client = { post, patch } as unknown as GraphClient;
    const withoutMarker = makeFilter({ description: "Scoped filter" });
    const withMarker = makeFilter({ description: `Tagged ${HYDRATION_MARKER}` });

    await createFilter(client, withoutMarker);
    await createFilter(client, withMarker);
    await expect(updateFilter(client, "updated", { displayName: "Updated Filter" })).resolves.toEqual(
      makeFilter({ id: "updated", displayName: "Updated Filter" })
    );

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
    expect(patch).toHaveBeenCalledWith("/deviceManagement/assignmentFilters/updated", {
      displayName: "Updated Filter",
    });
  });

  it("deletes only hydration-marked filters and supports deletion by name", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(makeFilter({ id: "delete-me" }))
      .mockResolvedValueOnce(makeFilter({ id: "named-delete", displayName: "Named Filter" }));
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([makeFilter({ id: "named-delete", displayName: "Named Filter" })])
      .mockResolvedValueOnce([]);
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { get, getCollection, delete: del } as unknown as GraphClient;

    await expect(deleteFilter(client, "delete-me")).resolves.toBeUndefined();
    await expect(deleteFilterByName(client, "Named Filter")).resolves.toBeUndefined();
    await expect(deleteFilterByName(client, "Missing Filter")).rejects.toThrow('Filter "Missing Filter" not found');

    expect(del).toHaveBeenNthCalledWith(1, "/deviceManagement/assignmentFilters/delete-me");
    expect(del).toHaveBeenNthCalledWith(2, "/deviceManagement/assignmentFilters/named-delete");
  });

  it("rejects deletion for filters without a hydration marker", async () => {
    const get = vi.fn().mockResolvedValue(makeFilter({ displayName: "Unsafe Filter", description: "Manual filter" }));
    const del = vi.fn();
    const client = { get, delete: del } as unknown as GraphClient;

    await expect(deleteFilter(client, "unsafe-filter")).rejects.toThrow(
      'Cannot delete filter "Unsafe Filter": Not created by Intune Hydration Kit'
    );
    expect(del).not.toHaveBeenCalled();
  });

  it("validates filter rules and counts matching devices", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Invalid rule"));
    const get = vi.fn().mockResolvedValue(makeFilter({ id: "rule-filter", platform: "android" }));
    const getCollection = vi.fn().mockResolvedValue([{ id: "d1" }, { id: "d2" }, { id: "d3" }]);
    const client = { post, get, getCollection } as unknown as GraphClient;

    await expect(validateFilterRule(client, "(device.model -eq \"Pixel\")", "android")).resolves.toEqual({
      isValid: true,
    });
    await expect(validateFilterRule(client, "broken", "android")).resolves.toEqual({
      isValid: false,
      error: "Invalid rule",
    });
    await expect(getDevicesMatchingFilter(client, "rule-filter")).resolves.toBe(3);

    expect(post).toHaveBeenNthCalledWith(1, "/deviceManagement/assignmentFilters/validateFilter", {
      platform: "android",
      rule: '(device.model -eq "Pixel")',
    });
    expect(getCollection).toHaveBeenCalledWith(
      "/deviceManagement/managedDevices?$filter=platform eq 'android'"
    );
  });

  it("returns zero matching devices when the lookup fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const get = vi.fn().mockRejectedValue(new Error("Filter lookup failed"));
    const client = { get } as unknown as GraphClient;

    await expect(getDevicesMatchingFilter(client, "missing-filter")).resolves.toBe(0);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("batch creates filters with existing, invalid, created, and errored outcomes", async () => {
    const existing = makeFilter({ displayName: "Existing Filter" });
    const invalid = makeFilter({ displayName: "Invalid Filter", rule: "broken" });
    const toCreate = makeFilter({ displayName: "Create Filter", description: "Needs marker" });
    const failing = makeFilter({ displayName: "Fail Filter" });
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Filter lookup failed"));
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error("Invalid rule"))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(makeFilter({ id: "created-filter", displayName: "Create Filter" }));
    const client = { getCollection, post } as unknown as GraphClient;

    const results = await batchCreateFilters(client, [existing, invalid, toCreate, failing]);

    expect(results).toEqual([
      { filter: existing, success: false, error: "Filter already exists" },
      { filter: invalid, success: false, error: "Invalid filter rule: Invalid rule" },
      { filter: toCreate, success: true, id: "created-filter" },
      { filter: failing, success: false, error: "Filter lookup failed" },
    ]);
    expect(post).toHaveBeenNthCalledWith(1, "/deviceManagement/assignmentFilters/validateFilter", {
      platform: "windows10AndLater",
      rule: "broken",
    });
    expect(post).toHaveBeenNthCalledWith(2, "/deviceManagement/assignmentFilters/validateFilter", {
      platform: "windows10AndLater",
      rule: '(device.deviceOwnership -eq "Corporate")',
    });
  });

  it("batch deletes filters and preserves per-item errors", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(makeFilter({ id: "safe-delete" }))
      .mockResolvedValueOnce(makeFilter({ id: "unsafe-delete", displayName: "Unsafe Filter", description: "Manual filter" }));
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { get, delete: del } as unknown as GraphClient;

    const results = await batchDeleteFilters(client, ["safe-delete", "unsafe-delete"]);

    expect(results).toEqual([
      { filterId: "safe-delete", success: true },
      {
        filterId: "unsafe-delete",
        success: false,
        error: 'Cannot delete filter "Unsafe Filter": Not created by Intune Hydration Kit',
      },
    ]);
    expect(del).toHaveBeenCalledTimes(1);
  });
});
