import type { TaskCategory, CISCategoryId, OIBPlatformId } from "@/types/hydration";
import type {
  CISBaselineManifest,
  CISBaselineManifestFile,
  OIBManifest,
  OIBManifestFile,
} from "@/lib/templates/loader";
import { CIS_CATEGORY_METADATA, TEMPLATE_METADATA } from "@/templates";

export interface Target {
  id: TaskCategory;
  label: string;
  description: string;
  count: number;
  hasSubcategories?: boolean;
}

export interface CategoryItem {
  displayName: string;
  description?: string;
  subtype?: string;
}

export const TARGETS: Target[] = Object.entries(TEMPLATE_METADATA).map(([key, meta]) => ({
  id: key as TaskCategory,
  label: meta.displayName,
  description: meta.description,
  count: meta.count,
  hasSubcategories: "hasSubcategories" in meta ? meta.hasSubcategories : false,
}));

export const CIS_CATEGORIES = Object.entries(CIS_CATEGORY_METADATA).map(([id, meta]) => ({
  id: id as CISCategoryId,
  name: meta.name,
  description: meta.description,
  count: meta.count,
}));

const CIS_CATEGORY_IDS = new Set<CISCategoryId>(CIS_CATEGORIES.map((category) => category.id));

function isCISCategoryId(value: string): value is CISCategoryId {
  return CIS_CATEGORY_IDS.has(value as CISCategoryId);
}

export function getSelectedCISCategoryIds(
  manifest: CISBaselineManifest | null,
  selectedPolicyPaths: Set<string>
): CISCategoryId[] {
  if (selectedPolicyPaths.size === 0) {
    return [];
  }

  if (!manifest) {
    return [];
  }

  const categoryIdByFolder = new Map<string, CISCategoryId>();
  for (const category of manifest.categories) {
    if (isCISCategoryId(category.id)) {
      categoryIdByFolder.set(category.folder, category.id);
    }
  }

  const selectedCategoryIds = new Set<CISCategoryId>();
  for (const file of manifest.files) {
    if (!selectedPolicyPaths.has(file.path)) {
      continue;
    }

    const categoryId = categoryIdByFolder.get(file.category);
    if (categoryId) {
      selectedCategoryIds.add(categoryId);
    }
  }

  return Array.from(selectedCategoryIds);
}

export const PLATFORM_NAMES: Record<OIBPlatformId, string> = {
  WINDOWS: "Windows",
  MACOS: "macOS",
  BYOD: "BYOD (Bring Your Own Device)",
  WINDOWS365: "Windows 365 Cloud PC",
};

export const OS_PLATFORM_FILTERS = [
  { id: "windows", label: "Windows" },
  { id: "macos", label: "macOS" },
  { id: "ios", label: "iOS/iPadOS" },
  { id: "android", label: "Android" },
  { id: "linux", label: "Linux" },
] as const;

export type OSPlatformFilterId = typeof OS_PLATFORM_FILTERS[number]["id"];

export const PLATFORM_CATEGORIES: Record<OSPlatformFilterId, TaskCategory[]> = {
  windows: ["groups", "filters", "baseline", "compliance", "enrollment", "win32Apps", "conditionalAccess", "cisBaseline"],
  macos: ["groups", "filters", "baseline", "compliance", "cisBaseline"],
  ios: ["groups", "filters", "baseline", "compliance", "appProtection", "cisBaseline"],
  android: ["groups", "filters", "baseline", "compliance", "appProtection", "cisBaseline"],
  linux: ["groups", "filters", "compliance", "cisBaseline"],
};

export function platformMatchesItem(
  platform: OSPlatformFilterId,
  item: CategoryItem,
  category: TaskCategory
): boolean {
  const name = item.displayName.toLowerCase();
  const subtype = item.subtype?.toLowerCase() || "";
  const desc = item.description?.toLowerCase() || "";
  const combined = `${name} ${subtype} ${desc}`;

  switch (platform) {
    case "windows":
      if (category === "baseline") {
        return subtype.includes("windows") || subtype.includes("windows365");
      }
      return (
        combined.includes("windows") ||
        combined.includes("win10") ||
        combined.includes("win11") ||
        combined.includes("dell") ||
        combined.includes(" hp ") ||
        name.includes("hp devices") ||
        combined.includes("lenovo") ||
        combined.includes("surface")
      );
    case "macos":
      if (category === "baseline") {
        return subtype.includes("macos");
      }
      return combined.includes("macos") || (combined.includes("mac") && !combined.includes("machine"));
    case "ios":
      return combined.includes("ios") || combined.includes("ipad") || combined.includes("iphone");
    case "android":
      return combined.includes("android");
    case "linux":
      return combined.includes("linux");
    default:
      return false;
  }
}

