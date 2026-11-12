import { useContext, useState, type Dispatch, type SetStateAction } from "react";
import type { TaskCategory } from "@/types/hydration";
import type { CISBaselineManifest, OIBManifest } from "@/lib/templates/loader";
import { ProfileApplyContext } from "@/components/wizard/profileApplyContext";
import { TARGETS, type CategoryItem } from "@/components/wizard/targetSelectionModel";
import { getTaskCategoryLabel } from "@/lib/hydration/categoryLabels";
import {
  ProfileError,
  resolveSelection,
  type DroppedProfileItem,
  type ScopeSelection,
} from "@/lib/profiles/scopeProfiles";

interface ScopeProfileSelectionOptions {
  targets: TaskCategory[];
  selectedItems: Record<string, Set<string>>;
  selectedCISPolicies: Set<string>;
  setTargets: Dispatch<SetStateAction<TaskCategory[]>>;
  setSelectedItems: Dispatch<SetStateAction<Record<string, Set<string>>>>;
  setSelectedCISPolicies: Dispatch<SetStateAction<Set<string>>>;
  setExpandedCategories: Dispatch<SetStateAction<Set<TaskCategory>>>;
  startSelectionUpdate: () => () => boolean;
  invalidatePendingSelectionUpdates: () => void;
  ensureAllCategoryItems: (categories: TaskCategory[]) => Promise<Record<string, CategoryItem[]>>;
  ensureBaselineManifest: () => Promise<OIBManifest | null>;
  ensureCISManifest: () => Promise<CISBaselineManifest | null>;
}

const KNOWN_TARGETS = new Set<string>(TARGETS.map((target) => target.id));

function isKnownTarget(value: string): value is TaskCategory {
  return KNOWN_TARGETS.has(value);
}

/** The category name that the target selection step shows. */
export function getTargetLabel(category: string): string {
  return TARGETS.find((target) => target.id === category)?.label ?? getTaskCategoryLabel(category);
}

function catalogUnavailable(category: string): ProfileError {
  return new ProfileError(
    `The app cannot load the ${getTargetLabel(category)} catalog, so it did not apply the profile. Your current selection did not change. Try again.`,
  );
}

/** Save the current target selection as a profile selection, and apply a profile selection. */
export function useScopeProfileSelection(options: ScopeProfileSelectionOptions) {
  // The wizard page shares the state, so that it can pause step navigation during an apply.
  const localApplying = useState(false);
  const [isApplying, setIsApplying] = useContext(ProfileApplyContext) ?? localApplying;
  const getCurrentSelection = (): ScopeSelection => {
    const items: Record<string, string[]> = {};
    for (const target of options.targets) {
      items[target] = target === "cisBaseline"
        ? [...options.selectedCISPolicies]
        : [...(options.selectedItems[target] ?? [])];
    }
    return { targets: [...options.targets], items };
  };

  /**
   * Load the catalogs that the profile uses, keep the items that still exist, and replace the
   * current selection. The wizard confirmation does not change. Throws ProfileError when a
   * catalog cannot load, so that the scope never changes from a partial catalog.
   *
   * The apply is authoritative: it discards async selection writes (category defaults,
   * platform filters, Select All) that started before it wrote. Returns null when a later
   * apply replaced this one or the step unmounted, so this one writes nothing.
   */
  const resolveAndApply = async (selection: ScopeSelection): Promise<DroppedProfileItem[] | null> => {
    options.invalidatePendingSelectionUpdates();
    const isCurrent = options.startSelectionUpdate();
    const known = selection.targets.filter(isKnownTarget);
    const regular = known.filter((target) => target !== "baseline" && target !== "cisBaseline");
    const catalog: Record<string, ReadonlySet<string>> = {};

    let loaded: Record<string, CategoryItem[]>;
    try {
      loaded = await options.ensureAllCategoryItems(regular);
    } catch {
      throw catalogUnavailable(regular[0] ?? "groups");
    }
    for (const target of regular) {
      const items = loaded[target];
      if (!items || items.length === 0) throw catalogUnavailable(target);
      catalog[target] = new Set(items.map((item) => item.displayName));
    }
    if (known.includes("baseline")) {
      const manifest = await options.ensureBaselineManifest();
      if (!manifest || manifest.files.length === 0) throw catalogUnavailable("baseline");
      catalog.baseline = new Set(manifest.files.map((file) => file.path));
    }
    if (known.includes("cisBaseline")) {
      const manifest = await options.ensureCISManifest();
      if (!manifest || manifest.files.length === 0) throw catalogUnavailable("cisBaseline");
      catalog.cisBaseline = new Set(manifest.files.map((file) => file.path));
    }

    if (!isCurrent()) return null;
    // Discard the async writes that started while the catalogs loaded.
    options.invalidatePendingSelectionUpdates();

    const resolved = resolveSelection(selection, catalog);
    const targets = resolved.selection.targets.filter(isKnownTarget);
    const nextItems: Record<string, Set<string>> = {};
    for (const target of targets) {
      if (target !== "cisBaseline") nextItems[target] = new Set(resolved.selection.items[target]);
    }
    options.setTargets(targets);
    options.setSelectedItems(nextItems);
    options.setSelectedCISPolicies(new Set(resolved.selection.items.cisBaseline ?? []));
    options.setExpandedCategories(new Set(targets));
    return resolved.dropped;
  };

  /** Apply a profile. While it runs, the step disables the controls that change or leave the selection. */
  const applySelection = async (selection: ScopeSelection): Promise<DroppedProfileItem[] | null> => {
    setIsApplying(true);
    try {
      return await resolveAndApply(selection);
    } finally {
      setIsApplying(false);
    }
  };

  return { getCurrentSelection, applySelection, isApplying };
}
