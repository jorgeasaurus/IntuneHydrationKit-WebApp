import type { TaskCategory, CategorySelections } from "@/types/hydration";
import type { CISBaselineManifest } from "@/lib/templates/loader";
import { getSelectedCISCategoryIds } from "@/components/wizard/targetSelectionModel";

interface TargetSelectionPersistenceOptions {
  targets: TaskCategory[];
  selectedItems: Record<string, Set<string>>;
  selectedCISPolicies: Set<string>;
  cisManifest: CISBaselineManifest | null;
  setSelectedTargets: (targets: TaskCategory[]) => void;
  setSelectedCISCategories: (categories: ReturnType<typeof getSelectedCISCategoryIds>) => void;
  setBaselineSelection: (selection: NonNullable<CategorySelections["baseline"]>) => void;
  setCategorySelections: (selections: CategorySelections) => void;
  nextStep: () => void;
}

function buildCategorySelections({
  targets,
  selectedItems,
  selectedCISPolicies,
  setBaselineSelection,
}: Pick<
  TargetSelectionPersistenceOptions,
  "targets" | "selectedItems" | "selectedCISPolicies" | "setBaselineSelection"
>): CategorySelections {
  const selections: CategorySelections = {};

  for (const target of targets) {
    if (target === "baseline") {
      const baselineSelection = {
        platforms: [],
        selectedPolicies: Array.from(selectedItems.baseline || []),
        excludedPolicies: [],
      };
      setBaselineSelection(baselineSelection);
      selections.baseline = baselineSelection;
    } else if (target === "cisBaseline") {
      selections.cisBaseline = {
        selectedItems: Array.from(selectedCISPolicies),
      };
    } else if (target !== "notification") {
      const categorySelection = { selectedItems: Array.from(selectedItems[target] || []) };
      if (target === "groups") selections.groups = categorySelection;
      else if (target === "filters") selections.filters = categorySelection;
      else if (target === "compliance") selections.compliance = categorySelection;
      else if (target === "conditionalAccess") selections.conditionalAccess = categorySelection;
      else if (target === "appProtection") selections.appProtection = categorySelection;
      else if (target === "enrollment") selections.enrollment = categorySelection;
    }
  }

  return selections;
}

export function useTargetSelectionPersistence({
  targets,
  selectedItems,
  selectedCISPolicies,
  cisManifest,
  setSelectedTargets,
  setSelectedCISCategories,
  setBaselineSelection,
  setCategorySelections,
  nextStep,
}: TargetSelectionPersistenceOptions) {
  return () => {
    setSelectedTargets(targets);
    setSelectedCISCategories(getSelectedCISCategoryIds(cisManifest, selectedCISPolicies));
    setCategorySelections(
      buildCategorySelections({
        targets,
        selectedItems,
        selectedCISPolicies,
        setBaselineSelection,
      })
    );

    nextStep();
  };
}
