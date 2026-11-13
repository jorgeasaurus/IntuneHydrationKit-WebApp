import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for selection handling in the task queue builder.
 * These tests use the real module-level template cache so that state
 * that survives between runs is visible.
 */

const { mockFetchBaselinePolicies, mockFetchCISBaselinePolicies, mockFetchFilters } = vi.hoisted(() => ({
  mockFetchBaselinePolicies: vi.fn(),
  mockFetchCISBaselinePolicies: vi.fn(),
  mockFetchFilters: vi.fn(),
}));

vi.mock("@/lib/templates/loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/templates/loader")>();
  return {
    ...actual,
    fetchBaselinePolicies: mockFetchBaselinePolicies,
    fetchCISBaselinePolicies: mockFetchCISBaselinePolicies,
    fetchFilters: mockFetchFilters,
  };
});

import { buildTaskQueueAsync, getEstimatedCategoryCount } from "@/lib/hydration/taskQueue";
import { clearCategoryCache, getCachedTemplates } from "@/lib/templates/loader";

const BASELINE_POLICIES = Array.from({ length: 8 }, (_, index) => ({
  name: `[IHD] OIB Policy ${index + 1}`,
  displayName: `[IHD] OIB Policy ${index + 1}`,
  _oibFilePath: `WINDOWS/SettingsCatalog/policy-${index + 1}.json`,
}));

const CIS_POLICIES = Array.from({ length: 4 }, (_, index) => ({
  name: `[IHD] CIS Policy ${index + 1}`,
  displayName: `[IHD] CIS Policy ${index + 1}`,
  _cisCategory: "cis-windows-11",
  _cisSubcategory: "L1",
  _cisFilePath: `cis-windows-11/L1/policy-${index + 1}.json`,
}));

function baselineSelection(paths: string[]) {
  return { platforms: [], selectedPolicies: paths, excludedPolicies: [] };
}

