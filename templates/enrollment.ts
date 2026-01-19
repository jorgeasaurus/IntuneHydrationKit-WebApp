/**
 * Enrollment Profile Templates for Intune Hydration Kit
 * Windows Autopilot and Apple enrollment profiles
 */

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

/**
 * Windows Autopilot Profile Template
 */
export interface AutopilotProfile {
  "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile";
  id?: string;
  displayName: string;
  description: string;
  language?: string;
  extractHardwareHash: boolean;
  deviceNameTemplate?: string;
  deviceType: "windowsPc" | "surfaceHub2" | "holoLens";
  enableWhiteGlove: boolean;
  outOfBoxExperienceSettings: {
    hidePrivacySettings: boolean;
    hideEULA: boolean;
    userType: "standard" | "administrator";
    deviceUsageType: "singleUser" | "shared";
    skipKeyboardSelectionPage: boolean;
    hideEscapeLink: boolean;
  };
  [key: string]: unknown;
}

/**
 * Apple Enrollment Profile Template
 */
export interface AppleEnrollmentProfile {
  "@odata.type": "#microsoft.graph.depEnrollmentProfile";
  id?: string;
  displayName: string;
  description: string;
  requiresUserAuthentication: boolean;
  configurationEndpointUrl?: string;
  enableAuthenticationViaCompanyPortal: boolean;
  requireCompanyPortalOnSetupAssistantEnrolledDevices: boolean;
  isDefault: boolean;
  supervisedModeEnabled: boolean;
  supportDepartment?: string;
  passCodeDisabled: boolean;
  isMandatory: boolean;
  locationDisabled: boolean;
  supportPhoneNumber?: string;
  iTunesPairingMode: "disallow" | "allow" | "requiresCertificate";
  profileRemovalDisabled: boolean;
  managementCertificates: unknown[];
  restoreBlocked: boolean;
  restoreFromAndroidDisabled: boolean;
  appleIdDisabled: boolean;
  termsAndConditionsDisabled: boolean;
  touchIdDisabled: boolean;
  applePayDisabled: boolean;
  zoomDisabled: boolean;
  siriDisabled: boolean;
  diagnosticsDisabled: boolean;
  macOSRegistrationDisabled: boolean;
  [key: string]: unknown;
}

export const AUTOPILOT_PROFILES: AutopilotProfile[] = [
  {
    "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
    displayName: "Corporate Autopilot - User-Driven AAD Join",
    description: `Windows Autopilot user-driven Azure AD join profile for corporate devices. ${HYDRATION_MARKER}`,
    language: "en-US",
    extractHardwareHash: true,
    deviceNameTemplate: "CORP-%SERIAL%",
    deviceType: "windowsPc",
    enableWhiteGlove: true,
    outOfBoxExperienceSettings: {
      hidePrivacySettings: true,
      hideEULA: true,
      userType: "standard",
      deviceUsageType: "singleUser",
      skipKeyboardSelectionPage: true,
      hideEscapeLink: true,
    },
  },
  {
    "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
    displayName: "Corporate Autopilot - Self-Deploying",
    description: `Windows Autopilot self-deploying mode profile for kiosks and shared devices. ${HYDRATION_MARKER}`,
    language: "en-US",
    extractHardwareHash: true,
    deviceNameTemplate: "KIOSK-%SERIAL%",
    deviceType: "windowsPc",
    enableWhiteGlove: false,
    outOfBoxExperienceSettings: {
      hidePrivacySettings: true,
      hideEULA: true,
      userType: "standard",
      deviceUsageType: "shared",
      skipKeyboardSelectionPage: true,
      hideEscapeLink: true,
    },
  },
];

export const APPLE_ENROLLMENT_PROFILES: AppleEnrollmentProfile[] = [
  {
    "@odata.type": "#microsoft.graph.depEnrollmentProfile",
    displayName: "Corporate iOS/iPadOS Enrollment",
    description: `Apple DEP enrollment profile for corporate iOS and iPadOS devices. ${HYDRATION_MARKER}`,
    requiresUserAuthentication: true,
    enableAuthenticationViaCompanyPortal: true,
    requireCompanyPortalOnSetupAssistantEnrolledDevices: true,
    isDefault: false,
    supervisedModeEnabled: true,
    supportDepartment: "IT Support",
    passCodeDisabled: false,
    isMandatory: true,
    locationDisabled: false,
    supportPhoneNumber: undefined,
    iTunesPairingMode: "disallow",
    profileRemovalDisabled: true,
    managementCertificates: [],
    restoreBlocked: false,
    restoreFromAndroidDisabled: true,
    appleIdDisabled: false,
    termsAndConditionsDisabled: false,
    touchIdDisabled: false,
    applePayDisabled: false,
    zoomDisabled: false,
    siriDisabled: false,
    diagnosticsDisabled: false,
    macOSRegistrationDisabled: false,
  },
  {
    "@odata.type": "#microsoft.graph.depEnrollmentProfile",
    displayName: "Corporate macOS Enrollment",
    description: `Apple DEP enrollment profile for corporate macOS devices. ${HYDRATION_MARKER}`,
    requiresUserAuthentication: true,
    enableAuthenticationViaCompanyPortal: true,
    requireCompanyPortalOnSetupAssistantEnrolledDevices: true,
    isDefault: false,
    supervisedModeEnabled: false,
    supportDepartment: "IT Support",
    passCodeDisabled: false,
    isMandatory: true,
    locationDisabled: false,
    supportPhoneNumber: undefined,
    iTunesPairingMode: "allow",
    profileRemovalDisabled: true,
    managementCertificates: [],
    restoreBlocked: false,
    restoreFromAndroidDisabled: true,
    appleIdDisabled: false,
    termsAndConditionsDisabled: false,
    touchIdDisabled: false,
    applePayDisabled: false,
    zoomDisabled: false,
    siriDisabled: false,
    diagnosticsDisabled: false,
    macOSRegistrationDisabled: false,
  },
];

/**
 * Get all Autopilot profile templates
 */
export function getAutopilotProfiles(): AutopilotProfile[] {
  return AUTOPILOT_PROFILES;
}

/**
 * Get all Apple enrollment profile templates
 */
export function getAppleEnrollmentProfiles(): AppleEnrollmentProfile[] {
  return APPLE_ENROLLMENT_PROFILES;
}

/**
 * Get a specific Autopilot profile by display name
 */
export function getAutopilotProfileByName(displayName: string): AutopilotProfile | undefined {
  return AUTOPILOT_PROFILES.find(
    (profile) => profile.displayName.toLowerCase() === displayName.toLowerCase()
  );
}

/**
 * Get a specific Apple enrollment profile by display name
 */
export function getAppleEnrollmentProfileByName(
  displayName: string
): AppleEnrollmentProfile | undefined {
  return APPLE_ENROLLMENT_PROFILES.find(
    (profile) => profile.displayName.toLowerCase() === displayName.toLowerCase()
  );
}
