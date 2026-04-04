/**
 * Conditional Access Policy Templates for Intune Hydration Kit
 *
 * Sourced from the PowerShell IntuneHydrationKit project (Templates/ConditionalAccess/).
 * All 21 policies match the JSON files from the source project exactly.
 *
 * IMPORTANT: All CA policies are created in DISABLED state for safety.
 * Administrators must review and enable policies manually after deployment.
 */

import { ConditionalAccessPolicy } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

// Admin role IDs referenced across multiple policies
const ADMIN_ROLES_14 = [
  "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
  "194ae4cb-b126-40b2-bd5b-6091b380977d", // Security Administrator
  "f28a1f50-f6e7-4571-818b-6a12f2af6b6c", // SharePoint Administrator
  "29232cdf-9323-42fd-ade2-1d097af3e4de", // Exchange Administrator
  "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9", // Conditional Access Administrator
  "729827e3-9c14-49f7-bb1b-9608f156bbb8", // Helpdesk Administrator
  "b0f54661-2d74-4c50-afa3-1ec803f12efe", // Billing Administrator
  "fe930be7-5e62-47db-91af-98c3a49a38b1", // User Administrator
  "c4e39bd9-1100-46d3-8c65-fb160da0071f", // Authentication Administrator
  "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
  "158c047a-c907-4556-b7ef-446551a6b5f7", // Cloud Application Administrator
  "966707d0-3269-4727-9be2-8c3a10f19b9d", // Password Administrator
  "7be44c8a-adaf-4e2a-84d6-ab2649e08a13", // Privileged Authentication Administrator
  "e8611ab8-c189-46e8-94e1-60213ab1f814", // Privileged Role Administrator
];

// Extended admin role IDs for phishing-resistant MFA policy (14 + 5 additional)
const ADMIN_ROLES_19 = [
  ...ADMIN_ROLES_14,
  "17315797-102d-40b4-93e0-432062caca18", // Compliance Administrator
  "e6d1a23a-da11-4be4-9570-befc86d067a7", // Attribute Definition Administrator
  "3a2c62db-5318-420d-8d74-23affee5d9d5", // Teams Administrator
  "44367163-eba1-44c3-98af-f5787879f96a", // Azure DevOps Administrator
  "11648597-926c-4cf3-9c36-bcebb0ba8dcc", // Power Platform Administrator
];

