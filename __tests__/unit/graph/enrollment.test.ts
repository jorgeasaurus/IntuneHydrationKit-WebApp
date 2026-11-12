import { afterEach, describe, expect, it, vi } from "vitest";

import type { GraphClient } from "@/lib/graph/client";
import {
  createEnrollmentProfile,
  enrollmentProfileExists,
  findEnrollmentProfileForDelete,
  getEnrollmentProfileName,
  getEnrollmentProfileType,
} from "@/lib/graph/enrollment";
import { HYDRATION_MARKER } from "@/lib/utils/hydrationMarker";
import type {
  AutopilotDeploymentProfile,
  DevicePreparationProfile,
  EnrollmentStatusPageConfiguration,
} from "@/lib/graph/enrollment";

function makeAutopilotProfile(
  overrides: Partial<AutopilotDeploymentProfile> = {}
): AutopilotDeploymentProfile {
  return {
    "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
    id: "autopilot-id",
    displayName: "[IHD] Default Autopilot Deployment Profile",
    description: "Autopilot profile",
    language: "os-default",
    locale: "os-default",
    roleScopeTagIds: [],
    ...overrides,
  };
}

function makeEspProfile(
  overrides: Partial<EnrollmentStatusPageConfiguration> = {}
): EnrollmentStatusPageConfiguration {
  return {
    "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration",
    id: "esp-id",
    displayName: "[IHD] Intune Default Enrollment Status Page",
    description: `Enrollment status page ${HYDRATION_MARKER}`,
    ...overrides,
  };
}

