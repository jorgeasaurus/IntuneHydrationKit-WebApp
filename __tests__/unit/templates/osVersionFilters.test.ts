import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const directory = path.join(process.cwd(), "public/IntuneTemplates/Filters");
const filters = readdirSync(directory).flatMap((file) =>
  JSON.parse(readFileSync(path.join(directory, file), "utf8")).filters
) as Array<{ displayName: string; rule: string }>;

const cases = [
  ["iOS - iOS 27 Devices", "27.0", "26.9.9", "28.0", "29.0"],
  ["Windows - Windows 11 24H2 Devices", "10.0.26100", "10.0.26099.9999", "10.0.26101", "10.0.26200"],
  ["Windows - Windows 11 25H2 Devices", "10.0.26200", "10.0.26199.9999", "10.0.26201", "10.0.28000"],
  ["Windows - Windows 11 26H2 Devices", "10.0.26300", "10.0.26299.9999", "10.0.26301", "10.0.28000"],
  ["Windows - Windows 11 26H1 Devices", "10.0.28000", "10.0.27999.9999", "10.0.28001", "10.0.29000"],
  ["iOS - iOS 26 Devices", "26.0", "25.9.9", "27.0", "28.0"],
  ["iOS - iOS 18 Devices", "18.0", "17.9.9", "19.0", "26.0"],
  ["macOS - macOS 27 Golden Gate Devices", "27.0", "26.9.9", "28.0", "29.0"],
  ["macOS - macOS 26 Tahoe Devices", "26.0", "25.9.9", "27.0", "28.0"],
  ["macOS - macOS 15 Sequoia Devices", "15.0", "14.9.9", "16.0", "26.0"],
  ["macOS - macOS 14 Sonoma Devices", "14.0", "13.9.9", "15.0", "26.0"],
];

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 4; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

describe("bundled OS version filters", () => {
  it("does not use the deprecated device.osVersion property", () => {
    for (const filter of filters) {
      expect(filter.rule).not.toMatch(/device\.osVersion\b/i);
    }
  });

  it.each(cases)("keeps %s within its named release", (name, first, previous, next, later) => {
    const filter = filters.find((item) => item.displayName === name);
    expect(filter).toBeDefined();
    const bounds = filter!.rule.match(
      /^\(device\.operatingSystemVersion -ge ([\d.]+)\) and \(device\.operatingSystemVersion -lt ([\d.]+)\)$/
    );
    expect(bounds).not.toBeNull();
    const matches = (version: string) =>
      compareVersions(version, bounds![1]) >= 0 && compareVersions(version, bounds![2]) < 0;

    expect(matches(first)).toBe(true);
    expect(matches(`${first}.9999`)).toBe(true);
    if (!name.startsWith("Windows")) {
      expect(matches(`${first.split(".")[0]}.9.9`)).toBe(true);
    }
    for (const version of [previous, next, later]) {
      expect(matches(version), version).toBe(false);
    }
  });
});
