/**
 * Microsoft Graph API functions for prerequisite validation
 * Based on IntuneHydrationKit PowerShell module: Test-IntunePrerequisites.ps1
 */

import { GraphClient } from "./client";
import {
  OrganizationInfo,
  SubscribedSku,
  LicenseCheckResult,
  PermissionCheckResult,
  PrerequisiteCheckResult,
  INTUNE_SERVICE_PLANS,
  PREMIUM_P2_SERVICE_PLANS,
  WINDOWS_DRIVER_UPDATE_SERVICE_PLANS,
  REQUIRED_GRAPH_SCOPES,
} from "@/types/prerequisites";

/**
 * Fetch organization information
 */
export async function getOrganizationInfo(
  client: GraphClient
): Promise<OrganizationInfo> {
  console.log("[Prerequisites] Fetching organization info...");

  interface OrgResponse {
    id: string;
    displayName: string;
    tenantType?: string;
    verifiedDomains?: Array<{
      name: string;
      isDefault: boolean;
    }>;
  }

  // The /organization endpoint returns a collection
  const orgs = await client.getCollection<OrgResponse>("/organization", "beta");

  if (!orgs || orgs.length === 0) {
    throw new Error("No organization information found");
  }

  const org = orgs[0];
  console.log(`[Prerequisites] Organization: ${org.displayName} (${org.id})`);

  return {
    id: org.id,
    displayName: org.displayName,
    tenantType: org.tenantType,
    verifiedDomains: org.verifiedDomains,
  };
}

/**
 * Fetch subscribed SKUs and check for Intune and Premium P2 licenses
 */
export async function checkLicenses(
  client: GraphClient
): Promise<LicenseCheckResult> {
  console.log("[Prerequisites] Checking licenses...");

  // Fetch all subscribed SKUs
  const skus = await client.getCollection<SubscribedSku>(
    "/subscribedSkus",
    "beta"
  );

  console.log(`[Prerequisites] Found ${skus.length} SKUs`);

  // Extract all service plan names from all SKUs
  const allServicePlanNames = new Set<string>();
  for (const sku of skus) {
    if (sku.servicePlans && Array.isArray(sku.servicePlans)) {
      for (const plan of sku.servicePlans) {
        allServicePlanNames.add(plan.servicePlanName);
      }
    }
  }

  // Check for Intune licenses
  const intuneServicePlans = Array.from(allServicePlanNames).filter((planName) =>
    INTUNE_SERVICE_PLANS.includes(planName as never)
  );

  const hasIntuneLicense = intuneServicePlans.length > 0;

  // Check for Premium P2 licenses
  const premiumP2ServicePlans = Array.from(allServicePlanNames).filter(
    (planName) => PREMIUM_P2_SERVICE_PLANS.includes(planName as never)
  );

  const hasPremiumP2License = premiumP2ServicePlans.length > 0;

  // Check for Windows Driver Update licenses
  const windowsDriverUpdateServicePlans = Array.from(allServicePlanNames).filter(
    (planName) => WINDOWS_DRIVER_UPDATE_SERVICE_PLANS.includes(planName as never)
  );

  const hasWindowsDriverUpdateLicense = windowsDriverUpdateServicePlans.length > 0;

  console.log(
    `[Prerequisites] Intune license: ${hasIntuneLicense ? "✓" : "✗"} (${intuneServicePlans.length} plans)`
  );
  console.log(
    `[Prerequisites] Premium P2 license: ${hasPremiumP2License ? "✓" : "⚠"} (${premiumP2ServicePlans.length} plans)`
  );
  console.log(
    `[Prerequisites] Windows Driver Update license: ${hasWindowsDriverUpdateLicense ? "✓" : "⚠"} (${windowsDriverUpdateServicePlans.length} plans)`
  );

  return {
    hasIntuneLicense,
    hasPremiumP2License,
    hasWindowsDriverUpdateLicense,
    intuneServicePlans,
    premiumP2ServicePlans,
    windowsDriverUpdateServicePlans,
    allSkus: skus,
  };
}

/**
 * Validate required Graph API permissions
 * Note: In delegated permissions (SPA), we check what scopes were consented,
 * not what the app has been granted in the portal.
 */
