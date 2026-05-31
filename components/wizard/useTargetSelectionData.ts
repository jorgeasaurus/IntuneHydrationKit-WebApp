import { useCallback, useState } from "react";
import type { TaskCategory } from "@/types/hydration";
import {
  fetchOIBManifest,
  fetchDynamicGroups,
  fetchStaticGroups,
  fetchFilters,
  fetchCompliancePolicies,
  fetchConditionalAccessPolicies,
  fetchAppProtectionPolicies,
  fetchEnrollmentProfiles,
  fetchCISBaselineManifest,
  type OIBManifest,
  type CISBaselineManifest,
} from "@/lib/templates/loader";
import type { CategoryItem } from "@/components/wizard/targetSelectionModel";

async function fetchCategoryData(category: TaskCategory): Promise<CategoryItem[]> {
  switch (category) {
    case "groups": {
      const [dynamic, static_] = await Promise.all([fetchDynamicGroups(), fetchStaticGroups()]);
      return [...dynamic, ...static_].map(g => ({
        displayName: g.displayName,
        description: g.description,
        subtype: g.membershipRule ? "Dynamic" : "Static",
      }));
    }
    case "filters": {
      const filters = await fetchFilters();
      return filters.map(f => ({
        displayName: f.displayName,
        description: f.description,
        subtype: f.platform,
      }));
    }
    case "compliance": {
      const policies = await fetchCompliancePolicies();
      return policies.map(p => ({
        displayName: p.displayName,
        description: p.description,
        subtype:
          p["@odata.type"]?.replace("#microsoft.graph.", "").replace("CompliancePolicy", "") ||
          String(p.platforms || p.technologies || ""),
      }));
    }
    case "conditionalAccess": {
      const policies = await fetchConditionalAccessPolicies();
      return policies.map(p => ({
        displayName: p.displayName,
        subtype: "CA Policy",
      }));
    }
    case "appProtection": {
      const policies = await fetchAppProtectionPolicies();
      return policies.map(p => ({
        displayName: p.displayName,
        description: p.description,
        subtype: p["@odata.type"]?.includes("ios") ? "iOS" : "Android",
      }));
    }
    case "enrollment": {
      const profiles = await fetchEnrollmentProfiles();
      return (profiles as Array<{ displayName?: string; name?: string; description?: string }>).map(p => ({
        displayName: p.displayName || p.name || "Unknown Profile",
        description: p.description,
        subtype: "Autopilot",
      }));
    }
    default:
      return [];
  }
}

function baselineManifestItems(manifest: OIBManifest): CategoryItem[] {
  return manifest.files.map(f => ({
    displayName: f.path,
    description: f.displayName,
    subtype: `${f.platform} - ${f.policyType || "Config"}`,
  }));
}

export function useTargetSelectionData() {
  const [expandedCategories, setExpandedCategories] = useState<Set<TaskCategory>>(new Set());
  const [loadingCategories, setLoadingCategories] = useState<Set<TaskCategory>>(new Set());
  const [categoryItems, setCategoryItems] = useState<Record<string, CategoryItem[]>>({});
  const [baselineManifest, setBaselineManifest] = useState<OIBManifest | null>(null);
  const [cisManifest, setCISManifest] = useState<CISBaselineManifest | null>(null);
  const [cisLoading, setCISLoading] = useState(false);

  const ensureCategoryItems = useCallback(async (category: TaskCategory): Promise<CategoryItem[]> => {
    const loadedItems = categoryItems[category];
    if (loadedItems) {
      return loadedItems;
    }

    if (loadingCategories.has(category)) {
      return [];
    }

    setLoadingCategories(prev => new Set(prev).add(category));
    try {
      if (category === "baseline") {
        const manifest = await fetchOIBManifest();
        setBaselineManifest(manifest);
        const items = manifest ? baselineManifestItems(manifest) : [];
        setCategoryItems(prev => ({ ...prev, baseline: items }));
        return items;
      }

      const items = await fetchCategoryData(category);
      setCategoryItems(prev => ({ ...prev, [category]: items }));
      return items;
    } catch (error) {
      console.error(`Error loading ${category} items:`, error);
      return [];
    } finally {
      setLoadingCategories(prev => {
        const next = new Set(prev);
        next.delete(category);
        return next;
      });
    }
  }, [categoryItems, loadingCategories]);

  const ensureBaselineManifest = useCallback(async (): Promise<OIBManifest | null> => {
    if (baselineManifest) {
      return baselineManifest;
    }

    setLoadingCategories(prev => new Set(prev).add("baseline"));
    try {
      const manifest = await fetchOIBManifest();
      setBaselineManifest(manifest);
      if (manifest) {
        setCategoryItems(prev => ({ ...prev, baseline: baselineManifestItems(manifest) }));
      }
      return manifest;
    } finally {
      setLoadingCategories(prev => {
        const next = new Set(prev);
        next.delete("baseline");
        return next;
      });
    }
  }, [baselineManifest]);

  const ensureCISManifest = useCallback(async (): Promise<CISBaselineManifest | null> => {
    if (cisManifest) {
      return cisManifest;
    }

    if (cisLoading) {
      return null;
    }

    setCISLoading(true);
    try {
      const manifest = await fetchCISBaselineManifest();
      setCISManifest(manifest);
      return manifest;
    } finally {
      setCISLoading(false);
    }
  }, [cisLoading, cisManifest]);

  const ensureAllCategoryItems = useCallback(async (
    categories: TaskCategory[]
  ): Promise<Record<string, CategoryItem[]>> => {
    const categoryItemsToSelect: Record<string, CategoryItem[]> = { ...categoryItems };
    const categoriesToLoad = categories.filter(
      category => category !== "baseline" && category !== "cisBaseline" && !categoryItemsToSelect[category]
    );

    const loadedEntries = await Promise.all(
      categoriesToLoad.map(async category => [category, await fetchCategoryData(category)] as const)
    );
    const loadedCategoryItems = Object.fromEntries(loadedEntries);
    Object.assign(categoryItemsToSelect, loadedCategoryItems);

    if (loadedEntries.length > 0) {
      setCategoryItems(prev => ({ ...prev, ...loadedCategoryItems }));
    }

    return categoryItemsToSelect;
  }, [categoryItems]);

  return {
    expandedCategories,
    setExpandedCategories,
    loadingCategories,
    categoryItems,
    setCategoryItems,
    baselineManifest,
    cisManifest,
    cisLoading,
    ensureCategoryItems,
    ensureBaselineManifest,
    ensureCISManifest,
    ensureAllCategoryItems,
  };
}
