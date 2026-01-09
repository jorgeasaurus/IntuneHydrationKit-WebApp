import { Configuration, LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { CloudEnvironment } from "@/types/hydration";

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
 * Cloud environment endpoints for multi-cloud support
 */
export const CLOUD_ENVIRONMENTS = {
  global: {
    authority: "https://login.microsoftonline.com",
    graphEndpoint: "https://graph.microsoft.com",
  },
  usgov: {
    authority: "https://login.microsoftonline.us",
    graphEndpoint: "https://graph.microsoft.us",
  },
  usgovdod: {
    authority: "https://login.microsoftonline.us",
    graphEndpoint: "https://dod-graph.microsoft.us",
  },
  germany: {
    authority: "https://login.microsoftonline.de",
    graphEndpoint: "https://graph.microsoft.de",
  },
  china: {
    authority: "https://login.chinacloudapi.cn",
    graphEndpoint: "https://microsoftgraph.chinacloudapi.cn",
  },
};

/**
 * Get the Graph API endpoint for a cloud environment
 */
export function getGraphEndpoint(environment: CloudEnvironment = "global"): string {
  return CLOUD_ENVIRONMENTS[environment].graphEndpoint;
}

/**
 * Get the authority URL for a cloud environment
 */
export function getAuthorityUrl(
  environment: CloudEnvironment = "global",
  tenantId: string = "common"
): string {
  return `${CLOUD_ENVIRONMENTS[environment].authority}/${tenantId}`;
}

/**
 * MSAL configuration for authentication
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "",
    authority:
      process.env.NEXT_PUBLIC_MSAL_AUTHORITY ||
      "https://login.microsoftonline.com/common",
    redirectUri: process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || "http://localhost:3000",
    postLogoutRedirectUri:
      process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || "http://localhost:3000",
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
