import { useState } from "react";
import type { TaskCategory, OIBPlatformId, CategorySelections } from "@/types/hydration";

function getInitialSelectedItems(
  categorySelections?: CategorySelections
): Record<string, Set<string>> {
  const initial: Record<string, Set<string>> = {};

  if (!categorySelections) {
    return initial;
  }

  for (const [key, selection] of Object.entries(categorySelections)) {
    if (selection && "selectedItems" in selection) {
      initial[key] = new Set(selection.selectedItems);
    } else if (key === "baseline" && selection && "selectedPolicies" in selection) {
      initial[key] = new Set(selection.selectedPolicies);
    }
  }

  return initial;
}

export function useTargetSelectionState(
  initialTargets: TaskCategory[],
  categorySelections?: CategorySelections
) {
  const [targets, setTargets] = useState<TaskCategory[]>(initialTargets);
  const [selectedItems, setSelectedItems] = useState<Record<string, Set<string>>>(
    () => getInitialSelectedItems(categorySelections)
  );
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<OIBPlatformId>>(new Set());
  const [expandedCISCategories, setExpandedCISCategories] = useState<Set<string>>(new Set());
  const [selectedCISPolicies, setSelectedCISPolicies] = useState<Set<string>>(
    new Set(categorySelections?.cisBaseline?.selectedItems || [])
  );

  const toggleItem = (category: TaskCategory, itemName: string) => {
    setSelectedItems(prev => {
      const current = prev[category] || new Set();
      const next = new Set(current);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return { ...prev, [category]: next };
    });
  };

  const toggleCISPolicy = (policyPath: string) => {
    setSelectedCISPolicies(prev => {
      const next = new Set(prev);
      if (next.has(policyPath)) {
        next.delete(policyPath);
      } else {
        next.add(policyPath);
      }
      return next;
    });
  };

  const toggleCISCategoryExpanded = (categoryFolder: string) => {
    setExpandedCISCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryFolder)) {
        next.delete(categoryFolder);
      } else {
        next.add(categoryFolder);
      }
      return next;
    });
  };

  const togglePlatformExpanded = (platform: OIBPlatformId) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  const removeTarget = (targetId: TaskCategory) => {
    setTargets(prev => prev.filter(id => id !== targetId));
    setSelectedItems(items => {
      const next = { ...items };
      delete next[targetId];
      return next;
    });
    if (targetId === "cisBaseline") {
      setSelectedCISPolicies(new Set());
      setExpandedCISCategories(new Set());
    }
  };

  return {
    targets,
    setTargets,
    selectedItems,
    setSelectedItems,
    expandedPlatforms,
    expandedCISCategories,
    selectedCISPolicies,
    setSelectedCISPolicies,
    toggleItem,
    toggleCISPolicy,
    toggleCISCategoryExpanded,
    togglePlatformExpanded,
    removeTarget,
  };
}
