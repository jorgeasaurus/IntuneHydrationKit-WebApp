/**
 * Compliance Policy Templates for Intune Hydration Kit
 *
 * 8 importable policies matching the PowerShell project's Compliance templates.
 * Linux policies are excluded (Settings Catalog format, not supported via the
 * deviceManagement/deviceCompliancePolicies endpoint).
 */

import { CompliancePolicy } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

export const COMPLIANCE_POLICIES: CompliancePolicy[] = [
  // ── Android ──────────────────────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.androidDeviceOwnerCompliancePolicy",
    displayName: "Android-Compliance-FullyManaged",
    description: `Android Compliance Policy for Fully Managed Devices. ${HYDRATION_MARKER}`,
    passwordRequired: true,
    passwordMinimumLength: 6,
    passwordRequiredType: "numericComplex",
    storageRequireEncryption: true,
    securityRequireIntuneAppIntegrity: true,
    minAndroidSecurityPatchLevel: "2024-01-01",
    osMinimumVersion: "13.0",
    personalAppsSharingAllowed: true,
    workProfileInactivityBeforeScreenLockInMinutes: 15,
    scheduledActionsForRule: [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          { actionType: "block", gracePeriodHours: 1, notificationTemplateId: "" },
          { actionType: "retire", gracePeriodHours: 4320, notificationTemplateId: "" },
        ],
      },
    ],
  },
  {
    "@odata.type": "#microsoft.graph.androidDeviceOwnerCompliancePolicy",
    displayName: "Android-Compliance-FullyManaged-Strict",
    description: `Android Compliance Policy for Fully Managed Devices (strict settings). ${HYDRATION_MARKER}`,
    passwordRequired: true,
    passwordMinimumLength: 8,
    passwordRequiredType: "numericComplex",
    passwordMinutesOfInactivityBeforeLock: 5,
    storageRequireEncryption: true,
    securityRequireIntuneAppIntegrity: true,
    minAndroidSecurityPatchLevel: "2024-01-01",
    osMinimumVersion: "13.0",
    personalAppsSharingAllowed: true,
    workProfileInactivityBeforeScreenLockInMinutes: 15,
    deviceThreatProtectionEnabled: true,
    deviceThreatProtectionRequiredSecurityLevel: "medium",
    advancedThreatProtectionRequiredSecurityLevel: "medium",
    scheduledActionsForRule: [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          { actionType: "block", gracePeriodHours: 0, notificationTemplateId: "" },
          { actionType: "retire", gracePeriodHours: 720, notificationTemplateId: "" },
        ],
      },
    ],
  },

  // ── Windows ──────────────────────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
    displayName: "Windows Compliance Policy",
    description: `Windows Compliance Policy using GUI settings. ${HYDRATION_MARKER}`,
    activeFirewallRequired: true,
    antiSpywareRequired: true,
    antivirusRequired: true,
    bitLockerEnabled: true,
    codeIntegrityEnabled: true,
    defenderEnabled: true,
    rtpEnabled: true,
    secureBootEnabled: true,
    tpmRequired: true,
    scheduledActionsForRule: [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          { actionType: "block", gracePeriodHours: 12, notificationTemplateId: "" },
          { actionType: "retire", gracePeriodHours: 4320, notificationTemplateId: "" },
        ],
      },
    ],
  },
  {
    "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
    displayName: "Windows Custom Compliance",
    description: `Checks Manufacturer, Firewall, Malware and Bitlocker. ${HYDRATION_MARKER}`,
    activeFirewallRequired: true,
    antiSpywareRequired: true,
    antivirusRequired: true,
    bitLockerEnabled: true,
    codeIntegrityEnabled: true,
    defenderEnabled: true,
    rtpEnabled: true,
    secureBootEnabled: true,
    tpmRequired: true,
    scheduledActionsForRule: [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          { actionType: "block", gracePeriodHours: 12, notificationTemplateId: "" },
          { actionType: "retire", gracePeriodHours: 4320, notificationTemplateId: "" },
        ],
      },
    ],
  },

  // ── iOS ──────────────────────────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.iosCompliancePolicy",
    displayName: "iOS Compliance",
    description: `iOS Compliance Policy. ${HYDRATION_MARKER}`,
    managedEmailProfileRequired: true,
    passcodeRequired: true,
    passcodeBlockSimple: true,
    passcodeMinimumLength: 6,
    passcodeRequiredType: "numeric",
    securityBlockJailbrokenDevices: true,
    scheduledActionsForRule: [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          { actionType: "block", gracePeriodHours: 72, notificationTemplateId: "" },
          { actionType: "pushNotification", gracePeriodHours: 24, notificationTemplateId: "" },
          { actionType: "remoteLock", gracePeriodHours: 2160, notificationTemplateId: "" },
          { actionType: "retire", gracePeriodHours: 4320, notificationTemplateId: "" },
        ],
      },
    ],
  },
  {
    "@odata.type": "#microsoft.graph.iosCompliancePolicy",
    displayName: "iOS Compliance - Strict",
    description: `iOS Compliance Policy (strict). ${HYDRATION_MARKER}`,
    managedEmailProfileRequired: true,
    passcodeRequired: true,
    passcodeBlockSimple: true,
    passcodeMinimumLength: 8,
    passcodeMinimumCharacterSetCount: 3,
    passcodeRequiredType: "numeric",
    securityBlockJailbrokenDevices: true,
    deviceThreatProtectionEnabled: true,
    deviceThreatProtectionRequiredSecurityLevel: "medium",
    advancedThreatProtectionRequiredSecurityLevel: "medium",
    scheduledActionsForRule: [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          { actionType: "block", gracePeriodHours: 0, notificationTemplateId: "" },
          { actionType: "retire", gracePeriodHours: 720, notificationTemplateId: "" },
        ],
      },
    ],
  },

  // ── macOS ────────────────────────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
    displayName: "macOS Compliance",
    description: `Compliance Policy for macOS Devices. ${HYDRATION_MARKER}`,
    passwordRequired: true,
    passwordBlockSimple: true,
    passwordMinimumLength: 8,
    passwordRequiredType: "alphanumeric",
    storageRequireEncryption: true,
    firewallEnabled: true,
    firewallBlockAllIncoming: false,
    firewallEnableStealthMode: true,
    systemIntegrityProtectionEnabled: true,
    gatekeeperAllowedAppSource: "macAppStoreAndIdentifiedDevelopers",
    scheduledActionsForRule: [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          { actionType: "block", gracePeriodHours: 72, notificationTemplateId: "" },
          { actionType: "retire", gracePeriodHours: 4320, notificationTemplateId: "" },
        ],
      },
    ],
  },
  {
    "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
    displayName: "macOS Compliance - Strict",
    description: `Compliance Policy for macOS Devices (strict). ${HYDRATION_MARKER}`,
    passwordRequired: true,
    passwordBlockSimple: true,
    passwordMinimumLength: 14,
    passwordMinimumCharacterSetCount: 3,
    passwordRequiredType: "alphanumeric",
    storageRequireEncryption: true,
    firewallEnabled: true,
    firewallBlockAllIncoming: false,
    firewallEnableStealthMode: true,
    systemIntegrityProtectionEnabled: true,
    gatekeeperAllowedAppSource: "macAppStoreAndIdentifiedDevelopers",
    deviceThreatProtectionEnabled: true,
    deviceThreatProtectionRequiredSecurityLevel: "medium",
    advancedThreatProtectionRequiredSecurityLevel: "medium",
    osMinimumVersion: "14.0",
    scheduledActionsForRule: [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          { actionType: "block", gracePeriodHours: 0, notificationTemplateId: "" },
          { actionType: "retire", gracePeriodHours: 720, notificationTemplateId: "" },
        ],
      },
    ],
  },
];

/**
 * Get all compliance policy templates
 */
export function getCompliancePolicies(): CompliancePolicy[] {
  return COMPLIANCE_POLICIES;
}

/**
 * Get compliance policies for a specific platform
 */
export function getCompliancePoliciesByPlatform(platform: string): CompliancePolicy[] {
  const platformMap: Record<string, string[]> = {
    windows: ["#microsoft.graph.windows10CompliancePolicy"],
    ios: ["#microsoft.graph.iosCompliancePolicy"],
    android: ["#microsoft.graph.androidDeviceOwnerCompliancePolicy"],
    macos: ["#microsoft.graph.macOSCompliancePolicy"],
  };

  const odataTypes = platformMap[platform.toLowerCase()];
  if (!odataTypes) {
    return [];
  }

  return COMPLIANCE_POLICIES.filter((policy) =>
    odataTypes.includes(policy["@odata.type"])
  );
}

/**
 * Get a specific compliance policy by display name
 */
export function getCompliancePolicyByName(
  displayName: string
): CompliancePolicy | undefined {
  return COMPLIANCE_POLICIES.find(
    (policy) => policy.displayName.toLowerCase() === displayName.toLowerCase()
  );
}
