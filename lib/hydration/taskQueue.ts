/**
 * Task Queue Builder
 * Functions for building the hydration task queue from selected categories
 */

import { HydrationTask, OperationMode, TaskCategory, CISCategoryId, BaselineSelection, CategorySelections } from "@/types/hydration";
import * as Templates from "@/templates";
import {
  fetchDynamicGroups,
  fetchStaticGroups,
  fetchFilters,
  fetchCompliancePolicies,
  fetchConditionalAccessPolicies,
  fetchAppProtectionPolicies,
  fetchEnrollmentProfiles,
  fetchCISBaselinePolicies,
  fetchCISBaselinePoliciesByCategories,
  fetchBaselinePolicies,
  getCachedTemplates,
  cacheTemplates,
  clearCategoryCache,
  CISBaselinePolicy,
} from "@/lib/templates/loader";

/**
 * Options for building the task queue
 */
export interface BuildTaskQueueOptions {
  selectedCategories: TaskCategory[];
  operationMode: OperationMode;
  selectedCISCategories?: CISCategoryId[];
  baselineSelection?: BaselineSelection;
  categorySelections?: CategorySelections;
}

/** Display labels for each category */
const CATEGORY_LABELS: Partial<Record<TaskCategory, string>> = {
  groups: "Dynamic Groups",
  filters: "Device Filters",
  compliance: "Compliance Policies",
  appProtection: "App Protection Policies",
  conditionalAccess: "Conditional Access Policies",
  enrollment: "Enrollment Profiles",
  baseline: "OpenIntuneBaseline Policies",
  cisBaseline: "CIS Baseline Policies",
};

/**
 * Build task queue from selected categories and templates
 * @deprecated Use buildTaskQueueAsync for real template loading
 */
export function buildTaskQueue(
  selectedCategories: TaskCategory[],
  operationMode: OperationMode
): HydrationTask[] {
  const tasks: HydrationTask[] = [];
  let taskId = 1;

  for (const category of selectedCategories) {
    let items: Array<{ displayName: string }> = [];

    switch (category) {
      case "groups":
        items = Templates.getDynamicGroups();
        break;
      case "filters":
        items = Templates.getDeviceFilters();
        break;
      case "baseline":
        // OpenIntuneBaseline policies will be fetched from GitHub at runtime
        // For now, create placeholder tasks based on the count
        items = Array.from({ length: 70 }, (_, i) => ({
          displayName: `Baseline Policy ${i + 1}`,
        }));
        break;
      case "cisBaseline":
        // CIS Intune Baselines - placeholder for sync version
        // Real data will be fetched in async version
        items = Array.from({ length: 717 }, (_, i) => ({
          displayName: `CIS Baseline Policy ${i + 1}`,
        }));
        break;
      case "compliance":
        items = Templates.getCompliancePolicies();
        break;
      case "conditionalAccess":
        items = Templates.getConditionalAccessPolicies();
        break;
      case "appProtection":
        items = Templates.getAppProtectionPolicies();
        break;
      case "enrollment":
        // Enrollment profiles not yet implemented in templates
        items = [];
        break;
      default:
        items = [];
    }

    for (const item of items) {
      tasks.push({
        id: `task-${taskId++}`,
        category,
        operation: operationMode,
        itemName: item.displayName,
        status: "pending",
      });
    }
  }

  return tasks;
}

/**
 * Build task queue from selected categories (async version)
 * Fetches real templates from local IntuneTemplates directory
 */
