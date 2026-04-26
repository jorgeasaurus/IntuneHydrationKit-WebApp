/**
 * Central export for Intune Hydration Kit execution engine and utilities
 *
 * This module provides a modular structure for the hydration engine:
 * - types.ts: Shared type definitions (ExecutionContext, ExecutionResult, CISPolicyType)
 * - utils.ts: Utility functions (sleep, escapeODataString, etc.)
 * - cleaners.ts: Policy cleaning functions
 * - policyCreators.ts: Policy creation functions
 * - policyDetection.ts: Policy type detection
 * - taskQueue.ts: Task queue building functions
 * - taskExecutors/: Category-specific task executors
 * - engine.ts: Main execution engine (orchestrates task execution)
 *
 * For new code, prefer importing from the specific module files.
 */

// Main Engine, Validator, Reporter
export * from "./engine";
export * from "./validator";
export * from "./reporter";

// Types
export type { ExecutionContext, ExecutionResult, CISPolicyType, BuildTaskQueueOptions } from "./types";

// Task Queue Building
export {
  buildTaskQueue,
  buildTaskQueueAsync,
  getEstimatedTaskCount,
  getEstimatedCategoryCount,
} from "./taskQueue";

// Task Executors
export {
  executeGroupTask,
  executeFilterTask,
  executeComplianceTask,
  executeConditionalAccessTask,
  executeAppProtectionTask,
  executeEnrollmentTask,
  executeBaselineTask,
  executeCISBaselineTask,
} from "./taskExecutors";

// Utility functions
export {
  sleep,
  waitWhilePaused,
  sleepWithExecutionControl,
  escapeODataString,
  containsSecretPlaceholders,
  isActualSecretField,
} from "./utils";

// Cleaner functions
export {
  cleanSettingInstance,
  cleanSettingsCatalogPolicy,
  cleanPolicyRecursively,
} from "./cleaners";

// Policy creation functions
export {
  settingsCatalogPolicyExists,
  createSettingsCatalogPolicy,
  createDeviceConfigurationPolicy,
  createDriverUpdateProfile,
  compliancePolicyExistsByName,
  createBaselineCompliancePolicy,
  createCISCompliancePolicy,
  createV2CompliancePolicy,
  v2CompliancePolicyExists,
  createCISDeviceConfiguration,
  deviceConfigurationExists,
} from "./policyCreators";

// Policy detection
export {
  detectCISPolicyType,
} from "./policyDetection";
