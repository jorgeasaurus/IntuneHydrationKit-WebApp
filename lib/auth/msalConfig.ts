import { Configuration, LogLevel, PublicClientApplication } from "@azure/msal-browser";

/**
 * Microsoft Graph API scopes required for Intune Hydration Kit
 */
export const REQUIRED_SCOPES = [
  "DeviceManagementConfiguration.ReadWrite.All",
  "DeviceManagementServiceConfig.ReadWrite.All",
  "DeviceManagementManagedDevices.ReadWrite.All",
  "DeviceManagementScripts.ReadWrite.All",
  "DeviceManagementApps.ReadWrite.All",
  "Group.ReadWrite.All",
  "Policy.Read.All",
  "Policy.ReadWrite.ConditionalAccess",
  "Application.Read.All",
  "Directory.ReadWrite.All",
  "LicenseAssignment.Read.All",
  "Organization.Read.All",
];

/**
 * Get the authority URL for a tenant (global/commercial cloud only)
 */
export function getAuthorityUrl(tenantId: string = "common"): string {
  return `https://login.microsoftonline.com/${tenantId}`;
}

/**
 * MSAL configuration for authentication
 */
// Interactive browser flows must return to the origin that initiated them. This keeps
// branch aliases and custom domains from inheriting a stale build-time redirect URI.
const redirectUri =
  (typeof window !== "undefined" ? window.location.origin : undefined) ||
  process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI ||
  "http://localhost:3000";

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "",
    authority:
      process.env.NEXT_PUBLIC_MSAL_AUTHORITY ||
      "https://login.microsoftonline.com/common",
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: "sessionStorage", // Use sessionStorage instead of localStorage for security
    storeAuthStateInCookie: false, // Set to true for IE11 or Edge
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
          default:
            return;
        }
      },
    },
  },
};

/**
 * Returns a clear operator-facing error before MSAL attempts an invalid interactive flow.
 */
export function getMsalConfigurationError(): string | null {
  const clientId = msalConfig.auth.clientId?.trim();
  if (!clientId || clientId === "your-client-id-here") {
    return "Microsoft Entra sign-in is not configured. Set NEXT_PUBLIC_MSAL_CLIENT_ID and restart the app.";
  }

  return null;
}

/**
 * Scopes for login request
 */
export const loginRequest = {
  scopes: REQUIRED_SCOPES,
};

/**
 * Create a new MSAL instance
 */
export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Initialize MSAL instance - must be called before any authentication operations
 * Required for MSAL 3.x browser applications
 */
let msalInitialized = false;
let msalInitPromise: Promise<void> | null = null;

export async function initializeMsal(): Promise<void> {
  if (msalInitialized) {
    return;
  }

  if (msalInitPromise) {
    return msalInitPromise;
  }

  msalInitPromise = msalInstance.initialize().then(() => {
    msalInitialized = true;
    console.log("[MSAL] Instance initialized successfully");
  });

  return msalInitPromise;
}
