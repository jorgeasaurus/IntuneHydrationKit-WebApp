import { describe, expect, it, vi } from "vitest";

import {
  buildCISGroupPolicyConfigurationPayload,
  buildCISSecurityIntentPayload,
  compliancePolicyExistsByName,
  createBaselineCompliancePolicy,
  createCISDeviceConfiguration,
  createCISGroupPolicyConfiguration,
  createCISCompliancePolicy,
  createCISSecurityIntent,
  createDeviceConfigurationPolicy,
  createDriverUpdateProfile,
  createSettingsCatalogPolicy,
  createV2CompliancePolicy,
  deviceConfigurationExists,
  groupPolicyConfigurationExists,
  securityIntentExists,
  settingsCatalogPolicyExists,
  v2CompliancePolicyExists,
} from "@/lib/hydration/policyCreators";

describe("policyCreators", () => {
  it("builds a CIS group policy configuration payload with arrays and hydration marker", () => {
    const payload = buildCISGroupPolicyConfigurationPayload({
      "@odata.type": "#microsoft.graph.groupPolicyConfiguration",
      id: "template-id",
      displayName: "[IHD] CISv1 - VS Code - L2 - Ensure EnableFeedback is set to Disabled",
      description: "",
      roleScopeTagIds: ["0"],
      definitionValues: {
        enabled: false,
        "definition@odata.bind": "https://graph.microsoft.com/beta/deviceManagement/groupPolicyDefinitions('def-1')",
        presentationValues: {
          "@odata.type": "#microsoft.graph.groupPolicyPresentationValueText",
          value: "default",
          "presentation@odata.bind": "https://graph.microsoft.com/beta/deviceManagement/groupPolicyDefinitions('def-1')/presentations('pres-1')",
        },
      },
      _cisFilePath: "4.0 - CIS Benchmarks/CIS - Visual Studio Code/CISv1 - VS Code - L2 - Ensure EnableFeedback is set to Disabled.json",
    });

    expect(payload).toMatchObject({
      displayName: "[IHD] CISv1 - VS Code - L2 - Ensure EnableFeedback is set to Disabled",
      description: "Imported by Intune Hydration Kit",
      definitionValues: [
        {
          enabled: false,
          presentationValues: [
            {
              value: "default",
            },
          ],
        },
      ],
    });
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("_cisFilePath");
  });

  it("builds a CIS security intent payload with template metadata and hydration marker", () => {
    const payload = buildCISSecurityIntentPayload({
      "@odata.type": "#microsoft.graph.deviceManagementIntent",
      id: "intent-template-id",
      displayName: "[IHD] Baseline - MacOS - Firewall",
      description: "",
      templateId: "template-1",
      roleScopeTagIds: ["0"],
      settings: [
        {
          "@odata.type": "#microsoft.graph.deviceManagementBooleanSettingInstance",
          definitionId: "deviceConfiguration--macOSEndpointProtectionConfiguration_firewallEnabled",
          value: true,
          valueJson: "true",
        },
      ],
      _cisFilePath: "6.0 - Microsoft Endpoint Security Benchmarks/Firewall/Baseline - MacOS - Firewall.json",
    });

    expect(payload).toEqual({
      displayName: "[IHD] Baseline - MacOS - Firewall",
      description: "Imported by Intune Hydration Kit",
      templateId: "template-1",
      roleScopeTagIds: ["0"],
      settings: [
        {
          "@odata.type": "#microsoft.graph.deviceManagementBooleanSettingInstance",
          definitionId: "deviceConfiguration--macOSEndpointProtectionConfiguration_firewallEnabled",
          value: true,
          valueJson: "true",
        },
      ],
    });
  });

  it("builds CIS payloads without optional arrays by normalizing names and defaulting settings", () => {
    const groupPayload = buildCISGroupPolicyConfigurationPayload({
      name: "CIS Edge Policy",
      description: undefined,
    });
    const intentPayload = buildCISSecurityIntentPayload({
      displayName: "CIS Intent",
      description: undefined,
    });

    expect(groupPayload).toEqual({
      displayName: "CIS Edge Policy",
      description: "Imported by Intune Hydration Kit",
    });
    expect(intentPayload).toEqual({
      displayName: "CIS Intent",
      description: "Imported by Intune Hydration Kit",
      templateId: undefined,
      roleScopeTagIds: undefined,
      settings: [],
    });
  });

  it("preserves non-object group policy definition values while normalizing object entries", () => {
    const payload = buildCISGroupPolicyConfigurationPayload({
      displayName: "Definition Normalization",
      description: "",
      definitionValues: [
        null,
        {
          enabled: true,
        },
      ],
    });

    expect(payload).toMatchObject({
      displayName: "Definition Normalization",
      description: "Imported by Intune Hydration Kit",
      definitionValues: [
        null,
        {
          enabled: true,
        },
      ],
    });
  });

  it("detects existing CIS security intents with OData-unsafe names via collection lookup", async () => {
    const client = {
      get: () => {
        throw new Error("should not use filtered GET for OData-unsafe names");
      },
      getCollection: async () => [
        {
          id: "intent-1",
          displayName: "[IHD] Baseline - MacOS - Firewall",
        },
      ],
    } as unknown as Parameters<typeof securityIntentExists>[0];

    await expect(
      securityIntentExists(client, "[IHD] Baseline - MacOS - Firewall")
    ).resolves.toBe(true);
  });

  it("returns false when CIS security intent collection lookup has no data", async () => {
    const client = {
      getCollection: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof securityIntentExists>[0];

    await expect(securityIntentExists(client, "[IHD] Missing Intent")).resolves.toBe(false);
    expect(client.getCollection).toHaveBeenCalledWith(
      "/deviceManagement/intents?$select=id,displayName"
    );
  });

  it("uses filtered GET for safe CIS security intent lookups and handles errors", async () => {
    const safeClient = {
      get: vi.fn().mockResolvedValue({ value: [{ displayName: "O'Brien Intent" }] }),
    } as unknown as Parameters<typeof securityIntentExists>[0];

    await expect(securityIntentExists(safeClient, "O'Brien Intent")).resolves.toBe(true);
    expect(safeClient.get).toHaveBeenCalledWith(
      "/deviceManagement/intents?$filter=displayName eq 'O''Brien Intent'&$select=id,displayName"
    );

    const failingClient = {
      get: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as Parameters<typeof securityIntentExists>[0];

    await expect(securityIntentExists(failingClient, "Safe Intent")).resolves.toBe(false);
  });

  it("skips filtered settings catalog lookups for OData-unsafe names and escapes safe names", async () => {
    const unsafeClient = {
      get: vi.fn(),
    } as unknown as Parameters<typeof settingsCatalogPolicyExists>[0];

    await expect(
      settingsCatalogPolicyExists(unsafeClient, "[IHD] Baseline: Windows")
    ).resolves.toBe(false);
    expect(unsafeClient.get).not.toHaveBeenCalled();

    const safeClient = {
      get: vi.fn().mockResolvedValue({ value: [{ name: "O'Brien Policy" }] }),
    } as unknown as Parameters<typeof settingsCatalogPolicyExists>[0];

    await expect(settingsCatalogPolicyExists(safeClient, "O'Brien Policy")).resolves.toBe(true);
    expect(safeClient.get).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies?$filter=name eq 'O''Brien%20Policy'&$select=id,name"
    );
  });

  it("creates settings catalog policies with normalized names and secret warnings", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ id: "settings-policy-id" }),
    } as unknown as Parameters<typeof createSettingsCatalogPolicy>[0];

    const result = await createSettingsCatalogPolicy(client, {
      displayName: "Wi-Fi Profile",
      description: "",
      platforms: "windows10",
      technologies: "mdm",
      settings: [
        {
          settingDefinitionId: "wifi_password",
          simpleSettingValue: {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            value: "<YOUR PASSWORD>",
          },
        },
      ],
    });

    expect(result).toEqual({
      id: "settings-policy-id",
      warning:
        'Policy "Wi-Fi Profile" contains placeholder values that require manual configuration with actual secrets.',
    });
    expect(client.post).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies",
      expect.objectContaining({
        name: "Wi-Fi Profile",
        description: "Imported by Intune Hydration Kit",
      })
    );
    expect(client.post.mock.calls[0][1]).not.toHaveProperty("displayName");
  });

  it("creates settings catalog policies without a secret warning when placeholders are absent", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ id: "settings-policy-id" }),
    } as unknown as Parameters<typeof createSettingsCatalogPolicy>[0];

    await expect(
      createSettingsCatalogPolicy(client, {
        name: "Safe Wi-Fi Profile",
        description: "Existing description",
        settings: [{ simpleSettingValue: { value: "plain-text" } }],
      })
    ).resolves.toEqual({ id: "settings-policy-id", warning: undefined });

    expect(client.post).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies",
      expect.objectContaining({
        name: "Safe Wi-Fi Profile",
        description: "Existing description - Imported by Intune Hydration Kit",
      })
    );
  });

  it("creates device and compliance payloads through the thin post wrappers", async () => {
    const deviceClient = {
      post: vi.fn().mockResolvedValue({ id: "device-config-id" }),
    } as unknown as Parameters<typeof createDeviceConfigurationPolicy>[0];
    const baselineClient = {
      post: vi.fn().mockResolvedValue({ id: "baseline-id" }),
    } as unknown as Parameters<typeof createBaselineCompliancePolicy>[0];
    const cisGroupClient = {
      post: vi.fn().mockResolvedValue({ id: "cis-group-id" }),
    } as unknown as Parameters<typeof createCISGroupPolicyConfiguration>[0];
    const intentClient = {
      post: vi.fn().mockResolvedValue({ id: "intent-id" }),
    } as unknown as Parameters<typeof createCISSecurityIntent>[0];
    const cisDeviceClient = {
      post: vi.fn().mockResolvedValue({ id: "cis-device-id" }),
    } as unknown as Parameters<typeof createCISDeviceConfiguration>[0];

    await expect(
      createDeviceConfigurationPolicy(deviceClient, {
        displayName: "Windows Config",
        description: undefined,
      })
    ).resolves.toEqual({ id: "device-config-id" });
    await expect(
      createBaselineCompliancePolicy(baselineClient, {
        id: "baseline-template",
        displayName: "Baseline Compliance",
        passwordRequired: true,
      })
    ).resolves.toEqual({ id: "baseline-id" });
    await expect(
      createCISGroupPolicyConfiguration(cisGroupClient, {
        name: "CIS Group Policy",
        description: "",
      })
    ).resolves.toEqual({ id: "cis-group-id" });
    await expect(
      createCISSecurityIntent(intentClient, {
        displayName: "CIS Intent Wrapper",
        description: "",
      })
    ).resolves.toEqual({ id: "intent-id" });
    await expect(
      createCISDeviceConfiguration(cisDeviceClient, {
        id: "cis-device-template",
        name: "CIS Device Config",
        description: "",
        _cisCategory: "Windows",
      })
    ).resolves.toEqual({ id: "cis-device-id" });

    expect(deviceClient.post).toHaveBeenCalledWith(
      "/deviceManagement/deviceConfigurations",
      expect.objectContaining({
        displayName: "Windows Config",
        description: "Imported by Intune Hydration Kit",
      })
    );
    expect(baselineClient.post).toHaveBeenCalledWith(
      "/deviceManagement/deviceCompliancePolicies",
      {
        displayName: "Baseline Compliance",
        passwordRequired: true,
      }
    );
    expect(cisGroupClient.post).toHaveBeenCalledWith(
      "/deviceManagement/groupPolicyConfigurations",
      {
        displayName: "CIS Group Policy",
        description: "Imported by Intune Hydration Kit",
      }
    );
    expect(intentClient.post).toHaveBeenCalledWith(
      "/deviceManagement/intents",
      {
        displayName: "CIS Intent Wrapper",
        description: "Imported by Intune Hydration Kit",
        templateId: undefined,
        roleScopeTagIds: undefined,
        settings: [],
      }
    );
    expect(cisDeviceClient.post).toHaveBeenCalledWith(
      "/deviceManagement/deviceConfigurations",
      {
        displayName: "CIS Device Config",
        description: "Imported by Intune Hydration Kit",
      }
    );
  });

  it("falls back to querying driver update profiles by name when create returns no id", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({
        value: [{ id: "driver-profile-id", displayName: "Windows Drivers" }],
      }),
    } as unknown as Parameters<typeof createDriverUpdateProfile>[0];

    await expect(
      createDriverUpdateProfile(client, {
        id: "template-id",
        displayName: "Windows Drivers",
        description: "",
      })
    ).resolves.toEqual({ id: "driver-profile-id" });

    expect(client.post).toHaveBeenCalledWith(
      "/deviceManagement/windowsDriverUpdateProfiles",
      expect.objectContaining({
        displayName: "Windows Drivers",
        description: "Imported by Intune Hydration Kit",
      })
    );
    expect(client.get).toHaveBeenCalledWith(
      "/deviceManagement/windowsDriverUpdateProfiles?$select=id,displayName"
    );
  });

  it("returns the created driver update profile id immediately or an empty id when lookup misses", async () => {
    const directClient = {
      post: vi.fn().mockResolvedValue({ id: "driver-id" }),
      get: vi.fn(),
    } as unknown as Parameters<typeof createDriverUpdateProfile>[0];
    const missingLookupClient = {
      post: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({ value: [{ id: "other-id", displayName: "Other" }] }),
    } as unknown as Parameters<typeof createDriverUpdateProfile>[0];

    await expect(
      createDriverUpdateProfile(directClient, {
        displayName: "Driver Profile",
        description: "",
      })
    ).resolves.toEqual({ id: "driver-id" });
    expect(directClient.get).not.toHaveBeenCalled();

    await expect(
      createDriverUpdateProfile(missingLookupClient, {
        displayName: "Driver Profile",
        description: "",
      })
    ).resolves.toEqual({ id: "" });
  });

  it("strips CIS metadata and Graph-only fields from compliance payloads", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ id: "compliance-id" }),
    } as unknown as Parameters<typeof createCISCompliancePolicy>[0];

    await expect(
      createCISCompliancePolicy(client, {
        id: "original-id",
        name: "CIS Windows Compliance",
        assignments: [{ id: "assignment-id" }],
        _cisCategory: "Windows",
        _cisSubcategory: "Accounts",
        _cisFilePath: "cis/windows.json",
        passwordRequired: true,
      })
    ).resolves.toEqual({ id: "compliance-id" });

    expect(client.post).toHaveBeenCalledWith(
      "/deviceManagement/deviceCompliancePolicies",
      {
        displayName: "CIS Windows Compliance",
        passwordRequired: true,
      }
    );
  });

  it("creates v2 compliance policies with normalized name and cleaned settings", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ id: "v2-compliance-id" }),
    } as unknown as Parameters<typeof createV2CompliancePolicy>[0];

    await expect(
      createV2CompliancePolicy(client, {
        id: "policy-id",
        displayName: "Linux Compliance",
        description: "",
        _cisCategory: "Linux",
        settings: [
          {
            id: "setting-id",
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
            "@odata.context": "drop-me",
            settingDefinitions: [{ id: "definition-id" }],
            choiceSettingValue: "require",
          },
        ],
      })
    ).resolves.toEqual({ id: "v2-compliance-id" });

    expect(client.post).toHaveBeenCalledWith(
      "/deviceManagement/compliancePolicies",
      {
        displayName: "Linux Compliance",
        description: "Imported by Intune Hydration Kit",
        settings: [
          {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
            choiceSettingValue: "require",
          },
        ],
        name: "Linux Compliance",
      }
    );
  });

  it("preserves non-array v2 compliance settings and existing names", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ id: "v2-compliance-id" }),
    } as unknown as Parameters<typeof createV2CompliancePolicy>[0];

    await expect(
      createV2CompliancePolicy(client, {
        id: "policy-id",
        name: "Existing Name",
        description: undefined,
        settings: { value: "leave-me-alone" },
      })
    ).resolves.toEqual({ id: "v2-compliance-id" });

    expect(client.post).toHaveBeenCalledWith(
      "/deviceManagement/compliancePolicies",
      {
        name: "Existing Name",
        description: "Imported by Intune Hydration Kit",
        settings: { value: "leave-me-alone" },
      }
    );
  });

  it.each([
    {
      label: "compliance policy",
      fn: compliancePolicyExistsByName,
      resource: "/deviceManagement/deviceCompliancePolicies?$filter=displayName eq 'O''Brien%20Policy'&$select=id,displayName",
    },
    {
      label: "group policy configuration",
      fn: groupPolicyConfigurationExists,
      resource: "/deviceManagement/groupPolicyConfigurations?$filter=displayName eq 'O''Brien%20Policy'&$select=id,displayName",
    },
    {
      label: "v2 compliance policy",
      fn: v2CompliancePolicyExists,
      resource: "/deviceManagement/compliancePolicies?$filter=name eq 'O''Brien%20Policy'&$select=id,name",
    },
    {
      label: "device configuration",
      fn: deviceConfigurationExists,
      resource: "/deviceManagement/deviceConfigurations?$filter=displayName eq 'O''Brien%20Policy'&$select=id,displayName",
    },
  ])("checks $label existence across unsafe, empty, and error branches", async ({ fn, resource }) => {
    const unsafeClient = {
      get: vi.fn(),
    } as unknown as Parameters<typeof fn>[0];
    const emptyClient = {
      get: vi.fn().mockResolvedValue({ value: [] }),
    } as unknown as Parameters<typeof fn>[0];
    const failingClient = {
      get: vi.fn().mockRejectedValue(new Error("lookup failed")),
    } as unknown as Parameters<typeof fn>[0];

    await expect(fn(unsafeClient, "[IHD] Unsafe")).resolves.toBe(false);
    expect(unsafeClient.get).not.toHaveBeenCalled();

    await expect(fn(emptyClient, "O'Brien Policy")).resolves.toBe(false);
    expect(emptyClient.get).toHaveBeenCalledWith(resource);

    await expect(fn(failingClient, "Safe Policy")).resolves.toBe(false);
  });
});
