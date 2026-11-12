/* oxlint-disable react-doctor/async-await-in-loop -- task queue assembly preserves category ordering and cache side effects. */
/**
 * Task Queue Builder
 * Functions for building the hydration task queue from selected categories
 */

import {
  HydrationTask,
  OperationMode,
  TaskCategory,
  CategorySelections,
} from "@/types/hydration";
import type { BuildTaskQueueOptions } from "@/lib/hydration/types";
import { getTaskCategoryLabel } from "@/lib/hydration/categoryLabels";
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
  type TemplateLoadReport,
} from "@/lib/templates/loader";

type TemplateItem = { displayName: string } & Record<string, unknown>;
type QueueOptions = Omit<BuildTaskQueueOptions, "selectedCategories" | "operationMode">;
type TemplateLoad = (throwIfCancelled: () => void, report: TemplateLoadReport) => Promise<TemplateItem[]>;

function getTaskDedupKey(task: HydrationTask): string {
  return task.templatePath || task.itemName;
}

/**
 * Get the selected template keys for a category.
 * Returns undefined when there is no selection object (all templates are queued).
 * Returns an empty set for an explicit empty selection (no templates are queued).
 */
function getSelectedKeys(category: TaskCategory, options?: QueueOptions): Set<string> | undefined {
  if (category === "baseline") {
    const baselineSelection = options?.categorySelections?.baseline ?? options?.baselineSelection;
    return baselineSelection ? new Set(baselineSelection.selectedPolicies) : undefined;
  }

  const selection = options?.categorySelections?.[category as keyof CategorySelections];
  return selection && "selectedItems" in selection ? new Set(selection.selectedItems) : undefined;
}

/**
 * Get the key that a selection uses to identify a template.
 */
function getTemplateSelectionKey(category: TaskCategory, template: TemplateItem): string {
  if (category === "baseline") return template._oibFilePath as string;
  if (category === "cisBaseline") return template._cisFilePath as string;
  return template.displayName;
}

async function fetchAllGroups(throwIfCancelled: () => void, report: TemplateLoadReport): Promise<TemplateItem[]> {
  const dynamicGroups = await fetchDynamicGroups(report);
  throwIfCancelled();
  const staticGroups = await fetchStaticGroups(report);
  return [...dynamicGroups, ...staticGroups] as unknown as TemplateItem[];
}

async function fetchEnrollmentTemplates(_throwIfCancelled: () => void, report: TemplateLoadReport): Promise<TemplateItem[]> {
  const profiles = (await fetchEnrollmentProfiles(report)) as Array<{ displayName?: string; name?: string }>;
  return profiles.map((profile) => ({
    ...profile,
    displayName: profile.displayName || profile.name || "Unknown Profile",
  }));
}

/**
 * Get the cache key and loader for the complete template list of a category.
 * The cached content depends only on the cache key, never on an item selection.
 */
function getTemplateSource(
  category: TaskCategory,
  selectedKeys: Set<string> | undefined,
  options?: QueueOptions,
): { cacheKey: string; load: TemplateLoad } {
  const asItems =
    <T>(load: (report: TemplateLoadReport) => Promise<T[]> | T[]): TemplateLoad =>
    async (_throwIfCancelled, report) =>
      (await load(report)) as unknown as TemplateItem[];

  switch (category) {
    case "groups":
      return { cacheKey: category, load: fetchAllGroups };
    case "filters":
      return { cacheKey: category, load: asItems(fetchFilters) };
    case "compliance":
      return { cacheKey: category, load: asItems(fetchCompliancePolicies) };
    case "conditionalAccess":
      return { cacheKey: category, load: asItems(fetchConditionalAccessPolicies) };
    case "appProtection":
      return { cacheKey: category, load: asItems(fetchAppProtectionPolicies) };
    case "win32Apps":
      return { cacheKey: category, load: asItems(() => [...Templates.getWin32AppTemplates()]) };
    case "enrollment":
      return { cacheKey: category, load: fetchEnrollmentTemplates };
    case "baseline":
      return { cacheKey: category, load: asItems(fetchBaselinePolicies) };
    case "cisBaseline": {
      // A policy path selection needs every CIS policy. Without one, load only the selected sub-categories.
      const cisCategories = options?.selectedCISCategories?.length ? options.selectedCISCategories : undefined;
      if (selectedKeys || !cisCategories) {
        return { cacheKey: category, load: asItems(fetchCISBaselinePolicies) };
      }
      return {
        cacheKey: `${category}-${cisCategories.toSorted().join(",")}`,
        load: asItems((report) => fetchCISBaselinePoliciesByCategories(cisCategories, report)),
      };
    }
    default:
      return { cacheKey: category, load: async () => [] };
  }
}

