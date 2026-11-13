import oibManifest from "@/public/IntuneTemplates/OpenIntuneBaseline/manifest.json";
import {
  fetchAppProtectionPolicies,
  fetchBaselinePolicyByManifestFile,
  fetchCISBaselineManifest,
  fetchCISBaselinePolicyByManifestFile,
  fetchCompliancePolicies,
  fetchConditionalAccessPolicies,
  fetchDynamicGroups,
  fetchEnrollmentProfiles,
  fetchFilters,
  fetchNotificationTemplates,
  fetchOIBManifest,
  fetchStaticGroups,
  CISBaselineManifestFile,
  OIBManifestFile,
} from "@/lib/templates/loader";
import { IMPORT_PREFIX } from "@/lib/utils/hydrationMarker";
import { getWin32AppTemplates, NOT_OFFERED_WINGET_APPS } from "@/templates/win32Apps";
import type { Win32AppTemplate } from "@/templates/win32Apps";
import { TaskCategory } from "@/types/hydration";

export interface TemplateDocumentationCategorySummary {
  id: TaskCategory;
  label: string;
  description: string;
  count: number;
}

type InlinePayloadSource = {
  kind: "inline";
  payload: unknown;
};

type OIBPayloadSource = {
  kind: "oib";
  file: OIBManifestFile;
};

type CISPayloadSource = {
  kind: "cis";
  file: CISBaselineManifestFile;
};

type Win32PayloadSource = {
  kind: "win32";
  template: Win32AppTemplate;
};

export type TemplateDocumentationPayloadSource =
  | InlinePayloadSource
  | OIBPayloadSource
  | CISPayloadSource
  | Win32PayloadSource;

export interface TemplateDocumentationItem {
  id: string;
  /** URL-safe, unique id of the detail page at /templates/{slug}. */
  slug: string;
  category: TaskCategory;
  categoryLabel: string;
  displayName: string;
  description: string;
  subcategory?: string;
  platform?: TemplatePlatform;
  itemType: string;
  sourcePath?: string;
  payloadSource: TemplateDocumentationPayloadSource;
}

/** A catalog item before the catalog assigns its unique slug. */
type TemplateDocumentationItemDraft = Omit<TemplateDocumentationItem, "slug">;

export interface TemplateDocumentationCatalog {
  items: TemplateDocumentationItem[];
  categories: TemplateDocumentationCategorySummary[];
  totalCount: number;
}

export const TEMPLATE_DOCUMENTATION_CATEGORY_ORDER = [
  "groups",
  "filters",
  "compliance",
  "appProtection",
  "win32Apps",
  "conditionalAccess",
  "enrollment",
  "notification",
  "baseline",
  "cisBaseline",
] as const satisfies readonly TaskCategory[];

const CATEGORY_METADATA: Record<
  TaskCategory,
  { label: string; description: string }
> = {
  groups: {
    label: "Groups",
    description: "Dynamic and assigned Entra groups used for targeting and organization.",
  },
  filters: {
    label: "Device Filters",
    description: "Assignment filters that narrow policy scope by platform or device characteristics.",
  },
  compliance: {
    label: "Compliance Policies",
    description: "Device compliance templates that evaluate platform-specific security posture.",
  },
  appProtection: {
    label: "App Protection",
    description: "Mobile application management templates for Android and iOS/iPadOS.",
  },
  win32Apps: {
    label: "Win32 Apps",
    description:
      "Packaged Windows applications that install through Intune. WinGet catalog apps are opt-in. " +
      `Not offered, because no catalog version has a machine-scope x64 installer: ${NOT_OFFERED_WINGET_APPS.map((app) => app.displayName).join(", ")}.`,
  },
  conditionalAccess: {
    label: "Conditional Access",
    description: "Conditional Access starter policies, imported in a disabled state.",
  },
  enrollment: {
    label: "Enrollment",
    description: "Autopilot, ESP, and device preparation profiles used during onboarding.",
  },
  notification: {
    label: "Notifications",
    description: "Notification templates used by compliance and remediation workflows.",
  },
  baseline: {
    label: "OpenIntuneBaseline",
    description: `Baseline v${oibManifest.windowsVersion} includes macOS, Windows, and BYOD policies.`,
  },
  cisBaseline: {
    label: "CIS Baselines",
    description: "CIS benchmark payloads indexed from the local CIS manifest.",
  },
};

