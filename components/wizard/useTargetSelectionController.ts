import { useState } from "react";
import type { TaskCategory, OIBPlatformId } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";
import { TEMPLATE_METADATA } from "@/templates";
import {
  countSelectedPaths,
  getBaselinePolicyPathsForPlatform,
  getCISPolicyPathsForCategory,
  getCISPolicyPathsForPlatforms,
  getMatchingItemNames,
  getMatchingTargets,
  platformMatchesItem,
  TARGETS,
  type OSPlatformFilterId,
} from "@/components/wizard/targetSelectionModel";
import type { TargetSelectionViewModel } from "@/components/wizard/targetSelectionTypes";
import { useTargetSelectionBulkActions } from "@/components/wizard/useTargetSelectionBulkActions";
import { useTargetSelectionData } from "@/components/wizard/useTargetSelectionData";
import { useTargetSelectionPersistence } from "@/components/wizard/useTargetSelectionPersistence";
import { useTargetSelectionState } from "@/components/wizard/useTargetSelectionState";

export function useTargetSelectionController(): TargetSelectionViewModel {
  const wizard = useWizardState();
  const [searchQuery, setSearchQuery] = useState("");
  const selectionState = useTargetSelectionState(
    wizard.state.selectedTargets || [],
    wizard.state.categorySelections
  );
  const data = useTargetSelectionData();

  const bulkActions = useTargetSelectionBulkActions({
    searchQuery,
    targets: selectionState.targets,
    categoryItems: data.categoryItems,
    selectedItems: selectionState.selectedItems,
    baselineManifest: data.baselineManifest,
    cisManifest: data.cisManifest,
    cisLoading: data.cisLoading,
    setTargets: selectionState.setTargets,
    setExpandedCategories: data.setExpandedCategories,
    setSelectedItems: selectionState.setSelectedItems,
    setSelectedCISPolicies: selectionState.setSelectedCISPolicies,
    ensureCategoryItems: data.ensureCategoryItems,
    ensureBaselineManifest: data.ensureBaselineManifest,
    ensureCISManifest: data.ensureCISManifest,
    ensureAllCategoryItems: data.ensureAllCategoryItems,
  });

  const selectedPlatformFilters = bulkActions.selectedPlatformFilters;
  const normalizedSearch = searchQuery.toLowerCase().trim();

  const selectDefaultItemsForCategory = async (category: TaskCategory) => {
    if (category === "cisBaseline") {
      const manifest = await data.ensureCISManifest();
      if (manifest && selectionState.selectedCISPolicies.size === 0) {
        if (selectedPlatformFilters.size > 0) {
          const platforms = [...selectedPlatformFilters] as OSPlatformFilterId[];
          selectionState.setSelectedCISPolicies(new Set(getCISPolicyPathsForPlatforms(manifest.files, platforms)));
        } else {
          selectionState.setSelectedCISPolicies(new Set(manifest.files.map(f => f.path)));
        }
      }
      return;
    }

    const items = await data.ensureCategoryItems(category);
    const currentSelection = selectionState.selectedItems[category];
    if (currentSelection && currentSelection.size > 0) {
      return;
    }

    if (selectedPlatformFilters.size > 0) {
      const matchingItems = items.filter(item =>
        [...selectedPlatformFilters].some(platform =>
          platformMatchesItem(platform as OSPlatformFilterId, item, category)
        )
      );
      selectionState.setSelectedItems(prev => ({
        ...prev,
        [category]: new Set(matchingItems.map(i => i.displayName)),
      }));
    } else {
      selectionState.setSelectedItems(prev => ({
        ...prev,
        [category]: new Set(items.map(i => i.displayName)),
      }));
    }
  };

  const toggleCategoryExpanded = (category: TaskCategory) => {
    const isCurrentlyExpanded = data.expandedCategories.has(category);
    data.setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });

    if (!isCurrentlyExpanded) {
      void selectDefaultItemsForCategory(category);
    }
  };

  const handleToggle = (targetId: TaskCategory) => {
    const isCurrentlySelected = selectionState.targets.includes(targetId);
    if (isCurrentlySelected) {
      selectionState.removeTarget(targetId);
      data.setExpandedCategories(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      return;
    }

    selectionState.setTargets(prev => [...prev, targetId]);
    data.setExpandedCategories(prev => new Set(prev).add(targetId));
    void selectDefaultItemsForCategory(targetId);
  };

  const selectAllInCategory = (category: TaskCategory) => {
    const items = data.categoryItems[category];
    if (!items) return;
    const search = normalizedSearch;

    if (search) {
      const matchingNames = getMatchingItemNames(items, search);
      selectionState.setSelectedItems(prev => {
        const current = prev[category] || new Set();
        return {
          ...prev,
          [category]: new Set([...current, ...matchingNames]),
        };
      });
      return;
    }

    selectionState.setSelectedItems(prev => ({
      ...prev,
      [category]: new Set(items.map(i => i.displayName)),
    }));
  };

  const deselectAllInCategory = (category: TaskCategory) => {
    const items = data.categoryItems[category];

    if (normalizedSearch && items) {
      const matchingNameSet = new Set(getMatchingItemNames(items, normalizedSearch));
      selectionState.setSelectedItems(prev => {
        const current = prev[category] || new Set();
        return {
          ...prev,
          [category]: new Set([...current].filter(name => !matchingNameSet.has(name))),
        };
      });
      return;
    }

    selectionState.setSelectedItems(prev => ({
      ...prev,
      [category]: new Set(),
    }));
  };

  const toggleCISCategoryPolicies = (categoryFolder: string) => {
    if (!data.cisManifest) return;
    const categoryPolicies = getCISPolicyPathsForCategory(data.cisManifest.files, categoryFolder);
    const allSelected = categoryPolicies.every(p => selectionState.selectedCISPolicies.has(p));

    selectionState.setSelectedCISPolicies(prev => {
      const next = new Set(prev);
      if (allSelected) {
        categoryPolicies.forEach(p => next.delete(p));
      } else {
        categoryPolicies.forEach(p => next.add(p));
      }
      return next;
    });
  };

  const isCISCategoryFullySelected = (categoryFolder: string): boolean => {
    if (!data.cisManifest) return false;
    const categoryPolicies = getCISPolicyPathsForCategory(data.cisManifest.files, categoryFolder);
    return categoryPolicies.every(p => selectionState.selectedCISPolicies.has(p));
  };

  const isCISCategoryPartiallySelected = (categoryFolder: string): boolean => {
    if (!data.cisManifest) return false;
    const categoryPolicies = getCISPolicyPathsForCategory(data.cisManifest.files, categoryFolder);
    const selectedCount = countSelectedPaths(categoryPolicies, selectionState.selectedCISPolicies);
    return selectedCount > 0 && selectedCount < categoryPolicies.length;
  };

  const togglePlatformPolicies = (platform: OIBPlatformId) => {
    if (!data.baselineManifest) return;
    const platformPolicies = getBaselinePolicyPathsForPlatform(data.baselineManifest.files, platform);
    const current = selectionState.selectedItems.baseline || new Set();
    const allSelected = platformPolicies.every(p => current.has(p));

    selectionState.setSelectedItems(prev => {
      const next = new Set(prev.baseline || []);
      if (allSelected) {
        platformPolicies.forEach(p => next.delete(p));
      } else {
        platformPolicies.forEach(p => next.add(p));
      }
      return { ...prev, baseline: next };
    });
  };

  const isPlatformFullySelected = (platform: OIBPlatformId): boolean => {
    if (!data.baselineManifest) return false;
    const platformPolicies = getBaselinePolicyPathsForPlatform(data.baselineManifest.files, platform);
    const selected = selectionState.selectedItems.baseline || new Set();
    return platformPolicies.every(p => selected.has(p));
  };

  const isPlatformPartiallySelected = (platform: OIBPlatformId): boolean => {
    if (!data.baselineManifest) return false;
    const platformPolicies = getBaselinePolicyPathsForPlatform(data.baselineManifest.files, platform);
    const selected = selectionState.selectedItems.baseline || new Set();
    const count = countSelectedPaths(platformPolicies, selected);
    return count > 0 && count < platformPolicies.length;
  };

  const getSelectedCount = (category: TaskCategory): number => {
    if (category === "cisBaseline") {
      return selectionState.selectedCISPolicies.size;
    }
    return selectionState.selectedItems[category]?.size || 0;
  };

  const getTotalCount = (category: TaskCategory): number => {
    if (category === "cisBaseline") {
      return data.cisManifest?.totalFiles || TEMPLATE_METADATA.cisBaseline?.count || 0;
    }
    if (category === "baseline" && data.baselineManifest) {
      return data.baselineManifest.totalFiles;
    }
    if (data.categoryItems[category]?.length) {
      return data.categoryItems[category].length;
    }
    const meta = TEMPLATE_METADATA[category as keyof typeof TEMPLATE_METADATA];
    return meta?.count || 0;
  };

  const filteredTargets = getMatchingTargets(
    TARGETS,
    normalizedSearch,
    data.categoryItems,
    data.baselineManifest,
    data.cisManifest
  );
  const totalSelectedCount = TARGETS.filter(t => selectionState.targets.includes(t.id)).reduce(
    (sum, t) => sum + getSelectedCount(t.id),
    0
  );
  const isValid = selectionState.targets.length > 0 &&
    selectionState.targets.every(t => {
      if (t === "cisBaseline") return selectionState.selectedCISPolicies.size > 0 || data.cisLoading;
      return (selectionState.selectedItems[t]?.size || 0) > 0 || data.loadingCategories.has(t);
    });

  const handleContinue = useTargetSelectionPersistence({
    targets: selectionState.targets,
    selectedItems: selectionState.selectedItems,
    selectedCISPolicies: selectionState.selectedCISPolicies,
    cisManifest: data.cisManifest,
    setSelectedTargets: wizard.setSelectedTargets,
    setSelectedCISCategories: wizard.setSelectedCISCategories,
    setBaselineSelection: wizard.setBaselineSelection,
    setCategorySelections: wizard.setCategorySelections,
    nextStep: wizard.nextStep,
  });

  return {
    search: {
      query: searchQuery,
      normalized: normalizedSearch,
      setQuery: setSearchQuery,
    },
    platformFilters: {
      selected: selectedPlatformFilters,
      toggle: bulkActions.togglePlatformFilter,
    },
    data: {
      filteredTargets,
      loadingCategories: data.loadingCategories,
      categoryItems: data.categoryItems,
      baselineManifest: data.baselineManifest,
      cisManifest: data.cisManifest,
      cisLoading: data.cisLoading,
    },
    selection: {
      targets: selectionState.targets,
      selectedItems: selectionState.selectedItems,
      selectedCISPolicies: selectionState.selectedCISPolicies,
      totalSelectedCount,
      isValid,
      getSelectedCount,
      getTotalCount,
    },
    expansion: {
      expandedCategories: data.expandedCategories,
      expandedPlatforms: selectionState.expandedPlatforms,
      expandedCISCategories: selectionState.expandedCISCategories,
    },
    actions: {
      selectAll: bulkActions.handleSelectAll,
      deselectAll: bulkActions.handleDeselectAll,
      toggleTarget: handleToggle,
      toggleCategoryExpanded,
      selectAllInCategory,
      deselectAllInCategory,
      selectAllCIS: () => {
        if (data.cisManifest) {
          selectionState.setSelectedCISPolicies(new Set(data.cisManifest.files.map(f => f.path)));
        }
      },
      deselectAllCIS: () => selectionState.setSelectedCISPolicies(new Set()),
      toggleCISCategoryExpanded: selectionState.toggleCISCategoryExpanded,
      toggleCISCategoryPolicies,
      toggleCISPolicy: selectionState.toggleCISPolicy,
      isCISCategoryFullySelected,
      isCISCategoryPartiallySelected,
      togglePlatformExpanded: selectionState.togglePlatformExpanded,
      togglePlatformPolicies,
      isPlatformFullySelected,
      isPlatformPartiallySelected,
      toggleItem: selectionState.toggleItem,
    },
    navigation: {
      previousStep: wizard.previousStep,
      continue: handleContinue,
    },
  };
}
