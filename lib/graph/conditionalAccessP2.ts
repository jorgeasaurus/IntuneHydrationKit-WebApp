/**
 * Utility functions for detecting Premium P2-dependent Conditional Access policies
 * Based on IntuneHydrationKit PowerShell: Test-ConditionalAccessPolicyRequiresP2.ps1
 */

interface ConditionalAccessConditions {
  signInRiskLevels?: string[] | null;
  userRiskLevels?: string[] | null;
  insiderRiskLevels?: string | null;
  agentIdRiskLevels?: string[] | string | null;
  servicePrincipalRiskLevels?: string[] | string | null;
}

interface ConditionalAccessPolicy {
  conditions?: ConditionalAccessConditions;
  [key: string]: unknown;
}

/**
 * Checks if a Conditional Access policy requires Azure AD Premium P2 licensing
 *
 * Policies that use any of these risk-based conditions require Premium P2:
 * - Sign-in risk levels (signInRiskLevels)
 * - User risk levels (userRiskLevels)
 * - Insider risk levels (insiderRiskLevels)
 * - Agent identity risk levels (agentIdRiskLevels)
 * - Service principal risk levels (servicePrincipalRiskLevels)
 *
 * @param policy - The Conditional Access policy object to check
 * @returns true if the policy requires Premium P2, false otherwise
 */
export function policyRequiresPremiumP2(policy: ConditionalAccessPolicy): boolean {
  // Check if policy has conditions
  if (!policy.conditions) {
    return false;
  }

  const conditions = policy.conditions;

  // Check for sign-in risk levels
  if (
    conditions.signInRiskLevels &&
    Array.isArray(conditions.signInRiskLevels) &&
    conditions.signInRiskLevels.length > 0
  ) {
    console.log(
      `[P2 Check] Policy requires P2: uses signInRiskLevels`,
      conditions.signInRiskLevels
    );
    return true;
  }

  // Check for user risk levels
  if (
    conditions.userRiskLevels &&
    Array.isArray(conditions.userRiskLevels) &&
    conditions.userRiskLevels.length > 0
  ) {
    console.log(
      `[P2 Check] Policy requires P2: uses userRiskLevels`,
      conditions.userRiskLevels
    );
    return true;
  }

  // Check for insider risk levels (string value, not array)
  if (
    conditions.insiderRiskLevels !== null &&
    conditions.insiderRiskLevels !== undefined &&
    conditions.insiderRiskLevels !== "null" &&
    conditions.insiderRiskLevels.toString().trim() !== ""
  ) {
    console.log(
      `[P2 Check] Policy requires P2: uses insiderRiskLevels`,
      conditions.insiderRiskLevels
    );
    return true;
  }

  // Check for agent identity risk levels (can be string or array)
  if (conditions.agentIdRiskLevels !== null && conditions.agentIdRiskLevels !== undefined) {
    // Handle array format
    if (
      Array.isArray(conditions.agentIdRiskLevels) &&
      conditions.agentIdRiskLevels.length > 0
    ) {
      console.log(
        `[P2 Check] Policy requires P2: uses agentIdRiskLevels (array)`,
        conditions.agentIdRiskLevels
      );
      return true;
    }
    // Handle string format
    if (
      typeof conditions.agentIdRiskLevels === "string" &&
      conditions.agentIdRiskLevels.trim() !== ""
    ) {
      console.log(
        `[P2 Check] Policy requires P2: uses agentIdRiskLevels (string)`,
        conditions.agentIdRiskLevels
      );
      return true;
    }
  }

  // Check for service principal risk levels (can be string or array)
  if (
    conditions.servicePrincipalRiskLevels !== null &&
    conditions.servicePrincipalRiskLevels !== undefined
  ) {
    // Handle array format
    if (
      Array.isArray(conditions.servicePrincipalRiskLevels) &&
      conditions.servicePrincipalRiskLevels.length > 0
    ) {
      console.log(
        `[P2 Check] Policy requires P2: uses servicePrincipalRiskLevels (array)`,
        conditions.servicePrincipalRiskLevels
      );
      return true;
    }
    // Handle string format
    if (
      typeof conditions.servicePrincipalRiskLevels === "string" &&
      conditions.servicePrincipalRiskLevels.trim() !== ""
    ) {
      console.log(
        `[P2 Check] Policy requires P2: uses servicePrincipalRiskLevels (string)`,
        conditions.servicePrincipalRiskLevels
      );
      return true;
    }
  }

  return false;
}
