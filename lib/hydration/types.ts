/**
 * Hydration Engine Types
 * Shared types and interfaces for the hydration execution engine
 */

import { GraphClient } from "@/lib/graph/client";
import { HydrationTask, OperationMode, BatchProgress, TaskCategory, CISCategoryId, BaselineSelection, CategorySelections } from "@/types/hydration";
import {
  DeviceGroup,
  DeviceFilter,
  AppProtectionPolicy,
} from "@/types/graph";

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
  onBatchProgress?: (progress: BatchProgress) => void;
  shouldCancel?: () => boolean;
  shouldPause?: () => boolean;
  // Pre-fetched data caches to avoid repeated API calls
  cachedAppProtectionPolicies?: AppProtectionPolicy[];
  cachedIntuneGroups?: DeviceGroup[];
  cachedFilters?: DeviceFilter[];
  // Cached Settings Catalog policies for delete operations (fetched once, reused for all deletes)
  cachedSettingsCatalogPolicies?: Array<{ id: string; name: string; description?: string }>;
  // Cached Driver Update Profiles for delete operations
  cachedDriverUpdateProfiles?: Array<{ id: string; displayName: string; description?: string }>;
  // Cached V2 Compliance policies for delete operations (new compliance format used by OIB)
  cachedV2CompliancePolicies?: Array<{ id: string; name: string; description?: string }>;
  // Cached compliance policies for delete operations (legacy V1 compliance)
  cachedCompliancePolicies?: Array<{ id: string; displayName?: string; description?: string }>;
  // Cached conditional access policies for delete operations
  cachedConditionalAccessPolicies?: Array<{ id: string; displayName?: string; description?: string }>;
  // Cached device configurations for delete operations (Health Monitoring, etc.)
  cachedDeviceConfigurations?: Array<{ id: string; displayName?: string; description?: string }>;
  // License flags for conditional skipping
  hasPremiumP2License?: boolean;
  hasWindowsDriverUpdateLicense?: boolean;
}

/**
 * Task execution result
 */
export interface ExecutionResult {
  task: HydrationTask;
  success: boolean;
  skipped: boolean;
  error?: string;
  warning?: string;
  createdId?: string;
}

/**
 * CIS Policy type detection result
 */
export type CISPolicyType =
  | "SettingsCatalog"           // configurationPolicies - Settings Catalog (default)
  | "V2Compliance"              // compliancePolicies - Settings Catalog compliance
  | "V1Compliance"              // deviceCompliancePolicies - Legacy compliance
  | "DeviceConfiguration"       // deviceConfigurations - OMA-URI custom policies
  | "DriverUpdateProfiles"      // windowsDriverUpdateProfiles - Driver update profiles
  | "SecurityIntent"            // intents - Security baseline intents (deprecated)
  | "Unsupported";              // Policy type not supported for creation

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
