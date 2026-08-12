import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetWin32AppTemplates,
  mockFetchDynamicGroups,
  mockFetchStaticGroups,
  mockFetchFilters,
  mockFetchCompliancePolicies,
  mockFetchConditionalAccessPolicies,
  mockFetchAppProtectionPolicies,
  mockFetchEnrollmentProfiles,
  mockFetchCISBaselinePolicies,
  mockFetchCISBaselinePoliciesByCategories,
  mockFetchBaselinePolicies,
  mockGetCachedTemplates,
  mockCacheTemplates,
  mockClearCategoryCache,
} = vi.hoisted(() => ({
  mockGetWin32AppTemplates: vi.fn(),
  mockFetchDynamicGroups: vi.fn(),
  mockFetchStaticGroups: vi.fn(),
  mockFetchFilters: vi.fn(),
  mockFetchCompliancePolicies: vi.fn(),
  mockFetchConditionalAccessPolicies: vi.fn(),
  mockFetchAppProtectionPolicies: vi.fn(),
  mockFetchEnrollmentProfiles: vi.fn(),
  mockFetchCISBaselinePolicies: vi.fn(),
  mockFetchCISBaselinePoliciesByCategories: vi.fn(),
  mockFetchBaselinePolicies: vi.fn(),
  mockGetCachedTemplates: vi.fn(),
  mockCacheTemplates: vi.fn(),
  mockClearCategoryCache: vi.fn(),
}));

vi.mock("@/templates", () => ({
  TEMPLATE_METADATA: {
    groups: { count: 55 },
    filters: { count: 29 },
    baseline: { count: 93 },
    compliance: { count: 10 },
    appProtection: { count: 8 },
    enrollment: { count: 4 },
    conditionalAccess: { count: 20 },
    cisBaseline: { count: 717 },
  },
  getWin32AppTemplates: mockGetWin32AppTemplates,
}));

vi.mock("@/lib/templates/loader", () => ({
  fetchDynamicGroups: mockFetchDynamicGroups,
  fetchStaticGroups: mockFetchStaticGroups,
  fetchFilters: mockFetchFilters,
  fetchCompliancePolicies: mockFetchCompliancePolicies,
  fetchConditionalAccessPolicies: mockFetchConditionalAccessPolicies,
  fetchAppProtectionPolicies: mockFetchAppProtectionPolicies,
  fetchEnrollmentProfiles: mockFetchEnrollmentProfiles,
  fetchCISBaselinePolicies: mockFetchCISBaselinePolicies,
  fetchCISBaselinePoliciesByCategories: mockFetchCISBaselinePoliciesByCategories,
  fetchBaselinePolicies: mockFetchBaselinePolicies,
  getCachedTemplates: mockGetCachedTemplates,
  cacheTemplates: mockCacheTemplates,
  clearCategoryCache: mockClearCategoryCache,
}));

import {
  buildTaskQueueAsync,
  getEstimatedCategoryCount,
  getEstimatedTaskCount,
} from "@/lib/hydration/taskQueue";

