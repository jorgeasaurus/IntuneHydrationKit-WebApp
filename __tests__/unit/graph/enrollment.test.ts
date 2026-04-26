import { afterEach, describe, expect, it, vi } from "vitest";

import type { GraphClient } from "@/lib/graph/client";
import {
  createEnrollmentProfile,
  deleteAutopilotProfileByName,
  deleteEnrollmentProfileByName,
  deleteAutopilotProfile,
  deleteDevicePreparationByName,
  deleteESPConfigurationByName,
  deleteESPConfiguration,
  devicePreparationExists,
  enrollmentProfileExists,
  getAutopilotProfileAssignments,
  getEnrollmentProfileName,
  getEnrollmentProfileType,
  getESPConfigurationAssignments,
} from "@/lib/graph/enrollment";
import { HYDRATION_MARKER } from "@/lib/utils/hydrationMarker";
import type {
  AutopilotDeploymentProfile,
  EnrollmentStatusPageConfiguration,
} from "@/lib/graph/enrollment";
import type { DevicePreparationProfile } from "@/templates/enrollment";

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

  it("rejects deleting autopilot profiles that do not have the hydration marker", async () => {
    const get = vi.fn().mockResolvedValue({
      displayName: "Unsafe Autopilot Profile",
      description: "Manually created",
    });
    const getCollection = vi.fn();
    const del = vi.fn();
    const client = { get, getCollection, delete: del } as unknown as GraphClient;

    await expect(deleteAutopilotProfile(client, "unsafe-id")).rejects.toThrow(
      'Cannot delete profile "Unsafe Autopilot Profile": Not created by Intune Hydration Kit'
    );
    expect(getCollection).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("rejects deleting ESP configurations that still have assignments", async () => {
    const get = vi.fn().mockResolvedValue({
      displayName: "Assigned ESP",
      description: HYDRATION_MARKER,
    });
    const getCollection = vi.fn().mockResolvedValue([{ id: "assignment-1" }]);
    const del = vi.fn();
    const client = { get, getCollection, delete: del } as unknown as GraphClient;

    await expect(deleteESPConfiguration(client, "esp-id")).rejects.toThrow(
      'Cannot delete ESP configuration "Assigned ESP": Has 1 assignment(s). Remove all assignments before deleting.'
    );
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes device preparation profiles when the hydration marker is present in the name", async () => {
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "device-prep-id",
          name: "[IHD] - Windows Autopilot device preparation - User Driven",
          description: "Manually documented",
        },
      ])
      .mockResolvedValueOnce([]);
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { getCollection, delete: del } as unknown as GraphClient;

    await deleteDevicePreparationByName(
      client,
      "[IHD] Windows Autopilot device preparation - User Driven"
    );

    expect(del).toHaveBeenCalledWith("/deviceManagement/configurationPolicies/device-prep-id");
  });

  it("reads assignments and deletes enrollment profiles by normalized name", async () => {
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([{ id: "autopilot-assignment" }])
      .mockResolvedValueOnce([{ id: "esp-assignment" }])
      .mockResolvedValueOnce([
        makeAutopilotProfile({
          id: "autopilot-id",
          displayName: "[IHD] - Default Autopilot Deployment Profile",
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeEspProfile({
          id: "esp-id",
          displayName: "[IHD] - Intune Default Enrollment Status Page",
        }),
      ])
      .mockResolvedValueOnce([]);
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        displayName: "[IHD] Default Autopilot Deployment Profile",
        description: HYDRATION_MARKER,
      })
      .mockResolvedValueOnce({
        displayName: "[IHD] Intune Default Enrollment Status Page",
        description: HYDRATION_MARKER,
      });
    const del = vi.fn().mockResolvedValue(undefined);
    const client = { getCollection, get, delete: del } as unknown as GraphClient;

    await expect(getAutopilotProfileAssignments(client, "autopilot-id")).resolves.toEqual([
      { id: "autopilot-assignment" },
    ]);
    await expect(getESPConfigurationAssignments(client, "esp-id")).resolves.toEqual([
      { id: "esp-assignment" },
    ]);
    await deleteEnrollmentProfileByName(
      client,
      "[IHD] Default Autopilot Deployment Profile",
      "autopilot"
    );
    await deleteEnrollmentProfileByName(
      client,
      "[IHD] Intune Default Enrollment Status Page",
      "esp"
    );

    expect(del).toHaveBeenNthCalledWith(
      1,
      "/deviceManagement/windowsAutopilotDeploymentProfiles/autopilot-id"
    );
    expect(del).toHaveBeenNthCalledWith(
      2,
      "/deviceManagement/deviceEnrollmentConfigurations/esp-id"
    );
  });

  it("throws helpful errors when named autopilot or ESP profiles are missing", async () => {
    const client = {
      getCollection: vi.fn().mockResolvedValue([]),
    } as unknown as GraphClient;

    await expect(
      deleteAutopilotProfileByName(client, "[IHD] Missing Autopilot Profile")
    ).rejects.toThrow('Autopilot profile "[IHD] Missing Autopilot Profile" not found');
    await expect(
      deleteESPConfigurationByName(client, "[IHD] Missing ESP")
    ).rejects.toThrow('ESP configuration "[IHD] Missing ESP" not found');
  });

  it("guards device preparation deletes for missing or assigned policies", async () => {
    const missingClient = {
      getCollection: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    } as unknown as GraphClient;

    await expect(
      deleteDevicePreparationByName(missingClient, "[IHD] Missing Device Prep")
    ).rejects.toThrow('Device Preparation policy "[IHD] Missing Device Prep" not found');

    const assignedClient = {
      getCollection: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "device-prep-id",
            name: "[IHD] Windows Autopilot device preparation - User Driven",
            description: HYDRATION_MARKER,
          },
        ])
        .mockResolvedValueOnce([{ id: "assignment-1" }]),
      delete: vi.fn(),
    } as unknown as GraphClient;

    await expect(
      deleteDevicePreparationByName(
        assignedClient,
        "[IHD] Windows Autopilot device preparation - User Driven"
      )
    ).rejects.toThrow(
      'Cannot delete Device Preparation policy "[IHD] Windows Autopilot device preparation - User Driven": Has 1 assignment(s). Remove all assignments before deleting.'
    );
  });

  it("returns false when device preparation lookup fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = {
      getCollection: vi.fn().mockRejectedValue(new Error("Lookup failed")),
    } as unknown as GraphClient;

    await expect(devicePreparationExists(client, "Broken policy")).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[DevicePreparation] Error checking if policy exists: Broken policy",
      expect.any(Error)
    );
  });
});
