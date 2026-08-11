/**
 * Microsoft Graph API operations for App Protection Policies (MAM)
 */

import { GraphClient } from "./client";
import { AppProtectionPolicy, DeletionResult, TenantAppProtectionPolicy } from "@/types/graph";
import { hasHydrationMarker, addHydrationMarker } from "@/lib/utils/hydrationMarker";

type AppProtectionPlatform = "iOS" | "android";

const PLATFORM_ENDPOINTS: Record<AppProtectionPlatform, string> = {
  iOS: "/deviceAppManagement/iosManagedAppProtections",
  android: "/deviceAppManagement/androidManagedAppProtections",
};

const COMMON_CREATE_FIELDS = new Set([
  "@odata.type",
  "displayName",
  "description",
  "roleScopeTagIds",
  "periodOfflineBeforeAccessCheck",
  "periodOnlineBeforeAccessCheck",
  "allowedInboundDataTransferSources",
  "allowedOutboundDataTransferDestinations",
  "organizationalCredentialsRequired",
  "allowedOutboundClipboardSharingLevel",
  "dataBackupBlocked",
  "deviceComplianceRequired",
  "managedBrowserToOpenLinksRequired",
  "saveAsBlocked",
  "periodOfflineBeforeWipeIsEnforced",
  "pinRequired",
  "maximumPinRetries",
  "simplePinBlocked",
  "minimumPinLength",
  "pinCharacterSet",
  "periodBeforePinReset",
  "allowedDataStorageLocations",
  "contactSyncBlocked",
  "printBlocked",
  "fingerprintBlocked",
  "disableAppPinIfDevicePinIsSet",
  "maximumRequiredOsVersion",
  "maximumWarningOsVersion",
  "maximumWipeOsVersion",
  "minimumRequiredOsVersion",
  "minimumWarningOsVersion",
  "minimumRequiredAppVersion",
  "minimumWarningAppVersion",
  "minimumWipeOsVersion",
  "minimumWipeAppVersion",
  "appActionIfDeviceComplianceRequired",
  "appActionIfMaximumPinRetriesExceeded",
  "pinRequiredInsteadOfBiometricTimeout",
  "allowedOutboundClipboardSharingExceptionLength",
  "notificationRestriction",
  "previousPinBlockCount",
  "managedBrowser",
  "maximumAllowedDeviceThreatLevel",
  "mobileThreatDefenseRemediationAction",
  "blockDataIngestionIntoOrganizationDocuments",
  "allowedDataIngestionLocations",
  "appActionIfUnableToAuthenticateUser",
  "dialerRestrictionLevel",
  "gracePeriodToBlockAppsDuringOffClockHours",
  "appGroupType",
  "appActionIfAccountIsClockedOut",
  "minimumRequiredCompanyPortalVersion",
  "minimumWarningCompanyPortalVersion",
  "minimumWipeCompanyPortalVersion",
  "blockAfterCompanyPortalUpdateDeferralInDays",
  "warnAfterCompanyPortalUpdateDeferralInDays",
  "wipeAfterCompanyPortalUpdateDeferralInDays",
]);

const ANDROID_CREATE_FIELDS = new Set([
  ...COMMON_CREATE_FIELDS,
  "screenCaptureBlocked",
  "disableAppEncryptionIfDeviceEncryptionIsEnabled",
  "encryptAppData",
  "minimumRequiredPatchVersion",
  "minimumWarningPatchVersion",
  "minimumWipePatchVersion",
  "allowedAndroidDeviceManufacturers",
  "appActionIfAndroidDeviceManufacturerNotAllowed",
  "requiredAndroidSafetyNetDeviceAttestationType",
  "appActionIfAndroidSafetyNetDeviceAttestationFailed",
  "requiredAndroidSafetyNetAppsVerificationType",
  "appActionIfAndroidSafetyNetAppsVerificationFailed",
  "customBrowserPackageId",
  "customBrowserDisplayName",
  "keyboardsRestricted",
  "approvedKeyboards",
  "allowedAndroidDeviceModels",
  "appActionIfAndroidDeviceModelNotAllowed",
  "customDialerAppPackageId",
  "customDialerAppDisplayName",
  "biometricAuthenticationBlocked",
  "requiredAndroidSafetyNetEvaluationType",
  "deviceLockRequired",
  "appActionIfDeviceLockNotSet",
  "connectToVpnOnLaunch",
  "appActionIfDevicePasscodeComplexityLessThanLow",
  "appActionIfDevicePasscodeComplexityLessThanMedium",
  "appActionIfDevicePasscodeComplexityLessThanHigh",
  "requireClass3Biometrics",
  "requirePinAfterBiometricChange",
  "exemptedAppPackages",
]);

