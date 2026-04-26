/**
 * Enrollment Profile Templates for Intune Hydration Kit
 * Windows Autopilot, ESP, and Device Preparation profiles
 *
 * Matches the PowerShell project templates at:
 *   IntuneHydrationKit/Templates/Enrollment/
 */

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface AutopilotProfile {
  "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile";
  id?: string;
  displayName: string;
  description: string;
  deviceNameTemplate: string;
  locale: string;
  preprovisioningAllowed: boolean;
  deviceType: "windowsPc" | "surfaceHub2" | "holoLens";
  hardwareHashExtractionEnabled: boolean;
  roleScopeTagIds: string[];
  hybridAzureADJoinSkipConnectivityCheck: boolean;
  outOfBoxExperienceSetting: {
    deviceUsageType: "singleUser" | "shared";
    escapeLinkHidden: boolean;
    privacySettingsHidden: boolean;
    eulaHidden: boolean;
    userType: "standard" | "administrator";
    keyboardSelectionPageSkipped: boolean;
  };
  [key: string]: unknown;
}

export interface ESPProfile {
  "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration";
  id?: string;
  displayName: string;
  description: string;
  showInstallationProgress: boolean;
  blockDeviceSetupRetryByUser: boolean;
  allowDeviceResetOnInstallFailure: boolean;
  allowLogCollectionOnInstallFailure: boolean;
  customErrorMessage: string;
  installProgressTimeoutInMinutes: number;
  allowDeviceUseOnInstallFailure: boolean;
  allowNonBlockingAppInstallation: boolean;
  selectedMobileAppIds: string[];
  trackInstallProgressForAutopilotOnly: boolean;
  disableUserStatusTrackingAfterFirstUser: boolean;
  [key: string]: unknown;
}

export interface DevicePreparationSettingValueTemplateReference {
  settingValueTemplateId: string;
}

export interface DevicePreparationChoiceSettingValue {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue";
  children: unknown[];
  settingValueTemplateReference: DevicePreparationSettingValueTemplateReference;
  value: string;
}

export interface DevicePreparationIntegerSettingValue {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue";
  value: number;
  settingValueTemplateReference: DevicePreparationSettingValueTemplateReference;
}

export interface DevicePreparationStringSettingValue {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue";
  value: string;
  settingValueTemplateReference: DevicePreparationSettingValueTemplateReference;
}

export interface DevicePreparationSettingInstanceTemplateReference {
  settingInstanceTemplateId: string;
}

export interface DevicePreparationChoiceSettingInstance {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance";
  choiceSettingValue: DevicePreparationChoiceSettingValue;
  settingDefinitionId: string;
  settingInstanceTemplateReference: DevicePreparationSettingInstanceTemplateReference;
}

export interface DevicePreparationSimpleSettingInstance {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance";
  simpleSettingValue:
    | DevicePreparationIntegerSettingValue
    | DevicePreparationStringSettingValue;
  settingDefinitionId: string;
  settingInstanceTemplateReference: DevicePreparationSettingInstanceTemplateReference;
}

export interface DevicePreparationSetting {
  settingInstance:
    | DevicePreparationChoiceSettingInstance
    | DevicePreparationSimpleSettingInstance;
  "@odata.type"?: "#microsoft.graph.deviceManagementConfigurationSetting";
}

