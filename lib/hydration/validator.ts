/**
 * Pre-flight validation for Intune Hydration Kit
 * Validates tenant health, licenses, and permissions before operations
 */

import { GraphClient } from "@/lib/graph/client";
import { LicenseCheck } from "@/types/hydration";

/**
 * Intune license SKU part numbers
 */
const INTUNE_LICENSE_SKUS = [
  "INTUNE_A",
  "INTUNE_EDU",
  "EMS",
  "EMSPREMIUM",
  "O365_BUSINESS_PREMIUM",
  "SPE_E3", // Microsoft 365 E3
  "SPE_E5", // Microsoft 365 E5
  "M365EDU_A3_FACULTY",
  "M365EDU_A3_STUDENT",
  "M365EDU_A5_FACULTY",
  "M365EDU_A5_STUDENT",
];

/**
 * Windows E3/E5 license SKU part numbers (required for driver updates)
 */
const WINDOWS_E3_E5_SKUS = [
  "WIN10_VDA_E3",
  "WIN10_VDA_E5",
  "SPE_E3", // Microsoft 365 E3
  "SPE_E5", // Microsoft 365 E5
  "M365EDU_A3_FACULTY",
  "M365EDU_A3_STUDENT",
  "M365EDU_A5_FACULTY",
  "M365EDU_A5_STUDENT",
];

/**
 * Required Graph API permissions (delegated)
 */
const REQUIRED_PERMISSIONS = [
  "DeviceManagementConfiguration.ReadWrite.All",
  "DeviceManagementServiceConfig.ReadWrite.All",
  "DeviceManagementManagedDevices.ReadWrite.All",
  "DeviceManagementApps.ReadWrite.All",
  "Group.ReadWrite.All",
  "Policy.Read.All",
  "Policy.ReadWrite.ConditionalAccess",
  "Directory.ReadWrite.All",
];

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  checks: {
    connectivity: {
      passed: boolean;
      message: string;
    };
    licenses: {
      passed: boolean;
      message: string;
      details?: LicenseCheck;
    };
    permissions: {
      passed: boolean;
      message: string;
      missingPermissions?: string[];
    };
    role: {
      passed: boolean;
      message: string;
      userRoles?: string[];
    };
  };
  errors: string[];
  warnings: string[];
}

/**
 * Check Graph API connectivity
 */
async function checkConnectivity(client: GraphClient): Promise<{
  passed: boolean;
  message: string;
}> {
  try {
    await client.get("/organization", "v1.0");
    return {
      passed: true,
      message: "Successfully connected to Microsoft Graph API",
    };
  } catch (error) {
    return {
      passed: false,
      message:
        error instanceof Error
          ? `Failed to connect to Graph API: ${error.message}`
          : "Failed to connect to Graph API",
    };
  }
}

/**
 * Check Intune and Windows licenses
 */
async function checkLicenses(client: GraphClient): Promise<{
  passed: boolean;
  message: string;
  details: LicenseCheck;
}> {
  try {
    // Get organization subscribed SKUs
    const skus = await client.getCollection<{
      skuPartNumber: string;
      servicePlans: Array<{ servicePlanName: string }>;
    }>("/subscribedSkus", "v1.0");

    const skuPartNumbers = skus.map((sku) => sku.skuPartNumber);

    // Check for Intune license
    const hasIntuneLicense = INTUNE_LICENSE_SKUS.some((sku) =>
      skuPartNumbers.includes(sku)
    );

    // Check for Windows E3/E5 license
    const hasWindowsE3OrHigher = WINDOWS_E3_E5_SKUS.some((sku) =>
      skuPartNumbers.includes(sku)
    );

    const details: LicenseCheck = {
      hasIntuneLicense,
      hasWindowsE3OrHigher,
      assignedLicenses: skuPartNumbers,
      validationTime: new Date(),
    };

    if (!hasIntuneLicense) {
      return {
        passed: false,
        message:
          "No Intune license found. Requires: INTUNE_A, EMS, Microsoft 365 E3/E5, or Business Premium",
        details,
      };
    }

    const messages: string[] = ["Intune license detected"];
    if (hasWindowsE3OrHigher) {
      messages.push("Windows E3/E5 license detected (supports driver update profiles)");
    } else {
      messages.push(
        "Windows E3/E5 license not detected (driver update profiles will not be available)"
      );
    }

    return {
      passed: true,
      message: messages.join(". "),
      details,
    };
  } catch (error) {
    return {
      passed: false,
      message:
        error instanceof Error
          ? `Failed to check licenses: ${error.message}`
          : "Failed to check licenses",
      details: {
        hasIntuneLicense: false,
        hasWindowsE3OrHigher: false,
        assignedLicenses: [],
        validationTime: new Date(),
      },
    };
  }
}

/**
 * Check user permissions
 */
