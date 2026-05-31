import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { TaskCategory } from "@/types/hydration";
import {
  baselineFileMatchesPlatform,
  cisFileMatchesPlatform,
  getBaselinePolicyPathsForPlatforms,
  getBaselinePolicyPathsMatchingSearch,
  getCISPolicyPathsForPlatforms,
  getCISPolicyPathsMatchingSearch,
  getMatchingItemNames,
  getMatchingTargets,
  PLATFORM_CATEGORIES,
  platformMatchesItem,
  TARGETS,
  type CategoryItem,
  type OSPlatformFilterId,
} from "@/components/wizard/targetSelectionModel";
import type { CISBaselineManifest, OIBManifest } from "@/lib/templates/loader";

interface UseTargetSelectionBulkActionsOptions {
  searchQuery: string;
  targets: TaskCategory[];
  categoryItems: Record<string, CategoryItem[]>;
  selectedItems: Record<string, Set<string>>;
  baselineManifest: OIBManifest | null;
  cisManifest: CISBaselineManifest | null;
  cisLoading: boolean;
  setTargets: Dispatch<SetStateAction<TaskCategory[]>>;
  setExpandedCategories: Dispatch<SetStateAction<Set<TaskCategory>>>;
  setSelectedItems: Dispatch<SetStateAction<Record<string, Set<string>>>>;
  setSelectedCISPolicies: Dispatch<SetStateAction<Set<string>>>;
  ensureCategoryItems: (category: TaskCategory) => Promise<CategoryItem[]>;
  ensureBaselineManifest: () => Promise<OIBManifest | null>;
  ensureCISManifest: () => Promise<CISBaselineManifest | null>;
  ensureAllCategoryItems: (categories: TaskCategory[]) => Promise<Record<string, CategoryItem[]>>;
}

