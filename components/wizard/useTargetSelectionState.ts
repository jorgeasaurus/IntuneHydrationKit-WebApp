import { useEffect, useRef, useState } from "react";
import type { TaskCategory, OIBPlatformId, CategorySelections } from "@/types/hydration";
import type { AutopilotBrandingCustomization } from "@/lib/win32/autopilotBrandingConfig";

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
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<OIBPlatformId>>(() => new Set());
  const [expandedCISCategories, setExpandedCISCategories] = useState<Set<string>>(() => new Set());
  const [selectedCISPolicies, setSelectedCISPolicies] = useState<Set<string>>(
    () => new Set(categorySelections?.cisBaseline?.selectedItems || [])
  );
  // Undefined: the Autopilot Branding app uses the kit configuration without change.
  const [autopilotBranding, setAutopilotBranding] = useState<AutopilotBrandingCustomization | undefined>(
    categorySelections?.win32Apps?.autopilotBranding
  );
  // Pinned WinGet versions by Win32 app template ID. An app that is not a key uses the latest version.
  const [wingetVersions, setWinGetVersions] = useState<Record<string, string>>(
    () => ({ ...categorySelections?.win32Apps?.wingetVersions })
  );
  const setWinGetVersion = (templateId: string, version: string | undefined) => {
    setWinGetVersions(prev => {
      const next = { ...prev };
      if (version === undefined) delete next[templateId];
      else next[templateId] = version;
      return next;
    });
  };

  // Async selection writers (category defaults, platform filters, Select All) check this
  // generation after they await a catalog. A profile apply increments it, so a load that
  // finishes late cannot replace the selection that the profile set.
  const selectionGeneration = useRef(0);
  const startSelectionUpdate = () => {
    const generation = selectionGeneration.current;
    return () => selectionGeneration.current === generation;
  };
  const invalidatePendingSelectionUpdates = () => {
    selectionGeneration.current += 1;
  };
  // When the step unmounts, no pending async write may continue.
  useEffect(() => () => {
    selectionGeneration.current += 1;
  }, []);

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
    autopilotBranding,
    setAutopilotBranding,
    wingetVersions,
    setWinGetVersions,
    setWinGetVersion,
    toggleItem,
    toggleCISPolicy,
    toggleCISCategoryExpanded,
    togglePlatformExpanded,
    removeTarget,
    startSelectionUpdate,
    invalidatePendingSelectionUpdates,
  };
}
