import { describe, expect, it } from "vitest";

import {
  DEVICE_FILTER_TEMPLATE_COUNT,
  DEVICE_FILTER_TEMPLATE_PATHS,
} from "@/templates/filterManifest";
import {
  DEVICE_FILTER_TEMPLATE_FILES,
  getDeviceFilterByName,
  getDeviceFilters,
  getDeviceFiltersByPlatform,
} from "@/templates/filters";

describe("device filter template offering", () => {
  it("includes the PowerShell module architecture filters", () => {
    const filters = getDeviceFilters();
    const displayNames = new Set(filters.map((filter) => filter.displayName));

    expect(filters).toHaveLength(DEVICE_FILTER_TEMPLATE_COUNT);
    expect(DEVICE_FILTER_TEMPLATE_COUNT).toBe(29);
    expect(displayNames.size).toBe(29);
    expect(getDeviceFiltersByPlatform("windows10AndLater")).toHaveLength(18);
    expect(getDeviceFiltersByPlatform("macOS")).toHaveLength(5);
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
  });

  it("keeps the lightweight manifest aligned with the static fallback files", () => {
    expect(DEVICE_FILTER_TEMPLATE_FILES.map((file) => file.path)).toEqual(
      DEVICE_FILTER_TEMPLATE_PATHS
    );
    expect(
      DEVICE_FILTER_TEMPLATE_FILES.reduce(
        (total, file) => total + file.source.filters.length,
        0
      )
    ).toBe(DEVICE_FILTER_TEMPLATE_COUNT);
  });
});