function itemMatchesSearch(item: CategoryItem, search: string): boolean {
  return (
    item.displayName.toLowerCase().includes(search) ||
    item.description?.toLowerCase().includes(search) ||
    item.subtype?.toLowerCase().includes(search) ||
    false
  );
}

export function filterItemsBySearch(items: CategoryItem[], search: string): CategoryItem[] {
  if (!search) {
    return items;
  }

  return items.filter((item) => itemMatchesSearch(item, search));
}

export function getMatchingItemNames(items: CategoryItem[], search: string): string[] {
  return filterItemsBySearch(items, search).map((item) => item.displayName);
}

export function getBaselinePolicyPathsForPlatform(
  files: OIBManifestFile[],
  platform: OIBPlatformId
): string[] {
  return files.flatMap((file) => file.platform === platform ? [file.path] : []);
}

export function getCISPolicyPathsForCategory(
  files: CISBaselineManifestFile[],
  categoryFolder: string
): string[] {
  return files.flatMap((file) => file.category === categoryFolder ? [file.path] : []);
}

export function baselineFileMatchesPlatform(
  file: OIBManifestFile,
  platform: OSPlatformFilterId
): boolean {
  return platformMatchesItem(
    platform,
    {
      displayName: file.path,
      subtype: `${file.platform} - ${file.policyType || "Config"}`.toLowerCase(),
    },
    "baseline"
  );
}

export function cisFileMatchesPlatform(
  file: CISBaselineManifestFile,
  platform: OSPlatformFilterId
): boolean {
  return platformMatchesItem(
    platform,
    {
      displayName: file.displayName,
      subtype: file.category,
      description: file.subcategory,
    },
    "cisBaseline"
  );
}

export function getBaselinePolicyPathsForPlatforms(
  files: OIBManifestFile[],
  platforms: OSPlatformFilterId[]
): string[] {
  return files.flatMap((file) =>
    platforms.some((platform) => baselineFileMatchesPlatform(file, platform))
      ? [file.path]
      : []
  );
}

export function getCISPolicyPathsForPlatforms(
  files: CISBaselineManifestFile[],
  platforms: OSPlatformFilterId[]
): string[] {
  return files.flatMap((file) =>
    platforms.some((platform) => cisFileMatchesPlatform(file, platform))
      ? [file.path]
      : []
  );
}

export function baselineFileMatchesSearch(file: OIBManifestFile, search: string): boolean {
  return (
    file.displayName.toLowerCase().includes(search) ||
    file.platform.toLowerCase().includes(search) ||
    file.policyType?.toLowerCase().includes(search) ||
    false
  );
}

export function cisFileMatchesSearch(file: CISBaselineManifestFile, search: string): boolean {
  return (
    file.displayName.toLowerCase().includes(search) ||
    file.category.toLowerCase().includes(search) ||
    file.subcategory?.toLowerCase().includes(search) ||
    false
  );
}

export function getBaselinePolicyPathsMatchingSearch(
  files: OIBManifestFile[],
  search: string
): string[] {
  return files.flatMap((file) => baselineFileMatchesSearch(file, search) ? [file.path] : []);
}

export function getCISPolicyPathsMatchingSearch(
  files: CISBaselineManifestFile[],
  search: string
): string[] {
  return files.flatMap((file) => cisFileMatchesSearch(file, search) ? [file.path] : []);
}

function targetMatchesSearch({
  target,
  search,
  categoryItems,
  baselineManifest,
  cisManifest,
}: {
  target: Target;
  search: string;
  categoryItems: Record<string, CategoryItem[]>;
  baselineManifest: OIBManifest | null;
  cisManifest: CISBaselineManifest | null;
}): boolean {
  if (!search) {
    return true;
  }

  if (target.label.toLowerCase().includes(search)) {
    return true;
  }

  if (target.description.toLowerCase().includes(search)) {
    return true;
  }

  if (filterItemsBySearch(categoryItems[target.id] || [], search).length > 0) {
    return true;
  }

  if (target.id === "baseline" && baselineManifest) {
    return baselineManifest.files.some((file) => baselineFileMatchesSearch(file, search));
  }

  if (target.id === "cisBaseline" && cisManifest) {
    return cisManifest.files.some((file) => cisFileMatchesSearch(file, search));
  }

  return false;
}

export function getMatchingTargets(
  targets: Target[],
  search: string,
  categoryItems: Record<string, CategoryItem[]>,
  baselineManifest: OIBManifest | null,
  cisManifest: CISBaselineManifest | null
): Target[] {
  return targets.filter((target) =>
    targetMatchesSearch({
      target,
      search,
      categoryItems,
      baselineManifest,
      cisManifest,
    })
  );
}

export function countSelectedPaths(paths: string[], selected: Set<string>): number {
  return paths.reduce((count, path) => count + (selected.has(path) ? 1 : 0), 0);
}