describe("taskQueue selection handling across runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ["baseline", "cisBaseline", "filters"]) {
      clearCategoryCache(key);
    }
    mockFetchBaselinePolicies.mockResolvedValue(BASELINE_POLICIES.map((policy) => ({ ...policy })));
    mockFetchCISBaselinePolicies.mockResolvedValue(CIS_POLICIES.map((policy) => ({ ...policy })));
    mockFetchFilters.mockResolvedValue([{ displayName: "Filter A" }, { displayName: "Filter B" }]);
  });

  it.each(["create", "delete"] as const)(
    "uses the current OpenIntuneBaseline selection on a second %s run",
    async (operationMode) => {
      const firstPaths = BASELINE_POLICIES.slice(0, 5).map((policy) => policy._oibFilePath);
      const secondPaths = BASELINE_POLICIES.slice(5, 8).map((policy) => policy._oibFilePath);

      const firstRun = await buildTaskQueueAsync(["baseline"], operationMode, {
        baselineSelection: baselineSelection(firstPaths),
        categorySelections: { baseline: baselineSelection(firstPaths) },
      });
      expect(firstRun.map((task) => task.itemName)).toEqual(BASELINE_POLICIES.slice(0, 5).map((policy) => policy.name));
      expect(firstRun.map((task) => task.templatePath)).toEqual(firstPaths);

      const secondRun = await buildTaskQueueAsync(["baseline"], operationMode, {
        baselineSelection: baselineSelection(secondPaths),
        categorySelections: { baseline: baselineSelection(secondPaths) },
      });
      expect(secondRun.map((task) => task.itemName)).toEqual(BASELINE_POLICIES.slice(5, 8).map((policy) => policy.name));
      expect(secondRun.map((task) => task.templatePath)).toEqual(secondPaths);
    },
  );

  it("does not reuse a filtered CIS selection when a later run has no CIS selection", async () => {
    const firstRun = await buildTaskQueueAsync(["cisBaseline"], "create", {
      categorySelections: { cisBaseline: { selectedItems: [CIS_POLICIES[0]._cisFilePath] } },
    });
    expect(firstRun).toHaveLength(1);

    const secondRun = await buildTaskQueueAsync(["cisBaseline"], "create");
    expect(secondRun.map((task) => task.templatePath)).toEqual(CIS_POLICIES.map((policy) => policy._cisFilePath));
  });

  it("does not reuse a filtered selection for other categories", async () => {
    const firstRun = await buildTaskQueueAsync(["filters"], "create", {
      categorySelections: { filters: { selectedItems: ["Filter A"] } },
    });
    expect(firstRun.map((task) => task.itemName)).toEqual(["Filter A"]);

    const secondRun = await buildTaskQueueAsync(["filters"], "create");
    expect(secondRun.map((task) => task.itemName)).toEqual(["Filter A", "Filter B"]);
  });

  it("queues no tasks for a category with an explicit empty selection", async () => {
    const tasks = await buildTaskQueueAsync(["filters", "baseline", "cisBaseline"], "create", {
      baselineSelection: baselineSelection([]),
      categorySelections: {
        filters: { selectedItems: [] },
        baseline: baselineSelection([]),
        cisBaseline: { selectedItems: [] },
      },
    });

    expect(tasks).toEqual([]);
  });

  it("queues every template when there is no selection object for the category", async () => {
    const tasks = await buildTaskQueueAsync(["filters"], "create", { categorySelections: {} });
    expect(tasks.map((task) => task.itemName)).toEqual(["Filter A", "Filter B"]);
  });

  it("queues both selected OpenIntuneBaseline files when they share a name", async () => {
    const shared = { name: "[IHD] Shared", displayName: "[IHD] Shared" };
    mockFetchBaselinePolicies.mockResolvedValue([
      { ...shared, _oibFilePath: "WINDOWS/a.json" },
      { ...shared, _oibFilePath: "MACOS/a.json" },
    ]);
    const paths = ["MACOS/a.json"];

    const tasks = await buildTaskQueueAsync(["baseline"], "create", {
      baselineSelection: baselineSelection(paths),
      categorySelections: { baseline: baselineSelection(paths) },
    });

    expect(tasks.map((task) => task.templatePath)).toEqual(["MACOS/a.json"]);
  });

  describe("incomplete template loads", () => {
    const failFilterB = async (report?: { failedFiles: string[] }) => {
      report?.failedFiles.push("Filters/filter-b.json");
      return [{ displayName: "Filter A" }];
    };

    it("does not reuse a list with a failed file request, and caches a later complete load", async () => {
      mockFetchFilters.mockImplementationOnce(failFilterB);

      const firstRun = await buildTaskQueueAsync(["filters"], "create", {
        categorySelections: { filters: { selectedItems: ["Filter A"] } },
      });
      expect(firstRun.map((task) => task.itemName)).toEqual(["Filter A"]);
      // The partial list is still readable for this run's executors.
      expect(getCachedTemplates("filters")).toEqual([{ displayName: "Filter A" }]);

      const secondRun = await buildTaskQueueAsync(["filters"], "create", {
        categorySelections: { filters: { selectedItems: ["Filter A", "Filter B"] } },
      });
      expect(mockFetchFilters).toHaveBeenCalledTimes(2);
      expect(secondRun.map((task) => task.itemName)).toEqual(["Filter A", "Filter B"]);

      await buildTaskQueueAsync(["filters"], "create");
      expect(mockFetchFilters).toHaveBeenCalledTimes(2);
    });

    it("reports a selected template that failed to load in create mode instead of dropping it", async () => {
      mockFetchFilters.mockImplementationOnce(failFilterB);

      await expect(
        buildTaskQueueAsync(["filters"], "create", {
          categorySelections: { filters: { selectedItems: ["Filter A", "Filter B"] } },
        }),
      ).rejects.toThrow(
        /Could not load 1 Device Filters template file\(s\): Filters\/filter-b\.json\. Selected templates not loaded: Filter B\./,
      );
      expect(getCachedTemplates("filters")).toBeNull();
    });

    it("queues a delete selection by name when a template file failed to load", async () => {
      mockFetchFilters.mockImplementationOnce(failFilterB);

      // Delete selections are tenant object names; they can include objects with no template.
      const tasks = await buildTaskQueueAsync(["filters"], "delete", {
        categorySelections: { filters: { selectedItems: ["Filter A", "Filter B", "Tenant-only filter"] } },
      });

      expect(tasks.map((task) => task.itemName)).toEqual(["Filter A", "Filter B", "Tenant-only filter"]);
      // The incomplete list is not reused by a later run.
      expect(getCachedTemplates("filters", { completeOnly: true })).toBeNull();
    });

    it("reports a failed load when every template of the category is queued", async () => {
      mockFetchFilters.mockImplementationOnce(failFilterB);

      await expect(buildTaskQueueAsync(["filters"], "create")).rejects.toThrow(/Filters\/filter-b\.json/);
      expect(getCachedTemplates("filters")).toBeNull();
    });

    it("reports a selected OpenIntuneBaseline file that failed to load", async () => {
      const [loaded, failed] = BASELINE_POLICIES;
      mockFetchBaselinePolicies.mockImplementationOnce(async (report?: { failedFiles: string[] }) => {
        report?.failedFiles.push(failed._oibFilePath);
        return [{ ...loaded }];
      });
      const paths = [loaded._oibFilePath, failed._oibFilePath];

      await expect(
        buildTaskQueueAsync(["baseline"], "create", {
          baselineSelection: baselineSelection(paths),
          categorySelections: { baseline: baselineSelection(paths) },
        }),
      ).rejects.toThrow(`Selected templates not loaded: ${failed._oibFilePath}.`);
    });
  });

  it("estimates zero objects for an explicit empty selection", () => {
    expect(getEstimatedCategoryCount("groups", { groups: { selectedItems: [] } })).toBe(0);
    expect(getEstimatedCategoryCount("cisBaseline", { cisBaseline: { selectedItems: [] } })).toBe(0);
  });
});
