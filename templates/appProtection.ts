/**
 * App Protection Policy (MAM) Templates for Intune Hydration Kit
 * Mobile Application Management policies for iOS and Android
 */

import { AppProtectionPolicy } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune-Hydration-Kit";

export const APP_PROTECTION_POLICIES: AppProtectionPolicy[] = [
  {
    "@odata.type": "#microsoft.graph.iosManagedAppProtection",
    displayName: "iOS - Corporate MAM Policy",
    description: `iOS App Protection policy for corporate data on managed and unmanaged devices. ${HYDRATION_MARKER}`,
    periodOfflineBeforeAccessCheck: "PT12H",
    periodOnlineBeforeAccessCheck: "PT30M",
    allowedInboundDataTransferSources: "managedApps",
    allowedOutboundDataTransferDestinations: "managedApps",
    allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
    organizationalCredentialsRequired: false,
    dataBackupBlocked: true,
    deviceComplianceRequired: true,
    managedBrowserToOpenLinksRequired: false,
    saveAsBlocked: true,
    periodOfflineBeforeWipeIsEnforced: "P90D",
    pinRequired: true,
    maximumPinRetries: 5,
    simplePinBlocked: true,
    minimumPinLength: 6,
    pinCharacterSet: "alphanumericAndSymbol",
    periodBeforePinReset: "P0D",
    allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint"],
    contactSyncBlocked: true,
    printBlocked: true,
    fingerprintBlocked: false,
    disableAppPinIfDevicePinIsSet: false,
    minimumRequiredOsVersion: "14.0",
    minimumWarningOsVersion: "15.0",
    minimumRequiredAppVersion: null,
    minimumWarningAppVersion: null,
    managedBrowser: "microsoftEdge",
    appActionIfDeviceComplianceRequired: "block",
    appActionIfMaximumPinRetriesExceeded: "block",
    pinRequiredInsteadOfBiometricTimeout: "PT30M",
    allowedOutboundClipboardSharingExceptionLength: 0,
    notificationRestriction: "allow",
    previousPinBlockCount: 5,
    managedUniversalLinks: [],
    exemptedUniversalLinks: [],
    faceIdBlocked: false,
    appDataEncryptionType: "whenDeviceLocked",
  },
  {
    "@odata.type": "#microsoft.graph.androidManagedAppProtection",
    displayName: "Android - Corporate MAM Policy",
    description: `Android App Protection policy for corporate data on managed and unmanaged devices. ${HYDRATION_MARKER}`,
    periodOfflineBeforeAccessCheck: "PT12H",
    periodOnlineBeforeAccessCheck: "PT30M",
    allowedInboundDataTransferSources: "managedApps",
    allowedOutboundDataTransferDestinations: "managedApps",
    allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
    organizationalCredentialsRequired: false,
    dataBackupBlocked: true,
    deviceComplianceRequired: true,
    managedBrowserToOpenLinksRequired: false,
    saveAsBlocked: true,
    periodOfflineBeforeWipeIsEnforced: "P90D",
    pinRequired: true,
    maximumPinRetries: 5,
    simplePinBlocked: true,
    minimumPinLength: 6,
    pinCharacterSet: "alphanumericAndSymbol",
    periodBeforePinReset: "P0D",
    allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint"],
    contactSyncBlocked: true,
    printBlocked: true,
    fingerprintBlocked: false,
    disableAppPinIfDevicePinIsSet: false,
    minimumRequiredOsVersion: "9.0",
    minimumWarningOsVersion: "10.0",
    minimumRequiredAppVersion: null,
    minimumWarningAppVersion: null,
    minimumRequiredPatchVersion: "2022-01-01",
    minimumWarningPatchVersion: "2023-01-01",
    screenCaptureBlocked: true,
    encryptAppData: true,
    disableAppEncryptionIfDeviceEncryptionIsEnabled: false,
    appActionIfDeviceComplianceRequired: "block",
    appActionIfMaximumPinRetriesExceeded: "block",
    pinRequiredInsteadOfBiometricTimeout: "PT30M",
    allowedOutboundClipboardSharingExceptionLength: 0,
    notificationRestriction: "allow",
    previousPinBlockCount: 5,
    managedBrowser: "microsoftEdge",
    customBrowserProtocol: null,
    customBrowserPackageId: null,
    customDialerAppProtocol: null,
    customDialerAppPackageId: null,
    biometricAuthenticationBlocked: false,
    requiredAndroidSafetyNetDeviceAttestationType: "basicIntegrity",
    blockAfterCompanyPortalUpdateDeferralInDays: 0,
    warnAfterCompanyPortalUpdateDeferralInDays: 0,
    exemptedAppProtocols: [],
    exemptedAppPackages: [],
    approvedKeyboards: [],
    keyboardsRestricted: false,
  },
  {
    "@odata.type": "#microsoft.graph.iosManagedAppProtection",
    displayName: "iOS - BYOD MAM Policy",
    description: `iOS App Protection policy for personal (BYOD) devices with basic protection. ${HYDRATION_MARKER}`,
    periodOfflineBeforeAccessCheck: "PT12H",
    periodOnlineBeforeAccessCheck: "PT30M",
    allowedInboundDataTransferSources: "allApps",
    allowedOutboundDataTransferDestinations: "managedApps",
    allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
    organizationalCredentialsRequired: false,
    dataBackupBlocked: false,
    deviceComplianceRequired: false,
    managedBrowserToOpenLinksRequired: false,
    saveAsBlocked: false,
    periodOfflineBeforeWipeIsEnforced: "P90D",
    pinRequired: true,
    maximumPinRetries: 5,
    simplePinBlocked: false,
    minimumPinLength: 4,
    pinCharacterSet: "numeric",
    periodBeforePinReset: "P0D",
    allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint", "localStorage"],
    contactSyncBlocked: false,
    printBlocked: false,
    fingerprintBlocked: false,
    disableAppPinIfDevicePinIsSet: true,
    minimumRequiredOsVersion: "13.0",
    minimumWarningOsVersion: "14.0",
    minimumRequiredAppVersion: null,
    minimumWarningAppVersion: null,
    managedBrowser: "microsoftEdge",
    appActionIfDeviceComplianceRequired: "block",
    appActionIfMaximumPinRetriesExceeded: "block",
    pinRequiredInsteadOfBiometricTimeout: "PT30M",
    allowedOutboundClipboardSharingExceptionLength: 0,
    notificationRestriction: "allow",
    previousPinBlockCount: 0,
    managedUniversalLinks: [],
    exemptedUniversalLinks: [],
    faceIdBlocked: false,
    appDataEncryptionType: "whenDeviceLocked",
  },
  {
    "@odata.type": "#microsoft.graph.androidManagedAppProtection",
    displayName: "Android - BYOD MAM Policy",
    description: `Android App Protection policy for personal (BYOD) devices with basic protection. ${HYDRATION_MARKER}`,
    periodOfflineBeforeAccessCheck: "PT12H",
    periodOnlineBeforeAccessCheck: "PT30M",
    allowedInboundDataTransferSources: "allApps",
    allowedOutboundDataTransferDestinations: "managedApps",
    allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
    organizationalCredentialsRequired: false,
    dataBackupBlocked: false,
    deviceComplianceRequired: false,
    managedBrowserToOpenLinksRequired: false,
    saveAsBlocked: false,
    periodOfflineBeforeWipeIsEnforced: "P90D",
    pinRequired: true,
    maximumPinRetries: 5,
    simplePinBlocked: false,
    minimumPinLength: 4,
    pinCharacterSet: "numeric",
    periodBeforePinReset: "P0D",
    allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint", "localStorage"],
    contactSyncBlocked: false,
    printBlocked: false,
    fingerprintBlocked: false,
    disableAppPinIfDevicePinIsSet: true,
    minimumRequiredOsVersion: "8.0",
    minimumWarningOsVersion: "9.0",
    minimumRequiredAppVersion: null,
    minimumWarningAppVersion: null,
    minimumRequiredPatchVersion: "2021-01-01",
    minimumWarningPatchVersion: "2022-01-01",
    screenCaptureBlocked: false,
    encryptAppData: true,
    disableAppEncryptionIfDeviceEncryptionIsEnabled: true,
    appActionIfDeviceComplianceRequired: "block",
    appActionIfMaximumPinRetriesExceeded: "block",
    pinRequiredInsteadOfBiometricTimeout: "PT30M",
    allowedOutboundClipboardSharingExceptionLength: 0,
    notificationRestriction: "allow",
    previousPinBlockCount: 0,
    managedBrowser: "microsoftEdge",
    customBrowserProtocol: null,
    customBrowserPackageId: null,
    customDialerAppProtocol: null,
    customDialerAppPackageId: null,
    biometricAuthenticationBlocked: false,
    requiredAndroidSafetyNetDeviceAttestationType: "none",
    blockAfterCompanyPortalUpdateDeferralInDays: 0,
    warnAfterCompanyPortalUpdateDeferralInDays: 0,
    exemptedAppProtocols: [],
    exemptedAppPackages: [],
    approvedKeyboards: [],
    keyboardsRestricted: false,
  },
];

/**
 * Get all app protection policy templates
 */
export function getAppProtectionPolicies(): AppProtectionPolicy[] {
  return APP_PROTECTION_POLICIES;
}

/**
 * Get app protection policies for a specific platform
 */
export function getAppProtectionPoliciesByPlatform(
  platform: string
): AppProtectionPolicy[] {
  const platformMap: Record<string, string> = {
    ios: "#microsoft.graph.iosManagedAppProtection",
    android: "#microsoft.graph.androidManagedAppProtection",
  };

  const odataType = platformMap[platform.toLowerCase()];
  if (!odataType) {
    return [];
  }

  return APP_PROTECTION_POLICIES.filter((policy) => policy["@odata.type"] === odataType);
}

/**
 * Get a specific app protection policy by display name
 */
export function getAppProtectionPolicyByName(
  displayName: string
): AppProtectionPolicy | undefined {
  return APP_PROTECTION_POLICIES.find(
    (policy) => policy.displayName.toLowerCase() === displayName.toLowerCase()
  );
}
