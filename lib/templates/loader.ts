/**
 * Template loader for Intune Hydration Kit
 * Loads templates from local IntuneTemplates directory
 */

const TEMPLATES_BASE_PATH = "/IntuneTemplates";
const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

// Cache version - increment this when templates change to invalidate old caches
const CACHE_VERSION = 3; // Updated to fix CIS displayName

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
 * OpenIntuneBaseline manifest types
 */
export interface OIBManifest {
  version: string;
  generatedAt: string;
  totalFiles: number;
  platforms: Array<{
    id: string;
    name: string;
    count: number;
    policyTypes: Array<{
      type: string;
      description: string;
      count: number;
    }>;
  }>;
  files: Array<{
    path: string;
    platform: string;
    policyType: string;
    displayName: string;
  }>;
}

export interface BaselinePolicy {
  "@odata.type"?: string;
  name?: string;
  displayName?: string;
  description?: string;
  platforms?: string;
  technologies?: string;
  settings?: unknown[];
  _oibPlatform: string;
  _oibPolicyType: string;
  _oibFilePath: string;
  [key: string]: unknown;
}

const OIB_PATH = "/IntuneTemplates/OpenIntuneBaseline";

/**
 * Parse JSON that may be UTF-16 LE or UTF-8 encoded
 */
function parseJsonWithEncoding(buffer: ArrayBuffer): unknown {
  const bytes = new Uint8Array(buffer);

  // Check for UTF-16 LE BOM (0xFF 0xFE)
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    // UTF-16 LE with BOM
    const decoder = new TextDecoder("utf-16le");
    const text = decoder.decode(buffer.slice(2));
    const cleanText = text.replace(/\0/g, "");
    return JSON.parse(cleanText);
  }

  // Check for UTF-8 BOM (0xEF 0xBB 0xBF)
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    // UTF-8 with BOM
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer.slice(3));
    return JSON.parse(text);
  }

  // Try UTF-8 first (most common)
  try {
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer);
    return JSON.parse(text);
  } catch {
    // Fallback to UTF-16 LE without BOM
    const decoder = new TextDecoder("utf-16le");
    const text = decoder.decode(buffer);
    const cleanText = text.replace(/\0/g, "");
    return JSON.parse(cleanText);
  }
}

/**
 * Fetch a single OpenIntuneBaseline policy from local templates
 */
async function fetchOIBFile(filePath: string): Promise<unknown | null> {
  try {
    const response = await fetch(`${OIB_PATH}/${filePath}`);
    if (!response.ok) {
      console.error(`Failed to fetch ${filePath}: ${response.statusText}`);
      return null;
    }

    // Get the raw buffer to handle different encodings
    const buffer = await response.arrayBuffer();
    const data = parseJsonWithEncoding(buffer);

    return data;
  } catch (error) {
    console.error(`Error fetching OIB policy ${filePath}:`, error);
    return null;
  }
}

/**
 * Fetch the OpenIntuneBaseline manifest
 */
