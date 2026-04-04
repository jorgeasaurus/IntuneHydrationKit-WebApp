/**
 * Microsoft Graph API operations for Enrollment Profiles
 * Handles Autopilot Deployment Profiles, Enrollment Status Page (ESP),
 * and Device Preparation profiles (Settings Catalog-based)
 */

import { GraphClient } from "./client";
import { HYDRATION_MARKER, hasHydrationMarker } from "@/lib/utils/hydrationMarker";
import type { DevicePreparationProfile } from "@/templates/enrollment";

const AUTOPILOT_PATH = "/deviceManagement/windowsAutopilotDeploymentProfiles";
const ESP_PATH = "/deviceManagement/deviceEnrollmentConfigurations";
const CONFIG_POLICIES_PATH = "/deviceManagement/configurationPolicies";

function addEnrollmentHydrationMarker(description: string | undefined | null): string {
  const desc = String(description || "");
  if (hasHydrationMarker(desc)) {
    return desc;
  }
  return desc ? `${desc} ${HYDRATION_MARKER}` : HYDRATION_MARKER;
}

/**
 * Shared delete logic: verify hydration marker, check for assignments, then delete.
 */
async function deleteEnrollmentEntity(
  client: GraphClient,
  basePath: string,
  entityId: string,
  entityLabel: string
): Promise<void> {
  const entity = await client.get<{ displayName: string; description?: string }>(
    `${basePath}/${entityId}`
  );

  if (!hasHydrationMarker(entity.description)) {
    throw new Error(
      `Cannot delete ${entityLabel} "${entity.displayName}": Not created by Intune Hydration Kit`
    );
  }

  const assignments = await client.getCollection(`${basePath}/${entityId}/assignments`);
  if (assignments.length > 0) {
    throw new Error(
      `Cannot delete ${entityLabel} "${entity.displayName}": Has ${assignments.length} assignment(s). Remove all assignments before deleting.`
    );
  }

  await client.delete(`${basePath}/${entityId}`);
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
export type EnrollmentProfile = AutopilotDeploymentProfile | EnrollmentStatusPageConfiguration | DevicePreparationProfile;

export async function getAllAutopilotProfiles(
  client: GraphClient
): Promise<AutopilotDeploymentProfile[]> {
  return client.getCollection<AutopilotDeploymentProfile>(AUTOPILOT_PATH);
}

export async function getAutopilotProfileByName(
  client: GraphClient,
  displayName: string
): Promise<AutopilotDeploymentProfile | null> {
  const profiles = await getAllAutopilotProfiles(client);
  return profiles.find(
    (p) => p.displayName.toLowerCase() === displayName.toLowerCase()
  ) || null;
}

export async function autopilotProfileExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const profile = await getAutopilotProfileByName(client, displayName);
  return profile !== null;
}

function cleanAutopilotProfile(profile: AutopilotDeploymentProfile): Record<string, unknown> {
  const cleaned = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;

  delete cleaned.id;
  cleaned.description = addEnrollmentHydrationMarker(profile.description);

  // Graph API doesn't accept "os-default" for language/locale
  if (cleaned.language === "os-default") delete cleaned.language;
  if (cleaned.locale === "os-default") delete cleaned.locale;

  return cleaned;
}

export async function createAutopilotProfile(
  client: GraphClient,
  profile: AutopilotDeploymentProfile
): Promise<AutopilotDeploymentProfile> {
  return client.post<AutopilotDeploymentProfile>(
    AUTOPILOT_PATH,
    cleanAutopilotProfile(profile)
  );
}

export async function getAutopilotProfileAssignments(
  client: GraphClient,
  profileId: string
): Promise<unknown[]> {
  return client.getCollection(`${AUTOPILOT_PATH}/${profileId}/assignments`);
}

export async function deleteAutopilotProfile(
  client: GraphClient,
  profileId: string
): Promise<void> {
  await deleteEnrollmentEntity(client, AUTOPILOT_PATH, profileId, "profile");
}

export async function deleteAutopilotProfileByName(
  client: GraphClient,
  displayName: string
): Promise<void> {
  const profile = await getAutopilotProfileByName(client, displayName);
  if (!profile?.id) {
    throw new Error(`Autopilot profile "${displayName}" not found`);
  }
  await deleteAutopilotProfile(client, profile.id);
}

export async function getAllEnrollmentConfigurations(
  client: GraphClient
): Promise<EnrollmentStatusPageConfiguration[]> {
  const configs = await client.getCollection<EnrollmentStatusPageConfiguration>(ESP_PATH);
  return configs.filter(
    (c) => c["@odata.type"] === "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration"
  );
}

export async function getESPConfigurationByName(
  client: GraphClient,
  displayName: string
): Promise<EnrollmentStatusPageConfiguration | null> {
  const configs = await getAllEnrollmentConfigurations(client);
  return configs.find(
    (c) => c.displayName.toLowerCase() === displayName.toLowerCase()
  ) || null;
}

export async function espConfigurationExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const config = await getESPConfigurationByName(client, displayName);
  return config !== null;
}