const IOS_CREATE_FIELDS = new Set([
  ...COMMON_CREATE_FIELDS,
  "appDataEncryptionType",
  "minimumRequiredSdkVersion",
  "faceIdBlocked",
  "minimumWipeSdkVersion",
  "allowedIosDeviceModels",
  "appActionIfIosDeviceModelNotAllowed",
  "thirdPartyKeyboardsBlocked",
  "filterOpenInToOnlyManagedApps",
  "disableProtectionOfManagedOutboundOpenInData",
  "protectInboundDataFromUnknownSources",
  "customBrowserProtocol",
  "customDialerAppProtocol",
  "managedUniversalLinks",
  "exemptedUniversalLinks",
  "minimumWarningSdkVersion",
  "exemptedAppProtocols",
]);

const EMPTY_STRING_OPTIONAL_FIELDS = new Set([
  "allowedAndroidDeviceManufacturers",
  "allowedIosDeviceModels",
  "customBrowserProtocol",
  "customBrowserPackageId",
  "customBrowserDisplayName",
  "customDialerAppProtocol",
  "customDialerAppPackageId",
  "customDialerAppDisplayName",
]);

const EMPTY_ARRAY_OPTIONAL_FIELDS = new Set([
  "allowedAndroidDeviceModels",
  "approvedKeyboards",
  "exemptedAppPackages",
]);

const PLACEHOLDER_VERSION_VALUES = new Set(["0000-00-00"]);

function getPlatformEndpoint(platform: AppProtectionPlatform, policyId?: string): string {
  const base = PLATFORM_ENDPOINTS[platform];
  return policyId ? `${base}/${policyId}` : base;
}

/**
 * Get all iOS app protection policies
 */
async function getiOSAppProtectionPolicies(
  client: GraphClient
): Promise<TenantAppProtectionPolicy[]> {
  return client.getCollection<TenantAppProtectionPolicy>(
    "/deviceAppManagement/iosManagedAppProtections?$select=id,displayName,description"
  );
}

/**
 * Get all Android app protection policies
 */
async function getAndroidAppProtectionPolicies(
  client: GraphClient
): Promise<TenantAppProtectionPolicy[]> {
  return client.getCollection<TenantAppProtectionPolicy>(
    "/deviceAppManagement/androidManagedAppProtections?$select=id,displayName,description"
  );
}

/**
 * Get all app protection policies (iOS and Android)
 * Tags each policy with _platform property for delete operations
 */
export async function getAllAppProtectionPolicies(
  client: GraphClient
): Promise<TenantAppProtectionPolicy[]> {
  const [iosPolicies, androidPolicies] = await Promise.all([
    getiOSAppProtectionPolicies(client),
    getAndroidAppProtectionPolicies(client),
  ]);

  // Tag each policy with its platform (Graph API collection responses don't include @odata.type reliably)
  const taggedIosPolicies = iosPolicies.map(p => ({ ...p, _platform: "iOS" as const }));
  const taggedAndroidPolicies = androidPolicies.map(p => ({ ...p, _platform: "android" as const }));

  return [...taggedIosPolicies, ...taggedAndroidPolicies];
}

/**
 * Get an app protection policy by ID
 */
async function getAppProtectionPolicyById(
  client: GraphClient,
  policyId: string,
  platform: AppProtectionPlatform
): Promise<AppProtectionPolicy> {
  return client.get<AppProtectionPolicy>(getPlatformEndpoint(platform, policyId));
}

/**
 * Get an app protection policy by display name
 */
async function getAppProtectionPolicyByName(
  client: GraphClient,
  displayName: string
): Promise<TenantAppProtectionPolicy | null> {
  const policies = await getAllAppProtectionPolicies(client);
  const found = policies.find(
    (policy) => policy.displayName.toLowerCase() === displayName.toLowerCase()
  );
  return found || null;
}

function getAllowedCreateFields(platform: AppProtectionPlatform): Set<string> {
  return platform === "iOS" ? IOS_CREATE_FIELDS : ANDROID_CREATE_FIELDS;
}

function cleanNestedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cleanNestedValue(item));
  }

  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};

    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (/@odata\./.test(nestedKey) && nestedKey !== "@odata.type") {
        continue;
      }

      if (nestedKey.startsWith("#")) {
        continue;
      }

      if (nestedValue === undefined) {
        continue;
      }

      cleaned[nestedKey] = cleanNestedValue(nestedValue);
    }

    return cleaned;
  }

  return value;
}

