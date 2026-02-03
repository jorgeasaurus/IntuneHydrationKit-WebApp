/**
 * Types for tenant prerequisite validation
 */

export interface OrganizationInfo {
  id: string;
  displayName: string;
  tenantType?: string;
  verifiedDomains?: Array<{
    name: string;
    isDefault: boolean;
  }>;
}

export interface ServicePlan {
  servicePlanId: string;
  servicePlanName: string;
  appliesTo: string;
}

export interface SubscribedSku {
  skuId: string;
  skuPartNumber: string;
  servicePlans: ServicePlan[];
  capabilityStatus: string;
  consumedUnits?: number;
  prepaidUnits?: {
    enabled: number;
    suspended: number;
    warning: number;
  };
}

export interface LicenseCheckResult {
  hasIntuneLicense: boolean;
  hasConditionalAccessLicense: boolean;
  hasPremiumP2License: boolean;
  hasWindowsDriverUpdateLicense: boolean;
  intuneServicePlans: string[];
  conditionalAccessServicePlans: string[];
  premiumP2ServicePlans: string[];
  windowsDriverUpdateServicePlans: string[];
  allSkus: SubscribedSku[];
}

export interface PermissionCheckResult {
  hasRequiredPermissions: boolean;
  missingPermissions: string[];
  grantedPermissions: string[];
}

export interface PrerequisiteCheckResult {
  organization: OrganizationInfo | null;
  licenses: LicenseCheckResult | null;
  permissions: PermissionCheckResult | null;
  isValid: boolean;
  warnings: string[];
  errors: string[];
  timestamp: Date;
}

export type PrerequisiteCheckStatus = "pending" | "checking" | "success" | "warning" | "error";

/**
 * Intune service plan names that indicate Intune licensing
 */
export const INTUNE_SERVICE_PLANS = [
  "INTUNE_A", // Intune for Education
  "INTUNE_EDU", // Intune for Education (alternate)
  "INTUNE_SMBIZ", // Intune for Small Business
  "AAD_PREMIUM", // Azure AD Premium (includes Intune)
  "EMSPREMIUM", // Enterprise Mobility + Security E5
] as const;

/**
 * Premium P2 service plan names required for risk-based Conditional Access
 * Based on IntuneHydrationKit PowerShell module
 */
export const PREMIUM_P2_SERVICE_PLANS = [
  // Azure AD Premium P2 standalone
  "AAD_PREMIUM_P2",

  // Microsoft 365 E5 suites (include Azure AD Premium P2)
  "SPE_E5", // Microsoft 365 E5
  "SPE_E5_GOV", // Microsoft 365 E5 (Gov)
  "M365_E5", // Microsoft 365 E5 (alternate)
  "SPE_E5_USGOV_GCCHIGH", // Microsoft 365 E5 GCC High
  "INFORMATION_PROTECTION_COMPLIANCE", // Microsoft 365 E5 Compliance
  "M365_E5_SUITE_COMPONENTS", // Microsoft 365 E5 Suite

  // Microsoft 365 Education A5 (includes Azure AD Premium P2)
  "M365EDU_A5_FACULTY", // Microsoft 365 A5 for Faculty
  "M365EDU_A5_STUDENT", // Microsoft 365 A5 for Students

  // Enterprise Mobility + Security E5
  "EMSPREMIUM", // Enterprise Mobility + Security E5
  "EMS", // EMS E5 (alternate)

  // Identity & Threat Protection (standalone add-on)
  "IDENTITY_THREAT_PROTECTION", // Microsoft 365 E5 Security

  // Microsoft Defender for Cloud Apps (formerly MCAS)
  "ADALLOM_S_STANDALONE", // Microsoft Defender for Cloud Apps

  // Azure Advanced Threat Protection (now part of Defender for Identity)
  "ATA", // Azure ATP
] as const;

/**
 * Conditional Access service plan names (requires Entra ID Premium P1 or higher)
 * CA requires at minimum P1. All P2 plans also include P1.
 */
