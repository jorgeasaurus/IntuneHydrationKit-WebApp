/**
 * Policy Detection
 * Functions for detecting policy types from templates
 */

import { CISPolicyType } from "./types";

/**
 * Detect the CIS policy type from the template's @odata.type and properties
 */
export function detectCISPolicyType(template: Record<string, unknown>): CISPolicyType {
  const odataType = (template["@odata.type"] as string || "").toLowerCase();

  // Security Intents (deprecated security baselines) - NOT supported for creation
  // These require using the template createInstance endpoint which is complex
  if (odataType.includes("devicemanagementintent")) {
    return "Unsupported";
  }

  // Group Policy Configuration (ADMX-based templates like VS Code, Outlook profile) - NOT supported
  // These require a complex 2-step creation: create policy, then add definitionValues with bindings
  // Examples: groupPolicyConfiguration for VS Code settings, OneDrive KFM, Outlook profile
  if (odataType.includes("grouppolicyconfiguration")) {
    return "Unsupported";
  }

  // Device Configurations - various subtypes that all use /deviceConfigurations endpoint
  const deviceConfigPatterns = [
    "windows10customconfiguration",
    "windows10generalconfiguration",
    "windowshealthmonitoringconfiguration",
    "sharedpcconfiguration",
    "windows10endpointprotectionconfiguration",
    "windowsidentityprotectionconfiguration",
    "windowsdefenderadvancedthreatprotectionconfiguration",
    "windowsdeliveryoptimizationconfiguration",
    "windowsupdateforbusinessconfiguration",
    "deviceconfiguration",
  ];

  const isDeviceConfig = deviceConfigPatterns.some(pattern => odataType.includes(pattern));
  const hasOmaSettings = template.omaSettings && Array.isArray(template.omaSettings);

  if (isDeviceConfig || hasOmaSettings) {
    return "DeviceConfiguration";
  }

  // V2 Compliance (Settings Catalog compliance) - has platforms/technologies
  if (odataType.includes("devicemanagementcompliancepolicy")) {
    return "V2Compliance";
  }

  // V1 Compliance (legacy compliance) - has @odata.type like windows10CompliancePolicy
  if (
    odataType.includes("compliancepolicy") &&
    !odataType.includes("devicemanagement")
  ) {
    return "V1Compliance";
  }

  // Default: Settings Catalog (most CIS baselines are this type)
  return "SettingsCatalog";
}
