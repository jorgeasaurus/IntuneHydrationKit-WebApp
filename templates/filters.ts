/**
 * Device Filter Templates for Intune Hydration Kit
 * Filters are used for granular policy targeting
 */

import { DeviceFilter } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune-Hydration-Kit";

export const DEVICE_FILTERS: DeviceFilter[] = [
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows 11 Corporate Devices",
    description: `Filter for Windows 11 corporate-owned devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.deviceOwnership -eq "Corporate") and (device.osVersion -startsWith "10.0.22")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows 10 Corporate Devices",
    description: `Filter for Windows 10 corporate-owned devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.deviceOwnership -eq "Corporate") and (device.osVersion -startsWith "10.0.19")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows BYOD Devices",
    description: `Filter for Windows personal (BYOD) devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.deviceOwnership -eq "Personal")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Corporate iOS Devices",
    description: `Filter for corporate-owned iOS devices. ${HYDRATION_MARKER}`,
    platform: "iOS",
    rule: '(device.deviceOwnership -eq "Corporate")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Personal iOS Devices",
    description: `Filter for personal (BYOD) iOS devices. ${HYDRATION_MARKER}`,
    platform: "iOS",
    rule: '(device.deviceOwnership -eq "Personal")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Corporate Android Devices",
    description: `Filter for corporate-owned Android devices. ${HYDRATION_MARKER}`,
    platform: "android",
    rule: '(device.deviceOwnership -eq "Corporate")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Personal Android Devices",
    description: `Filter for personal (BYOD) Android devices. ${HYDRATION_MARKER}`,
    platform: "android",
    rule: '(device.deviceOwnership -eq "Personal")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Corporate macOS Devices",
    description: `Filter for corporate-owned macOS devices. ${HYDRATION_MARKER}`,
    platform: "macOS",
    rule: '(device.deviceOwnership -eq "Corporate")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Personal macOS Devices",
    description: `Filter for personal (BYOD) macOS devices. ${HYDRATION_MARKER}`,
    platform: "macOS",
    rule: '(device.deviceOwnership -eq "Personal")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Azure AD Joined Windows Devices",
    description: `Filter for Azure AD joined Windows devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.trustType -eq "AzureAd")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Hybrid Azure AD Joined Windows Devices",
    description: `Filter for Hybrid Azure AD joined Windows devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.trustType -eq "ServerAd")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows Autopilot Devices",
    description: `Filter for Windows Autopilot provisioned devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.enrollmentProfileName -ne null)',
  },
];

/**
 * Get all device filter templates
 */
export function getDeviceFilters(): DeviceFilter[] {
  return DEVICE_FILTERS;
}

/**
 * Get device filters for a specific platform
 */
export function getDeviceFiltersByPlatform(
  platform: DeviceFilter["platform"]
): DeviceFilter[] {
  return DEVICE_FILTERS.filter((filter) => filter.platform === platform);
}

/**
 * Get a specific device filter by display name
 */
export function getDeviceFilterByName(displayName: string): DeviceFilter | undefined {
  return DEVICE_FILTERS.find(
    (filter) => filter.displayName.toLowerCase() === displayName.toLowerCase()
  );
}