export async function createESPConfiguration(
  client: GraphClient,
  config: EnrollmentStatusPageConfiguration
): Promise<EnrollmentStatusPageConfiguration> {
  const configBody = JSON.parse(JSON.stringify(config)) as EnrollmentStatusPageConfiguration;
  delete configBody.id;
  configBody.description = addEnrollmentHydrationMarker(configBody.description);

  return client.post<EnrollmentStatusPageConfiguration>(ESP_PATH, configBody);
}

export async function getESPConfigurationAssignments(
  client: GraphClient,
  configId: string
): Promise<unknown[]> {
  return client.getCollection(`${ESP_PATH}/${configId}/assignments`);
}

export async function deleteESPConfiguration(
  client: GraphClient,
  configId: string
): Promise<void> {
  await deleteEnrollmentEntity(client, ESP_PATH, configId, "ESP configuration");
}

export async function deleteESPConfigurationByName(
  client: GraphClient,
  displayName: string
): Promise<void> {
  const config = await getESPConfigurationByName(client, displayName);
  if (!config?.id) {
    throw new Error(`ESP configuration "${displayName}" not found`);
  }
  await deleteESPConfiguration(client, config.id);
}

export function getEnrollmentProfileType(
  profile: EnrollmentProfile
): "autopilot" | "esp" | "devicePreparation" {
  if (profile["@odata.type"] === "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration") {
    return "esp";
  }
  if ("technologies" in profile && (profile as DevicePreparationProfile).technologies === "enrollment") {
    return "devicePreparation";
  }
  return "autopilot";
}

// ---------------------------------------------------------------------------
// Device Preparation Profiles (Settings Catalog-based)
// ---------------------------------------------------------------------------

export async function devicePreparationExists(
  client: GraphClient,
  name: string
): Promise<boolean> {
  try {
    const response = await client.get<{ value: Array<{ name: string }> }>(
      `${CONFIG_POLICIES_PATH}?$filter=name eq '${encodeURIComponent(name)}'&$select=id,name`
    );
    return response.value && response.value.length > 0;
  } catch (error) {
    console.error(`[DevicePreparation] Error checking if policy exists: ${name}`, error);
    return false;
  }
}

export async function createDevicePreparationProfile(
  client: GraphClient,
  profile: DevicePreparationProfile
): Promise<DevicePreparationProfile> {
  const payload = { ...profile };
  delete payload.id;
  delete (payload as Record<string, unknown>).displayName; // Settings Catalog uses `name`, not `displayName`
  payload.description = addEnrollmentHydrationMarker(payload.description);

  return client.post<DevicePreparationProfile>(CONFIG_POLICIES_PATH, payload);
}

export async function deleteDevicePreparationByName(
  client: GraphClient,
  name: string
): Promise<void> {
  const response = await client.get<{ value: Array<{ id: string; name: string; description?: string }> }>(
    `${CONFIG_POLICIES_PATH}?$filter=name eq '${encodeURIComponent(name)}'&$select=id,name,description`
  );

  const match = response.value?.find(p => hasHydrationMarker(p.description) || hasHydrationMarker(p.name));
  if (!match?.id) {
    throw new Error(`Device Preparation policy "${name}" not found`);
  }

  await client.delete(`${CONFIG_POLICIES_PATH}('${match.id}')`);
}

/**
 * Get the display name from any enrollment profile type.
 */
export function getEnrollmentProfileName(profile: EnrollmentProfile): string {
  if ("displayName" in profile && profile.displayName) {
    return String(profile.displayName);
  }
  if ("name" in profile && profile.name) {
    return String(profile.name);
  }
  return "";
}

export async function createEnrollmentProfile(
  client: GraphClient,
  profile: EnrollmentProfile
): Promise<EnrollmentProfile> {
  switch (getEnrollmentProfileType(profile)) {
    case "esp":
      return createESPConfiguration(client, profile as EnrollmentStatusPageConfiguration);
    case "devicePreparation":
      return createDevicePreparationProfile(client, profile as DevicePreparationProfile);
    case "autopilot":
      return createAutopilotProfile(client, profile as AutopilotDeploymentProfile);
  }
}

export async function enrollmentProfileExists(
  client: GraphClient,
  profile: EnrollmentProfile
): Promise<boolean> {
  switch (getEnrollmentProfileType(profile)) {
    case "esp":
      return espConfigurationExists(client, (profile as EnrollmentStatusPageConfiguration).displayName);
    case "devicePreparation":
      return devicePreparationExists(client, (profile as DevicePreparationProfile).name);
    case "autopilot":
      return autopilotProfileExists(client, (profile as AutopilotDeploymentProfile).displayName);
  }
}

export async function deleteEnrollmentProfileByName(
  client: GraphClient,
  displayName: string,
  profileType: "autopilot" | "esp" | "devicePreparation"
): Promise<void> {
  switch (profileType) {
    case "esp":
      return deleteESPConfigurationByName(client, displayName);
    case "devicePreparation":
      return deleteDevicePreparationByName(client, displayName);
    case "autopilot":
      return deleteAutopilotProfileByName(client, displayName);
  }
}
