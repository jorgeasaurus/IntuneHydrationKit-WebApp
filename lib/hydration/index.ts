/**
 * Central export for Intune Hydration Kit execution engine and utilities
 *
 * This module provides a modular structure for the hydration engine:
 * - types.ts: Shared type definitions
 * - utils.ts: Utility functions
 * - cleaners.ts: Policy cleaning functions
 * - policyCreators.ts: Policy creation functions
 * - policyDetection.ts: Policy type detection
 * - engine.ts: Main execution engine (also contains inline copies of the above)
 *
 * For new code, prefer importing from the specific module files.
 * The engine.ts exports are kept for backward compatibility.
 */

// Main Engine, Validator, Reporter (these have the primary exports)
export * from "./engine";
export * from "./validator";
export * from "./reporter";

// Additional exports from modular files (for direct imports)
// Note: Some of these are also defined in engine.ts for backward compatibility
export {
  sleep,
  escapeODataString,
  containsSecretPlaceholders,
  isActualSecretField,
} from "./utils";

export {
  cleanSettingInstance,
  cleanSettingsCatalogPolicy,
  cleanPolicyRecursively,
} from "./cleaners";

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

export {
  detectCISPolicyType,
} from "./policyDetection";
