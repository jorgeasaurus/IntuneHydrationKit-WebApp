/**
 * Microsoft Graph API operations for Enrollment Profiles
 * Handles Autopilot Deployment Profiles, Enrollment Status Page (ESP),
 * and Device Preparation profiles (Settings Catalog-based)
 */

import { GraphClient } from "./client";
import { HYDRATION_MARKER, hasHydrationMarker } from "@/lib/utils/hydrationMarker";

const AUTOPILOT_PATH = "/deviceManagement/windowsAutopilotDeploymentProfiles";
const ESP_PATH = "/deviceManagement/deviceEnrollmentConfigurations";
const CONFIG_POLICIES_PATH = "/deviceManagement/configurationPolicies";

function normalizeEnrollmentDisplayName(displayName: string | undefined | null): string {
  return String(displayName || "")
    .replace(/^\[IHD\]\s*-\s*/i, "[IHD] ")
    .trim()
    .toLowerCase();
}

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
 * Windows Autopilot device preparation profile.
 */
export interface DevicePreparationProfile {
  id?: string;
  name: string;
  description: string;
  settings: Array<Record<string, unknown>>;
  roleScopeTagIds: string[];
  platforms: string;
  technologies: string;
  templateReference: {
    templateId: string;
  };
  [key: string]: unknown;
}

/**
 * Union type for all enrollment profile types
 */
export type EnrollmentProfile = AutopilotDeploymentProfile | EnrollmentStatusPageConfiguration | DevicePreparationProfile;

interface DevicePreparationPolicySummary {
  id: string;
  name: string;
  description?: string;
}

async function getAllAutopilotProfiles(
  client: GraphClient
): Promise<AutopilotDeploymentProfile[]> {
  return client.getCollection<AutopilotDeploymentProfile>(AUTOPILOT_PATH);
}

async function getAutopilotProfileByName(
  client: GraphClient,
  displayName: string
): Promise<AutopilotDeploymentProfile | null> {
  const profiles = await getAllAutopilotProfiles(client);
  const normalizedDisplayName = normalizeEnrollmentDisplayName(displayName);
  return profiles.find(
    (p) => normalizeEnrollmentDisplayName(p.displayName) === normalizedDisplayName
  ) || null;
}

async function autopilotProfileExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const profile = await getAutopilotProfileByName(client, displayName);
  return profile !== null;
}

function cleanAutopilotProfile(profile: AutopilotDeploymentProfile): Record<string, unknown> {
  const cleaned = structuredClone(profile) as unknown as Record<string, unknown>;

  delete cleaned.id;
  cleaned.description = addEnrollmentHydrationMarker(profile.description);

  // Graph API doesn't accept "os-default" for language/locale
  if (cleaned.language === "os-default") delete cleaned.language;
  if (cleaned.locale === "os-default") delete cleaned.locale;

  return cleaned;
}

async function createAutopilotProfile(
  client: GraphClient,
  profile: AutopilotDeploymentProfile
): Promise<AutopilotDeploymentProfile> {
  return client.post<AutopilotDeploymentProfile>(
    AUTOPILOT_PATH,
    cleanAutopilotProfile(profile)
  );
}

async function getAllEnrollmentConfigurations(
  client: GraphClient
): Promise<EnrollmentStatusPageConfiguration[]> {
  const configs = await client.getCollection<EnrollmentStatusPageConfiguration>(ESP_PATH);
  return configs.filter(
    (c) => c["@odata.type"] === "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration"
  );
}

async function getESPConfigurationByName(
  client: GraphClient,
  displayName: string
): Promise<EnrollmentStatusPageConfiguration | null> {
  const configs = await getAllEnrollmentConfigurations(client);
  const normalizedDisplayName = normalizeEnrollmentDisplayName(displayName);
  return configs.find(
    (c) => normalizeEnrollmentDisplayName(c.displayName) === normalizedDisplayName
  ) || null;
}

async function espConfigurationExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const config = await getESPConfigurationByName(client, displayName);
  return config !== null;
}

