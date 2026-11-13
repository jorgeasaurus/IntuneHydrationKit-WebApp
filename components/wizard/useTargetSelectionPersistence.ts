import type { TaskCategory, CategorySelections } from "@/types/hydration";
import type { CISBaselineManifest } from "@/lib/templates/loader";
import { getSelectedCISCategoryIds } from "@/components/wizard/targetSelectionModel";
import type { AutopilotBrandingCustomization } from "@/lib/win32/autopilotBrandingConfig";
import { AUTOPILOT_BRANDING_WIN32_APP } from "@/templates/win32Apps";
import { getSelectedWinGetVersions } from "@/lib/winget/selectedVersions";

interface TargetSelectionPersistenceOptions {
  targets: TaskCategory[];
  selectedItems: Record<string, Set<string>>;
  selectedCISPolicies: Set<string>;
  autopilotBranding: AutopilotBrandingCustomization | undefined;
  wingetVersions: Record<string, string>;
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
  autopilotBranding,
  wingetVersions,
  setBaselineSelection,
}: Pick<
  TargetSelectionPersistenceOptions,
  "targets" | "selectedItems" | "selectedCISPolicies" | "autopilotBranding" | "wingetVersions" | "setBaselineSelection"
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
    } else {
      const categorySelection = { selectedItems: Array.from(selectedItems[target] || []) };
      if (target === "groups") selections.groups = categorySelection;
      else if (target === "filters") selections.filters = categorySelection;
      else if (target === "compliance") selections.compliance = categorySelection;
      else if (target === "conditionalAccess") selections.conditionalAccess = categorySelection;
      else if (target === "appProtection") selections.appProtection = categorySelection;
      else if (target === "win32Apps") {
        // The customization is kept only while the Autopilot Branding app is selected, and a
        // pinned version only while its app is selected.
        const versions = getSelectedWinGetVersions(categorySelection.selectedItems, wingetVersions);
        selections.win32Apps = {
          ...categorySelection,
          ...(autopilotBranding && categorySelection.selectedItems.includes(AUTOPILOT_BRANDING_WIN32_APP.displayName)
            ? { autopilotBranding }
            : {}),
          ...(versions ? { wingetVersions: versions } : {}),
        };
      }
      else if (target === "enrollment") selections.enrollment = categorySelection;
      else if (target === "notification") selections.notification = categorySelection;
    }
  }

  return selections;
}

export function useTargetSelectionPersistence({
  targets,
  selectedItems,
  selectedCISPolicies,
  autopilotBranding,
  wingetVersions,
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
        autopilotBranding,
        wingetVersions,
        setBaselineSelection,
      })
    );

    nextStep();
  };
}