export const CONDITIONAL_ACCESS_SERVICE_PLANS = [
  // Azure AD Premium P1 standalone
  "AAD_PREMIUM",

  // Azure AD Premium P2 (P2 implies P1)
  "AAD_PREMIUM_P2",

  // Enterprise Mobility + Security E3/E5
  "EMSPREMIUM", // EMS E5
  "EMS", // EMS E3

  // Microsoft 365 E3/E5 suites
  "SPE_E3", // Microsoft 365 E3
  "SPE_E5", // Microsoft 365 E5
  "SPE_E3_GOV", // Microsoft 365 E3 (Gov)
  "SPE_E5_GOV", // Microsoft 365 E5 (Gov)
  "M365_E3", // Microsoft 365 E3 (alternate)
  "M365_E5", // Microsoft 365 E5 (alternate)
  "SPE_E3_USGOV_GCCHIGH", // Microsoft 365 E3 GCC High
  "SPE_E5_USGOV_GCCHIGH", // Microsoft 365 E5 GCC High

  // Microsoft 365 Education A3/A5
  "M365EDU_A3_FACULTY",
  "M365EDU_A3_STUDENT",
  "M365EDU_A5_FACULTY",
  "M365EDU_A5_STUDENT",

  // Microsoft 365 Business Premium
  "SPB",
  "SMB_BUSINESS_PREMIUM",
  "O365_BUSINESS_PREMIUM",

  // Identity & Threat Protection
  "IDENTITY_THREAT_PROTECTION",
] as const;

/**
 * Windows Driver Update service plan names
 * Required for Windows Driver Update profiles
 * Based on IntuneHydrationKit PowerShell module: Test-WindowsDriverUpdateLicense.ps1
 * Reference: https://learn.microsoft.com/en-us/mem/intune/protect/windows-driver-updates-overview
 */
export const WINDOWS_DRIVER_UPDATE_SERVICE_PLANS = [
  // Windows Update for Business Deployment Service
  "WINDOWSUPDATEFORBUSINESS_DEPLOYMENTSERVICE",

  // Windows Enterprise E3/E5
  "WIN10_PRO_ENT_SUB", // Windows 10/11 Enterprise E3
  "WIN10_ENT_A3_GOV", // Windows 10/11 Enterprise E3 (Gov)
  "WIN10_ENT_A5_GOV", // Windows 10/11 Enterprise E5 (Gov)
  "WINE5_GCC_COMPAT", // Windows E5 GCC

  // Windows VDA
  "WIN10_VDA_E3", // Windows Virtual Desktop Access E3
  "WIN10_VDA_E5", // Windows Virtual Desktop Access E5
  "WINDOWS_STORE", // Sometimes bundled with VDA

  // Microsoft 365 E3/E5 (includes Windows Enterprise)
  "SPE_E3", // Microsoft 365 E3
  "SPE_E5", // Microsoft 365 E5
  "SPE_E3_GOV", // Microsoft 365 E3 (Gov)
  "SPE_E5_GOV", // Microsoft 365 E5 (Gov)
  "SPE_E3_RPA1", // Microsoft 365 E3 variant
  "M365_E3", // Microsoft 365 E3 (alternate)
  "M365_E5", // Microsoft 365 E5 (alternate)

  // Microsoft 365 Education A3/A5
  "M365EDU_A3_FACULTY", // Microsoft 365 A3 for Faculty
  "M365EDU_A3_STUDENT", // Microsoft 365 A3 for Students
  "M365EDU_A5_FACULTY", // Microsoft 365 A5 for Faculty
  "M365EDU_A5_STUDENT", // Microsoft 365 A5 for Students
  "SPE_E3_USGOV_GCCHIGH", // Microsoft 365 E3 GCC High
  "SPE_E5_USGOV_GCCHIGH", // Microsoft 365 E5 GCC High

  // Microsoft 365 Business Premium
  "SPB", // Microsoft 365 Business Premium
  "SMB_BUSINESS_PREMIUM", // Microsoft 365 Business Premium (alternate)
  "O365_BUSINESS_PREMIUM", // Microsoft 365 Business Premium (legacy)

  // Windows 365 Enterprise (includes Windows E3 entitlement)
  "CPC_E_2C_4GB_64GB",
  "CPC_E_2C_8GB_128GB",
  "CPC_E_4C_16GB_128GB",
  "CPC_E_4C_16GB_256GB",
  "CPC_E_8C_32GB_128GB",
  "CPC_E_8C_32GB_256GB",
  "CPC_E_8C_32GB_512GB",

  // Intune Suite add-on
  "INTUNE_SUITE",
] as const;

/**
 * Required Microsoft Graph API permission scopes
 */
export const REQUIRED_GRAPH_SCOPES = [
  "DeviceManagementConfiguration.ReadWrite.All",
  "DeviceManagementServiceConfig.ReadWrite.All",
  "DeviceManagementManagedDevices.ReadWrite.All",
  "DeviceManagementScripts.ReadWrite.All",
  "DeviceManagementApps.ReadWrite.All",
  "Group.ReadWrite.All",
  "Policy.Read.All",
  "Policy.ReadWrite.ConditionalAccess",
  "Application.Read.All",
  "Directory.ReadWrite.All",
  "LicenseAssignment.Read.All",
  "Organization.Read.All",
] as const;
