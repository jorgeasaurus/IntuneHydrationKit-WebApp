/**
 * Microsoft Graph API operations for Enrollment Profiles
 * Handles Autopilot Deployment Profiles and Enrollment Status Page (ESP) configurations
 */

import { GraphClient } from "./client";
import { HYDRATION_MARKER, hasHydrationMarker } from "@/lib/utils/hydrationMarker";

/**
 * Add hydration marker to enrollment profile description
 */
function addEnrollmentHydrationMarker(description: string | undefined | null): string {
  const desc = String(description || "");
  if (hasHydrationMarker(desc)) {
    return desc;
  }
  return desc ? `${desc} ${HYDRATION_MARKER}` : HYDRATION_MARKER;
}

/**
 * Autopilot Deployment Profile interface
 */
export interface AutopilotDeploymentProfile {
  id?: string;
  "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile" | "#microsoft.graph.activeDirectoryWindowsAutopilotDeploymentProfile";
  displayName: string;
  description?: string;
  deviceType?: string;
  deviceNameTemplate?: string;
  language?: string;
  locale?: string;
  enableWhiteGlove?: boolean;
  preprovisioningAllowed?: boolean;
  extractHardwareHash?: boolean;
  hardwareHashExtractionEnabled?: boolean;
  hybridAzureADJoinSkipConnectivityCheck?: boolean;
  outOfBoxExperienceSettings?: {
    hidePrivacySettings?: boolean;
    hideEULA?: boolean;
    userType?: string;
    deviceUsageType?: string;
    skipKeyboardSelectionPage?: boolean;
    hideEscapeLink?: boolean;
  };
  outOfBoxExperienceSetting?: {
    deviceUsageType?: string;
    escapeLinkHidden?: boolean;
    privacySettingsHidden?: boolean;
    eulaHidden?: boolean;
    userType?: string;
    keyboardSelectionPageSkipped?: boolean;
  };
  roleScopeTagIds?: string[];
}

/**
 * Enrollment Status Page (ESP) Configuration interface
 */
export interface EnrollmentStatusPageConfiguration {
  id?: string;
  "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration";
  displayName: string;
  description?: string;
  showInstallationProgress?: boolean;
  blockDeviceSetupRetryByUser?: boolean;
  allowDeviceResetOnInstallFailure?: boolean;
  allowLogCollectionOnInstallFailure?: boolean;
  customErrorMessage?: string;
  installProgressTimeoutInMinutes?: number;
  allowDeviceUseOnInstallFailure?: boolean;
  allowNonBlockingAppInstallation?: boolean;
  selectedMobileAppIds?: string[];
  trackInstallProgressForAutopilotOnly?: boolean;
  disableUserStatusTrackingAfterFirstUser?: boolean;
  priority?: number;
}

/**
 * Union type for all enrollment profile types
 */
export type EnrollmentProfile = AutopilotDeploymentProfile | EnrollmentStatusPageConfiguration;

/**
 * Get all Autopilot deployment profiles
 */
export async function getAllAutopilotProfiles(
  client: GraphClient
): Promise<AutopilotDeploymentProfile[]> {
  return client.getCollection<AutopilotDeploymentProfile>(
    "/deviceManagement/windowsAutopilotDeploymentProfiles"
  );
}

/**
 * Get an Autopilot profile by display name
 */
export async function getAutopilotProfileByName(
  client: GraphClient,
  displayName: string
): Promise<AutopilotDeploymentProfile | null> {
  const profiles = await getAllAutopilotProfiles(client);
  return profiles.find(
    (p) => p.displayName.toLowerCase() === displayName.toLowerCase()
  ) || null;
}

/**
 * Check if an Autopilot profile exists by display name
 */
export async function autopilotProfileExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const profile = await getAutopilotProfileByName(client, displayName);
  return profile !== null;
}

/**
 * Clean and normalize an Autopilot profile for creation
 */
function cleanAutopilotProfile(profile: AutopilotDeploymentProfile): Record<string, unknown> {
  const cleaned = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;

  delete cleaned.id;
  cleaned.description = addEnrollmentHydrationMarker(profile.description);

  // Graph API doesn't accept "os-default" for language/locale
  if (cleaned.language === "os-default") {
    delete cleaned.language;
  }
  if (cleaned.locale === "os-default") {
    delete cleaned.locale;
  }

  return cleaned;
}

/**
 * Create an Autopilot deployment profile
 */
export async function createAutopilotProfile(
  client: GraphClient,
  profile: AutopilotDeploymentProfile
): Promise<AutopilotDeploymentProfile> {
  const profileBody = cleanAutopilotProfile(profile);

  return client.post<AutopilotDeploymentProfile>(
    "/deviceManagement/windowsAutopilotDeploymentProfiles",
    profileBody
  );
}

/**
 * Delete an Autopilot deployment profile
 */