function normalizeAppProtectionPolicyForCreate(
  policy: AppProtectionPolicy
): AppProtectionPolicy {
  const platform: AppProtectionPlatform =
    policy["@odata.type"] === "#microsoft.graph.iosManagedAppProtection" ? "iOS" : "android";
  const allowedFields = getAllowedCreateFields(platform);
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(policy)) {
    if (!allowedFields.has(key)) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (EMPTY_STRING_OPTIONAL_FIELDS.has(key) && value === "") {
      continue;
    }

    if (EMPTY_ARRAY_OPTIONAL_FIELDS.has(key) && Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (
      typeof value === "string" &&
      PLACEHOLDER_VERSION_VALUES.has(value) &&
      (key === "minimumRequiredPatchVersion" ||
        key === "minimumWarningPatchVersion" ||
        key === "minimumWipePatchVersion")
    ) {
      continue;
    }

    normalized[key] = cleanNestedValue(value);
  }

  normalized.description = addHydrationMarker(
    typeof normalized.description === "string" ? normalized.description : policy.description
  );

  return normalized as AppProtectionPolicy;
}

async function createAppProtectionPolicyWithRecovery(
  client: GraphClient,
  endpoint: string,
  policyBody: AppProtectionPolicy
): Promise<AppProtectionPolicy> {
  try {
    // Avoid retrying POST creates: Intune may create the policy even if the client sees a transient failure.
    return await client.postNoRetry<AppProtectionPolicy>(endpoint, policyBody);
  } catch (error) {
    const recoveredPolicy = await getAppProtectionPolicyByName(client, policyBody.displayName);
    if (recoveredPolicy) {
      console.warn(
        `[AppProtection] Recovered from create error for "${policyBody.displayName}" by finding the policy in tenant after POST failure.`
      );
      return {
        ...policyBody,
        ...recoveredPolicy,
        "@odata.type": policyBody["@odata.type"],
      };
    }

    throw error;
  }
}

/**
 * Create a new iOS app protection policy
 */
async function createiOSAppProtectionPolicy(
  client: GraphClient,
  policy: AppProtectionPolicy
): Promise<AppProtectionPolicy> {
  const policyBody = normalizeAppProtectionPolicyForCreate(policy);

  return createAppProtectionPolicyWithRecovery(
    client,
    "/deviceAppManagement/iosManagedAppProtections",
    policyBody
  );
}

/**
 * Create a new Android app protection policy
 */
async function createAndroidAppProtectionPolicy(
  client: GraphClient,
  policy: AppProtectionPolicy
): Promise<AppProtectionPolicy> {
  const policyBody = normalizeAppProtectionPolicyForCreate(policy);

  return createAppProtectionPolicyWithRecovery(
    client,
    "/deviceAppManagement/androidManagedAppProtections",
    policyBody
  );
}

/**
 * Create an app protection policy (auto-detects platform from @odata.type)
 */
export async function createAppProtectionPolicy(
  client: GraphClient,
  policy: AppProtectionPolicy
): Promise<AppProtectionPolicy> {
  const isiOS = policy["@odata.type"] === "#microsoft.graph.iosManagedAppProtection";
  return isiOS
    ? createiOSAppProtectionPolicy(client, policy)
    : createAndroidAppProtectionPolicy(client, policy);
}

/**
 * Delete an app protection policy by ID
 * Only deletes if created by Intune Hydration Kit and has no active assignments
 */
export async function deleteAppProtectionPolicy(
  client: GraphClient,
  policyId: string,
  platform: AppProtectionPlatform
): Promise<DeletionResult> {
  const policy = await getAppProtectionPolicyById(client, policyId, platform);

  if (!hasHydrationMarker(policy.description)) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Not created by Intune Hydration Kit`
    );
  }

  const assignments = await getAppProtectionPolicyAssignments(client, policyId, platform);
  if (assignments.length > 0) {
    console.log(`[AppProtection] Skipping deletion of ${platform} policy "${policy.displayName}" - has ${assignments.length} active assignment(s)`);
    return {
      deleted: false,
      skipped: true,
      reason: `Policy has ${assignments.length} active assignment(s)`
    };
  }

  await client.delete(`${PLATFORM_ENDPOINTS[platform]}/${policyId}`);
  return { deleted: true, skipped: false };
}

/**
 * Get assignments for an app protection policy
 */
async function getAppProtectionPolicyAssignments(
  client: GraphClient,
  policyId: string,
  platform: AppProtectionPlatform
): Promise<unknown[]> {
  return client.getCollection(`${getPlatformEndpoint(platform, policyId)}/assignments`);
}
