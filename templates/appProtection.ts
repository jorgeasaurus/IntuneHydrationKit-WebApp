/**
 * App Protection Policy (MAM) Templates for Intune Hydration Kit
 * Mobile Application Management policies for iOS and Android
 *
 * Sources (8 policies):
 *   - Android-App-Protection.json
 *   - iOS-App-Protection.json
 *   - level-1-enterprise-basic-data-protection-Android.json
 *   - level-1-enterprise-basic-data-protection-iOS.json
 *   - level-2-enterprise-enhanced-data-protection-Android.json
 *   - level-2-enterprise-enhanced-data-protection-iOS.json
 *   - level-3-enterprise-high-data-protection-Android.json
 *   - level-3-enterprise-high-data-protection-iOS.json
 */

import { AppProtectionPolicy } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

// ---------------------------------------------------------------------------
// 1. Android App Protection Policy  (Android-App-Protection.json)
// ---------------------------------------------------------------------------
const ANDROID_APP_PROTECTION: AppProtectionPolicy = {
  "@odata.type": "#microsoft.graph.androidManagedAppProtection",
  displayName: "Android App Protection Policy",
  description: `Microsoft Apps Only ${HYDRATION_MARKER}`,
  allowedAndroidDeviceManufacturers: "",
  allowedDataIngestionLocations: ["oneDriveForBusiness", "sharePoint"],
  allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint"],
  allowedInboundDataTransferSources: "managedApps",
  allowedOutboundClipboardSharingExceptionLength: 0,
  allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
  allowedOutboundDataTransferDestinations: "managedApps",
  appActionIfAccountIsClockedOut: null,
  appActionIfAndroidDeviceManufacturerNotAllowed: "block",
  appActionIfAndroidSafetyNetAppsVerificationFailed: "block",
  appActionIfAndroidSafetyNetDeviceAttestationFailed: "block",
  appActionIfDeviceComplianceRequired: "block",
  appActionIfDeviceLockNotSet: "block",
  appActionIfDevicePasscodeComplexityLessThanHigh: null,
  appActionIfDevicePasscodeComplexityLessThanLow: null,
  appActionIfDevicePasscodeComplexityLessThanMedium: "block",
  appActionIfMaximumPinRetriesExceeded: "block",
  appActionIfUnableToAuthenticateUser: "block",
  appGroupType: "allMicrosoftApps",
  approvedKeyboards: [],
  apps: [],
  biometricAuthenticationBlocked: false,
  blockAfterCompanyPortalUpdateDeferralInDays: 0,
  blockDataIngestionIntoOrganizationDocuments: true,
  connectToVpnOnLaunch: false,
  contactSyncBlocked: true,
  customBrowserDisplayName: "",
  customBrowserPackageId: "",
  customBrowserProtocol: "",
  customDialerAppDisplayName: "",
  customDialerAppPackageId: "",
  customDialerAppProtocol: "",
  dataBackupBlocked: true,
  deviceComplianceRequired: true,
  deviceLockRequired: false,
  dialerRestrictionLevel: "managedApps",
  disableAppEncryptionIfDeviceEncryptionIsEnabled: false,
  disableAppPinIfDevicePinIsSet: false,
  encryptAppData: true,
  exemptedAppPackages: [],
  exemptedAppProtocols: [
    {
      name: "Default",
      value:
        "skype;app-settings;calshow;itms;itmss;itms-apps;itms-appss;itms-services;",
    },
  ],
  fingerprintAndBiometricEnabled: true,
  fingerprintBlocked: false,
  gracePeriodToBlockAppsDuringOffClockHours: null,
  keyboardsRestricted: false,
  managedBrowser: "microsoftEdge",
  managedBrowserToOpenLinksRequired: true,
  maximumAllowedDeviceThreatLevel: "notConfigured",
  maximumPinRetries: 5,
  maximumRequiredOsVersion: null,
  maximumWarningOsVersion: null,
  maximumWipeOsVersion: null,
  minimumPinLength: 6,
  minimumRequiredAppVersion: null,
  minimumRequiredCompanyPortalVersion: null,
  minimumRequiredOsVersion: null,
  minimumRequiredPatchVersion: null,
  minimumWarningAppVersion: null,
  minimumWarningCompanyPortalVersion: null,
  minimumWarningOsVersion: null,
  minimumWarningPatchVersion: null,
  minimumWipeAppVersion: null,
  minimumWipeCompanyPortalVersion: null,
  minimumWipeOsVersion: null,
  minimumWipePatchVersion: null,
  mobileThreatDefensePartnerPriority: null,
  mobileThreatDefenseRemediationAction: "block",
  notificationRestriction: "allow",
  organizationalCredentialsRequired: false,
  periodBeforePinReset: "P0D",
  periodBeforePinResetRequired: false,
  periodOfflineBeforeAccessCheck: "PT720M",
  periodOfflineBeforeWipeIsEnforced: "P90D",
  periodOnlineBeforeAccessCheck: "PT30M",
  pinCharacterSet: "numeric",
  pinRequired: true,
  pinRequiredInsteadOfBiometric: true,
  pinRequiredInsteadOfBiometricTimeout: "PT30M",
  previousPinBlockCount: 0,
  printBlocked: true,
  requireClass3Biometrics: false,
  requiredAndroidSafetyNetAppsVerificationType: "enabled",
  requiredAndroidSafetyNetDeviceAttestationType: "basicIntegrity",
  requiredAndroidSafetyNetEvaluationType: "basic",
  requirePinAfterBiometricChange: false,
  roleScopeTagIds: [],
  saveAsBlocked: true,
  screenCaptureBlocked: true,
  shareWithBrowserVirtualSetting: "anyApp",
  simplePinBlocked: true,
  targetedAppManagementLevels: "unspecified",
  warnAfterCompanyPortalUpdateDeferralInDays: 0,
  wipeAfterCompanyPortalUpdateDeferralInDays: 0,
};

