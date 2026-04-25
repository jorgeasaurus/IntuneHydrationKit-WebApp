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

export type TemplateDocumentationPayloadSource =
  | InlinePayloadSource
  | OIBPayloadSource
  | CISPayloadSource;

export interface TemplateDocumentationItem {
  id: string;
  category: TaskCategory;
  categoryLabel: string;
  displayName: string;
  description: string;
  subcategory?: string;
  platform?: string;
  itemType: string;
  sourcePath?: string;
  payloadSource: TemplateDocumentationPayloadSource;
}

export interface TemplateDocumentationCatalog {
  items: TemplateDocumentationItem[];
  categories: TemplateDocumentationCategorySummary[];
  totalCount: number;
}

const CATEGORY_ORDER: TaskCategory[] = [
  "groups",
  "filters",
  "compliance",
  "appProtection",
  "conditionalAccess",
  "enrollment",
  "notification",
  "baseline",
  "cisBaseline",
];

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
    description: "Curated security baseline payloads indexed from the bundled OpenIntuneBaseline manifest.",
  },
  cisBaseline: {
    label: "CIS Baselines",
    description: "CIS benchmark payloads indexed from the local CIS manifest.",
  },
};

const PLATFORM_ORDER = [
  "Windows",
  "macOS",
  "iOS/iPadOS",
  "Android",
  "Linux",
  "Identity",
  "Cross-platform",
];

const OIB_PLATFORM_LABELS: Record<string, string> = {
  WINDOWS: "Windows",
  MACOS: "macOS",
  BYOD: "BYOD (Bring Your Own Device)",
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

function createItemId(category: TaskCategory, seed: string): string {
  return `${category}:${seed}`;
}

function sortItems(items: TemplateDocumentationItem[]): TemplateDocumentationItem[] {
  return [...items].sort((left, right) => {
    const categoryDiff =
      CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
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

function detectPlatform(value: string): string | undefined {
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

function pickPlatform(...values: Array<string | undefined>): string | undefined {
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

  const oibPlatformLabels = Object.fromEntries(
    (oibManifest?.platforms ?? []).map((platform) => [platform.id, platform.name])
  );

  const groupItems: TemplateDocumentationItem[] = [
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

  const filterItems: TemplateDocumentationItem[] = filters.map((filter) => ({
    id: createItemId("filters", filter.displayName),
    category: "filters",
    categoryLabel: CATEGORY_METADATA.filters.label,
    displayName: filter.displayName,
    description: normalizeDescription(
      filter.description,
      "Device assignment filter imported by Intune Hydration Kit."
    ),
    platform: filter.platform,
    itemType: "Assignment Filter",
    payloadSource: inlinePayloadSource(filter),
  }));

  const complianceItems: TemplateDocumentationItem[] = compliancePolicies.map((policy) => ({
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

  const conditionalAccessItems: TemplateDocumentationItem[] =
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

  const appProtectionItems: TemplateDocumentationItem[] =
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

  const enrollmentItems: TemplateDocumentationItem[] = (
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

  const notificationItems: TemplateDocumentationItem[] = (
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

  const baselineItems: TemplateDocumentationItem[] = (oibManifest?.files ?? []).map((file) => ({
    id: createItemId("baseline", file.path),
    category: "baseline",
    categoryLabel: CATEGORY_METADATA.baseline.label,
    displayName: file.displayName,
    description: `${file.policyType} template from the bundled OpenIntuneBaseline catalog.`,
    subcategory: file.platform,
    platform:
      oibPlatformLabels[file.platform] ??
      OIB_PLATFORM_LABELS[file.platform] ??
      pickPlatform(file.platform, file.displayName),
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

  const cisItems: TemplateDocumentationItem[] = (cisManifest?.files ?? []).map((file) => ({
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

  const items = sortItems([
    ...groupItems,
    ...filterItems,
    ...complianceItems,
    ...appProtectionItems,
    ...conditionalAccessItems,
    ...enrollmentItems,
    ...notificationItems,
    ...baselineItems,
    ...cisItems,
  ]);

  const categories = CATEGORY_ORDER.map((category) =>
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
    default:
      return null;
  }
}

export function getPlatformFilterOrder(platforms: string[]): string[] {
  return [...platforms].sort((left, right) => {
    const leftIndex = PLATFORM_ORDER.indexOf(left);
    const rightIndex = PLATFORM_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}