export async function buildTaskQueueAsync(
  selectedCategories: TaskCategory[],
  operationMode: OperationMode,
  options?: {
    selectedCISCategories?: CISCategoryId[];
    baselineSelection?: BaselineSelection;
    categorySelections?: CategorySelections;
    /** Callback for reporting progress during queue construction */
    onProgress?: (message: string, type?: "info" | "progress" | "success" | "warning" | "error") => void;
  }
): Promise<HydrationTask[]> {
  const emit = options?.onProgress;
  console.log(`[Task Queue] Building task queue for categories:`, selectedCategories);
  emit?.(`Preparing ${selectedCategories.length} categor${selectedCategories.length === 1 ? "y" : "ies"}: ${selectedCategories.join(", ")}`);
  if (options?.selectedCISCategories) {
    console.log(`[Task Queue] Selected CIS categories:`, options.selectedCISCategories);
  }
  if (options?.baselineSelection?.selectedPolicies) {
    console.log(`[Task Queue] Selected baseline policies:`, options.baselineSelection.selectedPolicies.length);
  }
  if (options?.categorySelections) {
    console.log(`[Task Queue] Category selections provided for:`, Object.keys(options.categorySelections));
  }
  const tasks: HydrationTask[] = [];
  let taskId = 1;

  for (const [categoryIndex, category] of selectedCategories.entries()) {
    console.log(`[Task Queue] Processing category: ${category}`);
    const label = CATEGORY_LABELS[category] || category;
    emit?.(`[${categoryIndex + 1}/${selectedCategories.length}] Loading templates for ${label}...`);
    let items: Array<{ displayName: string }> = [];

    // CIS baselines use a special cache key that includes selected categories
    const cacheKey = category === "cisBaseline" && options?.selectedCISCategories
      ? `${category}-${options.selectedCISCategories.sort().join(",")}`
      : category;

    // Clear cache if categorySelections has selections for this category
    // This ensures we fetch fresh templates and don't use stale filtered cache
    const categorySelections = options?.categorySelections;
    const selectionKey = category as keyof CategorySelections;
    const selection = categorySelections?.[selectionKey];
    if (selection && 'selectedItems' in selection && selection.selectedItems && selection.selectedItems.length > 0) {
      console.log(`[Task Queue] Clearing cache for ${cacheKey} - specific items selected`);
      clearCategoryCache(cacheKey);
    }

    // Try to get from cache first
    const cached = getCachedTemplates(cacheKey);
    if (cached && Array.isArray(cached)) {
      console.log(`[Task Queue] Using ${cached.length} cached templates for ${cacheKey}`);
      emit?.(`Using ${cached.length} cached templates for ${label}`, "info");
      items = cached as Array<{ displayName: string }>;
    } else {
      console.log(`[Task Queue] Cache miss for ${cacheKey}, fetching fresh templates...`);
      emit?.(`Fetching templates for ${label}...`);
      // Fetch fresh templates
      switch (category) {
        case "groups":
          {
            console.log(`[Task Queue] Fetching dynamic and static groups...`);
            emit?.("Fetching dynamic groups...");
            const dynamicGroups = await fetchDynamicGroups();
            emit?.(`Found ${dynamicGroups.length} dynamic groups. Fetching static groups...`);
            const staticGroups = await fetchStaticGroups();
            emit?.(`Found ${staticGroups.length} static groups`, "info");
            let allGroups = [...dynamicGroups, ...staticGroups];

            // Filter by selected items if categorySelections is provided
            const groupSelection = options?.categorySelections?.groups;
            if (groupSelection?.selectedItems && groupSelection.selectedItems.length > 0) {
              const selectedSet = new Set(groupSelection.selectedItems);
              allGroups = allGroups.filter(g => selectedSet.has(g.displayName));
              console.log(`[Task Queue] Filtered to ${allGroups.length} selected groups`);
              emit?.(`Filtered to ${allGroups.length} of ${dynamicGroups.length + staticGroups.length} groups based on selection`, "info");
            }

            items = allGroups;
            console.log(`[Task Queue] Using ${items.length} groups`);
            cacheTemplates(category, items);
          }
          break;
        case "filters":
          {
            console.log(`[Task Queue] Fetching device filters...`);
            emit?.("Fetching device filter templates...");
            let filters = await fetchFilters();

            // Filter by selected items if categorySelections is provided
            const filterSelection = options?.categorySelections?.filters;
            if (filterSelection?.selectedItems && filterSelection.selectedItems.length > 0) {
              const selectedSet = new Set(filterSelection.selectedItems);
              const totalCount = filters.length;
              filters = filters.filter(f => selectedSet.has(f.displayName));
              console.log(`[Task Queue] Filtered to ${filters.length} selected filters`);
              emit?.(`Filtered to ${filters.length} of ${totalCount} device filters based on selection`, "info");
            }

            items = filters;
            console.log(`[Task Queue] Using ${items.length} filters`);
            cacheTemplates(category, items);
          }
          break;
        case "compliance":
          {
            emit?.("Fetching compliance policy templates...");
            let policies = await fetchCompliancePolicies();

            // Filter by selected items if categorySelections is provided
            const complianceSelection = options?.categorySelections?.compliance;
            if (complianceSelection?.selectedItems && complianceSelection.selectedItems.length > 0) {
              const selectedSet = new Set(complianceSelection.selectedItems);
              const totalCount = policies.length;
              policies = policies.filter(p => selectedSet.has(p.displayName));
              console.log(`[Task Queue] Filtered to ${policies.length} selected compliance policies`);
              emit?.(`Filtered to ${policies.length} of ${totalCount} compliance policies based on selection`, "info");
            }

            items = policies;
            cacheTemplates(category, items);
          }
          break;
        case "conditionalAccess":
          {
            emit?.("Fetching conditional access policy templates...");
            let policies = await fetchConditionalAccessPolicies();

            // Filter by selected items if categorySelections is provided
            const caSelection = options?.categorySelections?.conditionalAccess;
            if (caSelection?.selectedItems && caSelection.selectedItems.length > 0) {
              const selectedSet = new Set(caSelection.selectedItems);
              const totalCount = policies.length;
              policies = policies.filter(p => selectedSet.has(p.displayName));
              console.log(`[Task Queue] Filtered to ${policies.length} selected CA policies`);
              emit?.(`Filtered to ${policies.length} of ${totalCount} conditional access policies based on selection`, "info");
            }

            items = policies;
            cacheTemplates(category, items);
          }
          break;
        case "appProtection":
          {
            emit?.("Fetching app protection policy templates...");
            let policies = await fetchAppProtectionPolicies();

            // Filter by selected items if categorySelections is provided
            const appSelection = options?.categorySelections?.appProtection;
            if (appSelection?.selectedItems && appSelection.selectedItems.length > 0) {
              const selectedSet = new Set(appSelection.selectedItems);
              const totalCount = policies.length;
              policies = policies.filter(p => selectedSet.has(p.displayName));
              console.log(`[Task Queue] Filtered to ${policies.length} selected app protection policies`);
              emit?.(`Filtered to ${policies.length} of ${totalCount} app protection policies based on selection`, "info");
            }

            items = policies;
            cacheTemplates(category, items);
          }
          break;
        case "enrollment":
          {
            emit?.("Fetching enrollment profile templates...");
            let profiles = await fetchEnrollmentProfiles() as Array<{ displayName?: string }>;

            // Filter by selected items if categorySelections is provided
            const enrollmentSelection = options?.categorySelections?.enrollment;
            if (enrollmentSelection?.selectedItems && enrollmentSelection.selectedItems.length > 0) {
              const selectedSet = new Set(enrollmentSelection.selectedItems);
              const totalCount = profiles.length;
              profiles = profiles.filter(p => selectedSet.has(p.displayName || ""));
              console.log(`[Task Queue] Filtered to ${profiles.length} selected enrollment profiles`);
              emit?.(`Filtered to ${profiles.length} of ${totalCount} enrollment profiles based on selection`, "info");
            }

            items = profiles as Array<{ displayName: string }>;
            cacheTemplates(category, items);
          }
          break;
        case "baseline":
          {
            console.log(`[Task Queue] Fetching OpenIntuneBaseline policies...`);
            emit?.("Fetching OpenIntuneBaseline policies from local templates...");
            let baselinePolicies = await fetchBaselinePolicies();
            emit?.(`Found ${baselinePolicies.length} baseline policies`, "info");

            // Filter by selected policies if baselineSelection is provided
            if (options?.baselineSelection?.selectedPolicies && options.baselineSelection.selectedPolicies.length > 0) {
              const selectedPaths = new Set(options.baselineSelection.selectedPolicies);
              const totalCount = baselinePolicies.length;
              baselinePolicies = baselinePolicies.filter(p => selectedPaths.has(p._oibFilePath));
              console.log(`[Task Queue] Filtered to ${baselinePolicies.length} selected baseline policies`);
              emit?.(`Filtered to ${baselinePolicies.length} of ${totalCount} baseline policies based on selection`, "info");
            }

            items = baselinePolicies as Array<{ displayName: string }>;
            console.log(`[Task Queue] Using ${items.length} OpenIntuneBaseline policies`);
            // Debug: Log sample policy names to verify name field exists
            if (baselinePolicies.length > 0) {
              const sample = baselinePolicies.slice(0, 3).map(p => ({ name: p.name, displayName: p.displayName }));
              console.log(`[Task Queue] Sample baseline policies:`, sample);
            }
            cacheTemplates(category, baselinePolicies); // Cache the filtered policies
            console.log(`[Task Queue] Cached ${baselinePolicies.length} baseline policies with key "${category}"`);
            // Verify cache was set
            const verifyCache = getCachedTemplates(category);
            console.log(`[Task Queue] Cache verification: ${verifyCache?.length || 0} policies in cache`);

          }
          break;
        case "cisBaseline":
          {
            console.log(`[Task Queue] Fetching CIS Intune Baselines...`);
            let cisItems: CISBaselinePolicy[];

            // Use filtered fetch if specific categories are selected (legacy approach)
            if (options?.selectedCISCategories && options.selectedCISCategories.length > 0) {
              console.log(`[Task Queue] Fetching CIS baselines for selected categories:`, options.selectedCISCategories);
              emit?.(`Fetching CIS baselines for ${options.selectedCISCategories.length} sub-categories...`);
              cisItems = await fetchCISBaselinePoliciesByCategories(options.selectedCISCategories);
              emit?.(`Found ${cisItems.length} CIS policies across ${options.selectedCISCategories.length} sub-categories`, "info");
            } else {
              emit?.("Fetching all CIS Intune Baseline policies...");
              // Fetch all if no specific categories selected
              cisItems = await fetchCISBaselinePolicies();
              emit?.(`Found ${cisItems.length} CIS baseline policies`, "info");
            }

            // Filter by selected policy paths if categorySelections is provided (new approach)
            const cisSelection = options?.categorySelections?.cisBaseline;
            if (cisSelection?.selectedItems && cisSelection.selectedItems.length > 0) {
              const selectedPaths = new Set(cisSelection.selectedItems);
              const totalCount = cisItems.length;
              cisItems = cisItems.filter(p => selectedPaths.has(p._cisFilePath));
              console.log(`[Task Queue] Filtered to ${cisItems.length} selected CIS policies`);
              emit?.(`Filtered to ${cisItems.length} of ${totalCount} CIS policies based on selection`, "info");
            }

            items = cisItems as Array<{ displayName: string }>;
            console.log(`[Task Queue] Using ${items.length} CIS baseline policies`);
            cacheTemplates(cacheKey, cisItems); // Cache the filtered policies
          }
          break;
        default:
          items = [];
      }
    }

    // Report how many tasks are being queued for this category
    emit?.(`Queuing ${items.length} ${label.toLowerCase()} tasks`, "success");

    // For delete mode with specific selections, use selectedItems directly
    // This ensures all selected items appear in the task queue, even if they don't exist in templates
    // During execution, items that don't exist in the tenant will be marked as "skipped"

    // Check if we have direct selections for this category
    const hasDirectSelections = selection && 'selectedItems' in selection && selection.selectedItems && selection.selectedItems.length > 0;

    // Special handling for baseline which uses baselineSelection instead of categorySelections
    const hasBaselineSelections = category === "baseline" && options?.baselineSelection?.selectedPolicies && options.baselineSelection.selectedPolicies.length > 0;

    if (operationMode === "delete" && hasDirectSelections) {
      console.log(`[Task Queue] Using ${selection!.selectedItems!.length} selected items directly for ${category} (delete mode)`);

      // For cisBaseline, selectedItems contains file paths - need to look up displayNames
      if (category === "cisBaseline" && items.length > 0) {
        // Build a map from file path to displayName
        const pathToDisplayName = new Map<string, string>();
        for (const item of items) {
          const itemRecord = item as Record<string, unknown>;
          const filePath = itemRecord._cisFilePath as string;
          const displayName = item.displayName || (itemRecord.name as string);
          if (filePath && displayName) {
            pathToDisplayName.set(filePath, displayName);
          }
        }

        for (const selectedPath of selection!.selectedItems!) {
          // Use displayName if found, otherwise extract name from path
          const displayName = pathToDisplayName.get(selectedPath) ||
            selectedPath.replace(/\.json$/, '').split('/').pop() ||
            selectedPath;
          tasks.push({
            id: `task-${taskId++}`,
            category,
            operation: operationMode,
            itemName: displayName,
            status: "pending",
          });
        }
      } else {
        for (const itemName of selection!.selectedItems!) {
          tasks.push({
            id: `task-${taskId++}`,
            category,
            operation: operationMode,
            itemName,
            status: "pending",
          });
        }
      }
    } else if (operationMode === "delete" && hasBaselineSelections) {
      // For baseline in delete mode, create tasks from the filtered items array
      // The items array was already filtered by selectedPolicies paths in the switch case above
      console.log(`[Task Queue] Using ${items.length} baseline items for ${category} (${operationMode} mode)`);
      for (const item of items) {
        const itemRecord = item as Record<string, unknown>;
        // Use name first (matches batchExecutor lookup order: p.name || p.displayName)
        const itemName = (itemRecord.name as string) || item.displayName || 'Unknown Policy';
        tasks.push({
          id: `task-${taskId++}`,
          category,
          operation: operationMode,
          itemName,
          status: "pending",
        });
      }
    } else {
      console.log(`[Task Queue] Creating ${items.length} tasks for ${category}:`,
        items.slice(0, 5).map(i => i.displayName || (i as Record<string, unknown>).name || 'Unknown').concat(items.length > 5 ? ['...'] : [])
      );

      for (const item of items) {
        // Get itemName with fallbacks - prefer 'name' to match batch executor lookup
        const itemRecord = item as Record<string, unknown>;
        // For file paths, extract just the name without extension
        const filePath = itemRecord._cisFilePath as string | undefined;
        const extractedName = filePath ? filePath.replace(/\.json$/, '').split('/').pop() : undefined;
        // Use name first (matches batchExecutor lookup order: p.name || p.displayName)
        const itemName = (itemRecord.name as string) || item.displayName || extractedName || 'Unknown Policy';

        tasks.push({
          id: `task-${taskId++}`,
          category,
          operation: operationMode,
          itemName,
          status: "pending",
        });
      }
    }
  }

  // Deduplicate tasks by itemName within each category to prevent multiple creations/deletions
  // This handles cases where templates might have duplicate displayNames or where the same
  // policy appears in multiple template sources
  const seenItems = new Map<string, Set<string>>(); // category -> set of itemNames
  const deduplicatedTasks = tasks.filter((task) => {
    if (!seenItems.has(task.category)) {
      seenItems.set(task.category, new Set());
    }
    const categoryItems = seenItems.get(task.category)!;
    const lowerName = task.itemName.toLowerCase();
    if (categoryItems.has(lowerName)) {
      console.log(`[Task Queue] Removed duplicate: "${task.itemName}" (${task.category})`);
      return false;
    }
    categoryItems.add(lowerName);
    return true;
  });

  const duplicateCount = tasks.length - deduplicatedTasks.length;
  if (duplicateCount > 0) {
    console.log(`[Task Queue] Removed ${duplicateCount} duplicate task(s)`);
    emit?.(`Removed ${duplicateCount} duplicate task(s)`, "info");
  }

  emit?.(`Deduplication complete. ${deduplicatedTasks.length} tasks ready for execution`, "success");
  console.log(`[Task Queue] Task queue built successfully with ${deduplicatedTasks.length} total tasks`);
  return deduplicatedTasks;
}