export const CONDITIONAL_ACCESS_POLICIES: ConditionalAccessPolicy[] = [
  // ─── 1. Block access for unknown or unsupported device platform ──────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Block access for unknown or unsupported device platform",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [
          "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
        ],
      },
      platforms: {
        includePlatforms: ["all"],
        excludePlatforms: ["android", "iOS", "windows", "macOS", "linux"],
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },

  // ─── 2. Block access to Office365 apps for users with insider risk ───────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Block access to Office365 apps for users with insider risk",
    state: "disabled",
    conditions: {
      locations: null,
      signInRiskLevels: [],
      times: null,
      servicePrincipalRiskLevels: [],
      clientApplications: null,
      clientAppTypes: ["all"],
      applications: {
        excludeApplications: [],
        includeUserActions: [],
        networkAccess: null,
        globalSecureAccess: null,
        includeApplications: ["Office365"],
        applicationFilter: null,
        includeAuthenticationContextClassReferences: [],
      },
      authenticationFlows: null,
      userRiskLevels: [],
      platforms: null,
      insiderRiskLevels: "elevated",
      deviceStates: null,
      clients: null,
      agentIdRiskLevels: null,
      users: {
        excludeUsers: [],
        includeUsers: ["All"],
        includeRoles: [],
        excludeGuestsOrExternalUsers: {
          guestOrExternalUserTypes:
            "b2bDirectConnectUser,otherExternalUser,serviceProvider",
          externalTenants: null,
        },
        includeGroups: [],
        includeGuestsOrExternalUsers: null,
        excludeGroups: [],
        excludeRoles: [],
      },
      devices: null,
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 3. Block all agent identities from accessing resources ──────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Block all agent identities from accessing resources",
    state: "disabled",
    conditions: {
      locations: null,
      signInRiskLevels: [],
      times: null,
      servicePrincipalRiskLevels: [],
      clientApplications: {
        servicePrincipalFilter: null,
        agentIdServicePrincipalFilter: null,
        excludeServicePrincipals: [],
        includeAgentIdServicePrincipals: ["All"],
        excludeAgentIdServicePrincipals: [],
        includeServicePrincipals: [],
      },
      clientAppTypes: ["all"],
      applications: {
        excludeApplications: [],
        includeUserActions: [],
        networkAccess: null,
        globalSecureAccess: null,
        includeApplications: ["All"],
        applicationFilter: null,
        includeAuthenticationContextClassReferences: [],
      },
      authenticationFlows: null,
      userRiskLevels: [],
      platforms: null,
      insiderRiskLevels: null,
      deviceStates: null,
      clients: null,
      agentIdRiskLevels: null,
      users: {
        excludeUsers: [],
        includeUsers: ["None"],
        includeRoles: [],
        excludeGuestsOrExternalUsers: null,
        includeGroups: [],
        includeGuestsOrExternalUsers: null,
        excludeGroups: [],
        excludeRoles: [],
      },
      devices: null,
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 4. Block all agent users from accessing resources ───────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Block all agent users from accessing resources",
    state: "disabled",
    conditions: {
      locations: null,
      signInRiskLevels: [],
      times: null,
      servicePrincipalRiskLevels: [],
      clientApplications: null,
      clientAppTypes: ["all"],
      applications: {
        excludeApplications: [],
        includeUserActions: [],
        networkAccess: null,
        globalSecureAccess: null,
        includeApplications: ["All"],
        applicationFilter: null,
        includeAuthenticationContextClassReferences: [],
      },
      authenticationFlows: null,
      userRiskLevels: [],
      platforms: null,
      insiderRiskLevels: null,
      deviceStates: null,
      clients: null,
      agentIdRiskLevels: null,
      users: {
        excludeUsers: [],
        includeUsers: ["AllAgentIdUsers"],
        includeRoles: [],
        excludeGuestsOrExternalUsers: null,
        includeGroups: [],
        includeGuestsOrExternalUsers: null,
        excludeGroups: [],
        excludeRoles: [],
      },
      devices: null,
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 5. Block high risk agent identities from accessing resources ────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Block high risk agent identities from accessing resources",
    state: "disabled",
    conditions: {
      locations: null,
      signInRiskLevels: [],
      times: null,
      servicePrincipalRiskLevels: [],
      clientApplications: {
        servicePrincipalFilter: null,
        agentIdServicePrincipalFilter: null,
        excludeServicePrincipals: [],
        includeAgentIdServicePrincipals: ["All"],
        excludeAgentIdServicePrincipals: [],
        includeServicePrincipals: [],
      },
      clientAppTypes: ["all"],
      applications: {
        excludeApplications: [],
        includeUserActions: [],
        networkAccess: null,
        globalSecureAccess: null,
        includeApplications: ["All"],
        applicationFilter: null,
        includeAuthenticationContextClassReferences: [],
      },
      authenticationFlows: null,
      userRiskLevels: [],
      platforms: null,
      insiderRiskLevels: null,
      deviceStates: null,
      clients: null,
      agentIdRiskLevels: "high",
      users: {
        excludeUsers: [],
        includeUsers: ["None"],
        includeRoles: [],
        excludeGuestsOrExternalUsers: null,
        includeGroups: [],
        includeGuestsOrExternalUsers: null,
        excludeGroups: [],
        excludeRoles: [],
      },
      devices: null,
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 6. Block legacy authentication ──────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Block legacy authentication",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["exchangeActiveSync", "other"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 7. No persistent browser session ────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "No persistent browser session",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
      devices: {
        includeDeviceStates: [],
        excludeDeviceStates: [],
        includeDevices: [],
        excludeDevices: [],
        deviceFilter: {
          mode: "include",
          rule: 'device.trustType -ne "ServerAD" -or device.isCompliant -ne True',
        },
      },
    },
    grantControls: null,
    sessionControls: {
      disableResilienceDefaults: null,
      applicationEnforcedRestrictions: null,
      cloudAppSecurity: null,
      continuousAccessEvaluation: null,
      secureSignInSession: null,
      networkAccessSecurity: null,
      globalSecureAccessFilteringProfile: null,
      signInFrequency: {
        value: 1,
        type: "hours",
        authenticationType: "primaryAndSecondaryAuthentication",
        frequencyInterval: "timeBased",
        isEnabled: true,
      },
      persistentBrowser: {
        mode: "never",
        isEnabled: true,
      },
    },
  },

  // ─── 8. Require MDM-enrolled and compliant device (Preview) ──────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName:
      "Require MDM-enrolled and compliant device to access cloud apps for all users (Preview)",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [
          "d29b2b05-8046-44ba-8758-1e26182fcf32", // Directory Synchronization Accounts
        ],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["compliantDevice"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 9. Require compliant or hybrid Azure AD joined device for admins ────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName:
      "Require compliant or hybrid Azure AD joined device for admins",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["None"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [...ADMIN_ROLES_14],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["compliantDevice", "domainJoinedDevice"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 10. Require compliant/hybrid or MFA for all users ───────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName:
      "Require compliant or hybrid Azure AD joined device or multifactor authentication for all users",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [
          "d29b2b05-8046-44ba-8758-1e26182fcf32", // Directory Synchronization Accounts
        ],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa", "compliantDevice", "domainJoinedDevice"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 11. Require MFA for Azure management ────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Require multifactor authentication for Azure management",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["797f4846-ba00-4fd7-ba43-dac1f8f63013"], // Azure Management
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 12. Require MFA for Microsoft admin portals ─────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName:
      "Require multifactor authentication for Microsoft admin portals",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["MicrosoftAdminPortals"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: [],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [...ADMIN_ROLES_14],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: [],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: {
        id: "00000000-0000-0000-0000-000000000002", // MFA
      },
    },
    sessionControls: null,
  },

  // ─── 13. Require MFA for admins ──────────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Require multifactor authentication for admins",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: [],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [...ADMIN_ROLES_14],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 14. Require MFA for all users ───────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Require multifactor authentication for all users",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [
          "d29b2b05-8046-44ba-8758-1e26182fcf32", // Directory Synchronization Accounts
        ],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 15. Require MFA for guest access ────────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Require multifactor authentication for guest access",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["GuestsOrExternalUsers"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 16. Require MFA for risky sign-ins ──────────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Require multifactor authentication for risky sign-ins",
    state: "disabled",
    conditions: {
      locations: null,
      signInRiskLevels: ["high", "medium"],
      times: null,
      servicePrincipalRiskLevels: [],
      clientApplications: null,
      clientAppTypes: ["all"],
      applications: {
        excludeApplications: [],
        includeUserActions: [],
        networkAccess: null,
        globalSecureAccess: null,
        includeApplications: ["All"],
        applicationFilter: null,
        includeAuthenticationContextClassReferences: [],
      },
      authenticationFlows: null,
      userRiskLevels: [],
      platforms: null,
      insiderRiskLevels: null,
      deviceStates: null,
      clients: null,
      agentIdRiskLevels: null,
      users: {
        excludeUsers: [],
        includeUsers: ["All"],
        includeRoles: [],
        excludeGuestsOrExternalUsers: null,
        includeGroups: [],
        includeGuestsOrExternalUsers: null,
        excludeGroups: [],
        excludeRoles: [],
      },
      devices: null,
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: {
      continuousAccessEvaluation: null,
      disableResilienceDefaults: null,
      signInFrequency: {
        isEnabled: true,
        type: null,
        authenticationType: "primaryAndSecondaryAuthentication",
        frequencyInterval: "everyTime",
        value: null,
      },
      networkAccessSecurity: null,
      persistentBrowser: null,
      secureSignInSession: null,
      cloudAppSecurity: null,
      applicationEnforcedRestrictions: null,
      globalSecureAccessFilteringProfile: null,
    },
  },

  // ─── 17. Require password change for high-risk users ─────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Require password change for high-risk users",
    state: "disabled",
    conditions: {
      locations: null,
      signInRiskLevels: [],
      times: null,
      servicePrincipalRiskLevels: [],
      clientApplications: null,
      clientAppTypes: ["all"],
      applications: {
        excludeApplications: [],
        includeUserActions: [],
        networkAccess: null,
        globalSecureAccess: null,
        includeApplications: ["All"],
        applicationFilter: null,
        includeAuthenticationContextClassReferences: [],
      },
      authenticationFlows: null,
      userRiskLevels: ["high"],
      platforms: null,
      insiderRiskLevels: null,
      deviceStates: null,
      clients: null,
      agentIdRiskLevels: null,
      users: {
        excludeUsers: [],
        includeUsers: ["All"],
        includeRoles: [],
        excludeGuestsOrExternalUsers: null,
        includeGroups: [],
        includeGuestsOrExternalUsers: null,
        excludeGroups: [],
        excludeRoles: [],
      },
      devices: null,
    },
    grantControls: {
      operator: "AND",
      builtInControls: ["mfa", "passwordChange"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: {
      continuousAccessEvaluation: null,
      disableResilienceDefaults: null,
      signInFrequency: {
        isEnabled: true,
        type: null,
        authenticationType: "primaryAndSecondaryAuthentication",
        frequencyInterval: "everyTime",
        value: null,
      },
      networkAccessSecurity: null,
      persistentBrowser: null,
      secureSignInSession: null,
      cloudAppSecurity: null,
      applicationEnforcedRestrictions: null,
      globalSecureAccessFilteringProfile: null,
    },
  },

  // ─── 18. Require phishing-resistant MFA for admins ───────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName:
      "Require phishing-resistant multifactor authentication for admins",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: [],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [...ADMIN_ROLES_19],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: {
      operator: "AND",
      builtInControls: [],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: {
        id: "00000000-0000-0000-0000-000000000004", // Phishing-resistant MFA
      },
    },
    sessionControls: null,
  },

  // ─── 19. Secure account recovery with identity verification (Preview) ────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName:
      "Secure account recovery with identity verification (Preview)",
    state: "disabled",
    conditions: {
      locations: null,
      signInRiskLevels: [],
      times: null,
      servicePrincipalRiskLevels: [],
      clientApplications: null,
      clientAppTypes: ["all"],
      applications: {
        excludeApplications: [],
        includeUserActions: ["urn:user:accountrecovery"],
        networkAccess: null,
        globalSecureAccess: null,
        includeApplications: [],
        applicationFilter: null,
        includeAuthenticationContextClassReferences: [],
      },
      authenticationFlows: null,
      userRiskLevels: [],
      platforms: null,
      insiderRiskLevels: null,
      deviceStates: null,
      clients: null,
      agentIdRiskLevels: null,
      users: {
        excludeUsers: [],
        includeUsers: ["All"],
        includeRoles: [],
        excludeGuestsOrExternalUsers: {
          guestOrExternalUserTypes:
            "b2bCollaborationGuest,b2bCollaborationMember,b2bDirectConnectUser,otherExternalUser,serviceProvider",
          externalTenants: {
            membershipKind: "all",
            "@odata.type":
              "#microsoft.graph.conditionalAccessAllExternalTenants",
          },
        },
        includeGroups: [],
        includeGuestsOrExternalUsers: null,
        excludeGroups: [],
        excludeRoles: [],
      },
      devices: null,
    },
    grantControls: {
      operator: "AND",
      builtInControls: ["verifiedID"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 20. Securing security info registration ─────────────────────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Securing security info registration",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: [],
        excludeApplications: [],
        includeUserActions: ["urn:user:registersecurityinfo"],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: ["GuestsOrExternalUsers"],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [
          "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
        ],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
      locations: {
        includeLocations: ["All"],
        excludeLocations: ["AllTrusted"],
      },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    sessionControls: null,
  },

  // ─── 21. Use application enforced restrictions for O365 apps ─────────────────
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "Use application enforced restrictions for O365 apps",
    state: "disabled",
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ["all"],
      servicePrincipalRiskLevels: [],
      agentIdRiskLevels: null,
      insiderRiskLevels: null,
      clients: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      authenticationFlows: null,
      applications: {
        includeApplications: ["Office365"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
        networkAccess: null,
        globalSecureAccess: null,
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        includeGuestsOrExternalUsers: null,
        excludeGuestsOrExternalUsers: null,
      },
    },
    grantControls: null,
    sessionControls: {
      disableResilienceDefaults: null,
      cloudAppSecurity: null,
      signInFrequency: null,
      persistentBrowser: null,
      continuousAccessEvaluation: null,
      secureSignInSession: null,
      networkAccessSecurity: null,
      globalSecureAccessFilteringProfile: null,
      applicationEnforcedRestrictions: {
        isEnabled: true,
      },
    },
  },
];

/**
 * Get all conditional access policy templates
 * NOTE: All policies are created in DISABLED state for safety
 */
export function getConditionalAccessPolicies(): ConditionalAccessPolicy[] {
  return CONDITIONAL_ACCESS_POLICIES;
}

/**
 * Get a specific conditional access policy by display name
 */
export function getConditionalAccessPolicyByName(
  displayName: string
): ConditionalAccessPolicy | undefined {
  return CONDITIONAL_ACCESS_POLICIES.find(
    (policy) => policy.displayName.toLowerCase() === displayName.toLowerCase()
  );
}

/**
 * Get conditional access policies by risk level requirement
 * Searches signInRiskLevels, userRiskLevels, insiderRiskLevels, and agentIdRiskLevels
 */
export function getConditionalAccessPoliciesByRiskLevel(
  riskLevel: "low" | "medium" | "high" | "elevated"
): ConditionalAccessPolicy[] {
  return CONDITIONAL_ACCESS_POLICIES.filter((policy) => {
    const c = policy.conditions;
    return (
      c.signInRiskLevels?.includes(riskLevel) ||
      c.userRiskLevels?.includes(riskLevel) ||
      c.insiderRiskLevels === riskLevel ||
      c.agentIdRiskLevels === riskLevel
    );
  });
}
