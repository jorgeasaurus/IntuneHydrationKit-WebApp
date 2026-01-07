/**
 * Template loader for Intune Hydration Kit
 * Loads templates from local IntuneTemplates directory
 */

const TEMPLATES_BASE_PATH = "/IntuneTemplates";
const HYDRATION_MARKER = "Imported by Intune-Hydration-Kit";

// Cache version - increment this when templates change to invalidate old caches
const CACHE_VERSION = 2; // Updated for 10 App Protection policies

export interface GroupTemplate {
  displayName: string;
  description: string;
  membershipRule: string;
}

export interface FilterTemplate {
  displayName: string;
  description: string;
  platform: string;
  rule: string;
}

export interface ComplianceTemplate {
  "@odata.type": string;
  displayName: string;
  description: string;
  [key: string]: unknown;
}

export interface ConditionalAccessTemplate {
  displayName: string;
  state: string;
  conditions: unknown;
  grantControls: unknown;
  sessionControls: unknown;
}

export interface AppProtectionTemplate {
  "@odata.type": string;
  displayName: string;
  description: string;
  [key: string]: unknown;
}

/**
 * Fetch dynamic groups from local templates
 */
export async function fetchDynamicGroups(): Promise<GroupTemplate[]> {
  const groupFiles = [
    "DynamicGroups/Autopilot-Groups.json",
    "DynamicGroups/Manufacturer-Groups.json",
    "DynamicGroups/OS-Groups.json",
    "DynamicGroups/Ownership-Groups.json",
    "DynamicGroups/User-Groups.json",
    "DynamicGroups/VM-Groups.json",
  ];

  const allGroups: GroupTemplate[] = [];

  for (const file of groupFiles) {
    try {
      const response = await fetch(`${TEMPLATES_BASE_PATH}/${file}`);
      if (!response.ok) {
        console.error(`Failed to fetch ${file}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      // The JSON files have a "groups" array
      if (data.groups && Array.isArray(data.groups)) {
        const groups = data.groups.map((group: GroupTemplate) => ({
          ...group,
          description: group.description
            ? `${group.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        }));
        allGroups.push(...groups);
      }
    } catch (error) {
      console.error(`Error fetching ${file}:`, error);
    }
  }

  return allGroups;
}

/**
 * Fetch static groups from local templates
 */