export async function checkPermissions(
  client: GraphClient
): Promise<PermissionCheckResult> {
  console.log("[Prerequisites] Checking permissions...");

  try {
    // Try to get the current user's consent info
    // This is a best-effort check - in delegated auth, we rely on consent at runtime
    interface OAuthPermissionGrant {
      scope: string;
      clientId: string;
      consentType: string;
    }

    // Get OAuth2PermissionGrants for the current user
    // Note: This may not work in all scenarios (requires additional permissions)
    let grantedScopes: string[] = [];

    try {
      const grants = await client.getCollection<OAuthPermissionGrant>(
        "/me/oauth2PermissionGrants",
        "beta"
      );

      if (grants && grants.length > 0) {
        // Combine all scopes from grants
        const allScopes = grants.flatMap((grant) =>
          grant.scope ? grant.scope.split(" ") : []
        );
        grantedScopes = [...new Set(allScopes)];
      }
    } catch (error) {
      console.warn(
        "[Prerequisites] Unable to check OAuth grants, will rely on runtime consent:",
        error
      );
      // In SPA with delegated permissions, we can't always check this ahead of time
      // Return partial result
      return {
        hasRequiredPermissions: true, // Assume true, will fail at runtime if not consented
        missingPermissions: [],
        grantedPermissions: [],
      };
    }

    // Check which required scopes are missing
    const missingPermissions = REQUIRED_GRAPH_SCOPES.filter(
      (scope) => !grantedScopes.includes(scope)
    );

    const hasRequiredPermissions = missingPermissions.length === 0;

    console.log(
      `[Prerequisites] Permissions: ${hasRequiredPermissions ? "✓" : "⚠"} (${grantedScopes.length} granted, ${missingPermissions.length} missing)`
    );

    return {
      hasRequiredPermissions,
      missingPermissions,
      grantedPermissions: grantedScopes,
    };
  } catch (error) {
    console.error("[Prerequisites] Error checking permissions:", error);
    // Return default result - permissions will be checked at runtime
    return {
      hasRequiredPermissions: true, // Assume true for SPA
      missingPermissions: [],
      grantedPermissions: [],
    };
  }
}

/**
 * Run all prerequisite checks
 */
export async function validatePrerequisites(
  client: GraphClient
): Promise<PrerequisiteCheckResult> {
  console.log("[Prerequisites] Starting validation...");

  const result: PrerequisiteCheckResult = {
    organization: null,
    licenses: null,
    permissions: null,
    isValid: false,
    warnings: [],
    errors: [],
    timestamp: new Date(),
  };

  try {
    // Check 1: Organization info
    try {
      result.organization = await getOrganizationInfo(client);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Failed to get organization info: ${message}`);
      console.error("[Prerequisites] Organization check failed:", error);
    }

    // Check 2: Licenses
    try {
      result.licenses = await checkLicenses(client);

      if (!result.licenses.hasIntuneLicense) {
        result.errors.push(
          "No Intune license found. At least one of the following is required: " +
            INTUNE_SERVICE_PLANS.join(", ")
        );
      }

      if (!result.licenses.hasPremiumP2License) {
        result.warnings.push(
          "No Azure AD Premium P2 license found. Conditional Access policies that use risk-based conditions (signInRiskLevels, userRiskLevels, insiderRiskLevels) will be skipped during creation."
        );
      }

      if (!result.licenses.hasWindowsDriverUpdateLicense) {
        result.warnings.push(
          "No Windows Driver Update compatible license found (Windows E3/E5, Microsoft 365 E3/E5, etc.). Windows Driver Update profiles will be skipped during creation."
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Failed to check licenses: ${message}`);
      console.error("[Prerequisites] License check failed:", error);
    }

    // Check 3: Permissions - Skipped
    // Permissions are verified during initial MSAL login flow
    // Users must consent to all required scopes before accessing the app
    // No need to check permissions after login as MSAL enforces this

    // Determine overall validity
    // Valid if: organization info retrieved AND has Intune license
    result.isValid =
      result.organization !== null &&
      result.licenses !== null &&
      result.licenses.hasIntuneLicense;

    console.log(
      `[Prerequisites] Validation complete: ${result.isValid ? "PASS" : "FAIL"} (${result.errors.length} errors, ${result.warnings.length} warnings)`
    );

    return result;
  } catch (error) {
    console.error("[Prerequisites] Unexpected error during validation:", error);
    result.errors.push(
      `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    return result;
  }
}