async function checkPermissions(client: GraphClient): Promise<{
  passed: boolean;
  message: string;
  missingPermissions?: string[];
}> {
  try {
    // Get current user's OAuth2 permissions
    const me = await client.get<{
      id: string;
      userPrincipalName: string;
    }>("/me", "v1.0");

    // Try to access endpoints that require specific permissions
    const permissionTests = [
      {
        permission: "DeviceManagementConfiguration.ReadWrite.All",
        test: () => client.get("/deviceManagement/deviceConfigurations?$top=1"),
      },
      {
        permission: "Group.ReadWrite.All",
        test: () => client.get("/groups?$top=1", "v1.0"),
      },
      {
        permission: "Policy.ReadWrite.ConditionalAccess",
        test: () => client.get("/identity/conditionalAccess/policies?$top=1"),
      },
    ];

    const failedPermissions: string[] = [];

    for (const { permission, test } of permissionTests) {
      try {
        await test();
      } catch {
        failedPermissions.push(permission);
      }
    }

    if (failedPermissions.length > 0) {
      return {
        passed: false,
        message: `Missing required permissions: ${failedPermissions.join(", ")}`,
        missingPermissions: failedPermissions,
      };
    }

    return {
      passed: true,
      message: "All required permissions are granted",
    };
  } catch (error) {
    return {
      passed: false,
      message:
        error instanceof Error
          ? `Failed to check permissions: ${error.message}`
          : "Failed to check permissions",
    };
  }
}

/**
 * Check user role (Global Admin or Intune Admin)
 */
async function checkUserRole(client: GraphClient): Promise<{
  passed: boolean;
  message: string;
  userRoles?: string[];
}> {
  try {
    // Get current user's directory roles
    const roles = await client.getCollection<{
      displayName: string;
      roleTemplateId: string;
    }>("/me/memberOf/$/microsoft.graph.directoryRole", "v1.0");

    const roleNames = roles.map((role) => role.displayName);

    // Check for Global Admin or Intune Admin
    const hasGlobalAdmin = roleNames.some((name) =>
      name.toLowerCase().includes("global administrator")
    );
    const hasIntuneAdmin = roleNames.some(
      (name) =>
        name.toLowerCase().includes("intune") &&
        name.toLowerCase().includes("administrator")
    );

    if (!hasGlobalAdmin && !hasIntuneAdmin) {
      return {
        passed: false,
        message:
          "User must have Global Administrator or Intune Administrator role. Current roles: " +
          (roleNames.length > 0 ? roleNames.join(", ") : "None"),
        userRoles: roleNames,
      };
    }

    return {
      passed: true,
      message: hasGlobalAdmin
        ? "User has Global Administrator role"
        : "User has Intune Administrator role",
      userRoles: roleNames,
    };
  } catch (error) {
    return {
      passed: false,
      message:
        error instanceof Error
          ? `Failed to check user role: ${error.message}`
          : "Failed to check user role",
    };
  }
}

/**
 * Run all pre-flight validation checks
 */
export async function validateTenant(client: GraphClient): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Run all checks in parallel
  const [connectivity, licenses, permissions, role] = await Promise.all([
    checkConnectivity(client),
    checkLicenses(client),
    checkPermissions(client),
    checkUserRole(client),
  ]);

  // Collect errors
  if (!connectivity.passed) {
    errors.push(connectivity.message);
  }
  if (!licenses.passed) {
    errors.push(licenses.message);
  }
  if (!permissions.passed) {
    errors.push(permissions.message);
  }
  if (!role.passed) {
    errors.push(role.message);
  }

  // Collect warnings
  if (licenses.details && !licenses.details.hasWindowsE3OrHigher) {
    warnings.push(
      "Windows E3/E5 license not detected. Driver update profiles will not be available."
    );
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    checks: {
      connectivity,
      licenses,
      permissions,
      role,
    },
    errors,
    warnings,
  };
}

/**
 * Quick connectivity test (lighter than full validation)
 */
export async function quickConnectivityTest(client: GraphClient): Promise<boolean> {
  try {
    await client.get("/organization?$top=1", "v1.0");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get tenant information
 */
export async function getTenantInfo(client: GraphClient): Promise<{
  tenantId: string;
  displayName: string;
  verifiedDomains: string[];
}> {
  const org = await client.get<{
    value?: Array<{
      id: string;
      displayName: string;
      verifiedDomains: Array<{ name: string; isDefault: boolean }>;
    }>;
    id?: string;
    displayName?: string;
    verifiedDomains?: Array<{ name: string; isDefault: boolean }>;
  }>("/organization", "v1.0");

  // The response may be wrapped in a value array or returned directly
  const orgData = org.value?.[0] || {
    id: org.id || "",
    displayName: org.displayName || "",
    verifiedDomains: org.verifiedDomains || [],
  };

  return {
    tenantId: orgData.id,
    displayName: orgData.displayName,
    verifiedDomains: orgData.verifiedDomains.map((d) => d.name),
  };
}
