import { describe, expect, it } from "vitest";

import {
  DEVICE_FILTER_TEMPLATE_COUNT,
  DEVICE_FILTER_TEMPLATE_MANIFEST,
  DEVICE_FILTER_TEMPLATE_PATHS,
} from "@/templates/filterManifest";
import {
  DEVICE_FILTER_TEMPLATE_FILES,
  getDeviceFilterByName,
  getDeviceFilters,
  getDeviceFiltersByPlatform,
} from "@/templates/filters";

const FILTER_SENTINELS_BY_PATH = {
  "Filters/Android-Filters.json": "Android - Samsung Devices",
  "Filters/Windows-Architecture-Filters.json": "Windows - x64 Devices",
  "Filters/Windows-Manufacturer-Filters.json": "Windows - Dell Devices",
  "Filters/Windows-OSVersion-Filters.json": "Windows - Windows 11 24H2 Devices",
  "Filters/Windows-VM-Filters.json": "Windows - Azure Virtual Desktop (AVD)",
  "Filters/iOS-Filters.json": "iOS - iPhone Devices",
  "Filters/iOS-OSVersion-Filters.json": "iOS - iOS 26 Devices",
  "Filters/macOS-Architecture-Filters.json": "macOS - Apple Silicon Devices",
  "Filters/macOS-Filters.json": "macOS - Apple Devices",
  "Filters/macOS-OSVersion-Filters.json": "macOS - macOS 27 Golden Gate Devices",
} satisfies Record<(typeof DEVICE_FILTER_TEMPLATE_PATHS)[number], string>;

describe("device filter template offering", () => {
  it("includes the PowerShell module architecture filters", () => {
    const filters = getDeviceFilters();
    const displayNames = new Set(filters.map((filter) => filter.displayName));

    expect(filters).toHaveLength(DEVICE_FILTER_TEMPLATE_COUNT);
    expect(DEVICE_FILTER_TEMPLATE_COUNT).toBe(38);
    expect(displayNames.size).toBe(38);
    expect(getDeviceFiltersByPlatform("windows10AndLater")).toHaveLength(21);
    expect(getDeviceFiltersByPlatform("macOS")).toHaveLength(9);
    expect(getDeviceFiltersByPlatform("iOS")).toHaveLength(5);
    expect(getDeviceFilterByName("Android - Samsung Devices")).toMatchObject({
      platform: "android",
      rule: '(device.manufacturer -eq "samsung")',
    });
    expect(getDeviceFilterByName("Windows - x64 Devices")).toMatchObject({
      platform: "windows10AndLater",
      rule: '(device.cpuArchitecture -eq "amd64")',
    });
    expect(getDeviceFilterByName("Windows - ARM64 Devices")).toMatchObject({
      platform: "windows10AndLater",
      rule: '(device.cpuArchitecture -eq "arm64")',
    });
    expect(getDeviceFilterByName("Windows - x86 Devices")).toMatchObject({
      platform: "windows10AndLater",
      rule: '(device.cpuArchitecture -eq "x86")',
    });
    expect(getDeviceFilterByName("macOS - Apple Silicon Devices")).toMatchObject({
      platform: "macOS",
      rule: '(device.cpuArchitecture -eq "arm64")',
    });
    expect(getDeviceFilterByName("macOS - Intel Devices")).toMatchObject({
      platform: "macOS",
      rule: '(device.cpuArchitecture -eq "x64")',
    });
    expect(
      getDeviceFilterByName("Windows - Windows 11 24H2 Devices")
    ).toMatchObject({
      platform: "windows10AndLater",
      rule: '(device.osVersion -startsWith "10.0.26100")',
    });
    expect(
      getDeviceFilterByName("Windows - Windows 11 25H2 Devices")
    ).toMatchObject({
      platform: "windows10AndLater",
      rule: '(device.osVersion -startsWith "10.0.26200")',
    });
    expect(
      getDeviceFilterByName("Windows - Windows 11 26H1 Devices")
    ).toMatchObject({
      platform: "windows10AndLater",
      rule: '(device.osVersion -startsWith "10.0.28000")',
    });
    expect(
      getDeviceFilterByName("macOS - macOS 26 Tahoe Devices")
    ).toMatchObject({
      platform: "macOS",
      rule: '(device.osVersion -startsWith "26.")',
    });
    expect(
      getDeviceFilterByName("macOS - macOS 27 Golden Gate Devices")
    ).toMatchObject({
      platform: "macOS",
      rule: '(device.osVersion -startsWith "27.")',
    });
    expect(getDeviceFilterByName("iOS - iOS 26 Devices")).toMatchObject({
      platform: "iOS",
      rule: '(device.osVersion -startsWith "26.")',
    });
  });

  it("keeps the lightweight manifest aligned with the static fallback files", () => {
    expect(DEVICE_FILTER_TEMPLATE_FILES.map((file) => file.path)).toEqual(
      DEVICE_FILTER_TEMPLATE_PATHS
    );

    for (const [index, manifestEntry] of DEVICE_FILTER_TEMPLATE_MANIFEST.entries()) {
      const fallbackFile = DEVICE_FILTER_TEMPLATE_FILES[index];

      expect(fallbackFile.path).toBe(manifestEntry.path);
      expect(fallbackFile.source.filters).toHaveLength(manifestEntry.count);
      expect(
        fallbackFile.source.filters.some(
          (filter) =>
            filter.displayName === FILTER_SENTINELS_BY_PATH[manifestEntry.path]
        )
      ).toBe(true);
    }

    const fallbackCount = DEVICE_FILTER_TEMPLATE_FILES.reduce(
      (total, file) => total + file.source.filters.length,
      0
    );
    expect(fallbackCount).toBe(DEVICE_FILTER_TEMPLATE_COUNT);
  });
});
