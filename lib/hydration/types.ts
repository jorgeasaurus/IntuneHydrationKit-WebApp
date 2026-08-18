/**
 * Hydration Engine Types
 * Shared types and interfaces for the hydration execution engine
 */

import { GraphClient } from "@/lib/graph/client";
import { HydrationTask, OperationMode, BatchProgress, TaskCategory, CISCategoryId, BaselineSelection, CategorySelections, SkipKind } from "@/types/hydration";
import {
  DeviceGroup,
  DeviceFilter,
  TenantAppProtectionPolicy,
} from "@/types/graph";
import { BaselinePolicy } from "@/lib/templates/loader";
import type { Win32LobApp } from "@/lib/graph/win32Apps";

export const ACTIVITY_MESSAGE_TYPES = [
  "info",
  "progress",
  "success",
  "warning",
  "error",
] as const;

export type ActivityMessageType = (typeof ACTIVITY_MESSAGE_TYPES)[number];

/**
 * Activity message for status updates
 */
export interface ActivityMessage {
  id: string;
  timestamp: Date;
  message: string;
  type: ActivityMessageType;
  /** Optional category for grouping (e.g., "prefetch", "delete", "create") */
  category?: string;
}

/**
 * Task execution context
 */
export interface ExecutionContext {
  client: GraphClient;
  /** Tenant ID established by the authenticated wizard session. */
  tenantId?: string;
  operationMode: OperationMode;
  isPreview: boolean;
  stopOnFirstError: boolean;
  onTaskStart?: (task: HydrationTask) => void;
  onTaskComplete?: (task: HydrationTask) => void;
  onTaskError?: (task: HydrationTask, error: Error) => void;
  onBatchProgress?: (progress: BatchProgress) => void;
  /** Callback for activity/status updates shown in UI */
  onStatusUpdate?: (message: ActivityMessage) => void;
  shouldCancel?: () => boolean;
  shouldPause?: () => boolean;
  // Pre-fetched data caches to avoid repeated API calls
  cachedAppProtectionPolicies?: TenantAppProtectionPolicy[];
  cachedIntuneGroups?: DeviceGroup[];
  cachedFilters?: DeviceFilter[];
  cachedWin32LobApps?: Win32LobApp[];
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
  // Cached group policy configurations for delete operations (Administrative Templates / ADMX)
  cachedGroupPolicyConfigurations?: Array<{ id: string; displayName?: string; description?: string }>;
  // Cached security intents for baseline/CIS endpoint security policies
  cachedSecurityIntents?: Array<{ id: string; displayName?: string; description?: string }>;
  // Cached baseline templates for batch creation (passed directly to avoid cache issues)
  cachedBaselineTemplates?: BaselinePolicy[];
  // License flags for conditional skipping
  hasConditionalAccessLicense?: boolean;
  hasPremiumP2License?: boolean;
  hasWindowsDriverUpdateLicense?: boolean;
}

/**
 * Task execution result
 */
interface ExecutionResultBase {
  task: HydrationTask;
  success: boolean;
  error?: string;
  warning?: string;
  createdId?: string;
}

export type ExecutionResult =
  | (ExecutionResultBase & { skipped: false; skipKind?: never })
  | (ExecutionResultBase & { skipped: true; skipKind: SkipKind });

/**
 * CIS Policy type detection result
 */
export type CISPolicyType =
  | "SettingsCatalog"           // configurationPolicies - Settings Catalog (default)
  | "V2Compliance"              // compliancePolicies - Settings Catalog compliance
  | "V1Compliance"              // deviceCompliancePolicies - Legacy compliance
  | "DeviceConfiguration"       // deviceConfigurations - OMA-URI custom policies
  | "GroupPolicyConfiguration"  // groupPolicyConfigurations - Administrative Templates / ADMX
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
  shouldCancel?: () => boolean;
  onProgress?: (message: string, type?: ActivityMessage["type"]) => void;
}