/**
 * Get estimated task count for selected categories
 * Takes into account individual item selections if provided
 */
export function getEstimatedTaskCount(
  selectedCategories: TaskCategory[],
  categorySelections?: CategorySelections
): number {
  let count = 0;

  for (const category of selectedCategories) {
    count += getEstimatedCategoryCount(category, categorySelections);
  }

  return count;
}

/**
 * Get estimated count for a single category
 * Returns selection count if items are selected, otherwise returns metadata count
 */
export function getEstimatedCategoryCount(
  category: TaskCategory,
  categorySelections?: CategorySelections
): number {
  // Check if we have individual item selections for this category
  if (categorySelections) {
    const selectionKey = category as keyof CategorySelections;
    const selection = categorySelections[selectionKey];

    if (selection) {
      // For baseline, use selectedPolicies
      if (selectionKey === 'baseline' && 'selectedPolicies' in selection) {
        return selection.selectedPolicies.length;
      }
      // For other categories, use selectedItems
      if ('selectedItems' in selection && selection.selectedItems.length > 0) {
        return selection.selectedItems.length;
      }
    }
  }

  // Fall back to metadata count if no selections
  const metadata = Templates.TEMPLATE_METADATA[category as keyof typeof Templates.TEMPLATE_METADATA];
  return metadata?.count || 0;
}
