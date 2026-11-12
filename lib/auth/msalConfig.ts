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
const appOrigin =
  (typeof window !== "undefined" ? window.location.origin : undefined) ||
  process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI ||
  "http://localhost:3000";

/**
 * Path of the MSAL redirect bridge page (app/auth/redirect/route.ts).
 * The URI `<origin>/auth/redirect` must be registered as an SPA redirect URI in Entra ID.
 */
export const MSAL_REDIRECT_BRIDGE_PATH = "/auth/redirect";

/**
 * Redirect URI for all MSAL flows.
 * MSAL Browser v5 receives popup sign-in, hidden-iframe renewal, and popup sign-out
 * responses through a redirect bridge page that sends them to the app window.
 */
export const redirectBridgeUri = new URL(MSAL_REDIRECT_BRIDGE_PATH, appOrigin).href;

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "",
    authority:
      process.env.NEXT_PUBLIC_MSAL_AUTHORITY ||
      "https://login.microsoftonline.com/common",
    redirectUri: redirectBridgeUri,
    // logoutPopup needs the bridge on this page to close the popup.
    postLogoutRedirectUri: redirectBridgeUri,
  },
  cache: {
    cacheLocation: "sessionStorage", // Use sessionStorage instead of localStorage for security
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        // msal-browser v5 tries sessionStorage when the instance is created during server
        // rendering, logs "window is not defined", and uses memory storage. MSAL does no
        // work on the server, so do not log there.
        if (containsPii || typeof window === "undefined") {
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