/**
 * Canonical platform labels for the /templates Platform filter, in display
 * order. Every catalog item has one of these values or no platform.
 */
export const TEMPLATE_PLATFORMS = [
  "Windows",
  "macOS",
  "iOS/iPadOS",
  "Android",
  "Linux",
  "Identity",
] as const;

export type TemplatePlatform = (typeof TEMPLATE_PLATFORMS)[number];

/** Graph device filter platform values mapped to canonical labels. */
const FILTER_PLATFORM_LABELS: Record<string, TemplatePlatform> = {
  android: "Android",
  androidForWork: "Android",
  iOS: "iOS/iPadOS",
  macOS: "macOS",
  windows10AndLater: "Windows",
};

/**
 * OIB manifest platform folders mapped to canonical labels. BYOD holds
 * Android and iOS app protection, so its platform comes from the file name.
 */
const OIB_PLATFORM_LABELS: Record<string, TemplatePlatform> = {
  WINDOWS: "Windows",
  MACOS: "macOS",
  WINDOWS365: "Windows",
};

function inlinePayloadSource(payload: unknown): InlinePayloadSource {
  return {
    kind: "inline",
    payload,
  };
}

function oibPayloadSource(file: OIBManifestFile): OIBPayloadSource {
  return {
    kind: "oib",
    file,
  };
}

function cisPayloadSource(file: CISBaselineManifestFile): CISPayloadSource {
  return {
    kind: "cis",
    file,
  };
}

function win32PayloadSource(template: Win32AppTemplate): Win32PayloadSource {
  return {
    kind: "win32",
    template,
  };
}