// ---------------------------------------------------------------------------
// 2. iOS App Protection  (iOS-App-Protection.json)
// ---------------------------------------------------------------------------
const IOS_APP_PROTECTION: AppProtectionPolicy = {
  "@odata.type": "#microsoft.graph.iosManagedAppProtection",
  displayName: "iOS App Protection",
  description: `Protect Microsoft Apps ${HYDRATION_MARKER}`,
  allowedDataIngestionLocations: [
    "oneDriveForBusiness",
    "sharePoint",
    "camera",
    "photoLibrary",
  ],
  allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint"],
  allowedInboundDataTransferSources: "managedApps",
  allowedIosDeviceModels: "",
  allowedOutboundClipboardSharingExceptionLength: 0,
  allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
  allowedOutboundDataTransferDestinations: "managedApps",
  appActionIfAccountIsClockedOut: null,
  appActionIfDeviceComplianceRequired: "block",
  appActionIfIosDeviceModelNotAllowed: "block",
  appActionIfMaximumPinRetriesExceeded: "block",
  appActionIfUnableToAuthenticateUser: "block",
  appDataEncryptionType: "whenDeviceLocked",
  appGroupType: "allMicrosoftApps",
  apps: [],
  blockAfterCompanyPortalUpdateDeferralInDays: 0,
  blockDataIngestionIntoOrganizationDocuments: false,
  contactSyncBlocked: true,
  customBrowserDisplayName: "",
  customBrowserPackageId: "",
  customBrowserProtocol: "",
  customDialerAppDisplayName: "",
  customDialerAppPackageId: "",
  customDialerAppProtocol: "",
  dataBackupBlocked: false,
  deviceComplianceRequired: true,
  dialerRestrictionLevel: "blocked",
  disableAppPinIfDevicePinIsSet: false,
  disableProtectionOfManagedOutboundOpenInData: false,
  exemptedAppPackages: [],
  exemptedAppProtocols: [
    {
      name: "Default",
      value:
        "skype;app-settings;calshow;itms;itmss;itms-apps;itms-appss;itms-services;",
    },
  ],
  exemptedUniversalLinks: [
    "http://facetime.apple.com",
    "http://maps.apple.com",
    "https://facetime.apple.com",
    "https://maps.apple.com",
    "http://*.appsplatform.us/*",
    "http://*.onedrive.com/*",
    "http://*.powerapps.cn/*",
    "http://*.powerapps.com/*",
    "http://*.powerapps.us/*",
    "http://*.powerbi.com/*",
    "http://*.service-now.com/*",
    "http://*.sharepoint-df.com/*",
    "http://*.sharepoint.com/*",
    "http://*.yammer.com/*",
    "http://*.zoom.us/*",
    "http://*collab.apps.mil/l/*",
    "http://*devspaces.skype.com/l/*",
    "http://*teams-fl.microsoft.com/l/*",
    "http://*teams.live.com/l/*",
    "http://*teams.microsoft.com/l/*",
    "http://*teams.microsoft.us/l/*",
    "http://app.powerbi.cn/*",
    "http://app.powerbi.de/*",
    "http://app.powerbigov.us/*",
    "http://msit.microsoftstream.com/video/*",
    "http://tasks.office.com/*",
    "http://to-do.microsoft.com/sharing*",
    "http://web.microsoftstream.com/video/*",
    "http://zoom.us/*",
    "https://*.appsplatform.us/*",
    "https://*.onedrive.com/*",
    "https://*.powerapps.cn/*",
    "https://*.powerapps.com/*",
    "https://*.powerapps.us/*",
    "https://*.powerbi.com/*",
    "https://*.service-now.com/*",
    "https://*.sharepoint-df.com/*",
    "https://*.sharepoint.com/*",
    "https://*.yammer.com/*",
    "https://*.zoom.us/*",
    "https://*collab.apps.mil/l/*",
    "https://*devspaces.skype.com/l/*",
    "https://*teams-fl.microsoft.com/l/*",
    "https://*teams.live.com/l/*",
    "https://*teams.microsoft.com/l/*",
    "https://*teams.microsoft.us/l/*",
    "https://app.powerbi.cn/*",
    "https://app.powerbi.de/*",
    "https://app.powerbigov.us/*",
    "https://msit.microsoftstream.com/video/*",
    "https://tasks.office.com/*",
    "https://to-do.microsoft.com/sharing*",
    "https://web.microsoftstream.com/video/*",
    "https://zoom.us/*",
  ],
  faceIdBlocked: false,
  filterOpenInToOnlyManagedApps: false,
  fingerprintBlocked: false,
  gracePeriodToBlockAppsDuringOffClockHours: null,
  managedBrowser: "microsoftEdge",
  managedBrowserToOpenLinksRequired: true,
  managedUniversalLinks: [],
  maximumAllowedDeviceThreatLevel: "notConfigured",
  maximumPinRetries: 5,
  maximumRequiredOsVersion: null,
  maximumWarningOsVersion: null,
  maximumWipeOsVersion: null,
  minimumPinLength: 6,
  minimumRequiredAppVersion: null,
  minimumRequiredCompanyPortalVersion: null,
  minimumRequiredOsVersion: null,
  minimumRequiredSdkVersion: null,
  minimumWarningAppVersion: null,
  minimumWarningCompanyPortalVersion: null,
  minimumWarningOsVersion: null,
  minimumWarningSdkVersion: null,
  minimumWipeAppVersion: null,
  minimumWipeCompanyPortalVersion: null,
  minimumWipeOsVersion: null,
  minimumWipeSdkVersion: null,
  mobileThreatDefensePartnerPriority: null,
  mobileThreatDefenseRemediationAction: "block",
  notificationRestriction: "allow",
  organizationalCredentialsRequired: false,
  periodBeforePinReset: "P0D",
  periodBeforePinResetRequired: false,
  periodOfflineBeforeAccessCheck: "PT720M",
  periodOfflineBeforeWipeIsEnforced: "P90D",
  periodOnlineBeforeAccessCheck: "PT30M",
  pinCharacterSet: "numeric",
  pinRequired: true,
  pinRequiredInsteadOfBiometric: true,
  pinRequiredInsteadOfBiometricTimeout: "PT30M",
  previousPinBlockCount: 0,
  printBlocked: true,
  protectInboundDataFromUnknownSources: false,
  roleScopeTagIds: ["0"],
  saveAsBlocked: true,
  shareWithBrowserVirtualSetting: "anyApp",
  simplePinBlocked: true,
  targetedAppManagementLevels: "unspecified",
  thirdPartyKeyboardsBlocked: false,
  warnAfterCompanyPortalUpdateDeferralInDays: 0,
  wipeAfterCompanyPortalUpdateDeferralInDays: 0,
};

