/* oxlint-disable react-doctor/async-await-in-loop -- template loading preserves manifest order and per-file fallback behavior. */
/**
 * Template loader for Intune Hydration Kit
 * Loads templates from local IntuneTemplates directory
 */

import { HYDRATION_MARKER, IMPORT_PREFIX, addImportPrefix } from "@/lib/utils/hydrationMarker";
import { DEVICE_FILTER_TEMPLATE_PATHS } from "@/templates/filterManifest";
import { DYNAMIC_GROUP_TEMPLATE_PATHS } from "@/templates/groupManifest";
import type { DeviceFilter } from "@/types/graph";

const TEMPLATES_BASE_PATH = "/IntuneTemplates";

export interface GroupTemplate {
  displayName: string;
  description: string;
  membershipRule?: string; // Optional for static/assigned groups
  isStaticGroup?: boolean; // Flag to indicate this is a static group
}

export interface FilterTemplate {
  displayName: string;
  description: string;
  platform: DeviceFilter["platform"];
  rule: string;
}

type RawFilterTemplate = Omit<FilterTemplate, "platform"> & { platform: string };

interface RawJsonTemplate extends Record<string, unknown> {
  "@odata.type"?: string;
  description?: string;
  displayName?: string;
  filters?: RawFilterTemplate[];
  groups?: GroupTemplate[];
  name?: string;
  platforms?: string;
}

interface JsonFileLoaderOptions {
  basePath?: string;
  fileLabel?: string;
  warn?: boolean;
}

async function loadJsonTemplateFiles<T>(
  files: readonly string[],
  normalize: (template: RawJsonTemplate, file: string) => T[],
  options: JsonFileLoaderOptions = {}
): Promise<T[]> {
  const templates: T[] = [];
  const basePath = options.basePath ?? TEMPLATES_BASE_PATH;

  for (const file of files) {
    const fileLabel = options.fileLabel ? `${options.fileLabel} ${file}` : file;

    try {
      const response = await fetch(`${basePath}/${file}`);
      if (!response.ok) {
        const message = `Failed to fetch ${fileLabel}: HTTP ${response.status} ${response.statusText}`;
        if (options.warn) console.warn(message);
        else console.error(message);
        continue;
      }

      templates.push(...normalize(await response.json(), file));
    } catch (error) {
      const message = `Error loading ${fileLabel}:`;
      if (options.warn) console.warn(message, error);
      else console.error(message, error);
    }
  }

  return templates;
}

function normalizeFilterPlatform(platform: string): FilterTemplate["platform"] {
  switch (platform) {
    case "androidForWork":
      return "android";
    case "android":
    case "iOS":
    case "macOS":
    case "windows10AndLater":
      return platform;
    default:
      throw new Error(`Unsupported device filter platform: ${platform}`);
  }
}