export interface DevicePreparationProfile {
  id?: string;
  name: string;
  description: string;
  settings: DevicePreparationSetting[];
  roleScopeTagIds: string[];
  platforms: string;
  technologies: string;
  templateReference: {
    templateId: string;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Autopilot Profiles (2)
// ---------------------------------------------------------------------------

export const AUTOPILOT_PROFILES: AutopilotProfile[] = [
  {
    "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
    displayName: "Default Autopilot Deployment Profile",
    description: `User Driven Azure AD Join with Standard User. ${HYDRATION_MARKER}`,
    deviceNameTemplate: "%SERIAL%",
    locale: "os-default",
    preprovisioningAllowed: true,
    deviceType: "windowsPc",
    hardwareHashExtractionEnabled: true,
    roleScopeTagIds: [],
    hybridAzureADJoinSkipConnectivityCheck: false,
    outOfBoxExperienceSetting: {
      deviceUsageType: "singleUser",
      escapeLinkHidden: true,
      privacySettingsHidden: true,
      eulaHidden: true,
      userType: "standard",
      keyboardSelectionPageSkipped: true,
    },
  },
  {
    "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
    displayName: "Self Deploy Default Autopilot Deployment Profile",
    description: `Self Deploy Azure AD Join with Standard User. ${HYDRATION_MARKER}`,
    deviceNameTemplate: "%SERIAL%",
    locale: "os-default",
    preprovisioningAllowed: false,
    deviceType: "windowsPc",
    hardwareHashExtractionEnabled: true,
    roleScopeTagIds: [],
    hybridAzureADJoinSkipConnectivityCheck: false,
    outOfBoxExperienceSetting: {
      deviceUsageType: "shared",
      escapeLinkHidden: true,
      privacySettingsHidden: true,
      eulaHidden: true,
      userType: "standard",
      keyboardSelectionPageSkipped: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Enrollment Status Page Profile (1)
// ---------------------------------------------------------------------------

export const ESP_PROFILES: ESPProfile[] = [
  {
    "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration",
    displayName: "Intune Default Enrollment Status Page",
    description: `Default Enrollment Status Page configuration for Windows devices. ${HYDRATION_MARKER}`,
    showInstallationProgress: true,
    blockDeviceSetupRetryByUser: false,
    allowDeviceResetOnInstallFailure: true,
    allowLogCollectionOnInstallFailure: true,
    customErrorMessage:
      "Setup encountered an error. Please contact your IT administrator.",
    installProgressTimeoutInMinutes: 60,
    allowDeviceUseOnInstallFailure: false,
    allowNonBlockingAppInstallation: true,
    selectedMobileAppIds: [],
    trackInstallProgressForAutopilotOnly: true,
    disableUserStatusTrackingAfterFirstUser: true,
  },
];

// ---------------------------------------------------------------------------
// Device Preparation Profile (1) - settings-catalog style
// ---------------------------------------------------------------------------

export const DEVICE_PREPARATION_PROFILES: DevicePreparationProfile[] = [
  {
    name: "Windows Autopilot device preparation - User Driven",
    description: HYDRATION_MARKER,
    settings: [
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          choiceSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue",
            children: [],
            settingValueTemplateReference: {
              settingValueTemplateId:
                "5874c2f6-bcf1-463b-a9eb-bee64e2f2d82",
            },
            value: "enrollment_autopilot_dpp_deploymentmode_0",
          },
          settingDefinitionId: "enrollment_autopilot_dpp_deploymentmode",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "5180aeab-886e-4589-97d4-40855c646315",
          },
        },
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSetting",
      },
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          choiceSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue",
            children: [],
            settingValueTemplateReference: {
              settingValueTemplateId:
                "e0af022f-37f3-4a40-916d-1ab7281c88d9",
            },
            value: "enrollment_autopilot_dpp_deploymenttype_0",
          },
          settingDefinitionId: "enrollment_autopilot_dpp_deploymenttype",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "f4184296-fa9f-4b67-8b12-1723b3f8456b",
          },
        },
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSetting",
      },
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          choiceSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue",
            children: [],
            settingValueTemplateReference: {
              settingValueTemplateId:
                "1fa84eb3-fcfa-4ed6-9687-0f3d486402c4",
            },
            value: "enrollment_autopilot_dpp_jointype_0",
          },
          settingDefinitionId: "enrollment_autopilot_dpp_jointype",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "6310e95d-6cfa-4d2f-aae0-1e7af12e2182",
          },
        },
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSetting",
      },
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          choiceSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue",
            children: [],
            settingValueTemplateReference: {
              settingValueTemplateId:
                "bf13bb47-69ef-4e06-97c1-50c2859a49c2",
            },
            value: "enrollment_autopilot_dpp_accountype_0",
          },
          settingDefinitionId: "enrollment_autopilot_dpp_accountype",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "d4f2a840-86d5-4162-9a08-fa8cc608b94e",
          },
        },
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSetting",
      },
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
          simpleSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            value: 60,
            settingValueTemplateReference: {
              settingValueTemplateId:
                "0bbcce5b-a55a-4e05-821a-94bf576d6cc8",
            },
          },
          settingDefinitionId: "enrollment_autopilot_dpp_timeout",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "6dec0657-dfb8-4906-a7ee-3ac6ee1edecb",
          },
        },
      },
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
          simpleSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            value:
              "Contact your organization's support person for help.",
            settingValueTemplateReference: {
              settingValueTemplateId:
                "fe5002d5-fbe9-4920-9e2d-26bfc4b4cc97",
            },
          },
          settingDefinitionId:
            "enrollment_autopilot_dpp_customerrormessage",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "2ddf0619-2b7a-46de-b29b-c6191e9dda6e",
          },
        },
      },
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          choiceSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue",
            children: [],
            settingValueTemplateReference: {
              settingValueTemplateId:
                "a2323e5e-ac56-4517-8847-b0a6fdb467e7",
            },
            value: "enrollment_autopilot_dpp_allowskip_1",
          },
          settingDefinitionId: "enrollment_autopilot_dpp_allowskip",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "2a71dc89-0f17-4ba9-bb27-af2521d34710",
          },
        },
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSetting",
      },
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          choiceSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue",
            children: [],
            settingValueTemplateReference: {
              settingValueTemplateId:
                "c59d26fd-3460-4b26-b47a-f7e202e7d5a3",
            },
            value: "enrollment_autopilot_dpp_allowdiagnostics_1",
          },
          settingDefinitionId:
            "enrollment_autopilot_dpp_allowdiagnostics",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "e2b7a81b-f243-4abd-bce3-c1856345f405",
          },
        },
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSetting",
      },
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
          simpleSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            value: "",
            settingValueTemplateReference: {
              settingValueTemplateId:
                "5f7d09e1-1a90-44ad-9c9f-ad90ba509e60",
            },
          },
          settingDefinitionId:
            "enrollment_autopilot_dpp_devicesecuritygroupids",
          settingInstanceTemplateReference: {
            settingInstanceTemplateId:
              "a46a50ab-3076-4968-9366-75a40dde950e",
          },
        },
      },
    ],
    roleScopeTagIds: ["0"],
    platforms: "windows10",
    technologies: "enrollment",
    templateReference: {
      templateId: "80d33118-b7b4-40d8-b15f-81be745e053f_1",
    },
  },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function getAutopilotProfiles(): AutopilotProfile[] {
  return AUTOPILOT_PROFILES;
}

export function getESPProfiles(): ESPProfile[] {
  return ESP_PROFILES;
}

export function getDevicePreparationProfiles(): DevicePreparationProfile[] {
  return DEVICE_PREPARATION_PROFILES;
}

export function getAutopilotProfileByName(
  displayName: string,
): AutopilotProfile | undefined {
  return AUTOPILOT_PROFILES.find(
    (profile) =>
      profile.displayName.toLowerCase() === displayName.toLowerCase(),
  );
}