function formatList(values: string[], limit = 5): string {
  const shown = values.slice(0, limit).join(", ");
  return values.length > limit ? `${shown} and ${values.length - limit} more` : shown;
}

/**
 * Check an incomplete template load. Throws when a template this run needs is missing,
 * so it is reported instead of silently dropped from the queue.
 */
function assertIncompleteLoadCoversSelection(
  category: TaskCategory,
  label: string,
  templates: TemplateItem[],
  selectedKeys: Set<string> | undefined,
  failedFiles: string[],
): void {
  const loadedKeys = new Set(templates.map((template) => getTemplateSelectionKey(category, template)));
  const missingKeys = selectedKeys ? [...selectedKeys].filter((key) => !loadedKeys.has(key)) : [];
  if (selectedKeys && missingKeys.length === 0) return;

  const missingDetail = selectedKeys ? ` Selected templates not loaded: ${formatList(missingKeys)}.` : "";
  throw new Error(
    `Could not load ${failedFiles.length} ${label} template file(s): ${formatList(failedFiles)}.${missingDetail} ` +
      "Check your connection and start the run again.",
  );
}

/**
 * Build task queue from selected categories (async version)
 * Fetches real templates from local IntuneTemplates directory
 */
export async function buildTaskQueueAsync(
  selectedCategories: TaskCategory[],
  operationMode: OperationMode,
  options?: QueueOptions,
): Promise<HydrationTask[]> {
  const emit = options?.onProgress;
  const throwIfCancelled = (): void => {
    if (options?.shouldCancel?.()) {
      throw new Error("Task queue construction cancelled.");
    }
  };
  const loadTemplates = async <T>(load: () => Promise<T>): Promise<T> => {
    throwIfCancelled();
    const value = await load();
    throwIfCancelled();
    return value;
  };
  console.log(`[Task Queue] Building task queue for categories:`, selectedCategories);
  emit?.(
    `Preparing ${selectedCategories.length} categor${selectedCategories.length === 1 ? "y" : "ies"}: ${selectedCategories.join(", ")}`,
  );
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
    throwIfCancelled();
    console.log(`[Task Queue] Processing category: ${category}`);
    const label = getTaskCategoryLabel(category);
    emit?.(`[${categoryIndex + 1}/${selectedCategories.length}] Loading templates for ${label}...`);
    const categorySelections = options?.categorySelections;
    const selectionKey = category as keyof CategorySelections;
    const selection = categorySelections?.[selectionKey];
    const selectedKeys = getSelectedKeys(category, options);

    let items: TemplateItem[] = [];
    if (selectedKeys?.size === 0) {
      emit?.(`No ${label.toLowerCase()} items are selected`, "info");
    } else {
      const source = getTemplateSource(category, selectedKeys, options);
      // An incomplete list from an earlier failed load is never reused; it is reloaded instead.
      const cached = getCachedTemplates(source.cacheKey, { completeOnly: true }) as TemplateItem[] | null;
      let templates: TemplateItem[];
      if (cached) {
        emit?.(`Using ${cached.length} cached templates for ${label}`, "info");
        templates = cached;
      } else {
        emit?.(`Fetching templates for ${label}...`);
        const report: TemplateLoadReport = { failedFiles: [] };
        templates = await loadTemplates(() => source.load(throwIfCancelled, report));
        const complete = report.failedFiles.length === 0;
        if (!complete) {
          // A delete with a direct selection queues the selected tenant object names as they
          // are, so it does not need the templates. CIS is the exception: its selection is a
          // list of file paths that the templates map to display names.
          const queuesSelectionDirectly =
            operationMode === "delete" &&
            category !== "cisBaseline" &&
            !!selection &&
            "selectedItems" in selection &&
            !!selection.selectedItems?.length;
          if (queuesSelectionDirectly) {
            emit?.(
              `${report.failedFiles.length} ${label.toLowerCase()} template file(s) failed to load; the selected items are queued by name`,
              "warning",
            );
          } else {
            assertIncompleteLoadCoversSelection(category, label, templates, selectedKeys, report.failedFiles);
            emit?.(
              `${report.failedFiles.length} ${label.toLowerCase()} template file(s) failed to load; every selected template loaded`,
              "warning",
            );
          }
        }
        // Only the unfiltered template list is cached; the selection is applied per run. An incomplete
        // list stays readable for this run's executors but is reloaded by the next run.
        cacheTemplates(source.cacheKey, templates, { complete });
      }

      items = selectedKeys
        ? templates.filter((template) => selectedKeys.has(getTemplateSelectionKey(category, template)))
        : templates;
      if (selectedKeys) {
        emit?.(`Filtered to ${items.length} of ${templates.length} ${label.toLowerCase()} based on selection`, "info");
      }
    }

    // Report how many tasks are being queued for this category
    emit?.(`Queuing ${items.length} ${label.toLowerCase()} tasks`, "success");

    // For delete mode with specific selections, use selectedItems directly
    // This ensures all selected items appear in the task queue, even if they don't exist in templates
    // During execution, items that don't exist in the tenant will be marked as "skipped"

    // Check if we have direct selections for this category
    const hasDirectSelections =
      selection && "selectedItems" in selection && selection.selectedItems && selection.selectedItems.length > 0;

    // Special handling for baseline which uses baselineSelection instead of categorySelections
    const hasBaselineSelections = category === "baseline" && selectedKeys !== undefined;

    if (operationMode === "delete" && hasDirectSelections) {
      console.log(
        `[Task Queue] Using ${selection!.selectedItems!.length} selected items directly for ${category} (delete mode)`,
      );

      // For cisBaseline, selectedItems contains file paths - need to look up displayNames
      if (category === "cisBaseline" && items.length > 0) {
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
          const displayName =
            pathToDisplayName.get(selectedPath) ||
            selectedPath
              .replace(/\.json$/, "")
              .split("/")
              .pop() ||
            selectedPath;
          tasks.push({
            id: `task-${taskId++}`,
            category,
            operation: operationMode,
            itemName: displayName,
            templatePath: selectedPath,
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
        const itemName = (itemRecord.name as string) || item.displayName || "Unknown Policy";
        tasks.push({
          id: `task-${taskId++}`,
          category,
          operation: operationMode,
          itemName,
          templatePath: itemRecord._oibFilePath as string | undefined,
          status: "pending",
        });
      }
    } else {
      console.log(
        `[Task Queue] Creating ${items.length} tasks for ${category}:`,
        items
          .slice(0, 5)
          .map((i) => i.displayName || (i as Record<string, unknown>).name || "Unknown")
          .concat(items.length > 5 ? ["..."] : []),
      );

      for (const item of items) {
        // Get itemName with fallbacks - prefer 'name' to match batch executor lookup
        const itemRecord = item as Record<string, unknown>;
        // For file paths, extract just the name without extension
        const filePath = itemRecord._cisFilePath as string | undefined;
        const extractedName = filePath
          ? filePath
              .replace(/\.json$/, "")
              .split("/")
              .pop()
          : undefined;
        // Use name first (matches batchExecutor lookup order: p.name || p.displayName)
        const itemName = (itemRecord.name as string) || item.displayName || extractedName || "Unknown Policy";

        tasks.push({
          id: `task-${taskId++}`,
          category,
          operation: operationMode,
          itemName,
          templatePath:
            category === "cisBaseline"
              ? filePath
              : category === "baseline"
                ? (itemRecord._oibFilePath as string | undefined)
                : undefined,
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
    const lowerName = getTaskDedupKey(task).toLowerCase();
    if (categoryItems.has(lowerName)) {
      console.log(`[Task Queue] Removed duplicate: "${getTaskDedupKey(task)}" (${task.category})`);
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
  categorySelections?: CategorySelections,
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
export function getEstimatedCategoryCount(category: TaskCategory, categorySelections?: CategorySelections): number {
  // Check if we have individual item selections for this category
  if (categorySelections) {
    const selectionKey = category as keyof CategorySelections;
    const selection = categorySelections[selectionKey];

    if (selection) {
      // For baseline, use selectedPolicies
      if (selectionKey === "baseline" && "selectedPolicies" in selection) {
        return selection.selectedPolicies.length;
      }
      // For other categories, use selectedItems. An explicit empty selection means no items.
      if ("selectedItems" in selection) {
        return selection.selectedItems.length;
      }
    }
  }

  // Fall back to metadata count if there is no selection object
  const metadata = Templates.TEMPLATE_METADATA[category as keyof typeof Templates.TEMPLATE_METADATA];
  return metadata?.count || 0;
}