export async function deleteAutopilotProfile(
  client: GraphClient,
  profileId: string
): Promise<void> {
  const profile = await client.get<AutopilotDeploymentProfile>(
    `/deviceManagement/windowsAutopilotDeploymentProfiles/${profileId}`
  );

  if (!hasHydrationMarker(profile.description)) {
    throw new Error(
      `Cannot delete profile "${profile.displayName}": Not created by Intune Hydration Kit`
    );
  }

  await client.delete(`/deviceManagement/windowsAutopilotDeploymentProfiles/${profileId}`);
}

/**
 * Delete an Autopilot profile by display name
 */
export async function deleteAutopilotProfileByName(
  client: GraphClient,
  displayName: string
): Promise<void> {
  const profile = await getAutopilotProfileByName(client, displayName);

  if (!profile || !profile.id) {
    throw new Error(`Autopilot profile "${displayName}" not found`);
  }

  await deleteAutopilotProfile(client, profile.id);
}

/**
 * Get all device enrollment configurations (includes ESP)
 */
export async function getAllEnrollmentConfigurations(
  client: GraphClient
): Promise<EnrollmentStatusPageConfiguration[]> {
  const configs = await client.getCollection<EnrollmentStatusPageConfiguration>(
    "/deviceManagement/deviceEnrollmentConfigurations"
  );
  // Filter to only ESP configurations
  return configs.filter(
    (c) => c["@odata.type"] === "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration"
  );
}

/**
 * Get an ESP configuration by display name
 */
export async function getESPConfigurationByName(
  client: GraphClient,
  displayName: string
): Promise<EnrollmentStatusPageConfiguration | null> {
  const configs = await getAllEnrollmentConfigurations(client);
  return configs.find(
    (c) => c.displayName.toLowerCase() === displayName.toLowerCase()
  ) || null;
}

/**
 * Check if an ESP configuration exists by display name
 */
export async function espConfigurationExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const config = await getESPConfigurationByName(client, displayName);
  return config !== null;
}

/**
 * Create an Enrollment Status Page configuration
 */
export async function createESPConfiguration(
  client: GraphClient,
  config: EnrollmentStatusPageConfiguration
): Promise<EnrollmentStatusPageConfiguration> {
  const configBody = JSON.parse(JSON.stringify(config)) as EnrollmentStatusPageConfiguration;

  delete configBody.id;
  configBody.description = addEnrollmentHydrationMarker(configBody.description);

  return client.post<EnrollmentStatusPageConfiguration>(
    "/deviceManagement/deviceEnrollmentConfigurations",
    configBody
  );
}

/**
 * Delete an ESP configuration
 */
export async function deleteESPConfiguration(
  client: GraphClient,
  configId: string
): Promise<void> {
  const config = await client.get<EnrollmentStatusPageConfiguration>(
    `/deviceManagement/deviceEnrollmentConfigurations/${configId}`
  );

  if (!hasHydrationMarker(config.description)) {
    throw new Error(
      `Cannot delete ESP configuration "${config.displayName}": Not created by Intune Hydration Kit`
    );
  }

  await client.delete(`/deviceManagement/deviceEnrollmentConfigurations/${configId}`);
}

/**
 * Delete an ESP configuration by display name
 */
export async function deleteESPConfigurationByName(
  client: GraphClient,
  displayName: string
): Promise<void> {
  const config = await getESPConfigurationByName(client, displayName);

  if (!config || !config.id) {
    throw new Error(`ESP configuration "${displayName}" not found`);
  }

  await deleteESPConfiguration(client, config.id);
}

/**
 * Determine the enrollment profile type from @odata.type
 */
export function getEnrollmentProfileType(
  profile: EnrollmentProfile
): "autopilot" | "esp" {
  const odataType = profile["@odata.type"];

  if (odataType === "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration") {
    return "esp";
  }

  // All other types are Autopilot profiles
  return "autopilot";
}

/**
 * Create an enrollment profile (auto-detects type)
 */
export async function createEnrollmentProfile(
  client: GraphClient,
  profile: EnrollmentProfile
): Promise<EnrollmentProfile> {
  const profileType = getEnrollmentProfileType(profile);

  if (profileType === "esp") {
    return createESPConfiguration(client, profile as EnrollmentStatusPageConfiguration);
  }

  return createAutopilotProfile(client, profile as AutopilotDeploymentProfile);
}

/**
 * Check if an enrollment profile exists (auto-detects type)
 */
export async function enrollmentProfileExists(
  client: GraphClient,
  profile: EnrollmentProfile
): Promise<boolean> {
  const profileType = getEnrollmentProfileType(profile);

  if (profileType === "esp") {
    return espConfigurationExists(client, profile.displayName);
  }

  return autopilotProfileExists(client, profile.displayName);
}

/**
 * Delete an enrollment profile by name (auto-detects type)
 */
export async function deleteEnrollmentProfileByName(
  client: GraphClient,
  displayName: string,
  profileType: "autopilot" | "esp"
): Promise<void> {
  if (profileType === "esp") {
    await deleteESPConfigurationByName(client, displayName);
  } else {
    await deleteAutopilotProfileByName(client, displayName);
  }
}
