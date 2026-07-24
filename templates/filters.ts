/**
 * Device Filter Templates for Intune Hydration Kit
 *
 * Generated from the bundled JSON filter templates so the static fallback and
 * browser-loaded templates share one source of truth.
 */

import androidFilterTemplates from "@/public/IntuneTemplates/Filters/Android-Filters.json";
import windowsArchitectureFilterTemplates from "@/public/IntuneTemplates/Filters/Windows-Architecture-Filters.json";
import windowsDeviceTrustTypeFilterTemplates from "@/public/IntuneTemplates/Filters/Windows-DeviceTrustType-Filters.json";
import windowsManufacturerFilterTemplates from "@/public/IntuneTemplates/Filters/Windows-Manufacturer-Filters.json";
import windowsOsVersionFilterTemplates from "@/public/IntuneTemplates/Filters/Windows-OSVersion-Filters.json";
import windowsVmFilterTemplates from "@/public/IntuneTemplates/Filters/Windows-VM-Filters.json";
import iosFilterTemplates from "@/public/IntuneTemplates/Filters/iOS-Filters.json";
import iosOsVersionFilterTemplates from "@/public/IntuneTemplates/Filters/iOS-OSVersion-Filters.json";
import macosArchitectureFilterTemplates from "@/public/IntuneTemplates/Filters/macOS-Architecture-Filters.json";
import macosFilterTemplates from "@/public/IntuneTemplates/Filters/macOS-Filters.json";
import macosOsVersionFilterTemplates from "@/public/IntuneTemplates/Filters/macOS-OSVersion-Filters.json";
import type { DeviceFilter } from "@/types/graph";
import { DEVICE_FILTER_TEMPLATE_PATHS } from "./filterManifest";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";
const FILTER_ODATA_TYPE = "#microsoft.graph.deviceAndAppManagementAssignmentFilter";

type DeviceFilterTemplate = {
  displayName: string;
  description: string;
  platform: string;
  rule: string;
};

type DeviceFilterTemplateFile = {
  path: string;
  source: { filters: DeviceFilterTemplate[] };
};

const [
  ANDROID_FILTERS_PATH,
  WINDOWS_ARCHITECTURE_FILTERS_PATH,
  WINDOWS_DEVICE_TRUST_TYPE_FILTERS_PATH,
  WINDOWS_MANUFACTURER_FILTERS_PATH,
  WINDOWS_OSVERSION_FILTERS_PATH,
  WINDOWS_VM_FILTERS_PATH,
  IOS_FILTERS_PATH,
  IOS_OSVERSION_FILTERS_PATH,
  MACOS_ARCHITECTURE_FILTERS_PATH,
  MACOS_FILTERS_PATH,
  MACOS_OSVERSION_FILTERS_PATH,
] = DEVICE_FILTER_TEMPLATE_PATHS;

export const DEVICE_FILTER_TEMPLATE_FILES = [
  { path: ANDROID_FILTERS_PATH, source: androidFilterTemplates },
  {
    path: WINDOWS_ARCHITECTURE_FILTERS_PATH,
    source: windowsArchitectureFilterTemplates,
  },
  {
    path: WINDOWS_DEVICE_TRUST_TYPE_FILTERS_PATH,
    source: windowsDeviceTrustTypeFilterTemplates,
  },
  {
    path: WINDOWS_MANUFACTURER_FILTERS_PATH,
    source: windowsManufacturerFilterTemplates,
  },
  {
    path: WINDOWS_OSVERSION_FILTERS_PATH,
    source: windowsOsVersionFilterTemplates,
  },
  { path: WINDOWS_VM_FILTERS_PATH, source: windowsVmFilterTemplates },
  { path: IOS_FILTERS_PATH, source: iosFilterTemplates },
  { path: IOS_OSVERSION_FILTERS_PATH, source: iosOsVersionFilterTemplates },
  {
    path: MACOS_ARCHITECTURE_FILTERS_PATH,
    source: macosArchitectureFilterTemplates,
  },
  { path: MACOS_FILTERS_PATH, source: macosFilterTemplates },
  {
    path: MACOS_OSVERSION_FILTERS_PATH,
    source: macosOsVersionFilterTemplates,
  },
] satisfies DeviceFilterTemplateFile[];

function normalizePlatform(platform: string): DeviceFilter["platform"] {
  switch (platform) {
    case "android":
    case "androidForWork":
      return "android";
    case "iOS":
    case "macOS":
    case "windows10AndLater":
      return platform;
    default:
      throw new Error(`Unsupported device filter platform: ${platform}`);
  }
}

function addHydrationMarker(description: string): string {
  return description.includes(HYDRATION_MARKER)
    ? description
    : `${description} ${HYDRATION_MARKER}`;
}

function toDeviceFilter(template: DeviceFilterTemplate): DeviceFilter {
  return {
    "@odata.type": FILTER_ODATA_TYPE,
    displayName: template.displayName,
    description: addHydrationMarker(template.description),
    platform: normalizePlatform(template.platform),
    rule: template.rule,
  };
}

export const DEVICE_FILTERS: DeviceFilter[] = DEVICE_FILTER_TEMPLATE_FILES.flatMap(
  (file) => file.source.filters.map(toDeviceFilter)
);

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
