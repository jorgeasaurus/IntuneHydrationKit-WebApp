/**
 * Hydration Execution Engine
 * Manages task queue and executes operations against Microsoft Graph API
 */

import { GraphClient } from "@/lib/graph/client";
import { HydrationTask, OperationMode, TaskCategory } from "@/types/hydration";
import {
  DeviceGroup,
  DeviceFilter,
  CompliancePolicy,
  ConditionalAccessPolicy,
  AppProtectionPolicy,
} from "@/types/graph";
import {
  createGroup,
  deleteGroupByName,
  groupExists,
} from "@/lib/graph/groups";
import {
  createFilter,
  deleteFilterByName,
  filterExists,
} from "@/lib/graph/filters";
import {
  createCompliancePolicy,
  deleteCompliancePolicyByName,
  compliancePolicyExists,
} from "@/lib/graph/compliance";
import {
  createConditionalAccessPolicy,
  deleteConditionalAccessPolicyByName,
  conditionalAccessPolicyExists,
} from "@/lib/graph/conditionalAccess";
import {
  createAppProtectionPolicy,
  appProtectionPolicyExists,
  getAppProtectionPolicyByName,
  deleteAppProtectionPolicy,
} from "@/lib/graph/appProtection";
import * as Templates from "@/templates";
import {
  fetchDynamicGroups,
  fetchStaticGroups,
  fetchFilters,
  fetchCompliancePolicies,
  fetchConditionalAccessPolicies,
  fetchAppProtectionPolicies,
  fetchEnrollmentProfiles,
  fetchBaselinePolicies,
  getCachedTemplates,
  cacheTemplates,
  GroupTemplate,
  FilterTemplate,
  ComplianceTemplate,
  ConditionalAccessTemplate,
  AppProtectionTemplate,
} from "@/lib/templates/loader";

/**
 * Task execution context
 */
export interface ExecutionContext {
  client: GraphClient;
  operationMode: OperationMode;
  stopOnFirstError: boolean;
  onTaskStart?: (task: HydrationTask) => void;
  onTaskComplete?: (task: HydrationTask) => void;
  onTaskError?: (task: HydrationTask, error: Error) => void;
  shouldCancel?: () => boolean;
  shouldPause?: () => boolean;
}

/**
 * Task execution result
 */
export interface ExecutionResult {
  task: HydrationTask;
  success: boolean;
  skipped: boolean;
  error?: string;
  createdId?: string;
}

/**
 * Sleep utility for delays between tasks
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a single task
 */