export function useTargetSelectionBulkActions({
  searchQuery,
  targets,
  categoryItems,
  selectedItems,
  baselineManifest,
  cisManifest,
  cisLoading,
  setTargets,
  setExpandedCategories,
  setSelectedItems,
  setSelectedCISPolicies,
  ensureCategoryItems,
  ensureBaselineManifest,
  ensureCISManifest,
  ensureAllCategoryItems,
}: UseTargetSelectionBulkActionsOptions) {
  const [selectedPlatformFilters, setSelectedPlatformFilters] = useState<Set<string>>(new Set());

  const handleSelectAll = async () => {
    const search = searchQuery.toLowerCase().trim();
    const hasPlatformFilters = selectedPlatformFilters.size > 0;

    if (search) {
      const matchingTargetIds = getMatchingTargets(
        TARGETS,
        search,
        categoryItems,
        baselineManifest,
        cisManifest
      ).map((target) => target.id);
      const matchingTargetIdSet = new Set<TaskCategory>(matchingTargetIds);
      setTargets(prev => [...new Set([...prev, ...matchingTargetIds])]);
      setExpandedCategories(prev => new Set([...prev, ...matchingTargetIds]));

      const newSelected: Record<string, Set<string>> = {};
      for (const [cat, items] of Object.entries(categoryItems)) {
        const matchingNames = getMatchingItemNames(items, search);
        if (matchingNames.length > 0) {
          const current = selectedItems[cat] || new Set();
          newSelected[cat] = new Set([...current, ...matchingNames]);
        }
      }
      setSelectedItems(prev => ({ ...prev, ...newSelected }));

      if (baselineManifest && matchingTargetIdSet.has("baseline")) {
        const matchingPolicies = getBaselinePolicyPathsMatchingSearch(baselineManifest.files, search);
        setSelectedItems(prev => ({
          ...prev,
          baseline: new Set([...(prev.baseline || []), ...matchingPolicies])
        }));
      }

      if (cisManifest && matchingTargetIdSet.has("cisBaseline")) {
        const matchingCIS = getCISPolicyPathsMatchingSearch(cisManifest.files, search);
        setSelectedCISPolicies(prev => new Set([...prev, ...matchingCIS]));
      }
      return;
    }

    if (hasPlatformFilters) {
      const platforms = [...selectedPlatformFilters] as OSPlatformFilterId[];
      const allPlatformCategories = new Set<TaskCategory>();
      platforms.forEach(p => PLATFORM_CATEGORIES[p].forEach(c => allPlatformCategories.add(c)));

      const categoriesToEnable: TaskCategory[] = [];
      const newSelected: Record<string, Set<string>> = {};
      const selectableCategories = [...allPlatformCategories].filter(
        category => category !== "baseline" && category !== "cisBaseline"
      );
      const categoryEntries = await Promise.all(
        selectableCategories.map(async category => [
          category,
          categoryItems[category] || await ensureCategoryItems(category),
        ] as const)
      );

      for (const [category, items] of categoryEntries) {
        const matchingItems = items.filter(item =>
          platforms.some(platform => platformMatchesItem(platform, item, category))
        );

        if (matchingItems.length > 0) {
          categoriesToEnable.push(category);
          newSelected[category] = new Set(matchingItems.map(i => i.displayName));
        }
      }

      const manifest = allPlatformCategories.has("baseline")
        ? baselineManifest || await ensureBaselineManifest()
        : baselineManifest;
      if (manifest && allPlatformCategories.has("baseline")) {
        const matchingBaseline = getBaselinePolicyPathsForPlatforms(manifest.files, platforms);
        if (matchingBaseline.length > 0) {
          categoriesToEnable.push("baseline");
          newSelected.baseline = new Set(matchingBaseline);
        }
      }

      const cis = allPlatformCategories.has("cisBaseline")
        ? cisManifest || await ensureCISManifest()
        : cisManifest;
      if (cis && allPlatformCategories.has("cisBaseline")) {
        const matchingCIS = getCISPolicyPathsForPlatforms(cis.files, platforms);
        if (matchingCIS.length > 0) {
          categoriesToEnable.push("cisBaseline");
          setSelectedCISPolicies(new Set(matchingCIS));
        }
      }

      setTargets(categoriesToEnable);
      setExpandedCategories(new Set(categoriesToEnable));
      setSelectedItems(newSelected);
      return;
    }

    const allTargetIds = TARGETS.map(t => t.id);
    setTargets(allTargetIds);
    setExpandedCategories(new Set(allTargetIds));

    const categoryItemsToSelect = await ensureAllCategoryItems(allTargetIds);
    const newSelected: Record<string, Set<string>> = {};
    for (const [cat, items] of Object.entries(categoryItemsToSelect)) {
      newSelected[cat] = new Set(items.map(i => i.displayName));
    }
    setSelectedItems(prev => ({ ...prev, ...newSelected }));

    const manifest = baselineManifest || await ensureBaselineManifest();
    if (manifest) {
      setSelectedItems(prev => ({
        ...prev,
        baseline: new Set(manifest.files.map(f => f.path))
      }));
    }

    const cis = cisLoading ? cisManifest : cisManifest || await ensureCISManifest();
    if (cis) {
      setSelectedCISPolicies(new Set(cis.files.map(f => f.path)));
    }
  };

  const handleDeselectAll = () => {
    const search = searchQuery.toLowerCase().trim();

    if (search) {
      const newSelected: Record<string, Set<string>> = {};
      for (const [cat, items] of Object.entries(categoryItems)) {
        const current = selectedItems[cat] || new Set();
        const matchingNameSet = new Set(getMatchingItemNames(items, search));
        newSelected[cat] = new Set([...current].filter(name => !matchingNameSet.has(name)));
      }
      setSelectedItems(prev => ({ ...prev, ...newSelected }));

      if (baselineManifest) {
        const matchingPolicies = getBaselinePolicyPathsMatchingSearch(baselineManifest.files, search);
        const matchingPolicySet = new Set(matchingPolicies);
        setSelectedItems(prev => {
          const current = prev.baseline || new Set();
          return {
            ...prev,
            baseline: new Set([...current].filter(p => !matchingPolicySet.has(p)))
          };
        });
      }

      if (cisManifest) {
        const matchingCIS = getCISPolicyPathsMatchingSearch(cisManifest.files, search);
        const matchingCISSet = new Set(matchingCIS);
        setSelectedCISPolicies(prev => new Set([...prev].filter(p => !matchingCISSet.has(p))));
      }
      return;
    }

    setTargets([]);
    setExpandedCategories(new Set());
    setSelectedItems({});
    setSelectedCISPolicies(new Set());
  };

  const togglePlatformFilter = async (platformId: OSPlatformFilterId) => {
    const isCurrentlySelected = selectedPlatformFilters.has(platformId);
    setSelectedPlatformFilters(prev => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        next.delete(platformId);
      } else {
        next.add(platformId);
      }
      return next;
    });

    if (!isCurrentlySelected) {
      const platformCategories = PLATFORM_CATEGORIES[platformId];
      const platformCategorySet = new Set<TaskCategory>(platformCategories);
      const targetSet = new Set(targets);
      const categoriesToEnable: TaskCategory[] = [];
      const newSelectedItems: Record<string, Set<string>> = {};

      const loadableCategories = platformCategories.filter(
        cat => cat !== "baseline" && cat !== "cisBaseline"
      );
      const loadedEntries = await Promise.all(
        loadableCategories.map(async category => [category, await ensureCategoryItems(category)] as const)
      );
      const allCategoryItems: Record<string, CategoryItem[]> = { ...categoryItems };
      for (const [category, items] of loadedEntries) {
        if (items.length > 0) {
          allCategoryItems[category] = items;
        }
      }

      const loadedBaselineManifest = platformCategorySet.has("baseline")
        ? baselineManifest || await ensureBaselineManifest()
        : baselineManifest;
      const loadedCISManifest = platformCategorySet.has("cisBaseline")
        ? cisManifest || await ensureCISManifest()
        : cisManifest;

      for (const category of platformCategories) {
        if (category === "baseline" || category === "cisBaseline") continue;

        const items = allCategoryItems[category] || [];
        const matchingItems = items.filter(item => platformMatchesItem(platformId, item, category));
        if (matchingItems.length > 0) {
          if (!targetSet.has(category)) {
            categoriesToEnable.push(category);
          }
          const current = selectedItems[category] || new Set();
          newSelectedItems[category] = new Set([...current, ...matchingItems.map(i => i.displayName)]);
        }
      }

      if (loadedBaselineManifest && platformCategorySet.has("baseline")) {
        const matchingBaseline = getBaselinePolicyPathsForPlatforms(loadedBaselineManifest.files, [platformId]);
        if (matchingBaseline.length > 0) {
          if (!targetSet.has("baseline")) {
            categoriesToEnable.push("baseline");
          }
          const current = selectedItems.baseline || new Set();
          newSelectedItems.baseline = new Set([...current, ...matchingBaseline]);
        }
      }

      if (loadedCISManifest && platformCategorySet.has("cisBaseline")) {
        const matchingCIS = getCISPolicyPathsForPlatforms(loadedCISManifest.files, [platformId]);
        if (matchingCIS.length > 0) {
          if (!targetSet.has("cisBaseline")) {
            categoriesToEnable.push("cisBaseline");
          }
          setSelectedCISPolicies(prev => new Set([...prev, ...matchingCIS]));
        }
      }

      if (categoriesToEnable.length > 0) {
        setTargets(prev => [...new Set([...prev, ...categoriesToEnable])]);
        setExpandedCategories(prev => new Set([...prev, ...categoriesToEnable]));
      }

      setSelectedItems(prev => ({ ...prev, ...newSelectedItems }));
      return;
    }

    const remainingPlatforms = [...selectedPlatformFilters].filter(p => p !== platformId) as OSPlatformFilterId[];
    const newSelectedItems: Record<string, Set<string>> = {};

    for (const [cat, items] of Object.entries(categoryItems)) {
      const category = cat as TaskCategory;
      const current = selectedItems[category];
      if (!current) continue;

      const itemsByName = new Map(items.map(item => [item.displayName, item]));
      newSelectedItems[category] = new Set([...current].filter(itemName => {
        const item = itemsByName.get(itemName);
        if (!item) return true;
        if (!platformMatchesItem(platformId, item, category)) return true;
        return remainingPlatforms.some(p => platformMatchesItem(p, item, category));
      }));
    }

    if (baselineManifest && selectedItems.baseline) {
      const baselineFilesByPath = new Map(baselineManifest.files.map(file => [file.path, file]));
      newSelectedItems.baseline = new Set([...selectedItems.baseline].filter(path => {
        const file = baselineFilesByPath.get(path);
        if (!file) return true;
        if (!baselineFileMatchesPlatform(file, platformId)) return true;
        return remainingPlatforms.some(p => baselineFileMatchesPlatform(file, p));
      }));
    }

    if (cisManifest) {
      const cisFilesByPath = new Map(cisManifest.files.map(file => [file.path, file]));
      setSelectedCISPolicies(prev => new Set([...prev].filter(path => {
        const file = cisFilesByPath.get(path);
        if (!file) return true;
        if (!cisFileMatchesPlatform(file, platformId)) return true;
        return remainingPlatforms.some(p => cisFileMatchesPlatform(file, p));
      })));
    }

    setSelectedItems(prev => ({ ...prev, ...newSelectedItems }));
  };

  return {
    selectedPlatformFilters,
    handleSelectAll,
    handleDeselectAll,
    togglePlatformFilter,
  };
}
