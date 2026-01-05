/**
 * Conditional Access Policy Templates for Intune Hydration Kit
 * IMPORTANT: All CA policies are created in DISABLED state for safety
 */

import { ConditionalAccessPolicy } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune-Hydration-Kit";

export const CONDITIONAL_ACCESS_POLICIES: ConditionalAccessPolicy[] = [
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA001: Require MFA for All Users",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA002: Block Legacy Authentication",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: [
        "exchangeActiveSync",
        "other",
      ],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA003: Require Compliant Device for All Apps",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["compliantDevice", "domainJoinedDevice"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA004: Require MFA for Azure Management",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["797f4846-ba00-4fd7-ba43-dac1f8f63013"], // Azure Management
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA005: Require MFA for Admins",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: [],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [
          "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
          "194ae4cb-b126-40b2-bd5b-6091b380977d", // Security Administrator
          "7be44c8a-adaf-4e2a-84d6-ab2649e08a13", // Privileged Authentication Administrator
          "c4e39bd9-1100-46d3-8c65-fb160da0071f", // Authentication Administrator
          "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
          "158c047a-c907-4556-b7ef-446551a6b5f7", // Cloud Application Administrator
        ],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA006: Block High Risk Sign-ins",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: ["high"],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA007: Require MFA for Medium Risk Sign-ins",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: ["medium"],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA008: Require Password Change for High Risk Users",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: ["high"],
    },
    grantControls: {
      operator: "AND",
      builtInControls: ["mfa", "passwordChange"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA009: Block Access from Unknown Locations",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: {
        includeLocations: ["All"],
        excludeLocations: ["AllTrusted"],
      },
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA010: Require App Protection for Mobile Devices",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["Office365"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: {
        includePlatforms: ["iOS", "android"],
        excludePlatforms: [],
      },
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["mobileAppsAndDesktopClients"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["approvedApplication", "compliantApplication"],
      customAuthenticationFactors: [],
      termsOfUse: [],
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA011: Sign-in Frequency for Unmanaged Devices",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: {
        includeDevices: ["All"],
        excludeDevices: [],
        deviceFilter: {
          mode: "exclude",
          rule: '(device.isCompliant -eq true) or (device.trustType -eq "AzureAD") or (device.trustType -eq "ServerAD")',
        },
      },
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: null,
    sessionControls: {
      signInFrequency: {
        value: 4,
        type: "hours",
        isEnabled: true,
      },
      persistentBrowser: {
        mode: "never",
        isEnabled: true,
      },
    },
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA012: Require Terms of Use Acceptance",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: null,
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: "OR",
      builtInControls: [],
      customAuthenticationFactors: [],
      termsOfUse: [], // This should be populated with actual ToU ID after ToU is created
    },
    sessionControls: null,
  },
  {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    displayName: "CA013: Block Downloads on Unmanaged Devices",
    state: "disabled",
    conditions: {
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["Office365"],
        excludeApplications: [],
        includeUserActions: [],
      },
      platforms: null,
      locations: null,
      deviceStates: null,
      devices: {
        includeDevices: ["All"],
        excludeDevices: [],
        deviceFilter: {
          mode: "exclude",
          rule: '(device.isCompliant -eq true) or (device.trustType -eq "AzureAD") or (device.trustType -eq "ServerAD")',
        },
      },
      clientAppTypes: ["browser"],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: null,
    sessionControls: {
      applicationEnforcedRestrictions: {
        isEnabled: true,
      },
      cloudAppSecurity: {
        isEnabled: true,
        cloudAppSecurityType: "blockDownloads",
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
 */
export function getConditionalAccessPoliciesByRiskLevel(
  riskLevel: "low" | "medium" | "high"
): ConditionalAccessPolicy[] {
  return CONDITIONAL_ACCESS_POLICIES.filter(
    (policy) =>
      policy.conditions.signInRiskLevels?.includes(riskLevel) ||
      policy.conditions.userRiskLevels?.includes(riskLevel)
  );
}
