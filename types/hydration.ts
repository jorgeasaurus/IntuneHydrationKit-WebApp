/**
 * Type definitions for Intune Hydration Kit application
 */

import { PrerequisiteCheckResult } from "./prerequisites";

export type CloudEnvironment =
  | "global"
  | "usgov"
  | "usgovdod"
  | "germany"
  | "china";

export type OperationMode = "create" | "delete" | "preview";

export type TaskStatus = "pending" | "running" | "success" | "failed" | "skipped";

export type TaskCategory =
  | "groups"
  | "filters"
  | "compliance"
  | "appProtection"
  | "conditionalAccess"
  | "enrollment"
  | "notification"
  | "baseline";

export interface HydrationTask {
  id: string;
  category: TaskCategory;
  operation: OperationMode;
  itemName: string;
  status: TaskStatus;
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface HydrationSummary {
  tenantId: string;
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
}

export interface LicenseCheck {
  hasIntuneLicense: boolean;
  hasWindowsE3OrHigher: boolean;
  assignedLicenses: string[];
  validationTime: Date;
}

export interface TenantConfig {
  tenantId: string;
  tenantName?: string;
  cloudEnvironment: CloudEnvironment;
}

export interface AppSettings {
  defaultCloudEnvironment: CloudEnvironment;
  stopOnFirstError: boolean;
  enableVerboseLogging: boolean;
  autoDownloadReports: boolean;
  theme: "light" | "dark" | "system";
}

export interface WizardState {
  currentStep: number;
  tenantConfig?: TenantConfig;
  operationMode?: OperationMode;
  selectedTargets: TaskCategory[];
  confirmed: boolean;
  prerequisiteResult?: PrerequisiteCheckResult;
}
