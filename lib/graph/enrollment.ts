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
  const profiles = await getAllAutopilotProfiles(client);
  console.log(`[Enrollment] Checking if profile exists: "${displayName}"`);
  console.log(`[Enrollment] Found ${profiles.length} existing profiles:`);
  profiles.forEach((p, i) => {
    console.log(`[Enrollment]   ${i+1}. "${p.displayName}" (matches: ${p.displayName.toLowerCase() === displayName.toLowerCase()})`);
  });
  const profile = profiles.find(
    (p) => p.displayName.toLowerCase() === displayName.toLowerCase()
  ) || null;
  console.log(`[Enrollment] Profile exists: ${profile !== null}`);
  return profile !== null;
}

/**
 * Clean and normalize an Autopilot profile for creation
 * Following PowerShell approach: send the full template directly with minimal transformation
 * PowerShell reference sends template as-is, only modifying description
 */
function cleanAutopilotProfile(profile: AutopilotDeploymentProfile): Record<string, unknown> {
  // Deep clone the profile to avoid mutating the original
  const cleaned = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;

  // Remove id if present (can't be set on creation)
  delete cleaned.id;

  // Add hydration marker to description (using period separator for enrollment profiles)
  cleaned.description = addEnrollmentHydrationMarker(profile.description);

  // Keep OOBE settings as-is - the Graph API accepts both:
  // - outOfBoxExperienceSettings (plural, old format with hidePrivacySettings, hideEULA, etc.)
  // - outOfBoxExperienceSetting (singular, new format with privacySettingsHidden, eulaHidden, etc.)
  // The template should use whichever format is appropriate for the API version

  // hybridAzureADJoinSkipConnectivityCheck - keep it in the payload as PowerShell reference includes it
  // The Graph API accepts this property for Azure AD join profiles as well

  // Handle "os-default" language/locale - Graph API doesn't accept this value
  // Remove it so the API uses the system default
  if (cleaned.language === "os-default") {
    delete cleaned.language;
  }
  if (cleaned.locale === "os-default") {
    delete cleaned.locale;
  }

  // Note: Following PowerShell reference, we keep these properties:
  // - deviceType (windowsPc)
  // - locale (en-US)
  // - preprovisioningAllowed (true)
  // - hardwareHashExtractionEnabled (true)
  // - roleScopeTagIds (empty array is valid)

  return cleaned;
}

/**
 * Create an Autopilot deployment profile
 */
export async function createAutopilotProfile(
  client: GraphClient,
  profile: AutopilotDeploymentProfile
): Promise<AutopilotDeploymentProfile> {
  // Clean and normalize the profile
  const profileBody = cleanAutopilotProfile(profile);

  console.log(`[Enrollment] Creating Autopilot profile: "${profileBody.displayName}"`);
  console.log(`[Enrollment] Cleaned payload keys:`, Object.keys(profileBody));
  console.log(`[Enrollment] Full payload:`, JSON.stringify(profileBody, null, 2));

  const created = await client.post<AutopilotDeploymentProfile>(
    "/deviceManagement/windowsAutopilotDeploymentProfiles",
    profileBody
  );

  console.log(`[Enrollment] Autopilot profile created with ID: ${created.id}`);
  return created;
}

/**
 * Delete an Autopilot deployment profile
 */
export async function deleteAutopilotProfile(
  client: GraphClient,
  profileId: string
): Promise<void> {
  // Fetch the profile to verify it has the hydration marker
  const profile = await client.get<AutopilotDeploymentProfile>(
    `/deviceManagement/windowsAutopilotDeploymentProfiles/${profileId}`
  );

  if (!hasHydrationMarker(profile.description)) {
    throw new Error(
      `Cannot delete profile "${profile.displayName}": Not created by Intune Hydration Kit`
    );
  }

  await client.delete(`/deviceManagement/windowsAutopilotDeploymentProfiles/${profileId}`);
  console.log(`[Enrollment] Deleted Autopilot profile: "${profile.displayName}"`);
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
  // Deep clone to avoid mutating original
  const configBody = JSON.parse(JSON.stringify(config)) as EnrollmentStatusPageConfiguration;

  // Remove id if present
  delete configBody.id;

  // Ensure the hydration marker is in the description (using period separator for enrollment profiles)
  configBody.description = addEnrollmentHydrationMarker(configBody.description);

  console.log(`[Enrollment] Creating ESP configuration: "${configBody.displayName}"`);

  const created = await client.post<EnrollmentStatusPageConfiguration>(
    "/deviceManagement/deviceEnrollmentConfigurations",
    configBody
  );

  console.log(`[Enrollment] ESP configuration created with ID: ${created.id}`);
  return created;
}

/**
 * Delete an ESP configuration
 */
export async function deleteESPConfiguration(
  client: GraphClient,
  configId: string
): Promise<void> {
  // Fetch the configuration to verify it has the hydration marker
  const config = await client.get<EnrollmentStatusPageConfiguration>(
    `/deviceManagement/deviceEnrollmentConfigurations/${configId}`
  );

  if (!hasHydrationMarker(config.description)) {
    throw new Error(
      `Cannot delete ESP configuration "${config.displayName}": Not created by Intune Hydration Kit`
    );
  }

  await client.delete(`/deviceManagement/deviceEnrollmentConfigurations/${configId}`);
  console.log(`[Enrollment] Deleted ESP configuration: "${config.displayName}"`);
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