export async function fetchStaticGroups(): Promise<GroupTemplate[]> {
  try {
    const response = await fetch(`${TEMPLATES_BASE_PATH}/StaticGroups/Static-Groups.json`);
    if (!response.ok) {
      console.error(`Failed to fetch static groups: ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data.groups && Array.isArray(data.groups)) {
      return data.groups.map((group: GroupTemplate) => ({
        ...group,
        description: group.description
          ? `${group.description} ${HYDRATION_MARKER}`
          : HYDRATION_MARKER,
      }));
    }

    return [];
  } catch (error) {
    console.error("Error fetching static groups:", error);
    return [];
  }
}

/**
 * Fetch device filters from local templates
 */
export async function fetchFilters(): Promise<FilterTemplate[]> {
  const filterFiles = [
    "Filters/Android-Filters.json",
    "Filters/Windows-Manufacturer-Filters.json",
    "Filters/Windows-VM-Filters.json",
    "Filters/iOS-Filters.json",
    "Filters/macOS-Filters.json",
  ];

  const allFilters: FilterTemplate[] = [];

  for (const file of filterFiles) {
    try {
      const response = await fetch(`${TEMPLATES_BASE_PATH}/${file}`);
      if (!response.ok) {
        console.error(`Failed to fetch ${file}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      if (data.filters && Array.isArray(data.filters)) {
        const filters = data.filters.map((filter: FilterTemplate) => ({
          ...filter,
          description: filter.description
            ? `${filter.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        }));
        allFilters.push(...filters);
      }
    } catch (error) {
      console.error(`Error fetching ${file}:`, error);
    }
  }

  return allFilters;
}

/**
 * Fetch compliance policies from local templates
 */
export async function fetchCompliancePolicies(): Promise<ComplianceTemplate[]> {
  const complianceFiles = [
    "Compliance/Android-Compliance-FullyManaged-Basic.json",
    "Compliance/Android-Compliance-FullyManaged-Strict.json",
    "Compliance/Linux-Compliance-Basic.json",
    "Compliance/Linux-Compliance-Strict.json",
    "Compliance/Windows-Compliance-Policy.json",
    "Compliance/Windows-Custom-Compliance.json",
    "Compliance/iOS-Compliance-Basic.json",
    "Compliance/iOS-Compliance-Strict.json",
    "Compliance/macOS-Compliance-Basic.json",
    "Compliance/macOS-Compliance-Strict.json",
  ];

  const allPolicies: ComplianceTemplate[] = [];

  for (const file of complianceFiles) {
    try {
      const response = await fetch(`${TEMPLATES_BASE_PATH}/${file}`);
      if (!response.ok) {
        console.error(`Failed to fetch ${file}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      // Compliance files contain single policy objects, not arrays
      if (data["@odata.type"]) {
        const policy: ComplianceTemplate = {
          ...data,
          description: data.description
            ? `${data.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        };
        allPolicies.push(policy);
      }
    } catch (error) {
      console.error(`Error fetching ${file}:`, error);
    }
  }

  return allPolicies;
}

/**
 * Fetch conditional access policies from local templates
 */
export async function fetchConditionalAccessPolicies(): Promise<ConditionalAccessTemplate[]> {
  // Get list of all CA policy files
  const caFiles = [
    "ConditionalAccess/Block access for unknown or unsupported device platform.json",
    "ConditionalAccess/Block access to Office365 apps for users with insider risk.json",
    "ConditionalAccess/Block all agent identities from accessing resources.json",
    "ConditionalAccess/Block all agent users from accessing resources.json",
    "ConditionalAccess/Block high risk agent identities from accessing resources.json",
    "ConditionalAccess/Block legacy authentication.json",
    "ConditionalAccess/No persistent browser session.json",
    "ConditionalAccess/Require MDM-enrolled and compliant device to access cloud apps for all users (Preview).json",
    "ConditionalAccess/Require compliant or hybrid Azure AD joined device for admins.json",
    "ConditionalAccess/Require compliant or hybrid Azure AD joined device or multifactor authentication for all users.json",
    "ConditionalAccess/Require multifactor authentication for admin portals.json",
    "ConditionalAccess/Require multifactor authentication for admins.json",
    "ConditionalAccess/Require multifactor authentication for all users.json",
    "ConditionalAccess/Require multifactor authentication for Azure management.json",
    "ConditionalAccess/Require multifactor authentication for guest access.json",
    "ConditionalAccess/Require multifactor authentication for risky sign-in (all users).json",
    "ConditionalAccess/Require password change for high-risk users.json",
    "ConditionalAccess/Securing security info registration.json",
    "ConditionalAccess/Use application enforced restrictions for unmanaged devices.json",
  ];

  const allPolicies: ConditionalAccessTemplate[] = [];

  for (const file of caFiles) {
    try {
      const response = await fetch(`${TEMPLATES_BASE_PATH}/${file}`);
      if (!response.ok) {
        console.error(`Failed to fetch ${file}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      // CA policy files contain single policy objects
      if (data.displayName) {
        const policy: ConditionalAccessTemplate = {
          ...data,
          state: "disabled", // CA policies are always created in disabled state
        };
        allPolicies.push(policy);
      }
    } catch (error) {
      console.error(`Error fetching ${file}:`, error);
    }
  }

  return allPolicies;
}

/**
 * Fetch app protection policies from local templates
 */
export async function fetchAppProtectionPolicies(): Promise<AppProtectionTemplate[]> {
  const appProtectionFiles = [
    "AppProtection/Android - Baseline - BYOD - App Protection.json",
    "AppProtection/Android-App-Protection.json",
    "AppProtection/iOS - Baseline - BYOD - App Protection.json",
    "AppProtection/iOS-App-Protection.json",
    "AppProtection/level-1-enterprise-basic-data-protection-Android.json",
    "AppProtection/level-1-enterprise-basic-data-protection-iOS.json",
    "AppProtection/level-2-enterprise-enhanced-data-protection-Android.json",
    "AppProtection/level-2-enterprise-enhanced-data-protection-iOS.json",
    "AppProtection/level-3-enterprise-high-data-protection-Android.json",
    "AppProtection/level-3-enterprise-high-data-protection-iOS.json",
  ];

  const allPolicies: AppProtectionTemplate[] = [];

  for (const file of appProtectionFiles) {
    try {
      const response = await fetch(`${TEMPLATES_BASE_PATH}/${file}`);
      if (!response.ok) {
        console.error(`Failed to fetch ${file}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      // App Protection files contain single policy objects, not arrays
      if (data["@odata.type"]) {
        const policy: AppProtectionTemplate = {
          ...data,
          description: data.description
            ? `${data.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        };
        allPolicies.push(policy);
      }
    } catch (error) {
      console.error(`Error fetching ${file}:`, error);
    }
  }

  return allPolicies;
}

/**
 * Fetch enrollment profiles from local templates
 */
export async function fetchEnrollmentProfiles(): Promise<unknown[]> {
  try {
    const response = await fetch(`${TEMPLATES_BASE_PATH}/Enrollment/Autopilot-Profiles.json`);
    if (!response.ok) {
      console.error(`Failed to fetch enrollment profiles: ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data.profiles && Array.isArray(data.profiles)) {
      return data.profiles.map((profile: { description?: string }) => ({
        ...profile,
        description: profile.description
          ? `${profile.description} ${HYDRATION_MARKER}`
          : HYDRATION_MARKER,
      }));
    }

    return [];
  } catch (error) {
    console.error("Error fetching enrollment profiles:", error);
    return [];
  }
}

/**
 * Fetch notification templates from local templates
 */
export async function fetchNotificationTemplates(): Promise<unknown[]> {
  try {
    const response = await fetch(`${TEMPLATES_BASE_PATH}/Notifications/Notification-Templates.json`);
    if (!response.ok) {
      console.error(`Failed to fetch notification templates: ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data.templates && Array.isArray(data.templates)) {
      return data.templates;
    }

    return [];
  } catch (error) {
    console.error("Error fetching notification templates:", error);
    return [];
  }
}

/**
 * Fetch OpenIntuneBaseline policies from local templates
 */
export async function fetchBaselinePolicies(): Promise<unknown[]> {
  // OpenIntuneBaseline is in a separate directory
  // We'll implement this when the baseline structure is finalized
  console.log("OpenIntuneBaseline loading from local files (not yet implemented)");
  return [];
}

/**
 * Cache templates in session storage
 */
export function cacheTemplates(category: string, templates: unknown[]): void {
  try {
    sessionStorage.setItem(
      `intune-hydration-templates-${category}`,
      JSON.stringify({
        templates,
        timestamp: Date.now(),
        version: CACHE_VERSION,
      })
    );
  } catch (error) {
    console.error(`Error caching ${category} templates:`, error);
  }
}

/**
 * Get cached templates from session storage
 * Returns null if cache is expired (> 1 hour) or version mismatch
 */
export function getCachedTemplates(category: string): unknown[] | null {
  try {
    const cached = sessionStorage.getItem(`intune-hydration-templates-${category}`);
    if (!cached) return null;

    const { templates, timestamp, version } = JSON.parse(cached);

    // Check cache version - invalidate if mismatch
    if (version !== CACHE_VERSION) {
      console.log(`[Cache] Invalidating ${category} cache - version mismatch (cached: ${version}, current: ${CACHE_VERSION})`);
      sessionStorage.removeItem(`intune-hydration-templates-${category}`);
      return null;
    }

    // Check age
    const age = Date.now() - timestamp;
    const ONE_HOUR = 60 * 60 * 1000;

    if (age > ONE_HOUR) {
      console.log(`[Cache] Invalidating ${category} cache - expired (age: ${Math.round(age / 60000)} minutes)`);
      sessionStorage.removeItem(`intune-hydration-templates-${category}`);
      return null;
    }

    return templates;
  } catch (error) {
    console.error(`Error reading cached ${category} templates:`, error);
    return null;
  }
}