describe("taskQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWin32AppTemplates.mockReturnValue([
      { displayName: "7-Zip - [IHD]" },
      { displayName: "Google Chrome - [IHD]" },
      { displayName: "Mozilla Firefox - [IHD]" },
      { displayName: "Visual Studio Code - [IHD]" },
    ]);
    mockGetCachedTemplates.mockReturnValue(undefined);
    mockFetchDynamicGroups.mockResolvedValue([]);
    mockFetchStaticGroups.mockResolvedValue([]);
    mockFetchFilters.mockResolvedValue([]);
    mockFetchCompliancePolicies.mockResolvedValue([]);
    mockFetchConditionalAccessPolicies.mockResolvedValue([]);
    mockFetchAppProtectionPolicies.mockResolvedValue([]);
    mockFetchEnrollmentProfiles.mockResolvedValue([]);
    mockFetchCISBaselinePolicies.mockResolvedValue([]);
    mockFetchCISBaselinePoliciesByCategories.mockResolvedValue([]);
    mockFetchBaselinePolicies.mockResolvedValue([]);
  });

  it("prefers explicit baseline selectedPolicies over template metadata counts", () => {
    const count = getEstimatedCategoryCount("baseline", {
      baseline: {
        platforms: ["WINDOWS"],
        selectedPolicies: [
          "WINDOWS/SettingsCatalog/policy-one.json",
          "WINDOWS/SettingsCatalog/policy-two.json",
        ],
        excludedPolicies: [],
      },
    });

    expect(count).toBe(2);
  });

  it("uses selected item counts before metadata fallback for non-baseline categories", () => {
    const count = getEstimatedCategoryCount("groups", {
      groups: {
        selectedItems: ["Group A", "Group B", "Group C"],
      },
    });

    expect(count).toBe(3);
  });

  it("sums estimated counts across categories", () => {
    const count = getEstimatedTaskCount(["groups", "baseline"], {
      groups: { selectedItems: ["Group A"] },
      baseline: {
        platforms: [],
        selectedPolicies: ["policy-a.json", "policy-b.json"],
        excludedPolicies: [],
      },
    });

    expect(count).toBe(3);
  });

  it("uses cached templates in async builds and removes case-insensitive duplicates within a category", async () => {
    mockGetCachedTemplates.mockReturnValue([
      { displayName: "Alpha Policy" },
      { displayName: "alpha policy" },
      { displayName: "Bravo Policy" },
    ]);

    const tasks = await buildTaskQueueAsync(["filters"], "create");

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.itemName)).toEqual(["Alpha Policy", "Bravo Policy"]);
    expect(mockFetchFilters).not.toHaveBeenCalled();
  });

  it("fetches and filters selected groups in async builds", async () => {
    mockFetchDynamicGroups.mockResolvedValue([
      { displayName: "Dynamic Group A" },
      { displayName: "Dynamic Group B" },
    ]);
    mockFetchStaticGroups.mockResolvedValue([
      { displayName: "Static Group A" },
    ]);

    const tasks = await buildTaskQueueAsync(["groups"], "create", {
      categorySelections: {
        groups: {
          selectedItems: ["Dynamic Group B", "Static Group A"],
        },
      },
    });

    expect(mockClearCategoryCache).toHaveBeenCalledWith("groups");
    expect(mockCacheTemplates).toHaveBeenCalledWith("groups", [
      { displayName: "Dynamic Group B" },
      { displayName: "Static Group A" },
    ]);
    expect(tasks.map((task) => task.itemName)).toEqual([
      "Dynamic Group B",
      "Static Group A",
    ]);
  });

  it("builds async delete tasks directly from selected non-CIS item names", async () => {
    mockFetchFilters.mockResolvedValue([
      { displayName: "Filter A" },
      { displayName: "Filter B" },
    ]);

    const tasks = await buildTaskQueueAsync(["filters"], "delete", {
      categorySelections: {
        filters: {
          selectedItems: ["Filter B", "Filter Missing"],
        },
      },
    });

    expect(tasks.map((task) => task.itemName)).toEqual([
      "Filter B",
      "Filter Missing",
    ]);
  });

  it.each(["create", "delete"] as const)(
    "builds only the selected Win32 app task in %s mode",
    async (operationMode) => {
      const tasks = await buildTaskQueueAsync(["win32Apps"], operationMode, {
        categorySelections: {
          win32Apps: {
            selectedItems: ["Google Chrome - [IHD]"],
          },
        },
      });

      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        category: "win32Apps",
        operation: operationMode,
        itemName: "Google Chrome - [IHD]",
      });
    }
  );

  it("builds async delete tasks from filtered baseline selections using the template name first", async () => {
    mockFetchBaselinePolicies.mockResolvedValue([
      {
        name: "Primary Baseline Name",
        displayName: "Friendly Baseline Name",
        _oibFilePath: "windows/policy-a.json",
      },
      {
        displayName: "Filtered Out",
        _oibFilePath: "windows/policy-b.json",
      },
    ]);
    mockGetCachedTemplates.mockImplementation((key?: string) => {
      if (key === "baseline") {
        return undefined;
      }
      return [];
    });

    const tasks = await buildTaskQueueAsync(["baseline"], "delete", {
      baselineSelection: {
        platforms: [],
        selectedPolicies: ["windows/policy-a.json"],
        excludedPolicies: [],
      },
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].itemName).toBe("Primary Baseline Name");
  });

  it("fetches all CIS baseline policies when no CIS subcategories are specified", async () => {
    mockFetchCISBaselinePolicies.mockResolvedValue([
      {
        name: "Fetched CIS Policy",
        displayName: "Fetched CIS Policy",
        _cisFilePath: "cis/fetched.json",
      },
    ]);

    const tasks = await buildTaskQueueAsync(["cisBaseline"], "create");

    expect(mockFetchCISBaselinePolicies).toHaveBeenCalledTimes(1);
    expect(mockFetchCISBaselinePoliciesByCategories).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].itemName).toBe("Fetched CIS Policy");
    expect(tasks[0].templatePath).toBe("cis/fetched.json");
  });

  it("returns zero for categories without metadata or explicit selections", () => {
    const count = getEstimatedCategoryCount("notification" as never);

    expect(count).toBe(0);
  });

  it("maps selected CIS delete paths back to display names when building async delete tasks", async () => {
    mockFetchCISBaselinePolicies.mockResolvedValue([
      {
        displayName: "Known CIS Policy",
        name: "Known CIS Policy",
        _cisFilePath: "cis/path-known.json",
      },
      {
        displayName: "Another CIS Policy",
        name: "Another CIS Policy",
        _cisFilePath: "cis/path-another.json",
      },
    ]);

    const tasks = await buildTaskQueueAsync(["cisBaseline"], "delete", {
      selectedCISCategories: ["cis-android"],
      categorySelections: {
        cisBaseline: {
          selectedItems: ["cis/path-known.json", "cis/missing-name.json"],
        },
      },
    });

    expect(mockFetchCISBaselinePolicies).toHaveBeenCalledTimes(1);
    expect(mockFetchCISBaselinePoliciesByCategories).not.toHaveBeenCalled();
    expect(mockClearCategoryCache).toHaveBeenCalledWith("cisBaseline");
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.itemName)).toEqual([
      "Known CIS Policy",
      "missing-name",
    ]);
    expect(tasks.map((task) => task.templatePath)).toEqual([
      "cis/path-known.json",
      "cis/missing-name.json",
    ]);
  });

  it("keeps selected CIS paths distinct when policies share a display name", async () => {
    mockFetchCISBaselinePolicies.mockResolvedValue([
      {
        displayName: "Duplicate CIS Policy",
        name: "Duplicate CIS Policy",
        _cisFilePath: "cis/path-a.json",
      },
      {
        displayName: "Duplicate CIS Policy",
        name: "Duplicate CIS Policy",
        _cisFilePath: "cis/path-b.json",
      },
    ]);

    const tasks = await buildTaskQueueAsync(["cisBaseline"], "create", {
      categorySelections: {
        cisBaseline: {
          selectedItems: ["cis/path-a.json", "cis/path-b.json"],
        },
      },
    });

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.itemName)).toEqual([
      "Duplicate CIS Policy",
      "Duplicate CIS Policy",
    ]);
    expect(tasks.map((task) => task.templatePath)).toEqual([
      "cis/path-a.json",
      "cis/path-b.json",
    ]);
  });
});