function makeDevicePreparationProfile(
  overrides: Partial<DevicePreparationProfile> = {}
): DevicePreparationProfile {
  return {
    id: "device-prep-id",
    name: "[IHD] Windows Autopilot device preparation - User Driven",
    description: "",
    settings: [],
    roleScopeTagIds: [],
    platforms: "windows10",
    technologies: "enrollment",
    templateReference: {
      templateId: "template-id",
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lib/graph/enrollment", () => {
  it("routes enrollment profile creation and cleans each payload type", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ id: "autopilot-created" })
      .mockResolvedValueOnce({ id: "esp-created" })
      .mockResolvedValueOnce({ id: "device-prep-created" });
    const client = { post } as unknown as GraphClient;

    const autopilotProfile = makeAutopilotProfile();
    const espProfile = makeEspProfile();
    const devicePreparationProfile = makeDevicePreparationProfile();

    await createEnrollmentProfile(client, autopilotProfile);
    await createEnrollmentProfile(client, espProfile);
    await createEnrollmentProfile(client, devicePreparationProfile);

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/deviceManagement/windowsAutopilotDeploymentProfiles",
      expect.objectContaining({
        "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
        displayName: "[IHD] Default Autopilot Deployment Profile",
        description: `Autopilot profile ${HYDRATION_MARKER}`,
        roleScopeTagIds: [],
      })
    );
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("id");
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("language");
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("locale");

    expect(post).toHaveBeenNthCalledWith(
      2,
      "/deviceManagement/deviceEnrollmentConfigurations",
      expect.objectContaining({
        "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration",
        displayName: "[IHD] Intune Default Enrollment Status Page",
        description: `Enrollment status page ${HYDRATION_MARKER}`,
      })
    );
    expect(post.mock.calls[1]?.[1]).not.toHaveProperty("id");

    expect(post).toHaveBeenNthCalledWith(
      3,
      "/deviceManagement/configurationPolicies",
      expect.objectContaining({
        name: "[IHD] Windows Autopilot device preparation - User Driven",
        description: HYDRATION_MARKER,
        settings: [],
        technologies: "enrollment",
      })
    );
    expect(post.mock.calls[2]?.[1]).not.toHaveProperty("id");
    expect(post.mock.calls[2]?.[1]).not.toHaveProperty("displayName");

    expect(autopilotProfile).toMatchObject({
      id: "autopilot-id",
      language: "os-default",
      locale: "os-default",
    });
    expect(devicePreparationProfile).toMatchObject({
      id: "device-prep-id",
      description: "",
    });
  });

  it("detects profile types, names, and existence across all enrollment variants", async () => {
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([makeEspProfile({ displayName: "[IHD] - Intune Default Enrollment Status Page" })])
      .mockResolvedValueOnce([makeDevicePreparationProfile({ name: "[IHD] - Windows Autopilot device preparation - User Driven" })])
      .mockResolvedValueOnce([]);
    const client = { getCollection } as unknown as GraphClient;

    const autopilotProfile = makeAutopilotProfile();
    const espProfile = makeEspProfile();
    const devicePreparationProfile = makeDevicePreparationProfile();

    expect(getEnrollmentProfileType(autopilotProfile)).toBe("autopilot");
    expect(getEnrollmentProfileType(espProfile)).toBe("esp");
    expect(getEnrollmentProfileType(devicePreparationProfile)).toBe("devicePreparation");

    expect(getEnrollmentProfileName(autopilotProfile)).toBe("[IHD] Default Autopilot Deployment Profile");
    expect(getEnrollmentProfileName(devicePreparationProfile)).toBe(
      "[IHD] Windows Autopilot device preparation - User Driven"
    );
    expect(getEnrollmentProfileName({} as never)).toBe("");

    await expect(enrollmentProfileExists(client, espProfile)).resolves.toBe(true);
    await expect(enrollmentProfileExists(client, devicePreparationProfile)).resolves.toBe(true);
    await expect(enrollmentProfileExists(client, autopilotProfile)).resolves.toBe(false);
  });

  it("returns false when device preparation lookup fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = {
      getCollection: vi.fn().mockRejectedValue(new Error("Lookup failed")),
    } as unknown as GraphClient;

    await expect(
      enrollmentProfileExists(
        client,
        makeDevicePreparationProfile({ name: "Broken policy" })
      )
    ).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[DevicePreparation] Error checking if policy exists: Broken policy",
      expect.any(Error)
    );
  });

  it("finds enrollment objects for delete by normalized name", async () => {
    const getCollection = vi.fn(async (url: string) => {
      if (url === "/deviceManagement/windowsAutopilotDeploymentProfiles") return [makeAutopilotProfile()];
      if (url === "/deviceManagement/deviceEnrollmentConfigurations") {
        return [makeEspProfile({ displayName: "[IHD] - Intune Default Enrollment Status Page" })];
      }
      return [
        { id: "settings-id", name: "[IHD] Device prep", description: HYDRATION_MARKER, technologies: "mdm" },
        { id: "prep-id", name: "[IHD] Device prep", description: HYDRATION_MARKER, technologies: "enrollment" },
      ];
    });
    const client = { getCollection } as unknown as GraphClient;

    await expect(findEnrollmentProfileForDelete(client, "[IHD] Default Autopilot Deployment Profile")).resolves.toMatchObject({
      id: "autopilot-id",
      basePath: "/deviceManagement/windowsAutopilotDeploymentProfiles",
    });
    await expect(findEnrollmentProfileForDelete(client, "[IHD] Intune Default Enrollment Status Page")).resolves.toMatchObject({
      id: "esp-id",
      basePath: "/deviceManagement/deviceEnrollmentConfigurations",
    });
    // Only Settings Catalog policies with the enrollment technology are Device Preparation policies
    await expect(findEnrollmentProfileForDelete(client, "[IHD] Device prep")).resolves.toMatchObject({
      id: "prep-id",
      basePath: "/deviceManagement/configurationPolicies",
    });
    await expect(findEnrollmentProfileForDelete(client, "[IHD] Missing")).resolves.toBeNull();
    expect(getCollection).toHaveBeenCalledWith("/deviceManagement/configurationPolicies?$select=id,name,description,technologies");
  });

  it("searches only the collection of the given profile type", async () => {
    const sameName = "[IHD] Windows Enrollment";
    const getCollection = vi.fn(async (url: string) => {
      if (url === "/deviceManagement/windowsAutopilotDeploymentProfiles") {
        return [makeAutopilotProfile({ displayName: sameName })];
      }
      if (url === "/deviceManagement/deviceEnrollmentConfigurations") return [makeEspProfile({ displayName: sameName })];
      return [];
    });
    const client = { getCollection } as unknown as GraphClient;

    await expect(findEnrollmentProfileForDelete(client, sameName, "esp")).resolves.toMatchObject({
      id: "esp-id",
      basePath: "/deviceManagement/deviceEnrollmentConfigurations",
    });
    expect(getCollection).toHaveBeenCalledTimes(1);
    // Without a type, a name that matches two object types is not resolved.
    await expect(findEnrollmentProfileForDelete(client, sameName)).rejects.toThrow(/more than one enrollment object/);
  });

  it("does not hide read errors during the delete lookup", async () => {
    const client = {
      getCollection: vi.fn().mockRejectedValue(new Error("[403] Forbidden")),
    } as unknown as GraphClient;

    await expect(findEnrollmentProfileForDelete(client, "[IHD] Any")).rejects.toThrow("[403] Forbidden");
  });
});
