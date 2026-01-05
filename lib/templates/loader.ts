/**
 * Template loader for Intune Hydration Kit
 * Fetches real templates from the PowerShell repository
 */

const REPO_BASE_URL = "https://raw.githubusercontent.com/jorgeasaurus/IntuneHydrationKit/main/Templates";
const HYDRATION_MARKER = "Imported by Intune-Hydration-Kit";

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
 * Fetch dynamic groups from PowerShell repository
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
      const response = await fetch(`${REPO_BASE_URL}/${file}`);
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
 * Fetch static groups from PowerShell repository
 */
export async function fetchStaticGroups(): Promise<GroupTemplate[]> {
  try {
    const response = await fetch(`${REPO_BASE_URL}/StaticGroups/Static-Groups.json`);
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
 * Fetch device filters from PowerShell repository
 */
export async function fetchFilters(): Promise<FilterTemplate[]> {
  const filterFiles = [
    "Filters/Autopilot-Filters.json",
    "Filters/Manufacturer-Filters.json",
    "Filters/OS-Filters.json",
    "Filters/Ownership-Filters.json",
  ];

  const allFilters: FilterTemplate[] = [];

  for (const file of filterFiles) {
    try {
      const response = await fetch(`${REPO_BASE_URL}/${file}`);
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
 * Fetch compliance policies from PowerShell repository
 */
export async function fetchCompliancePolicies(): Promise<ComplianceTemplate[]> {
  const complianceFiles = [
    "Compliance/Android-Compliance.json",
    "Compliance/iOS-Compliance.json",
    "Compliance/macOS-Compliance.json",
    "Compliance/Windows-Compliance.json",
  ];

  const allPolicies: ComplianceTemplate[] = [];

  for (const file of complianceFiles) {
    try {
      const response = await fetch(`${REPO_BASE_URL}/${file}`);
      if (!response.ok) {
        console.error(`Failed to fetch ${file}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      if (data.policies && Array.isArray(data.policies)) {
        const policies = data.policies.map((policy: ComplianceTemplate) => ({
          ...policy,
          description: policy.description
            ? `${policy.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        }));
        allPolicies.push(...policies);
      }
    } catch (error) {
      console.error(`Error fetching ${file}:`, error);
    }
  }

  return allPolicies;
}

/**
 * Fetch conditional access policies from PowerShell repository
 */
export async function fetchConditionalAccessPolicies(): Promise<ConditionalAccessTemplate[]> {
  try {
    const response = await fetch(`${REPO_BASE_URL}/ConditionalAccess/CA-Policies.json`);
    if (!response.ok) {
      console.error(`Failed to fetch CA policies: ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data.policies && Array.isArray(data.policies)) {
      // CA policies are created in disabled state
      return data.policies.map((policy: ConditionalAccessTemplate) => ({
        ...policy,
        state: "disabled",
      }));
    }

    return [];
  } catch (error) {
    console.error("Error fetching CA policies:", error);
    return [];
  }
}

/**
 * Fetch app protection policies from PowerShell repository
 */
export async function fetchAppProtectionPolicies(): Promise<AppProtectionTemplate[]> {
  const appProtectionFiles = [
    "AppProtection/Android-App-Protection.json",
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
      const response = await fetch(`${REPO_BASE_URL}/${file}`);
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
 * Fetch enrollment profiles from PowerShell repository
 */
export async function fetchEnrollmentProfiles(): Promise<unknown[]> {
  try {
    const response = await fetch(`${REPO_BASE_URL}/Enrollment/Autopilot-Profiles.json`);
    if (!response.ok) {
      console.error(`Failed to fetch enrollment profiles: ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data.profiles && Array.isArray(data.profiles)) {
      return data.profiles;
    }

    return [];
  } catch (error) {
    console.error("Error fetching enrollment profiles:", error);
    return [];
  }
}

/**
 * Fetch OpenIntuneBaseline policies from GitHub
 * Uses the baseline config from wizard state
 */
export async function fetchBaselinePolicies(
  repoUrl: string = "https://github.com/SkipToTheEndpoint/OpenIntuneBaseline",
  branch: string = "main"
): Promise<unknown[]> {
  // Extract owner and repo from GitHub URL
  const urlParts = repoUrl.replace("https://github.com/", "").split("/");
  if (urlParts.length < 2) {
    throw new Error("Invalid GitHub repository URL");
  }
  const [owner, repo] = urlParts;

  const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

  const platforms = ["Windows", "macOS", "iOS", "Android"];
  const allPolicies: unknown[] = [];

  for (const platform of platforms) {
    try {
      // Fetch the platform directory to get list of JSON files
      const response = await fetch(`${baseUrl}/${platform}/`);
      if (!response.ok) {
        console.error(`Failed to fetch ${platform} baseline: ${response.statusText}`);
        continue;
      }

      // Note: We can't list directory contents via raw.githubusercontent.com
      // We need to use GitHub API or fetch known file names
      // For now, we'll return placeholder data
      console.log(`Baseline policies for ${platform} would be fetched from ${baseUrl}/${platform}/`);

    } catch (error) {
      console.error(`Error fetching ${platform} baseline:`, error);
    }
  }

  return allPolicies;
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
      })
    );
  } catch (error) {
    console.error(`Error caching ${category} templates:`, error);
  }
}

/**
 * Get cached templates from session storage
 * Returns null if cache is expired (> 1 hour)
 */
export function getCachedTemplates(category: string): unknown[] | null {
  try {
    const cached = sessionStorage.getItem(`intune-hydration-templates-${category}`);
    if (!cached) return null;

    const { templates, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    const ONE_HOUR = 60 * 60 * 1000;

    if (age > ONE_HOUR) {
      sessionStorage.removeItem(`intune-hydration-templates-${category}`);
      return null;
    }

    return templates;
  } catch (error) {
    console.error(`Error reading cached ${category} templates:`, error);
    return null;
  }
}