// ---------------------------------------------------------------------------
// 3. Level 1 – Enterprise Basic Data Protection – Android
//    (level-1-enterprise-basic-data-protection-Android.json)
// ---------------------------------------------------------------------------
const LEVEL1_BASIC_ANDROID: AppProtectionPolicy = {
  "@odata.type": "#microsoft.graph.androidManagedAppProtection",
  displayName: "Android Enterprise Basic Data Protection v1.6",
  description: `This app protection policy ensures that apps with work or school account data are protected with a PIN, encrypted, validates Android device attestation, and enables selective wipe operations. ${HYDRATION_MARKER}`,
  roleScopeTagIds: ["0"],
  periodOfflineBeforeAccessCheck: "PT12H",
  periodOnlineBeforeAccessCheck: "PT30M",
  allowedInboundDataTransferSources: "allApps",
  allowedOutboundDataTransferDestinations: "allApps",
  organizationalCredentialsRequired: false,
  allowedOutboundClipboardSharingLevel: "allApps",
  dataBackupBlocked: false,
  deviceComplianceRequired: true,
  managedBrowserToOpenLinksRequired: false,
  saveAsBlocked: false,
  periodOfflineBeforeWipeIsEnforced: "P90D",
  pinRequired: true,
  maximumPinRetries: 5,
  simplePinBlocked: false,
  minimumPinLength: 4,
  pinCharacterSet: "numeric",
  periodBeforePinReset: "PT0S",
  allowedDataStorageLocations: [],
  contactSyncBlocked: false,
  printBlocked: false,
  fingerprintBlocked: false,
  disableAppPinIfDevicePinIsSet: false,
  minimumRequiredOsVersion: null,
  minimumWarningOsVersion: null,
  minimumRequiredAppVersion: null,
  minimumWarningAppVersion: null,
  minimumWipeOsVersion: null,
  minimumWipeAppVersion: null,
  appActionIfDeviceComplianceRequired: "block",
  appActionIfMaximumPinRetriesExceeded: "block",
  pinRequiredInsteadOfBiometricTimeout: "PT12H",
  allowedOutboundClipboardSharingExceptionLength: 0,
  notificationRestriction: "allow",
  previousPinBlockCount: 0,
  managedBrowser: "notConfigured",
  maximumAllowedDeviceThreatLevel: "notConfigured",
  mobileThreatDefenseRemediationAction: "block",
  blockDataIngestionIntoOrganizationDocuments: false,
  allowedDataIngestionLocations: [
    "oneDriveForBusiness",
    "sharePoint",
    "camera",
  ],
  appActionIfUnableToAuthenticateUser: null,
  dialerRestrictionLevel: "allApps",
  isAssigned: false,
  targetedAppManagementLevels: "unspecified",
  screenCaptureBlocked: false,
  disableAppEncryptionIfDeviceEncryptionIsEnabled: false,
  encryptAppData: true,
  deployedAppCount: 13,
  minimumRequiredPatchVersion: "0000-00-00",
  minimumWarningPatchVersion: "0000-00-00",
  minimumWipePatchVersion: "0000-00-00",
  allowedAndroidDeviceManufacturers: null,
  appActionIfAndroidDeviceManufacturerNotAllowed: "block",
  requiredAndroidSafetyNetDeviceAttestationType:
    "basicIntegrityAndDeviceCertification",
  appActionIfAndroidSafetyNetDeviceAttestationFailed: "block",
  requiredAndroidSafetyNetAppsVerificationType: "enabled",
  appActionIfAndroidSafetyNetAppsVerificationFailed: "block",
  customBrowserPackageId: "",
  customBrowserDisplayName: "",
  minimumRequiredCompanyPortalVersion: null,
  minimumWarningCompanyPortalVersion: null,
  minimumWipeCompanyPortalVersion: null,
  keyboardsRestricted: false,
  allowedAndroidDeviceModels: [],
  appActionIfAndroidDeviceModelNotAllowed: "block",
  customDialerAppPackageId: null,
  customDialerAppDisplayName: null,
  biometricAuthenticationBlocked: false,
  requiredAndroidSafetyNetEvaluationType: "basic",
  blockAfterCompanyPortalUpdateDeferralInDays: 0,
  warnAfterCompanyPortalUpdateDeferralInDays: 0,
  wipeAfterCompanyPortalUpdateDeferralInDays: 0,
  deviceLockRequired: true,
  appActionIfDeviceLockNotSet: "block",
  exemptedAppPackages: [],
  approvedKeyboards: [],
  apps: [
    {
      id: "com.microsoft.emmx.android",
      version: "-725393251",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.emmx",
      },
    },
    {
      id: "com.microsoft.office.excel.android",
      version: "-1789826587",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.excel",
      },
    },
    {
      id: "com.microsoft.office.officehub.android",
      version: "-1091809935",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehub",
      },
    },
    {
      id: "com.microsoft.office.officehubhl.android",
      version: "-1175805259",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehubhl",
      },
    },
    {
      id: "com.microsoft.office.officehubrow.android",
      version: "-1861979965",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehubrow",
      },
    },
    {
      id: "com.microsoft.office.onenote.android",
      version: "186482170",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.onenote",
      },
    },
    {
      id: "com.microsoft.office.outlook.android",
      version: "1146701235",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.outlook",
      },
    },
    {
      id: "com.microsoft.office.powerpoint.android",
      version: "1411665537",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.powerpoint",
      },
    },
    {
      id: "com.microsoft.office.word.android",
      version: "2122351424",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.word",
      },
    },
    {
      id: "com.microsoft.sharepoint.android",
      version: "84773357",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.sharepoint",
      },
    },
    {
      id: "com.microsoft.skydrive.android",
      version: "1887770705",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.skydrive",
      },
    },
    {
      id: "com.microsoft.teams.android",
      version: "1900143244",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.teams",
      },
    },
    {
      id: "com.microsoft.todos.android",
      version: "1697858135",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.todos",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Level 1 – Enterprise Basic Data Protection – iOS
//    (level-1-enterprise-basic-data-protection-iOS.json)
// ---------------------------------------------------------------------------
const LEVEL1_BASIC_IOS: AppProtectionPolicy = {
  "@odata.type": "#microsoft.graph.iosManagedAppProtection",
  displayName: "iOS/iPadOS Enterprise Basic Data Protection v1.1",
  description: `This app protection policy ensures that apps with work or school account data are protected with a PIN, encrypted, and enables selective wipe operations. ${HYDRATION_MARKER}`,
  roleScopeTagIds: ["0"],
  periodOfflineBeforeAccessCheck: "PT12H",
  periodOnlineBeforeAccessCheck: "PT30M",
  allowedInboundDataTransferSources: "allApps",
  allowedOutboundDataTransferDestinations: "allApps",
  organizationalCredentialsRequired: false,
  allowedOutboundClipboardSharingLevel: "allApps",
  dataBackupBlocked: false,
  deviceComplianceRequired: true,
  managedBrowserToOpenLinksRequired: false,
  saveAsBlocked: false,
  periodOfflineBeforeWipeIsEnforced: "P90D",
  pinRequired: true,
  maximumPinRetries: 5,
  simplePinBlocked: false,
  minimumPinLength: 4,
  pinCharacterSet: "numeric",
  periodBeforePinReset: "PT0S",
  allowedDataStorageLocations: [],
  contactSyncBlocked: false,
  printBlocked: false,
  fingerprintBlocked: false,
  disableAppPinIfDevicePinIsSet: false,
  minimumRequiredOsVersion: null,
  minimumWarningOsVersion: null,
  minimumRequiredAppVersion: null,
  minimumWarningAppVersion: null,
  minimumWipeOsVersion: null,
  minimumWipeAppVersion: null,
  appActionIfDeviceComplianceRequired: "block",
  appActionIfMaximumPinRetriesExceeded: "block",
  pinRequiredInsteadOfBiometricTimeout: "PT12H",
  allowedOutboundClipboardSharingExceptionLength: 0,
  notificationRestriction: "allow",
  previousPinBlockCount: 0,
  managedBrowser: "notConfigured",
  maximumAllowedDeviceThreatLevel: "notConfigured",
  mobileThreatDefenseRemediationAction: "block",
  blockDataIngestionIntoOrganizationDocuments: false,
  allowedDataIngestionLocations: [
    "oneDriveForBusiness",
    "sharePoint",
    "camera",
  ],
  appActionIfUnableToAuthenticateUser: null,
  dialerRestrictionLevel: "allApps",
  isAssigned: false,
  targetedAppManagementLevels: "unspecified",
  appDataEncryptionType: "whenDeviceLocked",
  minimumRequiredSdkVersion: null,
  deployedAppCount: 11,
  faceIdBlocked: false,
  minimumWipeSdkVersion: null,
  allowedIosDeviceModels: null,
  appActionIfIosDeviceModelNotAllowed: "block",
  thirdPartyKeyboardsBlocked: false,
  filterOpenInToOnlyManagedApps: false,
  disableProtectionOfManagedOutboundOpenInData: false,
  protectInboundDataFromUnknownSources: false,
  customBrowserProtocol: "",
  customDialerAppProtocol: null,
  exemptedAppProtocols: [
    {
      name: "Default",
      value:
        "skype;app-settings;calshow;itms;itmss;itms-apps;itms-appss;itms-services;",
    },
  ],
  apps: [
    {
      id: "com.microsoft.msedge.ios",
      version: "-2135752869",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.msedge",
      },
    },
    {
      id: "com.microsoft.office.excel.ios",
      version: "-1255026913",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.excel",
      },
    },
    {
      id: "com.microsoft.office.outlook.ios",
      version: "-518090279",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.outlook",
      },
    },
    {
      id: "com.microsoft.office.powerpoint.ios",
      version: "-740777841",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.powerpoint",
      },
    },
    {
      id: "com.microsoft.office.word.ios",
      version: "922692278",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.word",
      },
    },
    {
      id: "com.microsoft.officemobile.ios",
      version: "-803819540",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.officemobile",
      },
    },
    {
      id: "com.microsoft.onenote.ios",
      version: "107156768",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.onenote",
      },
    },
    {
      id: "com.microsoft.sharepoint.ios",
      version: "-585639021",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.sharepoint",
      },
    },
    {
      id: "com.microsoft.skydrive.ios",
      version: "-108719121",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.skydrive",
      },
    },
    {
      id: "com.microsoft.skype.teams.ios",
      version: "-1040529574",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.skype.teams",
      },
    },
    {
      id: "com.microsoft.to-do.ios",
      version: "-292160221",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.to-do",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. Level 2 – Enterprise Enhanced Data Protection – Android
//    (level-2-enterprise-enhanced-data-protection-Android.json)
// ---------------------------------------------------------------------------
const LEVEL2_ENHANCED_ANDROID: AppProtectionPolicy = {
  "@odata.type": "#microsoft.graph.androidManagedAppProtection",
  displayName: "Android Enterprise Enhanced Data Protection v1.7",
  description: `This app protection policy introduces data leakage prevention mechanisms and minimum OS requirements. This is the configuration that is applicable to most mobile users accessing work or school data. ${HYDRATION_MARKER}`,
  roleScopeTagIds: ["0"],
  periodOfflineBeforeAccessCheck: "PT12H",
  periodOnlineBeforeAccessCheck: "PT30M",
  allowedInboundDataTransferSources: "allApps",
  allowedOutboundDataTransferDestinations: "managedApps",
  organizationalCredentialsRequired: false,
  allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
  dataBackupBlocked: true,
  deviceComplianceRequired: true,
  managedBrowserToOpenLinksRequired: true,
  saveAsBlocked: true,
  periodOfflineBeforeWipeIsEnforced: "P90D",
  pinRequired: true,
  maximumPinRetries: 5,
  simplePinBlocked: false,
  minimumPinLength: 4,
  pinCharacterSet: "numeric",
  periodBeforePinReset: "PT0S",
  allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint"],
  contactSyncBlocked: false,
  printBlocked: false,
  fingerprintBlocked: false,
  disableAppPinIfDevicePinIsSet: false,
  minimumRequiredOsVersion: "6.0",
  minimumWarningOsVersion: null,
  minimumRequiredAppVersion: null,
  minimumWarningAppVersion: null,
  minimumWipeOsVersion: null,
  minimumWipeAppVersion: null,
  appActionIfDeviceComplianceRequired: "block",
  appActionIfMaximumPinRetriesExceeded: "block",
  pinRequiredInsteadOfBiometricTimeout: "PT12H",
  allowedOutboundClipboardSharingExceptionLength: 0,
  notificationRestriction: "blockOrganizationalData",
  previousPinBlockCount: 0,
  managedBrowser: "microsoftEdge",
  maximumAllowedDeviceThreatLevel: "notConfigured",
  mobileThreatDefenseRemediationAction: "block",
  blockDataIngestionIntoOrganizationDocuments: false,
  allowedDataIngestionLocations: [
    "oneDriveForBusiness",
    "sharePoint",
    "camera",
  ],
  appActionIfUnableToAuthenticateUser: "block",
  dialerRestrictionLevel: "allApps",
  isAssigned: false,
  targetedAppManagementLevels: "unspecified",
  screenCaptureBlocked: true,
  disableAppEncryptionIfDeviceEncryptionIsEnabled: false,
  encryptAppData: true,
  deployedAppCount: 13,
  minimumRequiredPatchVersion: null,
  minimumWarningPatchVersion: null,
  minimumWipePatchVersion: null,
  allowedAndroidDeviceManufacturers: null,
  appActionIfAndroidDeviceManufacturerNotAllowed: "block",
  requiredAndroidSafetyNetDeviceAttestationType:
    "basicIntegrityAndDeviceCertification",
  appActionIfAndroidSafetyNetDeviceAttestationFailed: "block",
  requiredAndroidSafetyNetAppsVerificationType: "enabled",
  appActionIfAndroidSafetyNetAppsVerificationFailed: "block",
  customBrowserPackageId: "",
  customBrowserDisplayName: "",
  minimumRequiredCompanyPortalVersion: null,
  minimumWarningCompanyPortalVersion: null,
  minimumWipeCompanyPortalVersion: null,
  keyboardsRestricted: false,
  allowedAndroidDeviceModels: [],
  appActionIfAndroidDeviceModelNotAllowed: "block",
  customDialerAppPackageId: null,
  customDialerAppDisplayName: null,
  biometricAuthenticationBlocked: true,
  requiredAndroidSafetyNetEvaluationType: "basic",
  blockAfterCompanyPortalUpdateDeferralInDays: 0,
  warnAfterCompanyPortalUpdateDeferralInDays: 0,
  wipeAfterCompanyPortalUpdateDeferralInDays: 0,
  deviceLockRequired: true,
  appActionIfDeviceLockNotSet: "block",
  exemptedAppPackages: [],
  approvedKeyboards: [],
  apps: [
    {
      id: "com.microsoft.emmx.android",
      version: "-725393251",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.emmx",
      },
    },
    {
      id: "com.microsoft.office.excel.android",
      version: "-1789826587",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.excel",
      },
    },
    {
      id: "com.microsoft.office.officehub.android",
      version: "-1091809935",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehub",
      },
    },
    {
      id: "com.microsoft.office.officehubhl.android",
      version: "-1175805259",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehubhl",
      },
    },
    {
      id: "com.microsoft.office.officehubrow.android",
      version: "-1861979965",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehubrow",
      },
    },
    {
      id: "com.microsoft.office.onenote.android",
      version: "186482170",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.onenote",
      },
    },
    {
      id: "com.microsoft.office.outlook.android",
      version: "1146701235",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.outlook",
      },
    },
    {
      id: "com.microsoft.office.powerpoint.android",
      version: "1411665537",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.powerpoint",
      },
    },
    {
      id: "com.microsoft.office.word.android",
      version: "2122351424",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.word",
      },
    },
    {
      id: "com.microsoft.sharepoint.android",
      version: "84773357",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.sharepoint",
      },
    },
    {
      id: "com.microsoft.skydrive.android",
      version: "1887770705",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.skydrive",
      },
    },
    {
      id: "com.microsoft.teams.android",
      version: "1900143244",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.teams",
      },
    },
    {
      id: "com.microsoft.todos.android",
      version: "1697858135",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.todos",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 6. Level 2 – Enterprise Enhanced Data Protection – iOS
//    (level-2-enterprise-enhanced-data-protection-iOS.json)
// ---------------------------------------------------------------------------
const LEVEL2_ENHANCED_IOS: AppProtectionPolicy = {
  "@odata.type": "#microsoft.graph.iosManagedAppProtection",
  displayName: "iOS/iPadOS Enterprise Enhanced Data Protection v1.4",
  description: `This app protection policy introduces data leakage prevention mechanisms and minimum OS requirements. This is the configuration that is applicable to most mobile users accessing work or school data. ${HYDRATION_MARKER}`,
  roleScopeTagIds: ["0"],
  periodOfflineBeforeAccessCheck: "PT12H",
  periodOnlineBeforeAccessCheck: "PT30M",
  allowedInboundDataTransferSources: "allApps",
  allowedOutboundDataTransferDestinations: "managedApps",
  organizationalCredentialsRequired: false,
  allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
  dataBackupBlocked: true,
  deviceComplianceRequired: true,
  managedBrowserToOpenLinksRequired: true,
  saveAsBlocked: true,
  periodOfflineBeforeWipeIsEnforced: "P90D",
  pinRequired: true,
  maximumPinRetries: 5,
  simplePinBlocked: false,
  minimumPinLength: 4,
  pinCharacterSet: "numeric",
  periodBeforePinReset: "PT0S",
  allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint"],
  contactSyncBlocked: false,
  printBlocked: false,
  fingerprintBlocked: false,
  disableAppPinIfDevicePinIsSet: false,
  minimumRequiredOsVersion: "13.7",
  minimumWarningOsVersion: null,
  minimumRequiredAppVersion: null,
  minimumWarningAppVersion: null,
  minimumWipeOsVersion: null,
  minimumWipeAppVersion: null,
  appActionIfDeviceComplianceRequired: "block",
  appActionIfMaximumPinRetriesExceeded: "block",
  pinRequiredInsteadOfBiometricTimeout: "PT12H",
  allowedOutboundClipboardSharingExceptionLength: 0,
  notificationRestriction: "blockOrganizationalData",
  previousPinBlockCount: 0,
  managedBrowser: "microsoftEdge",
  maximumAllowedDeviceThreatLevel: "notConfigured",
  mobileThreatDefenseRemediationAction: "block",
  blockDataIngestionIntoOrganizationDocuments: false,
  allowedDataIngestionLocations: [
    "oneDriveForBusiness",
    "sharePoint",
    "camera",
  ],
  appActionIfUnableToAuthenticateUser: "block",
  dialerRestrictionLevel: "allApps",
  isAssigned: false,
  targetedAppManagementLevels: "unspecified",
  appDataEncryptionType: "whenDeviceLocked",
  minimumRequiredSdkVersion: null,
  deployedAppCount: 11,
  faceIdBlocked: false,
  minimumWipeSdkVersion: null,
  allowedIosDeviceModels: null,
  appActionIfIosDeviceModelNotAllowed: "block",
  thirdPartyKeyboardsBlocked: false,
  filterOpenInToOnlyManagedApps: false,
  disableProtectionOfManagedOutboundOpenInData: false,
  protectInboundDataFromUnknownSources: false,
  customBrowserProtocol: "",
  customDialerAppProtocol: null,
  exemptedAppProtocols: [
    {
      name: "Default",
      value:
        "skype;app-settings;calshow;itms;itmss;itms-apps;itms-appss;itms-services;",
    },
  ],
  apps: [
    {
      id: "com.microsoft.msedge.ios",
      version: "-2135752869",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.msedge",
      },
    },
    {
      id: "com.microsoft.office.excel.ios",
      version: "-1255026913",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.excel",
      },
    },
    {
      id: "com.microsoft.office.outlook.ios",
      version: "-518090279",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.outlook",
      },
    },
    {
      id: "com.microsoft.office.powerpoint.ios",
      version: "-740777841",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.powerpoint",
      },
    },
    {
      id: "com.microsoft.office.word.ios",
      version: "922692278",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.word",
      },
    },
    {
      id: "com.microsoft.officemobile.ios",
      version: "-803819540",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.officemobile",
      },
    },
    {
      id: "com.microsoft.onenote.ios",
      version: "107156768",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.onenote",
      },
    },
    {
      id: "com.microsoft.sharepoint.ios",
      version: "-585639021",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.sharepoint",
      },
    },
    {
      id: "com.microsoft.skydrive.ios",
      version: "-108719121",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.skydrive",
      },
    },
    {
      id: "com.microsoft.skype.teams.ios",
      version: "-1040529574",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.skype.teams",
      },
    },
    {
      id: "com.microsoft.to-do.ios",
      version: "-292160221",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.to-do",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 7. Level 3 – Enterprise High Data Protection – Android
//    (level-3-enterprise-high-data-protection-Android.json)
// ---------------------------------------------------------------------------
const LEVEL3_HIGH_ANDROID: AppProtectionPolicy = {
  "@odata.type": "#microsoft.graph.androidManagedAppProtection",
  displayName: "Android Enterprise High Data Protection v1.7",
  description: `This app protection policy is for devices used by specific users or groups who are uniquely high risk (for example, users who handle highly sensitive data where unauthorized disclosure causes considerable material loss to the organization). ${HYDRATION_MARKER}`,
  roleScopeTagIds: ["0"],
  periodOfflineBeforeAccessCheck: "PT12H",
  periodOnlineBeforeAccessCheck: "PT30M",
  allowedInboundDataTransferSources: "managedApps",
  allowedOutboundDataTransferDestinations: "managedApps",
  organizationalCredentialsRequired: false,
  allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
  dataBackupBlocked: true,
  deviceComplianceRequired: true,
  managedBrowserToOpenLinksRequired: true,
  saveAsBlocked: true,
  periodOfflineBeforeWipeIsEnforced: "P90D",
  pinRequired: true,
  maximumPinRetries: 5,
  simplePinBlocked: true,
  minimumPinLength: 6,
  pinCharacterSet: "numeric",
  periodBeforePinReset: "P365D",
  allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint"],
  contactSyncBlocked: false,
  printBlocked: true,
  fingerprintBlocked: false,
  disableAppPinIfDevicePinIsSet: false,
  maximumRequiredOsVersion: "11.0",
  maximumWarningOsVersion: null,
  maximumWipeOsVersion: null,
  minimumRequiredOsVersion: "9.0",
  minimumWarningOsVersion: null,
  minimumRequiredAppVersion: null,
  minimumWarningAppVersion: null,
  minimumWipeOsVersion: null,
  minimumWipeAppVersion: null,
  appActionIfDeviceComplianceRequired: "wipe",
  appActionIfMaximumPinRetriesExceeded: "block",
  pinRequiredInsteadOfBiometricTimeout: "PT12H",
  allowedOutboundClipboardSharingExceptionLength: 0,
  notificationRestriction: "blockOrganizationalData",
  previousPinBlockCount: 0,
  managedBrowser: "microsoftEdge",
  maximumAllowedDeviceThreatLevel: "secured",
  mobileThreatDefenseRemediationAction: "block",
  blockDataIngestionIntoOrganizationDocuments: true,
  allowedDataIngestionLocations: ["oneDriveForBusiness", "sharePoint"],
  appActionIfUnableToAuthenticateUser: "block",
  dialerRestrictionLevel: "managedApps",
  isAssigned: false,
  targetedAppManagementLevels: "unspecified",
  screenCaptureBlocked: true,
  disableAppEncryptionIfDeviceEncryptionIsEnabled: false,
  encryptAppData: true,
  deployedAppCount: 13,
  minimumRequiredPatchVersion: "0000-00-00",
  minimumWarningPatchVersion: "0000-00-00",
  minimumWipePatchVersion: "0000-00-00",
  allowedAndroidDeviceManufacturers: null,
  appActionIfAndroidDeviceManufacturerNotAllowed: "block",
  requiredAndroidSafetyNetDeviceAttestationType:
    "basicIntegrityAndDeviceCertification",
  appActionIfAndroidSafetyNetDeviceAttestationFailed: "block",
  requiredAndroidSafetyNetAppsVerificationType: "enabled",
  appActionIfAndroidSafetyNetAppsVerificationFailed: "block",
  customBrowserPackageId: "",
  customBrowserDisplayName: "",
  minimumRequiredCompanyPortalVersion: null,
  minimumWarningCompanyPortalVersion: null,
  minimumWipeCompanyPortalVersion: null,
  keyboardsRestricted: true,
  allowedAndroidDeviceModels: [],
  appActionIfAndroidDeviceModelNotAllowed: "block",
  customDialerAppPackageId: "",
  customDialerAppDisplayName: "",
  biometricAuthenticationBlocked: false,
  requiredAndroidSafetyNetEvaluationType: "basic",
  blockAfterCompanyPortalUpdateDeferralInDays: 0,
  warnAfterCompanyPortalUpdateDeferralInDays: 0,
  wipeAfterCompanyPortalUpdateDeferralInDays: 0,
  deviceLockRequired: true,
  appActionIfDeviceLockNotSet: "block",
  exemptedAppPackages: [],
  approvedKeyboards: [
    {
      name: "com.google.android.inputmethod.latin",
      value: "Gboard - the Google Keyboard",
    },
    {
      name: "com.touchtype.swiftkey",
      value: "SwiftKey Keyboard",
    },
    {
      name: "com.sec.android.inputmethod",
      value: "Samsung Keyboard",
    },
    {
      name: "com.google.android.apps.inputmethod.hindi",
      value: "Google Indic Keyboard",
    },
    {
      name: "com.google.android.inputmethod.pinyin",
      value: "Google Pinyin Input",
    },
    {
      name: "com.google.android.inputmethod.japanese",
      value: "Google Japanese Input",
    },
    {
      name: "com.google.android.inputmethod.korean",
      value: "Google Korean Input",
    },
    {
      name: "com.google.android.apps.handwriting.ime",
      value: "Google Handwriting Input",
    },
    {
      name: "com.google.android.googlequicksearchbox",
      value: "Google voice typing",
    },
    {
      name: "com.samsung.android.svoiceime",
      value: "Samsung voice input",
    },
    {
      name: "com.samsung.android.honeyboard",
      value: "Samsung Keyboard",
    },
  ],
  apps: [
    {
      id: "com.microsoft.emmx.android",
      version: "-725393251",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.emmx",
      },
    },
    {
      id: "com.microsoft.office.excel.android",
      version: "-1789826587",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.excel",
      },
    },
    {
      id: "com.microsoft.office.officehub.android",
      version: "-1091809935",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehub",
      },
    },
    {
      id: "com.microsoft.office.officehubhl.android",
      version: "-1175805259",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehubhl",
      },
    },
    {
      id: "com.microsoft.office.officehubrow.android",
      version: "-1861979965",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.officehubrow",
      },
    },
    {
      id: "com.microsoft.office.onenote.android",
      version: "186482170",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.onenote",
      },
    },
    {
      id: "com.microsoft.office.outlook.android",
      version: "1146701235",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.outlook",
      },
    },
    {
      id: "com.microsoft.office.powerpoint.android",
      version: "1411665537",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.powerpoint",
      },
    },
    {
      id: "com.microsoft.office.word.android",
      version: "2122351424",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.office.word",
      },
    },
    {
      id: "com.microsoft.sharepoint.android",
      version: "84773357",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.sharepoint",
      },
    },
    {
      id: "com.microsoft.skydrive.android",
      version: "1887770705",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.skydrive",
      },
    },
    {
      id: "com.microsoft.teams.android",
      version: "1900143244",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.teams",
      },
    },
    {
      id: "com.microsoft.todos.android",
      version: "1697858135",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.androidMobileAppIdentifier",
        packageId: "com.microsoft.todos",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 8. Level 3 – Enterprise High Data Protection – iOS
//    (level-3-enterprise-high-data-protection-iOS.json)
// ---------------------------------------------------------------------------
const LEVEL3_HIGH_IOS: AppProtectionPolicy = {
  "@odata.type": "#microsoft.graph.iosManagedAppProtection",
  displayName: "iOS/iPadOS Enterprise High Data Protection v1.4",
  description: `This app protection policy is for devices used by specific users or groups who are uniquely high risk (for example, users who handle highly sensitive data where unauthorized disclosure causes considerable material loss to the organization). ${HYDRATION_MARKER}`,
  roleScopeTagIds: ["0"],
  periodOfflineBeforeAccessCheck: "PT12H",
  periodOnlineBeforeAccessCheck: "PT30M",
  allowedInboundDataTransferSources: "managedApps",
  allowedOutboundDataTransferDestinations: "managedApps",
  organizationalCredentialsRequired: false,
  allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
  dataBackupBlocked: true,
  deviceComplianceRequired: true,
  managedBrowserToOpenLinksRequired: true,
  saveAsBlocked: true,
  periodOfflineBeforeWipeIsEnforced: "P90D",
  pinRequired: true,
  maximumPinRetries: 5,
  simplePinBlocked: true,
  minimumPinLength: 6,
  pinCharacterSet: "numeric",
  periodBeforePinReset: "P365D",
  allowedDataStorageLocations: ["oneDriveForBusiness", "sharePoint"],
  contactSyncBlocked: false,
  printBlocked: true,
  fingerprintBlocked: false,
  disableAppPinIfDevicePinIsSet: false,
  minimumRequiredOsVersion: "13.7",
  minimumWarningOsVersion: null,
  minimumRequiredAppVersion: null,
  minimumWarningAppVersion: null,
  minimumWipeOsVersion: null,
  minimumWipeAppVersion: null,
  appActionIfDeviceComplianceRequired: "wipe",
  appActionIfMaximumPinRetriesExceeded: "block",
  pinRequiredInsteadOfBiometricTimeout: "PT12H",
  allowedOutboundClipboardSharingExceptionLength: 0,
  notificationRestriction: "blockOrganizationalData",
  previousPinBlockCount: 0,
  managedBrowser: "microsoftEdge",
  maximumAllowedDeviceThreatLevel: "secured",
  mobileThreatDefenseRemediationAction: "block",
  blockDataIngestionIntoOrganizationDocuments: true,
  allowedDataIngestionLocations: ["oneDriveForBusiness", "sharePoint"],
  appActionIfUnableToAuthenticateUser: "block",
  dialerRestrictionLevel: "customApp",
  isAssigned: false,
  targetedAppManagementLevels: "unspecified",
  appDataEncryptionType: "whenDeviceLocked",
  minimumRequiredSdkVersion: null,
  deployedAppCount: 11,
  faceIdBlocked: false,
  minimumWipeSdkVersion: null,
  allowedIosDeviceModels: null,
  appActionIfIosDeviceModelNotAllowed: "block",
  thirdPartyKeyboardsBlocked: true,
  filterOpenInToOnlyManagedApps: false,
  disableProtectionOfManagedOutboundOpenInData: false,
  protectInboundDataFromUnknownSources: false,
  customBrowserProtocol: "",
  customDialerAppProtocol: "replace_with_dialer_app_url_scheme",
  exemptedAppProtocols: [
    {
      name: "Default",
      value:
        "tel;telprompt;skype;app-settings;calshow;itms;itmss;itms-apps;itms-appss;itms-services;",
    },
  ],
  apps: [
    {
      id: "com.microsoft.msedge.ios",
      version: "-2135752869",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.msedge",
      },
    },
    {
      id: "com.microsoft.office.excel.ios",
      version: "-1255026913",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.excel",
      },
    },
    {
      id: "com.microsoft.office.outlook.ios",
      version: "-518090279",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.outlook",
      },
    },
    {
      id: "com.microsoft.office.powerpoint.ios",
      version: "-740777841",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.powerpoint",
      },
    },
    {
      id: "com.microsoft.office.word.ios",
      version: "922692278",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.office.word",
      },
    },
    {
      id: "com.microsoft.officemobile.ios",
      version: "-803819540",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.officemobile",
      },
    },
    {
      id: "com.microsoft.onenote.ios",
      version: "107156768",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.onenote",
      },
    },
    {
      id: "com.microsoft.sharepoint.ios",
      version: "-585639021",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.sharepoint",
      },
    },
    {
      id: "com.microsoft.skydrive.ios",
      version: "-108719121",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.skydrive",
      },
    },
    {
      id: "com.microsoft.skype.teams.ios",
      version: "-1040529574",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.skype.teams",
      },
    },
    {
      id: "com.microsoft.to-do.ios",
      version: "-292160221",
      mobileAppIdentifier: {
        "@odata.type": "#microsoft.graph.iosMobileAppIdentifier",
        bundleId: "com.microsoft.to-do",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Exported collection
// ---------------------------------------------------------------------------
export const APP_PROTECTION_POLICIES: AppProtectionPolicy[] = [
  ANDROID_APP_PROTECTION,
  IOS_APP_PROTECTION,
  LEVEL1_BASIC_ANDROID,
  LEVEL1_BASIC_IOS,
  LEVEL2_ENHANCED_ANDROID,
  LEVEL2_ENHANCED_IOS,
  LEVEL3_HIGH_ANDROID,
  LEVEL3_HIGH_IOS,
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

  return APP_PROTECTION_POLICIES.filter(
    (policy) => policy["@odata.type"] === odataType
  );
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
