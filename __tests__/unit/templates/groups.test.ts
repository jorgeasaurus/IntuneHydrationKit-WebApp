import { describe, expect, it } from "vitest";

import {
  DYNAMIC_GROUP_TEMPLATE_COUNT,
  GROUP_TEMPLATE_COUNT,
  STATIC_GROUP_TEMPLATE_COUNT,
} from "@/templates/groupManifest";
import {
  DYNAMIC_GROUPS,
  STATIC_GROUPS,
  getDynamicGroupByName,
} from "@/templates/groups";

describe("dynamic group templates", () => {
  it("keeps the lightweight manifest in sync with the template arrays", () => {
    expect(DYNAMIC_GROUPS).toHaveLength(DYNAMIC_GROUP_TEMPLATE_COUNT);
    expect(STATIC_GROUPS).toHaveLength(STATIC_GROUP_TEMPLATE_COUNT);
    expect(GROUP_TEMPLATE_COUNT).toBe(
      DYNAMIC_GROUPS.length + STATIC_GROUPS.length
    );
  });
  it("has unique display names and mail nicknames", () => {
    const displayNames = DYNAMIC_GROUPS.map((g) => g.displayName.toLowerCase());
    const nicknames = DYNAMIC_GROUPS.map((g) => g.mailNickname.toLowerCase());

    expect(new Set(displayNames).size).toBe(displayNames.length);
    expect(new Set(nicknames).size).toBe(nicknames.length);
  });

  it("includes OS-version dynamic groups for Windows, macOS, and iOS", () => {
    expect(
      getDynamicGroupByName("Intune - Windows 11 24H2 Devices")
    ).toMatchObject({
      membershipRule:
        '(device.deviceOSType -eq "Windows") and (device.deviceOSVersion -startsWith "10.0.26100") and (device.managementType -eq "MDM")',
    });
    expect(
      getDynamicGroupByName("Intune - Windows 11 25H2 Devices")
    ).toMatchObject({
      membershipRule:
        '(device.deviceOSType -eq "Windows") and (device.deviceOSVersion -startsWith "10.0.26200") and (device.managementType -eq "MDM")',
    });
    expect(
      getDynamicGroupByName("Intune - Windows 11 26H1 Devices")
    ).toMatchObject({
      membershipRule:
        '(device.deviceOSType -eq "Windows") and (device.deviceOSVersion -startsWith "10.0.28000") and (device.managementType -eq "MDM")',
    });
    expect(
      getDynamicGroupByName("Intune - macOS 26 Tahoe Devices")
    ).toMatchObject({
      membershipRule:
        '(device.deviceOSType -eq "MacMDM") and (device.deviceOSVersion -startsWith "26.")',
    });
    expect(
      getDynamicGroupByName("Intune - macOS 27 Golden Gate Devices")
    ).toMatchObject({
      membershipRule:
        '(device.deviceOSType -eq "MacMDM") and (device.deviceOSVersion -startsWith "27.")',
    });
    expect(
      getDynamicGroupByName("Intune - macOS 15 Sequoia Devices")
    ).toMatchObject({
      membershipRule:
        '(device.deviceOSType -eq "MacMDM") and (device.deviceOSVersion -startsWith "15.")',
    });
    expect(
      getDynamicGroupByName("Intune - macOS 14 Sonoma Devices")
    ).toMatchObject({
      membershipRule:
        '(device.deviceOSType -eq "MacMDM") and (device.deviceOSVersion -startsWith "14.")',
    });
    expect(
      getDynamicGroupByName("Intune - iOS iPadOS 26 Devices")
    ).toMatchObject({
      membershipRule:
        '((device.deviceOSType -eq "iOS") or (device.deviceOSType -eq "iPad")) and (device.deviceOSVersion -startsWith "26.")',
    });
    expect(
      getDynamicGroupByName("Intune - iOS iPadOS 18 Devices")
    ).toMatchObject({
      membershipRule:
        '((device.deviceOSType -eq "iOS") or (device.deviceOSType -eq "iPad")) and (device.deviceOSVersion -startsWith "18.")',
    });
  });

  it("marks every group with the hydration marker", () => {
    for (const group of DYNAMIC_GROUPS) {
      expect(group.description).toContain("Imported by Intune Hydration Kit");
    }
  });
});
