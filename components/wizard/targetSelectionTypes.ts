import type { TaskCategory, OIBPlatformId } from "@/types/hydration";
import type { CISBaselineManifest, OIBManifest } from "@/lib/templates/loader";
import type {
  CategoryItem,
  OSPlatformFilterId,
  Target,
} from "@/components/wizard/targetSelectionModel";

export interface TargetSelectionSearchModel {
  query: string;
  normalized: string;
  setQuery: (query: string) => void;
}

export interface TargetSelectionPlatformFilterModel {
  selected: Set<string>;
  toggle: (platformId: OSPlatformFilterId) => void;
}

export interface TargetSelectionDataModel {
  filteredTargets: Target[];
  loadingCategories: Set<TaskCategory>;
  categoryItems: Record<string, CategoryItem[]>;
  baselineManifest: OIBManifest | null;
  cisManifest: CISBaselineManifest | null;
  cisLoading: boolean;
}

export interface TargetSelectionStateModel {
  targets: TaskCategory[];
  selectedItems: Record<string, Set<string>>;
  selectedCISPolicies: Set<string>;
  totalSelectedCount: number;
  isValid: boolean;
  getSelectedCount: (category: TaskCategory) => number;
  getTotalCount: (category: TaskCategory) => number;
}

export interface TargetSelectionExpansionModel {
  expandedCategories: Set<TaskCategory>;
  expandedPlatforms: Set<OIBPlatformId>;
  expandedCISCategories: Set<string>;
}

export interface TargetSelectionActionsModel {
  selectAll: () => void;
  deselectAll: () => void;
  toggleTarget: (targetId: TaskCategory) => void;
  toggleCategoryExpanded: (category: TaskCategory) => void;
  selectAllInCategory: (category: TaskCategory) => void;
  deselectAllInCategory: (category: TaskCategory) => void;
  selectAllCIS: () => void;
  deselectAllCIS: () => void;
  toggleCISCategoryExpanded: (categoryFolder: string) => void;
  toggleCISCategoryPolicies: (categoryFolder: string) => void;
  toggleCISPolicy: (policyPath: string) => void;
  isCISCategoryFullySelected: (categoryFolder: string) => boolean;
  isCISCategoryPartiallySelected: (categoryFolder: string) => boolean;
  togglePlatformExpanded: (platform: OIBPlatformId) => void;
  togglePlatformPolicies: (platform: OIBPlatformId) => void;
  isPlatformFullySelected: (platform: OIBPlatformId) => boolean;
  isPlatformPartiallySelected: (platform: OIBPlatformId) => boolean;
  toggleItem: (category: TaskCategory, itemName: string) => void;
}

export interface TargetSelectionNavigationModel {
  previousStep: () => void;
  continue: () => void;
}

export interface TargetSelectionViewModel {
  search: TargetSelectionSearchModel;
  platformFilters: TargetSelectionPlatformFilterModel;
  data: TargetSelectionDataModel;
  selection: TargetSelectionStateModel;
  expansion: TargetSelectionExpansionModel;
  actions: TargetSelectionActionsModel;
  navigation: TargetSelectionNavigationModel;
}
