/**
 * Device Filter Templates for Intune Hydration Kit
 *
 * 24 filters matching the PowerShell project exactly.
 * PS "androidForWork" is mapped to "android" per the web app's DeviceFilter type.
 */

import { DeviceFilter } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

// ── Windows - Manufacturer Filters (3) ──────────────────────────────────────

const WINDOWS_MANUFACTURER_FILTERS: DeviceFilter[] = [
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Dell Devices",
    description: `Filter for Dell Windows devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -eq "Dell Inc.")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - HP Devices",
    description: `Filter for HP Windows devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -eq "HP") or (device.manufacturer -eq "Hewlett-Packard")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Lenovo Devices",
    description: `Filter for Lenovo Windows devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -eq "LENOVO")',
  },
];

// ── Windows - VM Filters (12) ───────────────────────────────────────────────

const WINDOWS_VM_FILTERS: DeviceFilter[] = [
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Azure Virtual Desktop (AVD)",
    description: `Filter for Azure Virtual Desktop VMs. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.model -contains "Virtual Machine")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Azure Virtual Desktop (AVD) Named",
    description: `Filter for AVD VMs with AVD- naming convention. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.model -contains "Virtual Machine") and (device.deviceName -startsWith "AVD-")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Azure IaaS VMs",
    description: `Filter for Azure IaaS Virtual Machines. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -eq "Microsoft Corporation") and (device.model -contains "Virtual Machine")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Windows 365 Cloud PC",
    description: `Filter for Windows 365 Cloud PC devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.model -contains "Cloud PC")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Microsoft Dev Box",
    description: `Filter for Microsoft Dev Box devices. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -contains "Microsoft") and (device.model -contains "Cloud")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Hyper-V VMs",
    description: `Filter for Hyper-V VMs (may overlap with Azure). ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -eq "Microsoft Corporation") and (device.model -contains "Virtual")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - VMware VMs",
    description: `Filter for VMware VMs (ESXi, Horizon, Workstation, Fusion). ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -contains "VMware")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - VirtualBox VMs",
    description: `Filter for Oracle VirtualBox VMs. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.model -contains "VirtualBox")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Parallels VMs",
    description: `Filter for Parallels Desktop VMs. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -contains "Parallels")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - QEMU KVM VMs",
    description: `Filter for QEMU/KVM VMs. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.manufacturer -contains "QEMU") or (device.model -contains "KVM")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - All Virtual Machines",
    description: `Filter for all VMs - use for reporting only. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.model -contains "Virtual") or (device.model -contains "Cloud PC") or (device.manufacturer -contains "VMware") or (device.manufacturer -contains "Parallels") or (device.manufacturer -contains "QEMU")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Windows - Physical Devices Only",
    description: `Filter excluding all known VMs. ${HYDRATION_MARKER}`,
    platform: "windows10AndLater",
    rule: '(device.model -notContains "Virtual") and (device.model -notContains "Cloud PC") and (device.manufacturer -notContains "VMware") and (device.manufacturer -notContains "Parallels") and (device.manufacturer -notContains "QEMU")',
  },
];

// ── iOS Filters (3) ─────────────────────────────────────────────────────────

const IOS_FILTERS: DeviceFilter[] = [
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "iOS - iPhone Devices",
    description: `Filter for iPhone devices. ${HYDRATION_MARKER}`,
    platform: "iOS",
    rule: '(device.model -startsWith "iPhone")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "iOS - iPad Devices",
    description: `Filter for iPad devices. ${HYDRATION_MARKER}`,
    platform: "iOS",
    rule: '(device.model -startsWith "iPad")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "iOS - Corporate Owned",
    description: `Filter for corporate-owned iOS/iPadOS devices. ${HYDRATION_MARKER}`,
    platform: "iOS",
    rule: '(device.deviceOwnership -eq "Corporate")',
  },
];

// ── Android Filters (3) - PS "androidForWork" mapped to "android" ───────────

const ANDROID_FILTERS: DeviceFilter[] = [
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Android - Samsung Devices",
    description: `Filter for Samsung Android devices. ${HYDRATION_MARKER}`,
    platform: "android",
    rule: '(device.manufacturer -eq "samsung")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Android - Google Pixel Devices",
    description: `Filter for Google Pixel Android devices. ${HYDRATION_MARKER}`,
    platform: "android",
    rule: '(device.manufacturer -eq "Google")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "Android - Corporate Owned",
    description: `Filter for corporate-owned Android devices. ${HYDRATION_MARKER}`,
    platform: "android",
    rule: '(device.deviceOwnership -eq "Corporate")',
  },
];

// ── macOS Filters (3) ───────────────────────────────────────────────────────

const MACOS_FILTERS: DeviceFilter[] = [
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "macOS - Apple Devices",
    description: `Filter for Apple macOS devices. ${HYDRATION_MARKER}`,
    platform: "macOS",
    rule: '(device.manufacturer -eq "Apple")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "macOS - MacBook Devices",
    description: `Filter for MacBook devices. ${HYDRATION_MARKER}`,
    platform: "macOS",
    rule: '(device.model -startsWith "MacBook")',
  },
  {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: "macOS - iMac Devices",
    description: `Filter for iMac devices. ${HYDRATION_MARKER}`,
    platform: "macOS",
    rule: '(device.model -startsWith "iMac")',
  },
];

// ── Combined export (24 filters) ────────────────────────────────────────────

export const DEVICE_FILTERS: DeviceFilter[] = [
  ...WINDOWS_MANUFACTURER_FILTERS,
  ...WINDOWS_VM_FILTERS,
  ...IOS_FILTERS,
  ...ANDROID_FILTERS,
  ...MACOS_FILTERS,
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
export function getDeviceFilterByName(
  displayName: string
): DeviceFilter | undefined {
  return DEVICE_FILTERS.find(
    (filter) => filter.displayName.toLowerCase() === displayName.toLowerCase()
  );
}