async function createESPConfiguration(
  client: GraphClient,
  config: EnrollmentStatusPageConfiguration
): Promise<EnrollmentStatusPageConfiguration> {
  const configBody = structuredClone(config) as EnrollmentStatusPageConfiguration;
  delete configBody.id;
  configBody.description = addEnrollmentHydrationMarker(configBody.description);

  return client.post<EnrollmentStatusPageConfiguration>(ESP_PATH, configBody);
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

async function devicePreparationExists(
  client: GraphClient,
  name: string
): Promise<boolean> {
  const policy = await findDevicePreparationPolicyByName(client, name);
  return policy !== null;
}

async function createDevicePreparationProfile(
  client: GraphClient,
  profile: DevicePreparationProfile
): Promise<DevicePreparationProfile> {
  const payload = { ...profile };
  delete payload.id;
  delete (payload as Record<string, unknown>).displayName; // Settings Catalog uses `name`, not `displayName`
  payload.description = addEnrollmentHydrationMarker(payload.description);

  return client.post<DevicePreparationProfile>(CONFIG_POLICIES_PATH, payload);
}

async function findDevicePreparationPolicyByName(
  client: GraphClient,
  name: string
): Promise<DevicePreparationPolicySummary | null> {
  try {
    const policies = await client.getCollection<DevicePreparationPolicySummary>(
      `${CONFIG_POLICIES_PATH}?$select=id,name,description`
    );
    const normalizedName = normalizeEnrollmentDisplayName(name);
    return policies.find(
      (policy) => normalizeEnrollmentDisplayName(policy.name) === normalizedName
    ) || null;
  } catch (error) {
    console.error(`[DevicePreparation] Error checking if policy exists: ${name}`, error);
    return null;
  }
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

/**
 * Tenant enrollment object that matches a delete task, with its endpoints.
 */
export interface EnrollmentDeleteCandidate {
  id: string;
  name: string;
  description?: string;
  label: string;
  basePath: string;
}

/** Enrollment object type, as getEnrollmentProfileType returns it. */
export type EnrollmentProfileType = ReturnType<typeof getEnrollmentProfileType>;

async function findAutopilotForDelete(client: GraphClient, normalizedName: string): Promise<EnrollmentDeleteCandidate | null> {
  const autopilot = (await getAllAutopilotProfiles(client)).find(
    (profile) => profile.id && normalizeEnrollmentDisplayName(profile.displayName) === normalizedName
  );
  if (!autopilot?.id) return null;
  return {
    id: autopilot.id,
    name: autopilot.displayName,
    description: autopilot.description,
    label: "Autopilot profile",
    basePath: AUTOPILOT_PATH,
  };
}

async function findEspForDelete(client: GraphClient, normalizedName: string): Promise<EnrollmentDeleteCandidate | null> {
  const esp = (await getAllEnrollmentConfigurations(client)).find(
    (config) => config.id && normalizeEnrollmentDisplayName(config.displayName) === normalizedName
  );
  if (!esp?.id) return null;
  return {
    id: esp.id,
    name: esp.displayName,
    description: esp.description,
    label: "Enrollment Status Page",
    basePath: ESP_PATH,
  };
}

async function findDevicePreparationForDelete(
  client: GraphClient,
  normalizedName: string
): Promise<EnrollmentDeleteCandidate | null> {
  // Device Preparation policies are Settings Catalog policies, so only policies with
  // the "enrollment" technology can match.
  const devicePreparation = (
    await client.getCollection<DevicePreparationPolicySummary & { technologies?: string }>(
      `${CONFIG_POLICIES_PATH}?$select=id,name,description,technologies`
    )
  ).find(
    (policy) =>
      policy.technologies?.toLowerCase().includes("enrollment") &&
      normalizeEnrollmentDisplayName(policy.name) === normalizedName
  );
  if (!devicePreparation?.id) return null;
  return {
    id: devicePreparation.id,
    name: devicePreparation.name,
    description: devicePreparation.description,
    label: "Device Preparation policy",
    basePath: CONFIG_POLICIES_PATH,
  };
}

const ENROLLMENT_DELETE_FINDERS: Record<
  EnrollmentProfileType,
  (client: GraphClient, normalizedName: string) => Promise<EnrollmentDeleteCandidate | null>
> = {
  autopilot: findAutopilotForDelete,
  esp: findEspForDelete,
  devicePreparation: findDevicePreparationForDelete,
};

/**
 * Find the enrollment object (Autopilot profile, ESP or Device Preparation policy)
 * that a delete task names. Read errors are not caught, so the caller does not
 * delete an object when it cannot read the tenant.
 *
 * With a profile type (from the task's template), only that collection is searched,
 * so an object of another type with the same name cannot be selected. Without one,
 * all three collections are searched and a name that matches in more than one of
 * them is an error: the caller must not guess which object to delete.
 */
export async function findEnrollmentProfileForDelete(
  client: GraphClient,
  name: string,
  profileType?: EnrollmentProfileType
): Promise<EnrollmentDeleteCandidate | null> {
  const normalizedName = normalizeEnrollmentDisplayName(name);

  if (profileType) {
    return ENROLLMENT_DELETE_FINDERS[profileType](client, normalizedName);
  }

  const matches: EnrollmentDeleteCandidate[] = [];
  for (const find of Object.values(ENROLLMENT_DELETE_FINDERS)) {
    const match = await find(client, normalizedName);
    if (match) matches.push(match);
  }
  if (matches.length > 1) {
    throw new Error(
      `"${name}" matches more than one enrollment object (${matches.map((match) => match.label).join(", ")})`
    );
  }
  return matches[0] ?? null;
}