export async function fetchOIBManifest(): Promise<OIBManifest | null> {
  try {
    const response = await fetch(`${OIB_PATH}/manifest.json`);
    if (!response.ok) {
      console.warn("OpenIntuneBaseline manifest not found. Run: node scripts/generate-oib-manifest.js");
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching OIB manifest:", error);
    return null;
  }
}

/**
 * Fetch OpenIntuneBaseline policies from local templates
 */
export async function fetchBaselinePolicies(): Promise<BaselinePolicy[]> {
  const allPolicies: BaselinePolicy[] = [];

  try {
    const manifest = await fetchOIBManifest();
    if (!manifest) {
      console.warn("OpenIntuneBaseline manifest not found. Run: node scripts/generate-oib-manifest.js");
      return [];
    }

    console.log(`[OIB Loader] Loading ${manifest.totalFiles} baseline policies...`);

    for (const file of manifest.files) {
      const policy = await fetchOIBFile(file.path);
      if (policy && typeof policy === "object") {
        const policyObj = policy as Record<string, unknown>;

        // Get display name from 'name' field (Settings Catalog uses 'name' not 'displayName')
        const displayName = (policyObj.name as string) || (policyObj.displayName as string) || file.displayName;

        allPolicies.push({
          ...policyObj,
          displayName, // Normalize to displayName for consistency
          _oibPlatform: file.platform,
          _oibPolicyType: file.policyType,
          _oibFilePath: file.path,
          description: policyObj.description
            ? `${policyObj.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        });
      }
    }

    console.log(`[OIB Loader] Loaded ${allPolicies.length} baseline policies`);
  } catch (error) {
    console.error("Error fetching OpenIntuneBaseline policies:", error);
  }

  return allPolicies;
}

/**
 * CIS Intune Baselines category structure
 */
export interface CISBaselineCategory {
  name: string;
  path: string;
  subcategories: string[];
}

export const CIS_BASELINE_CATEGORIES: CISBaselineCategory[] = [
  {
    name: "Android Benchmarks",
    path: "1.0 - Android Benchmarks",
    subcategories: ["Android Compliance", "Android Enterprise for Intune"],
  },
  {
    name: "Apple Benchmarks",
    path: "2.0 - Apple Benchmarks",
    subcategories: ["Apple MacOS Compliance", "Apple MacOS for Intune", "Apple iOS Benchmarks", "Apple iOS Compliance"],
  },
  {
    name: "Browser Benchmarks",
    path: "3.0 - Browser Benchmarks",
    subcategories: ["Google Chrome", "Microsoft Edge"],
  },
  {
    name: "CIS Benchmarks",
    path: "4.0 - CIS Benchmarks",
    subcategories: ["CIS -  Intune for Windows 11 Benchmarks", "CIS - Apple Intune for MacOS 15"],
  },
  {
    name: "Linux Benchmarks",
    path: "5.0 - Linux Benchmarks",
    subcategories: ["Linux Compliance"],
  },
  {
    name: "Microsoft Endpoint Security",
    path: "6.0 - Microsoft Endpoint Security Benchmarks",
    subcategories: ["Microsoft Endpoint Security Antivirus", "Microsoft Endpoint Security Firewall"],
  },
  {
    name: "Visual Studio Benchmarks",
    path: "7.0 - Visual Studio Benchmarks",
    subcategories: ["VS Code for Enterprise", "Visual Studio Enterprise 2017", "Visual Studio Enterprise 2019", "Visual Studio Enterprise 2022", "Visual Studio Professional 2017", "Visual Studio Professional 2019", "Visual Studio Professional 2022", "VisualStudio.com"],
  },
  {
    name: "Windows 11 Benchmarks",
    path: "8.0 - Windows 11 Benchmarks",
    subcategories: ["Windows 11 - BitLocker", "Windows 11 - Edge - Machine", "Windows 11 - Intune Benchmarks", "Windows 11 - Microsoft 365 Apps"],
  },
  {
    name: "Windows Cloud PC & AVD",
    path: "9.0 - Windows Cloud PC and AVD",
    subcategories: ["Azure Virtual Desktop", "Windows 365 Cloud PC"],
  },
];

const CIS_BASELINES_PATH = "/CISIntuneBaselines";

/**
 * Parse JSON with automatic encoding detection (UTF-16 LE or UTF-8)
 * Handles BOM markers and tries multiple encodings
 */
function parseJsonWithEncodingForCIS(buffer: ArrayBuffer): unknown {
  const bytes = new Uint8Array(buffer);

  // Check for UTF-16 LE BOM (0xFF 0xFE)
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    const decoder = new TextDecoder("utf-16le");
    const text = decoder.decode(buffer.slice(2));
    const cleanText = text.replace(/\0/g, "");
    return JSON.parse(cleanText);
  }

  // Check for UTF-8 BOM (0xEF 0xBB 0xBF)
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer.slice(3));
    return JSON.parse(text);
  }

  // Try UTF-8 first (most common)
  try {
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer);
    return JSON.parse(text);
  } catch {
    // Fallback to UTF-16 LE without BOM
    const decoder = new TextDecoder("utf-16le");
    const text = decoder.decode(buffer);
    const cleanText = text.replace(/\0/g, "");
    return JSON.parse(cleanText);
  }
}

/**
 * Fetch a single CIS baseline policy from local templates
 */
async function fetchCISBaselineFile(filePath: string): Promise<unknown | null> {
  try {
    // URL-encode the file path to handle special characters
    const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const response = await fetch(`${CIS_BASELINES_PATH}/${encodedPath}`);
    if (!response.ok) {
      console.error(`Failed to fetch ${filePath}: ${response.statusText}`);
      return null;
    }

    // Get the raw buffer to handle UTF-16/UTF-8 encoding
    const buffer = await response.arrayBuffer();
    const data = parseJsonWithEncodingForCIS(buffer);

    return data;
  } catch (error) {
    console.error(`Error fetching CIS baseline ${filePath}:`, error);
    return null;
  }
}

/**
 * Fetch all CIS Intune Baseline policies from local templates
 * Returns an array of policy objects with their category info
 */
export async function fetchCISBaselinePolicies(): Promise<CISBaselinePolicy[]> {
  const allPolicies: CISBaselinePolicy[] = [];

  // We need to fetch the manifest or list of files
  // Since we can't list directories from the browser, we'll use a manifest file
  // For now, return empty and we'll implement the manifest approach

  try {
    const response = await fetch(`${CIS_BASELINES_PATH}/manifest.json`);
    if (!response.ok) {
      console.warn("CIS Baselines manifest not found. Run the build script to generate it.");
      return [];
    }

    const manifest: CISBaselineManifest = await response.json();

    for (const file of manifest.files) {
      const policy = await fetchCISBaselineFile(file.path);
      if (policy && typeof policy === "object") {
        const policyObj = policy as Record<string, unknown>;
        allPolicies.push({
          ...policyObj,
          // Use displayName from manifest, fallback to policy's name or displayName property
          displayName: file.displayName || (policyObj.name as string) || (policyObj.displayName as string),
          _cisCategory: file.category,
          _cisSubcategory: file.subcategory,
          _cisFilePath: file.path,
          description: policyObj.description
            ? `${policyObj.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        });
      }
    }
  } catch (error) {
    console.error("Error fetching CIS baseline policies:", error);
  }

  return allPolicies;
}

export interface CISBaselinePolicy {
  "@odata.type"?: string;
  displayName?: string;
  description?: string;
  _cisCategory: string;
  _cisSubcategory: string;
  _cisFilePath: string;
  [key: string]: unknown;
}

export interface CISBaselineManifestCategory {
  id: string;
  folder: string;
  name: string;
  description: string;
  count: number;
  subcategories: Array<{
    name: string;
    count: number;
  }>;
}

export interface CISBaselineManifest {
  version: string;
  generatedAt: string;
  totalFiles: number;
  categories: CISBaselineManifestCategory[];
  files: Array<{
    path: string;
    category: string;
    subcategory: string;
    displayName: string;
  }>;
}

/**
 * Fetch the CIS baselines manifest (for category selection UI)
 */
export async function fetchCISBaselineManifest(): Promise<CISBaselineManifest | null> {
  try {
    const response = await fetch(`${CIS_BASELINES_PATH}/manifest.json`);
    if (!response.ok) {
      console.warn("CIS Baselines manifest not found. Run the build script to generate it.");
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching CIS baseline manifest:", error);
    return null;
  }
}

/**
 * Fetch CIS Baseline policies filtered by selected category IDs
 */
export async function fetchCISBaselinePoliciesByCategories(
  selectedCategoryIds: string[]
): Promise<CISBaselinePolicy[]> {
  const allPolicies: CISBaselinePolicy[] = [];

  try {
    const manifest = await fetchCISBaselineManifest();
    if (!manifest) return [];

    // Get the folder names for selected category IDs
    const selectedFolders = manifest.categories
      .filter(cat => selectedCategoryIds.includes(cat.id))
      .map(cat => cat.folder);

    // Filter files by selected categories
    const filteredFiles = manifest.files.filter(file =>
      selectedFolders.includes(file.category)
    );

    for (const file of filteredFiles) {
      const policy = await fetchCISBaselineFile(file.path);
      if (policy && typeof policy === "object") {
        const policyObj = policy as Record<string, unknown>;
        allPolicies.push({
          ...policyObj,
          // Use displayName from manifest, fallback to policy's name or displayName property
          displayName: file.displayName || (policyObj.name as string) || (policyObj.displayName as string),
          _cisCategory: file.category,
          _cisSubcategory: file.subcategory,
          _cisFilePath: file.path,
          description: policyObj.description
            ? `${policyObj.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        });
      }
    }
  } catch (error) {
    console.error("Error fetching CIS baseline policies:", error);
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