export interface ComplianceTemplate {
  "@odata.type"?: string;
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

function getTemplateFileName(filePath: string): string {
  return filePath.split("/").pop()?.replace(/\.json$/i, "") ?? filePath;
}

/**
 * Fetch dynamic groups from local templates
 */
export async function fetchDynamicGroups(): Promise<GroupTemplate[]> {
  return loadJsonTemplateFiles(DYNAMIC_GROUP_TEMPLATE_PATHS, (data) =>
    Array.isArray(data.groups)
      ? data.groups.map((group) => ({
          ...group,
          displayName: group.displayName.startsWith(IMPORT_PREFIX)
            ? group.displayName
            : `${IMPORT_PREFIX}${group.displayName}`,
          description: group.description
            ? group.description.includes(HYDRATION_MARKER)
              ? group.description
              : `${group.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
        }))
      : []
  );
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
        displayName: group.displayName.startsWith(IMPORT_PREFIX)
          ? group.displayName
          : `${IMPORT_PREFIX}${group.displayName}`,
        description: group.description
          ? group.description.includes(HYDRATION_MARKER)
            ? group.description
            : `${group.description} ${HYDRATION_MARKER}`
          : HYDRATION_MARKER,
        isStaticGroup: true, // Mark as static group (assigned membership, not dynamic)
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
  return loadJsonTemplateFiles(DEVICE_FILTER_TEMPLATE_PATHS, (data) =>
    Array.isArray(data.filters)
      ? data.filters.map((filter) => ({
          ...filter,
          displayName: addImportPrefix(filter.displayName),
          description: filter.description
            ? filter.description.includes(HYDRATION_MARKER)
              ? filter.description
              : `${filter.description} ${HYDRATION_MARKER}`
            : HYDRATION_MARKER,
          platform: normalizeFilterPlatform(filter.platform),
        }))
      : []
  );
}

/**
 * Fetch compliance policies from local templates
 */
export async function fetchCompliancePolicies(): Promise<ComplianceTemplate[]> {
  const complianceFiles = [
    "Compliance/Android-Compliance-FullyManaged-Basic.json",
    "Compliance/Android-Compliance-FullyManaged-Strict.json",
    "Compliance/Windows-Compliance-Policy.json",
    "Compliance/Windows-Custom-Compliance.json",
    "Compliance/iOS-Compliance-Basic.json",
    "Compliance/iOS-Compliance-Strict.json",
    "Compliance/macOS-Compliance-Basic.json",
    "Compliance/macOS-Compliance-Strict.json",
    "Compliance/Linux-Compliance-Basic.json",
    "Compliance/Linux-Compliance-Strict.json",
  ];

  return loadJsonTemplateFiles(complianceFiles, (data) => {
    // Compliance files contain single policy objects
    // Some use @odata.type (Windows, iOS, macOS, Android), others use platforms/technologies (Linux)
    if (data["@odata.type"] || data.platforms) {
      const policy: ComplianceTemplate = {
        ...data,
        displayName: `${IMPORT_PREFIX}${data.displayName ?? ""}`,
        description: data.description
          ? `${data.description} ${HYDRATION_MARKER}`
          : HYDRATION_MARKER,
      };
      return [policy];
    }

    return [];
  });
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
    "ConditionalAccess/Require multifactor authentication for Microsoft admin portals.json",
    "ConditionalAccess/Require multifactor authentication for admins.json",
    "ConditionalAccess/Require multifactor authentication for all users.json",
    "ConditionalAccess/Require multifactor authentication for Azure management.json",
    "ConditionalAccess/Require multifactor authentication for guest access.json",
    "ConditionalAccess/Require multifactor authentication for risky sign-ins.json",
    "ConditionalAccess/Require password change for high-risk users.json",
    "ConditionalAccess/Require phishing-resistant multifactor authentication for admins.json",
    "ConditionalAccess/Securing security info registration.json",
    "ConditionalAccess/Use application enforced restrictions for O365 apps.json",
  ];

  return loadJsonTemplateFiles(caFiles, (data, file) => {
    const displayName = data.displayName ?? getTemplateFileName(file);

    // CA policy files contain single policy objects
    if (displayName) {
      const policy: ConditionalAccessTemplate = {
        ...data,
        displayName: `${IMPORT_PREFIX}${displayName}`,
        state: "disabled", // CA policies are always created in disabled state
        conditions: data.conditions,
        grantControls: data.grantControls,
        sessionControls: data.sessionControls,
      };
      return [policy];
    }

    return [];
  });
}

/**
 * Fetch app protection policies from local templates
 */
export async function fetchAppProtectionPolicies(): Promise<AppProtectionTemplate[]> {
  const appProtectionFiles = [
    "AppProtection/Android-App-Protection.json",
    "AppProtection/iOS-App-Protection.json",
    "AppProtection/Android - Baseline - BYOD - App Protection.json",
    "AppProtection/iOS - Baseline - BYOD - App Protection.json",
    "AppProtection/level-1-enterprise-basic-data-protection-Android.json",
    "AppProtection/level-1-enterprise-basic-data-protection-iOS.json",
    "AppProtection/level-2-enterprise-enhanced-data-protection-Android.json",
    "AppProtection/level-2-enterprise-enhanced-data-protection-iOS.json",
    "AppProtection/level-3-enterprise-high-data-protection-Android.json",
    "AppProtection/level-3-enterprise-high-data-protection-iOS.json",
  ];

  return loadJsonTemplateFiles(appProtectionFiles, (data) => {
    // App Protection files contain single policy objects, not arrays
    if (data["@odata.type"]) {
      const policy: AppProtectionTemplate = {
        ...data,
        "@odata.type": data["@odata.type"],
        displayName: `${IMPORT_PREFIX}${data.displayName ?? ""}`,
        description: data.description
          ? `${data.description} ${HYDRATION_MARKER}`
          : HYDRATION_MARKER,
      };
      return [policy];
    }

    return [];
  });
}

/**
 * Fetch enrollment profiles from local templates
 */
export async function fetchEnrollmentProfiles(): Promise<unknown[]> {
  const enrollmentFiles = [
    "Windows-Autopilot-Profile.json",
    "Windows-Self-Deploy-Autopilot-Profile.json",
    "Windows-ESP-Profile.json",
    "Windows-Autopilot-Device-Preparation-UserDriven.json",
  ];

  return loadJsonTemplateFiles(
    enrollmentFiles,
    (profile) => {
      // Device Preparation uses "name" instead of "displayName"
      const nameField = profile.displayName ? "displayName" : "name";
      return [{
        ...profile,
        [nameField]: `${IMPORT_PREFIX}${profile[nameField] ?? ""}`,
        description: profile.description
          ? `${profile.description} ${HYDRATION_MARKER}`
          : HYDRATION_MARKER,
      }];
    },
    {
      basePath: `${TEMPLATES_BASE_PATH}/Enrollment`,
      fileLabel: "enrollment profile",
      warn: true,
    }
  );
}

/**
 * Fetch notification templates from local templates
 */
export async function fetchNotificationTemplates(): Promise<unknown[]> {
  const notificationFiles = [
    "Notifications/First-Warning.json",
  ];

  return loadJsonTemplateFiles(notificationFiles, (data) => {
    if (data.displayName) {
      return [
        {
          ...data,
          displayName: `${IMPORT_PREFIX}${data.displayName}`,
        },
      ];
    }

    return [];
  });
}

/**
 * OpenIntuneBaseline manifest types
 */
export interface OIBManifest {
  totalFiles: number;
  platforms: Array<{
    id: string;
    name: string;
    count: number;
  }>;
  files: OIBManifestFile[];
}

export interface OIBManifestFile {
  path: string;
  platform: string;
  policyType: string;
  displayName: string;
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
const OIB_POLICY_TYPE_FOLDERS = new Set([
  "SettingsCatalog",
  "CompliancePolicies",
  "AppProtection",
  "DeviceConfiguration",
  "UpdatePolicies",
  "DriverUpdateProfiles",
]);

interface StoredManifestFile {
  path: string;
  displayName: string;
}

interface StoredOIBManifest extends Omit<OIBManifest, "files"> {
  files: StoredManifestFile[];
}

function getManifestPathParts(filePath: string): string[] {
  return filePath.replace(/\\/g, "/").split("/");
}

function enrichOIBManifestFile(file: StoredManifestFile): OIBManifestFile {
  const pathParts = getManifestPathParts(file.path);

  return {
    ...file,
    platform: pathParts[0] ?? "",
    policyType:
      pathParts.slice(1, -1).find((part) => OIB_POLICY_TYPE_FOLDERS.has(part)) ?? "",
  };
}

/**
 * Parse JSON that may be UTF-16 LE or UTF-8 encoded
 * Handles BOM markers and tries multiple encodings
 */
function parseJsonWithEncoding(buffer: ArrayBuffer): unknown {
  const bytes = new Uint8Array(buffer);

  // Check for UTF-16 LE BOM (0xFF 0xFE)
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    const decoder = new TextDecoder("utf-16le");
    const text = decoder.decode(buffer.slice(2));
    return JSON.parse(text.replace(/\0/g, ""));
  }

  // Check for UTF-8 BOM (0xEF 0xBB 0xBF)
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    const decoder = new TextDecoder("utf-8");
    return JSON.parse(decoder.decode(buffer.slice(3)));
  }

  // Try UTF-8 first (most common)
  try {
    const decoder = new TextDecoder("utf-8");
    return JSON.parse(decoder.decode(buffer));
  } catch {
    // Fallback to UTF-16 LE without BOM
    const decoder = new TextDecoder("utf-16le");
    const text = decoder.decode(buffer);
    return JSON.parse(text.replace(/\0/g, ""));
  }
}

/**
 * Fetch a single OpenIntuneBaseline policy from local templates
 */
async function fetchOIBFile(filePath: string): Promise<unknown | null> {
  try {
    const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const response = await fetch(`${OIB_PATH}/${encodedPath}`);
    if (!response.ok) {
      console.error(`Failed to fetch ${filePath}: ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    return parseJsonWithEncoding(buffer);
  } catch (error) {
    console.error(`Error fetching OIB policy ${filePath}:`, error);
    return null;
  }
}

function transformOIBPolicy(
  policyObj: Record<string, unknown>,
  file: OIBManifestFile
): BaselinePolicy {
  const displayName =
    (policyObj.name as string) ||
    (policyObj.displayName as string) ||
    file.displayName;

  const prefixedName = addImportPrefix(displayName);

  return {
    ...policyObj,
    ...(policyObj.name ? { name: addImportPrefix(policyObj.name as string) } : {}),
    displayName: prefixedName,
    _oibPlatform: file.platform,
    _oibPolicyType: file.policyType,
    _oibFilePath: file.path,
    description: policyObj.description
      ? `${policyObj.description} ${HYDRATION_MARKER}`
      : HYDRATION_MARKER,
  };
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
    const manifest = await response.json() as StoredOIBManifest;
    return {
      ...manifest,
      files: manifest.files.map(enrichOIBManifestFile),
    };
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
      const policy = await fetchBaselinePolicyByManifestFile(file);
      if (policy) {
        allPolicies.push(policy);
      }
    }

    console.log(`[OIB Loader] Loaded ${allPolicies.length} baseline policies`);
  } catch (error) {
    console.error("Error fetching OpenIntuneBaseline policies:", error);
  }

  return allPolicies;
}

export async function fetchBaselinePolicyByManifestFile(
  file: OIBManifestFile
): Promise<BaselinePolicy | null> {
  const policy = await fetchOIBFile(file.path);
  if (!policy || typeof policy !== "object") {
    return null;
  }

  return transformOIBPolicy(policy as Record<string, unknown>, file);
}

const CIS_BASELINES_PATH = "/CISIntuneBaselines";

/**
 * Fetch a single CIS baseline policy from local templates
 */
async function fetchCISBaselineFile(filePath: string): Promise<unknown | null> {
  try {
    const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const response = await fetch(`${CIS_BASELINES_PATH}/${encodedPath}`);
    if (!response.ok) {
      console.error(`Failed to fetch ${filePath}: ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    return parseJsonWithEncoding(buffer);
  } catch (error) {
    console.error(`Error fetching CIS baseline ${filePath}:`, error);
    return null;
  }
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
}

export interface CISBaselineManifest {
  totalFiles: number;
  categories: CISBaselineManifestCategory[];
  files: CISBaselineManifestFile[];
}

export interface CISBaselineManifestFile {
  path: string;
  category: string;
  subcategory: string;
  displayName: string;
}

interface StoredCISBaselineManifest extends Omit<CISBaselineManifest, "files"> {
  files: StoredManifestFile[];
}

function enrichCISManifestFile(file: StoredManifestFile): CISBaselineManifestFile {
  const pathParts = getManifestPathParts(file.path);

  return {
    ...file,
    category: pathParts[0] ?? "",
    subcategory: pathParts[1] ?? "",
  };
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
    const manifest = await response.json() as StoredCISBaselineManifest;
    return {
      ...manifest,
      files: manifest.files.map(enrichCISManifestFile),
    };
  } catch (error) {
    console.error("Error fetching CIS baseline manifest:", error);
    return null;
  }
}

/**
 * Build CISBaselinePolicy objects from manifest file entries by fetching and transforming each policy
 */
async function loadCISPoliciesFromFiles(
  files: CISBaselineManifestFile[]
): Promise<CISBaselinePolicy[]> {
  const policies: CISBaselinePolicy[] = [];

  for (const file of files) {
    const policy = await fetchCISBaselinePolicyByManifestFile(file);
    if (policy) {
      policies.push(policy);
    }
  }

  return policies;
}

function transformCISPolicy(
  policyObj: Record<string, unknown>,
  file: CISBaselineManifestFile
): CISBaselinePolicy {
  const resolvedName =
    (policyObj.name as string) ||
    (policyObj.displayName as string) ||
    file.displayName;

  return {
    ...policyObj,
    displayName: `${IMPORT_PREFIX}${resolvedName}`,
    name: `${IMPORT_PREFIX}${resolvedName}`,
    _cisCategory: file.category,
    _cisSubcategory: file.subcategory,
    _cisFilePath: file.path,
    description: policyObj.description
      ? `${policyObj.description} ${HYDRATION_MARKER}`
      : HYDRATION_MARKER,
  };
}

export async function fetchCISBaselinePolicyByManifestFile(
  file: CISBaselineManifestFile
): Promise<CISBaselinePolicy | null> {
  const policy = await fetchCISBaselineFile(file.path);
  if (!policy || typeof policy !== "object") {
    return null;
  }

  return transformCISPolicy(policy as Record<string, unknown>, file);
}

/**
 * Fetch all CIS Intune Baseline policies from local templates
 */
export async function fetchCISBaselinePolicies(): Promise<CISBaselinePolicy[]> {
  try {
    const manifest = await fetchCISBaselineManifest();
    if (!manifest) return [];
    return await loadCISPoliciesFromFiles(manifest.files);
  } catch (error) {
    console.error("Error fetching CIS baseline policies:", error);
    return [];
  }
}

/**
 * Fetch CIS Baseline policies filtered by selected category IDs
 */
export async function fetchCISBaselinePoliciesByCategories(
  selectedCategoryIds: string[]
): Promise<CISBaselinePolicy[]> {
  try {
    const manifest = await fetchCISBaselineManifest();
    if (!manifest) return [];

    const selectedCategoryIdSet = new Set(selectedCategoryIds);
    const selectedFolders = manifest.categories.reduce<string[]>((folders, category) => {
      if (selectedCategoryIdSet.has(category.id)) {
        folders.push(category.folder);
      }
      return folders;
    }, []);
    const selectedFolderSet = new Set(selectedFolders);

    const filteredFiles = manifest.files.filter(file =>
      selectedFolderSet.has(file.category)
    );

    return await loadCISPoliciesFromFiles(filteredFiles);
  } catch (error) {
    console.error("Error fetching CIS baseline policies:", error);
    return [];
  }
}

const TEMPLATE_CACHE_PREFIX = "intune-hydration-templates-";
const templateCache = new Map<string, unknown[]>();

export function cacheTemplates(category: string, templates: unknown[]): void {
  templateCache.set(`${TEMPLATE_CACHE_PREFIX}${category}`, templates);
}

export function getCachedTemplates(category: string): unknown[] | null {
  return templateCache.get(`${TEMPLATE_CACHE_PREFIX}${category}`) ?? null;
}

export function clearCategoryCache(category: string): void {
  templateCache.delete(`${TEMPLATE_CACHE_PREFIX}${category}`);
}

export function getAllTemplateCacheKeys(): string[] {
  return Array.from(templateCache.keys());
}
