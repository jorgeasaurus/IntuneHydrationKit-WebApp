import { describe, expect, it } from "vitest";

import {
  getDeviceFilterByName,
  getDeviceFilters,
  getDeviceFiltersByPlatform,
} from "@/templates/filters";

describe("device filter template offering", () => {
  it("includes the PowerShell module architecture filters", () => {
    const filters = getDeviceFilters();
    const displayNames = new Set(filters.map((filter) => filter.displayName));

    expect(filters).toHaveLength(29);
    expect(displayNames.size).toBe(29);
    expect(getDeviceFiltersByPlatform("windows10AndLater")).toHaveLength(18);
    expect(getDeviceFiltersByPlatform("macOS")).toHaveLength(5);
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
});