async function executeTask(
  task: HydrationTask,
  context: ExecutionContext
): Promise<ExecutionResult> {
  console.log(`[Execute Task] Starting task: ${task.category} - "${task.itemName}" (mode: ${context.operationMode})`);
  const { client, operationMode } = context;

  // Update task status to running
  task.status = "running";
  task.startTime = new Date();
  context.onTaskStart?.(task);

  // Give React time to render the "running" state before task completes
  await sleep(100);

  try {
    let result: ExecutionResult;

    console.log(`[Execute Task] Routing to handler for category: ${task.category}`);
    switch (task.category) {
      case "groups":
        result = await executeGroupTask(task, client, operationMode);
        break;
      case "filters":
        result = await executeFilterTask(task, client, operationMode);
        break;
      case "compliance":
        result = await executeComplianceTask(task, client, operationMode);
        break;
      case "conditionalAccess":
        result = await executeConditionalAccessTask(task, client, operationMode);
        break;
      case "appProtection":
        result = await executeAppProtectionTask(task, client, operationMode);
        break;
      default:
        result = {
          task,
          success: false,
          skipped: false,
          error: `Unknown task category: ${task.category}`,
        };
    }

    // Update task with result
    task.status = result.skipped ? "skipped" : result.success ? "success" : "failed";
    task.error = result.error;
    task.endTime = new Date();

    console.log(`[Execute Task] Task completed:`, {
      itemName: task.itemName,
      status: task.status,
      success: result.success,
      skipped: result.skipped,
      error: result.error
    });

    if (result.success || result.skipped) {
      context.onTaskComplete?.(task);
    } else if (result.error) {
      context.onTaskError?.(task, new Error(result.error));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Execute Task] ✗ Exception caught for "${task.itemName}":`, errorMessage);
    console.error(`[Execute Task] Stack trace:`, error);
    task.status = "failed";
    task.error = errorMessage;
    task.endTime = new Date();
    context.onTaskError?.(task, error as Error);

    return {
      task,
      success: false,
      skipped: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute a group task (create or delete)
 */
async function executeGroupTask(
  task: HydrationTask,
  client: GraphClient,
  mode: OperationMode
): Promise<ExecutionResult> {
  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  console.log(`[Group Task] Looking up template for: "${task.itemName}"`);
  let template: GroupTemplate | DeviceGroup | undefined;
  const cachedGroups = getCachedTemplates("groups");

  if (cachedGroups && Array.isArray(cachedGroups)) {
    console.log(`[Group Task] Found ${cachedGroups.length} cached group templates`);
    template = (cachedGroups as GroupTemplate[]).find((g) => g.displayName === task.itemName);
    if (template) {
      console.log(`[Group Task] ✓ Found template in cache: "${template.displayName}"`);
    } else {
      console.log(`[Group Task] Template "${task.itemName}" not found in cache`);
    }
  } else {
    console.log("[Group Task] No cached templates found");
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    console.log("[Group Task] Trying hardcoded templates...");
    template = Templates.getDynamicGroupByName(task.itemName);
    if (template) {
      console.log(`[Group Task] ✓ Found template in hardcoded templates: "${template.displayName}"`);
    }
  }

  if (!template) {
    console.error(`[Group Task] ✗ Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if group already exists
    console.log(`[Group Task] Checking if group exists: "${template.displayName}"`);
    const exists = await groupExists(client, template.displayName);
    if (exists) {
      console.log(`[Group Task] Group already exists, skipping: "${template.displayName}"`);
      return {
        task,
        success: false,
        skipped: true,
        error: "Group already exists",
      };
    }

    // Convert template to full DeviceGroup format if it's a simple template
    let fullGroupTemplate: DeviceGroup = template as DeviceGroup;
    if (!("@odata.type" in template)) {
      console.log(`[Group Task] Converting simple template to full DeviceGroup format`);
      const simpleTemplate = template as GroupTemplate;
      fullGroupTemplate = {
        "@odata.type": "#microsoft.graph.group",
        displayName: simpleTemplate.displayName,
        description: simpleTemplate.description,
        groupTypes: ["DynamicMembership"],
        mailEnabled: false,
        mailNickname: simpleTemplate.displayName.replace(/[^a-zA-Z0-9]/g, ""),
        securityEnabled: true,
        membershipRule: simpleTemplate.membershipRule,
        membershipRuleProcessingState: "On",
      };
      console.log(`[Group Task] Template converted:`, {
        displayName: fullGroupTemplate.displayName,
        mailNickname: fullGroupTemplate.mailNickname,
        hasMembershipRule: !!fullGroupTemplate.membershipRule,
      });
    } else {
      console.log(`[Group Task] Using full template directly (has @odata.type)`);
    }

    // Create the group
    console.log(`[Group Task] Creating group: "${fullGroupTemplate.displayName}"`);
    const created = await createGroup(client, fullGroupTemplate);
    console.log(`[Group Task] ✓ Group created successfully with ID: ${created.id}`);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Delete the group
    await deleteGroupByName(client, template.displayName);
    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a filter task (create or delete)
 */
async function executeFilterTask(
  task: HydrationTask,
  client: GraphClient,
  mode: OperationMode
): Promise<ExecutionResult> {
  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  console.log(`[Filter Task] Looking up template for: "${task.itemName}"`);
  let template: FilterTemplate | DeviceFilter | undefined;
  const cachedFilters = getCachedTemplates("filters");

  if (cachedFilters && Array.isArray(cachedFilters)) {
    console.log(`[Filter Task] Found ${cachedFilters.length} cached filter templates`);
    template = (cachedFilters as FilterTemplate[]).find((f) => f.displayName === task.itemName);
    if (template) {
      console.log(`[Filter Task] ✓ Found template in cache: "${template.displayName}"`);
    } else {
      console.log(`[Filter Task] Template "${task.itemName}" not found in cache`);
    }
  } else {
    console.log("[Filter Task] No cached templates found");
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    console.log("[Filter Task] Trying hardcoded templates...");
    template = Templates.getDeviceFilterByName(task.itemName);
    if (template) {
      console.log(`[Filter Task] ✓ Found template in hardcoded templates: "${template.displayName}"`);
    }
  }

  if (!template) {
    console.error(`[Filter Task] ✗ Template not found for: "${task.itemName}"`);
    return { task, success: false, skipped: false, error: `Template not found for ${task.itemName}` };
  }

  if (mode === "create") {
    // Check if filter already exists
    console.log(`[Filter Task] Checking if filter exists: "${template.displayName}"`);
    const exists = await filterExists(client, template.displayName);
    if (exists) {
      console.log(`[Filter Task] Filter already exists, skipping: "${template.displayName}"`);
      return {
        task,
        success: false,
        skipped: true,
        error: "Filter already exists",
      };
    }

    // Convert template to full DeviceFilter format if it's a simple template
    let fullFilterTemplate: DeviceFilter = template as DeviceFilter;
    if (!("@odata.type" in template)) {
      console.log(`[Filter Task] Converting simple template to full DeviceFilter format`);
      const simpleTemplate = template as FilterTemplate;
      fullFilterTemplate = {
        "@odata.type": "#microsoft.graph.assignmentFilter",
        displayName: simpleTemplate.displayName,
        description: simpleTemplate.description,
        platform: simpleTemplate.platform as "android" | "iOS" | "macOS" | "windows10AndLater",
        rule: simpleTemplate.rule,
      };
      console.log(`[Filter Task] Template converted:`, {
        displayName: fullFilterTemplate.displayName,
        platform: fullFilterTemplate.platform,
        hasRule: !!fullFilterTemplate.rule,
      });
    } else {
      console.log(`[Filter Task] Using full template directly (has @odata.type)`);
    }

    // Create the filter
    console.log(`[Filter Task] Creating filter: "${fullFilterTemplate.displayName}"`);
    const created = await createFilter(client, fullFilterTemplate);
    console.log(`[Filter Task] ✓ Filter created successfully with ID: ${created.id}`);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Delete the filter
    await deleteFilterByName(client, template.displayName);
    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a compliance policy task (create or delete)
 */
async function executeComplianceTask(
  task: HydrationTask,
  client: GraphClient,
  mode: OperationMode
): Promise<ExecutionResult> {
  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: ComplianceTemplate | CompliancePolicy | undefined;
  const cachedCompliance = getCachedTemplates("compliance");
  if (cachedCompliance && Array.isArray(cachedCompliance)) {
    template = (cachedCompliance as ComplianceTemplate[]).find((c) => c.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getCompliancePolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  if (mode === "create") {
    // Check if policy already exists
    const exists = await compliancePolicyExists(client, template.displayName);
    if (exists) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Policy already exists",
      };
    }

    // Create the policy
    const created = await createCompliancePolicy(client, template);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Delete the policy
    await deleteCompliancePolicyByName(client, template.displayName);
    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a conditional access policy task (create or delete)
 */
async function executeConditionalAccessTask(
  task: HydrationTask,
  client: GraphClient,
  mode: OperationMode
): Promise<ExecutionResult> {
  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: ConditionalAccessTemplate | ConditionalAccessPolicy | undefined;
  const cachedCA = getCachedTemplates("conditionalAccess");
  if (cachedCA && Array.isArray(cachedCA)) {
    template = (cachedCA as ConditionalAccessTemplate[]).find((ca) => ca.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getConditionalAccessPolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  if (mode === "create") {
    // Check if policy already exists
    const exists = await conditionalAccessPolicyExists(client, template.displayName);
    if (exists) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Policy already exists",
      };
    }

    // Convert template to full ConditionalAccessPolicy format if needed
    let fullCATemplate: ConditionalAccessPolicy = template as ConditionalAccessPolicy;
    if (!("@odata.type" in template)) {
      const simpleTemplate = template as ConditionalAccessTemplate;
      fullCATemplate = {
        "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
        displayName: simpleTemplate.displayName,
        state: simpleTemplate.state as "enabled" | "disabled" | "enabledForReportingButNotEnforced",
        conditions: simpleTemplate.conditions as { [key: string]: unknown },
        grantControls: simpleTemplate.grantControls,
        sessionControls: simpleTemplate.sessionControls,
      };
    }

    // Create the policy (will be forced to disabled state)
    const created = await createConditionalAccessPolicy(client, fullCATemplate);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Delete the policy (must be disabled first)
    await deleteConditionalAccessPolicyByName(client, template.displayName);
    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute an app protection policy task (create or delete)
 */
async function executeAppProtectionTask(
  task: HydrationTask,
  client: GraphClient,
  mode: OperationMode
): Promise<ExecutionResult> {
  if (mode === "preview") {
    return { task, success: true, skipped: false };
  }

  // Try to get template from cache first, fallback to hardcoded templates
  let template: AppProtectionTemplate | AppProtectionPolicy | undefined;
  const cachedAppProtection = getCachedTemplates("appProtection");
  if (cachedAppProtection && Array.isArray(cachedAppProtection)) {
    template = (cachedAppProtection as AppProtectionTemplate[]).find((ap) => ap.displayName === task.itemName);
  }

  // Fallback to hardcoded templates if not in cache
  if (!template) {
    template = Templates.getAppProtectionPolicyByName(task.itemName);
  }

  if (!template) {
    return { task, success: false, skipped: false, error: "Template not found" };
  }

  if (mode === "create") {
    // Check if policy already exists
    const exists = await appProtectionPolicyExists(client, template.displayName);
    if (exists) {
      return {
        task,
        success: false,
        skipped: true,
        error: "Policy already exists",
      };
    }

    // Create the policy
    const created = await createAppProtectionPolicy(client, template);
    return {
      task,
      success: true,
      skipped: false,
      createdId: created.id,
    };
  } else if (mode === "delete") {
    // Get the policy to determine platform
    const policy = await getAppProtectionPolicyByName(client, template.displayName);
    if (!policy || !policy.id) {
      return { task, success: false, skipped: false, error: "Policy not found" };
    }

    const platform = policy["@odata.type"] === "#microsoft.graph.iosManagedAppProtection" ? "iOS" : "android";

    // Delete the policy
    await deleteAppProtectionPolicy(client, policy.id, platform);
    return { task, success: true, skipped: false };
  }

  return { task, success: false, skipped: false, error: "Invalid operation mode" };
}

/**
 * Execute a queue of tasks sequentially with delays
 */
export async function executeTasks(
  tasks: HydrationTask[],
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const TASK_DELAY_MS = 2000; // 2 second delay between tasks

  for (const task of tasks) {
    // Check for cancellation before starting task
    if (context.shouldCancel?.()) {
      console.log("[Execute Tasks] Execution cancelled by user");
      // Mark remaining tasks as skipped
      for (let i = tasks.indexOf(task); i < tasks.length; i++) {
        tasks[i].status = "skipped";
        tasks[i].error = "Cancelled by user";
      }
      break;
    }

    // Handle pause
    while (context.shouldPause?.()) {
      console.log("[Execute Tasks] Execution paused, waiting...");
      await sleep(500);
    }

    const result = await executeTask(task, context);
    results.push(result);

    // Stop on first error if configured
    if (context.stopOnFirstError && !result.success && !result.skipped) {
      break;
    }

    // Add delay between tasks to avoid API throttling
    if (tasks.indexOf(task) < tasks.length - 1) {
      await sleep(TASK_DELAY_MS);
    }
  }

  return results;
}

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
 * Fetches real templates from PowerShell repository
 */
export async function buildTaskQueueAsync(
  selectedCategories: TaskCategory[],
  operationMode: OperationMode,
  baselineConfig?: { repoUrl: string; branch: string }
): Promise<HydrationTask[]> {
  console.log(`[Task Queue] Building task queue for categories:`, selectedCategories);
  const tasks: HydrationTask[] = [];
  let taskId = 1;

  for (const category of selectedCategories) {
    console.log(`[Task Queue] Processing category: ${category}`);
    let items: Array<{ displayName: string }> = [];

    // Try to get from cache first
    const cached = getCachedTemplates(category);
    if (cached && Array.isArray(cached)) {
      console.log(`[Task Queue] ✓ Using ${cached.length} cached templates for ${category}`);
      items = cached as Array<{ displayName: string }>;
    } else {
      console.log(`[Task Queue] Cache miss for ${category}, fetching fresh templates...`);
      // Fetch fresh templates
      switch (category) {
        case "groups":
          {
            console.log(`[Task Queue] Fetching dynamic and static groups...`);
            const dynamicGroups = await fetchDynamicGroups();
            const staticGroups = await fetchStaticGroups();
            items = [...dynamicGroups, ...staticGroups];
            console.log(`[Task Queue] ✓ Fetched ${dynamicGroups.length} dynamic + ${staticGroups.length} static groups`);
            cacheTemplates(category, items);
          }
          break;
        case "filters":
          console.log(`[Task Queue] Fetching device filters...`);
          items = await fetchFilters();
          console.log(`[Task Queue] ✓ Fetched ${items.length} filters`);
          cacheTemplates(category, items);
          break;
        case "baseline":
          if (baselineConfig) {
            const baselinePolicies = await fetchBaselinePolicies(
              baselineConfig.repoUrl,
              baselineConfig.branch
            );
            items = baselinePolicies as Array<{ displayName: string }>;
            cacheTemplates(category, items);
          } else {
            // Fallback to placeholder
            items = Array.from({ length: 70 }, (_, i) => ({
              displayName: `Baseline Policy ${i + 1}`,
            }));
          }
          break;
        case "compliance":
          items = await fetchCompliancePolicies();
          cacheTemplates(category, items);
          break;
        case "conditionalAccess":
          items = await fetchConditionalAccessPolicies();
          cacheTemplates(category, items);
          break;
        case "appProtection":
          items = await fetchAppProtectionPolicies();
          cacheTemplates(category, items);
          break;
        case "enrollment":
          {
            const profiles = await fetchEnrollmentProfiles();
            items = profiles as Array<{ displayName: string }>;
            cacheTemplates(category, items);
          }
          break;
        default:
          items = [];
      }
    }

    console.log(`[Task Queue] Creating ${items.length} tasks for ${category}:`,
      items.slice(0, 5).map(i => i.displayName).concat(items.length > 5 ? ['...'] : [])
    );

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

  console.log(`[Task Queue] ✓ Task queue built successfully with ${tasks.length} total tasks`);
  return tasks;
}

/**
 * Get estimated task count for selected categories
 */
export function getEstimatedTaskCount(selectedCategories: TaskCategory[]): number {
  let count = 0;

  for (const category of selectedCategories) {
    const metadata = Templates.TEMPLATE_METADATA[category as keyof typeof Templates.TEMPLATE_METADATA];
    if (metadata) {
      count += metadata.count;
    }
  }

  return count;
}