async function fetchScriptContent(url: string, label: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Unable to load the ${label} from ${url}: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

function createItemId(category: TaskCategory, seed: string): string {
  return `${category}:${seed}`;
}

function sortItems(items: TemplateDocumentationItemDraft[]): TemplateDocumentationItemDraft[] {
  return items.toSorted((left, right) => {
    const categoryDiff =
      TEMPLATE_DOCUMENTATION_CATEGORY_ORDER.indexOf(left.category) -
      TEMPLATE_DOCUMENTATION_CATEGORY_ORDER.indexOf(right.category);
    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}

function getCategorySummary(
  category: TaskCategory,
  items: TemplateDocumentationItem[]
): TemplateDocumentationCategorySummary {
  return {
    id: category,
    label: CATEGORY_METADATA[category].label,
    description: CATEGORY_METADATA[category].description,
    count: items.length,
  };
}

function detectPlatform(value: string): TemplatePlatform | undefined {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("iphone") ||
    normalized.includes("ipad") ||
    normalized.includes("ios")
  ) {
    return "iOS/iPadOS";
  }

  if (normalized.includes("android")) {
    return "Android";
  }

  if (normalized.includes("macos") || normalized.includes(" mac ")) {
    return "macOS";
  }

  if (
    normalized.includes("windows") ||
    normalized.includes("win10") ||
    normalized.includes("win11") ||
    normalized.includes("cloud pc")
  ) {
    return "Windows";
  }

  if (normalized.includes("linux")) {
    return "Linux";
  }

  if (
    normalized.includes("admin") ||
    normalized.includes("authentication") ||
    normalized.includes("sign-in") ||
    normalized.includes("guest")
  ) {
    return "Identity";
  }

  return undefined;
}

function pickPlatform(
  ...values: Array<string | undefined>
): TemplatePlatform | undefined {
  const detected =
    values
      .map((value) => (value ? detectPlatform(value) : undefined))
      .find(Boolean) ?? undefined;

  return detected;
}

function formatGraphType(value: string | undefined): string {
  if (!value) {
    return "Template";
  }

  return value
    .replace("#microsoft.graph.", "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function normalizeDescription(
  description: string | undefined,
  fallback: string
): string {
  const trimmed = description?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export async function loadTemplateDocumentationCatalog(): Promise<TemplateDocumentationCatalog> {
  const [
    dynamicGroups,
    staticGroups,
    filters,
    compliancePolicies,
    conditionalAccessPolicies,
    appProtectionPolicies,
    enrollmentProfiles,
    notificationTemplates,
    oibManifest,
    cisManifest,
  ] = await Promise.all([
    fetchDynamicGroups(),
    fetchStaticGroups(),
    fetchFilters(),
    fetchCompliancePolicies(),
    fetchConditionalAccessPolicies(),
    fetchAppProtectionPolicies(),
    fetchEnrollmentProfiles(),
    fetchNotificationTemplates(),
    fetchOIBManifest(),
    fetchCISBaselineManifest(),
  ]);

  const oibSourceLabels: Record<string, string> = Object.fromEntries(
    (oibManifest?.platforms ?? []).map((platform) => [platform.id, platform.name])
  );

  const groupItems: TemplateDocumentationItemDraft[] = [
    ...dynamicGroups.map((group) => ({
      id: createItemId("groups", group.displayName),
      category: "groups" as const,
      categoryLabel: CATEGORY_METADATA.groups.label,
      displayName: group.displayName,
      description: normalizeDescription(
        group.description,
        "Dynamic Entra group imported by Intune Hydration Kit."
      ),
      subcategory: "Dynamic Group",
      platform: pickPlatform(group.displayName, group.description, group.membershipRule),
      itemType: "Dynamic Group",
      payloadSource: inlinePayloadSource(group),
    })),
    ...staticGroups.map((group) => ({
      id: createItemId("groups", group.displayName),
      category: "groups" as const,
      categoryLabel: CATEGORY_METADATA.groups.label,
      displayName: group.displayName,
      description: normalizeDescription(
        group.description,
        "Assigned Entra group imported by Intune Hydration Kit."
      ),
      subcategory: "Assigned Group",
      platform: pickPlatform(group.displayName, group.description),
      itemType: "Assigned Group",
      payloadSource: inlinePayloadSource(group),
    })),
  ];

  const filterItems: TemplateDocumentationItemDraft[] = filters.map((filter) => ({
    id: createItemId("filters", filter.displayName),
    category: "filters",
    categoryLabel: CATEGORY_METADATA.filters.label,
    displayName: filter.displayName,
    description: normalizeDescription(
      filter.description,
      "Device assignment filter imported by Intune Hydration Kit."
    ),
    platform:
      FILTER_PLATFORM_LABELS[filter.platform] ??
      pickPlatform(filter.platform, filter.displayName),
    itemType: "Assignment Filter",
    payloadSource: inlinePayloadSource(filter),
  }));

  const complianceItems: TemplateDocumentationItemDraft[] = compliancePolicies.map((policy) => ({
    id: createItemId("compliance", policy.displayName),
    category: "compliance",
    categoryLabel: CATEGORY_METADATA.compliance.label,
    displayName: policy.displayName,
    description: normalizeDescription(
      policy.description,
      "Compliance policy imported by Intune Hydration Kit."
    ),
    platform: pickPlatform(policy.displayName, policy.description, policy["@odata.type"]),
    itemType: formatGraphType(policy["@odata.type"]),
    payloadSource: inlinePayloadSource(policy),
  }));

  const conditionalAccessItems: TemplateDocumentationItemDraft[] =
    conditionalAccessPolicies.map((policy) => ({
      id: createItemId("conditionalAccess", policy.displayName),
      category: "conditionalAccess",
      categoryLabel: CATEGORY_METADATA.conditionalAccess.label,
      displayName: policy.displayName,
      description:
        "Conditional Access starter policy. Imported disabled so you can review before enabling.",
      platform: pickPlatform(policy.displayName),
      itemType: "Conditional Access Policy",
      subcategory: "Disabled on import",
      payloadSource: inlinePayloadSource(policy),
    }));

  const appProtectionItems: TemplateDocumentationItemDraft[] =
    appProtectionPolicies.map((policy) => ({
      id: createItemId("appProtection", policy.displayName),
      category: "appProtection",
      categoryLabel: CATEGORY_METADATA.appProtection.label,
      displayName: policy.displayName,
      description: normalizeDescription(
        policy.description,
        "App protection policy imported by Intune Hydration Kit."
      ),
      platform: pickPlatform(policy.displayName, policy.description, policy["@odata.type"]),
      itemType: formatGraphType(policy["@odata.type"]),
      payloadSource: inlinePayloadSource(policy),
    }));

  const enrollmentItems: TemplateDocumentationItemDraft[] = (
    enrollmentProfiles as Array<Record<string, unknown>>
  ).map((profile) => {
    const displayName =
      (profile.displayName as string | undefined) ??
      (profile.name as string | undefined) ??
      "Unnamed Enrollment Profile";

    return {
      id: createItemId("enrollment", displayName),
      category: "enrollment" as const,
      categoryLabel: CATEGORY_METADATA.enrollment.label,
      displayName,
      description: normalizeDescription(
        profile.description as string | undefined,
        "Enrollment profile imported by Intune Hydration Kit."
      ),
      platform: pickPlatform(displayName, profile["@odata.type"] as string | undefined) ?? "Windows",
      itemType: formatGraphType(profile["@odata.type"] as string | undefined) || "Enrollment Profile",
      payloadSource: inlinePayloadSource(profile),
    };
  });

  const notificationItems: TemplateDocumentationItemDraft[] = (
    notificationTemplates as Array<Record<string, unknown>>
  ).map((template) => {
    const displayName =
      (template.displayName as string | undefined) ?? "Notification Template";

    return {
      id: createItemId("notification", displayName),
      category: "notification" as const,
      categoryLabel: CATEGORY_METADATA.notification.label,
      displayName,
      description: "Compliance notification template bundled with the web app.",
      itemType: "Notification Template",
      payloadSource: inlinePayloadSource(template),
    };
  });

  const win32AppItems: TemplateDocumentationItemDraft[] = getWin32AppTemplates().map((app) => ({
    id: createItemId("win32Apps", app.id),
    category: "win32Apps",
    categoryLabel: CATEGORY_METADATA.win32Apps.label,
    displayName: app.displayName,
    description: normalizeDescription(
      app.description,
      "Packaged Windows application imported by Intune Hydration Kit."
    ),
    subcategory: app.catalogSubcategory ?? "WinGet Package",
    platform: "Windows",
    itemType: "Windows app (Win32)",
    sourcePath: app.packageUrl,
    payloadSource: win32PayloadSource(app),
  }));

  const baselineItems: TemplateDocumentationItemDraft[] = (oibManifest?.files ?? []).map((file) => ({
    id: createItemId("baseline", file.path),
    category: "baseline",
    categoryLabel: CATEGORY_METADATA.baseline.label,
    displayName: file.displayName,
    description: `${file.policyType} template from the bundled OpenIntuneBaseline catalog.`,
    subcategory: oibSourceLabels[file.platform] ?? file.platform,
    platform:
      OIB_PLATFORM_LABELS[file.platform] ?? pickPlatform(file.displayName),
    itemType: file.policyType,
    sourcePath: file.path,
    payloadSource: oibPayloadSource(file),
  }));

  const cisCategoryDescriptions = new Map(
    (cisManifest?.categories ?? []).map((category) => [
      category.folder,
      category.description,
    ])
  );

  const cisItems: TemplateDocumentationItemDraft[] = (cisManifest?.files ?? []).map((file) => ({
    id: createItemId("cisBaseline", file.path),
    category: "cisBaseline",
    categoryLabel: CATEGORY_METADATA.cisBaseline.label,
    displayName: file.displayName,
    description:
      cisCategoryDescriptions.get(file.category) ??
      `${file.subcategory} benchmark template from the bundled CIS catalog.`,
    subcategory: file.subcategory,
    platform: pickPlatform(file.category, file.subcategory, file.displayName),
    itemType: "CIS Benchmark Policy",
    sourcePath: file.path,
    payloadSource: cisPayloadSource(file),
  }));

  const items = assignTemplateSlugs(sortItems([
    ...groupItems,
    ...filterItems,
    ...complianceItems,
    ...appProtectionItems,
    ...win32AppItems,
    ...conditionalAccessItems,
    ...enrollmentItems,
    ...notificationItems,
    ...baselineItems,
    ...cisItems,
  ]));

  const categories = TEMPLATE_DOCUMENTATION_CATEGORY_ORDER.map((category) =>
    getCategorySummary(
      category,
      items.filter((item) => item.category === category)
    )
  );

  return {
    items,
    categories,
    totalCount: items.length,
  };
}

export async function loadTemplateDocumentationPayload(
  item: TemplateDocumentationItem
): Promise<unknown | null> {
  switch (item.payloadSource.kind) {
    case "inline":
      return item.payloadSource.payload;
    case "oib":
      return fetchBaselinePolicyByManifestFile(item.payloadSource.file);
    case "cis":
      return fetchCISBaselinePolicyByManifestFile(item.payloadSource.file);
    case "win32": {
      const template = item.payloadSource.template;
      // A WinGet catalog app has no committed scripts: its scripts are generated (latest version).
      if (!template.detectionScriptUrl || !template.installScriptUrl) {
        if (!template.winget) {
          throw new Error(`${template.displayName} has no scripts.`);
        }
        // Loaded on demand: the script text is large and only this payload needs it.
        const { getWinGetScripts } = await import("@/lib/win32/wingetScripts");
        const scripts = getWinGetScripts(template.winget);
        return {
          ...template,
          detectionScriptContent: scripts.detection,
          installScriptContent: scripts.install,
          uninstallScriptContent: scripts.uninstall,
        };
      }
      const [
        detectionScriptContent,
        installScriptContent,
        uninstallScriptContent,
      ] = await Promise.all([
        fetchScriptContent(template.detectionScriptUrl, "Win32 detection script"),
        fetchScriptContent(template.installScriptUrl, "Win32 install script"),
        template.uninstallScriptUrl
          ? fetchScriptContent(template.uninstallScriptUrl, "Win32 uninstall script")
          : Promise.resolve(template.uninstallCommandLine),
      ]);

      return {
        ...template,
        detectionScriptContent,
        installScriptContent,
        uninstallScriptContent,
      };
    }
    default:
      return null;
  }
}

function toSlugPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Returns the base slug for a catalog item. The slug comes from the item id
 * (category and display name or manifest path). It removes the "[IHD] " import
 * prefix and the ".json" extension, so the URL stays short and readable.
 */
export function getTemplateBaseSlug(item: Pick<TemplateDocumentationItem, "id" | "category">): string {
  const seed = item.id
    .slice(item.category.length + 1)
    .replace(IMPORT_PREFIX, "")
    .replace(/\.json$/i, "");
  const category = item.category.replace(/([a-z0-9])([A-Z])/g, "$1-$2");

  return `${toSlugPart(category)}--${toSlugPart(seed)}`;
}

/** Returns a short, stable hash of a value (32-bit FNV-1a in base 36). */
function hashSlugSeed(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

/**
 * Gives each item its detail page slug. Items that share a base slug (for
 * example, file names that differ only in spaces) all get a hash of their id
 * added, so no item depends on the order of the others.
 */
function assignTemplateSlugs(items: TemplateDocumentationItemDraft[]): TemplateDocumentationItem[] {
  const baseSlugs = items.map(getTemplateBaseSlug);
  const counts = new Map<string, number>();
  baseSlugs.forEach((slug) => counts.set(slug, (counts.get(slug) ?? 0) + 1));

  return items.map((item, index) => {
    const baseSlug = baseSlugs[index];
    const slug =
      (counts.get(baseSlug) ?? 0) > 1 ? `${baseSlug}-${hashSlugSeed(item.id)}` : baseSlug;
    return { ...item, slug };
  });
}

/** Returns the catalog item that has the slug, or undefined. */
export function findTemplateBySlug(
  items: readonly TemplateDocumentationItem[],
  slug: string
): TemplateDocumentationItem | undefined {
  return items.find((item) => item.slug === slug);
}

/** Returns the site path of the detail page for a catalog item. */
export function getTemplatePath(item: Pick<TemplateDocumentationItem, "slug">): string {
  return `/templates/${item.slug}`;
}

/** Returns the origin of a catalog item: OpenIntuneBaseline, CIS, or the kit itself. */
export function getTemplateSourceLabel(item: Pick<TemplateDocumentationItem, "payloadSource">): string {
  switch (item.payloadSource.kind) {
    case "oib":
      return "OpenIntuneBaseline";
    case "cis":
      return "CIS Intune Benchmarks";
    default:
      return "Intune Hydration Kit";
  }
}

/** Returns the path of the bundled file in the repository, when the catalog knows it. */
export function getTemplateFilePath(
  item: Pick<TemplateDocumentationItem, "payloadSource" | "sourcePath">
): string | undefined {
  switch (item.payloadSource.kind) {
    case "oib":
      return `public/IntuneTemplates/OpenIntuneBaseline/${item.payloadSource.file.path}`;
    case "cis":
      return `public/CISIntuneBaselines/${item.payloadSource.file.path}`;
    case "win32":
      return `public${item.payloadSource.template.packageUrl}`;
    default:
      return item.sourcePath;
  }
}

/** Returns the canonical platforms present in the list, in display order. */
export function getPlatformFilterOrder(
  platforms: ReadonlyArray<TemplatePlatform | undefined>
): TemplatePlatform[] {
  const present = new Set(platforms);
  return TEMPLATE_PLATFORMS.filter((platform) => present.has(platform));
}
