/**
 * Dynamic Group Templates for Intune Hydration Kit
 * These groups are used for device categorization and targeting
 */

import { DeviceGroup } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

export const DYNAMIC_GROUPS: DeviceGroup[] = [
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "All Windows Devices",
    description: `Dynamic group containing all Windows devices enrolled in Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "AllWindowsDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "Windows")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "All macOS Devices",
    description: `Dynamic group containing all macOS devices enrolled in Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "AllMacOSDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "MacMDM")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "All iOS Devices",
    description: `Dynamic group containing all iOS devices enrolled in Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "AllIOSDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "IPhone") or (device.deviceOSType -eq "IPad")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "All Android Devices",
    description: `Dynamic group containing all Android devices enrolled in Intune. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "AllAndroidDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "Android")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Windows 10 Devices",
    description: `Dynamic group containing Windows 10 devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "Windows10Devices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "Windows") and (device.deviceOSVersion -startsWith "10.0")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Windows 11 Devices",
    description: `Dynamic group containing Windows 11 devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "Windows11Devices",
    securityEnabled: true,
    membershipRule: '(device.deviceOSType -eq "Windows") and (device.deviceOSVersion -startsWith "10.0.22")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Corporate Devices",
    description: `Dynamic group containing corporate-owned devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "CorporateDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOwnership -eq "Company")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Personal Devices",
    description: `Dynamic group containing personal (BYOD) devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "PersonalDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceOwnership -eq "Personal")',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Compliant Devices",
    description: `Dynamic group containing compliant devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "CompliantDevices",
    securityEnabled: true,
    membershipRule: '(device.isCompliant -eq true)',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Non-Compliant Devices",
    description: `Dynamic group containing non-compliant devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "NonCompliantDevices",
    securityEnabled: true,
    membershipRule: '(device.isCompliant -eq false)',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Autopilot Devices",
    description: `Dynamic group containing Windows Autopilot devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "AutopilotDevices",
    securityEnabled: true,
    membershipRule: '(device.enrollmentProfileName -ne null)',
    membershipRuleProcessingState: "On",
  },
  {
    "@odata.type": "#microsoft.graph.group",
    displayName: "Azure AD Joined Devices",
    description: `Dynamic group containing Azure AD joined devices. ${HYDRATION_MARKER}`,
    groupTypes: ["DynamicMembership"],
    mailEnabled: false,
    mailNickname: "AzureADJoinedDevices",
    securityEnabled: true,
    membershipRule: '(device.deviceTrustType -eq "AzureAd")',
    membershipRuleProcessingState: "On",
  },
];

/**
 * Get all dynamic group templates
 */
export function getDynamicGroups(): DeviceGroup[] {
  return DYNAMIC_GROUPS;
}

/**
 * Get a specific dynamic group by display name
 */
export function getDynamicGroupByName(displayName: string): DeviceGroup | undefined {
  return DYNAMIC_GROUPS.find(
    (group) => group.displayName.toLowerCase() === displayName.toLowerCase()
  );
}
