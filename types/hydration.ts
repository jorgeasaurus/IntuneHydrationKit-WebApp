/**
 * Type definitions for Intune Hydration Kit application
 */

import { PrerequisiteCheckResult } from "./prerequisites";

export type CloudEnvironment = "global";

export const OPERATION_MODES = ["create", "delete"] as const;

export type OperationMode = (typeof OPERATION_MODES)[number];

export const TASK_STATUSES = [
  "pending",
  "running",
  "success",
  "failed",
  "skipped",
] as const;

export const NON_SKIPPED_TASK_STATUSES = [
  "pending",
  "running",
  "success",
  "failed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const SKIP_KINDS = ["noOp", "blocked", "cancelled"] as const;

export type SkipKind = (typeof SKIP_KINDS)[number];

export const EXECUTION_OUTCOMES = [
  "succeeded",
  "completedWithIssues",
  "cancelled",
  "failed",
] as const;

export const REPORTABLE_EXECUTION_OUTCOMES = [
  "succeeded",
  "completedWithIssues",
  "cancelled",
] as const;

export type ExecutionOutcome = (typeof EXECUTION_OUTCOMES)[number];
export type ReportableExecutionOutcome = (typeof REPORTABLE_EXECUTION_OUTCOMES)[number];

export const TASK_CATEGORIES = [
  "groups",
  "filters",
  "compliance",
  "appProtection",
  "win32Apps",
  "conditionalAccess",
  "enrollment",
  "notification",
  "baseline",
  "cisBaseline",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

interface HydrationTaskBase {
  id: string;
  category: TaskCategory;
  operation: OperationMode;
  itemName: string;
  templatePath?: string;
  error?: string;
  warning?: string;
  startTime?: Date;
  endTime?: Date;
}

export type HydrationTask =
  | (HydrationTaskBase & { status: "skipped"; skipKind: SkipKind })
  | (HydrationTaskBase & {
      status: Exclude<TaskStatus, "skipped">;
      skipKind?: never;
    });

/**
 * Batch execution statistics
 */
export interface BatchExecutionStats {
  /** Whether batch execution was used */
  batchingEnabled: boolean;
  /** Batch size used */
  batchSize: number;
  /** Number of batch requests sent */
  batchRequestCount: number;
  /** Number of tasks executed via batch */
  batchedTaskCount: number;
  /** Number of tasks executed sequentially */
  sequentialTaskCount: number;
}

/**
 * Real-time batch progress for UI display
 */
export interface BatchProgress {
  /** Whether batch mode is active */
  isActive: boolean;
  /** Current batch number being processed (1-indexed) */
  currentBatch: number;
  /** Total number of batches */
  totalBatches: number;
  /** Number of items in current batch */
  itemsInBatch: number;
  /** API version being used (v1.0 or beta) */
  apiVersion: string;
  /** Timestamp when current batch started */
  batchStartTime?: Date;
}

export interface HydrationSummary {
  tenantId: string;
  tenantName?: string;
  operationMode: OperationMode;
  startTime: Date;
  endTime: Date;
  duration: number;
  stats: {
    total: number;
    created: number;
    deleted: number;
    skipped: number;
    failed: number;
  };
  categoryBreakdown: {
    [category: string]: {
      total: number;
      success: number;
      skipped: number;
      failed: number;
    };
  };
  errors: Array<{
    task: string;
    message: string;
    timestamp: Date;
  }>;
  warnings: Array<{
    task: string;
    message: string;
    timestamp: Date;
  }>;
  /** Batch execution statistics (optional, present when batching was used) */
  batchStats?: BatchExecutionStats;
}

export interface LicenseCheck {
  hasIntuneLicense: boolean;
  hasWindowsE3OrHigher: boolean;
  assignedLicenses: string[];
  validationTime: Date;
}

export interface TenantConfig {
  tenantId: string;
  homeAccountId: string;
  tenantName?: string;
  cloudEnvironment: CloudEnvironment;
}

export interface AppSettings {
  stopOnFirstError: boolean;
  demoMode: boolean;
}

/**
 * CIS Baseline category IDs for sub-selection
 */
export type CISCategoryId =
  | "cis-android"
  | "cis-apple"
  | "cis-browser"
  | "cis-windows-cis"
  | "cis-linux"
  | "cis-endpoint-security"
  | "cis-visual-studio"
  | "cis-windows-11"
  | "cis-cloud-pc";

/**
 * OpenIntuneBaseline platform IDs
 */
export type OIBPlatformId = "WINDOWS" | "MACOS" | "BYOD" | "WINDOWS365";

/**
 * Selected baseline policies - can select by platform or individual policies
 */
export interface BaselineSelection {
  // Selected platforms (all policies in platform will be included)
  platforms: OIBPlatformId[];
  // Individual policy paths that are selected (overrides platform selection)
  selectedPolicies: string[];
  // Individual policy paths that are excluded (even if platform is selected)
  excludedPolicies: string[];
}

/**
 * Generic selection for any category - tracks selected item names
 */
export interface CategorySelection {
  // Names of selected items within the category
  selectedItems: string[];
}

/**
 * All category selections tracked in wizard state
 */
export interface CategorySelections {
  groups?: CategorySelection;
  filters?: CategorySelection;
  compliance?: CategorySelection;
  conditionalAccess?: CategorySelection;
  appProtection?: CategorySelection;
  win32Apps?: CategorySelection;
  enrollment?: CategorySelection;
  baseline?: BaselineSelection;
  cisBaseline?: CategorySelection;
}

export interface WizardState {
  currentStep: number;
  tenantConfig?: TenantConfig;
  operationMode?: OperationMode;
  isPreview: boolean;
  selectedTargets: TaskCategory[];
  selectedCISCategories: CISCategoryId[];
  categorySelections?: CategorySelections;
  baselineSelection?: BaselineSelection; // Keep for backwards compatibility
  confirmed: boolean;
  prerequisiteResult?: PrerequisiteCheckResult;
}
