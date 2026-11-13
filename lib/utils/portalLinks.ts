import type { CloudEnvironment, HydrationTask, TaskCategory } from "@/types/hydration";

/**
 * Admin portal links for objects that a run created.
 *
 * Only routes from a public source are used:
 * - Entra group and Conditional Access routes: Maester (maester365/maester,
 *   Get-MtPortalLinkTemplate.ps1).
 * - Intune app route: the reference project (ugurkocde/intuneassignments-website,
 *   src/lib/intune-urls.ts).
 * - Compliance and configuration list routes: the ASD Blueprint for Secure Cloud.
 * - Assignment filter list route: a university IT knowledge base article.
 *
 * When no per-object route is known, the link opens the list for that type, and
 * the label says so. When no route is known at all, the result is null.
 */

export interface PortalLink {
  href: string;
  /** Visible link text. */
  label: string;
  /** Accessible name. It starts with the visible text and includes the object name. */
  accessibleName: string;
  /** "object" opens the created object. "list" opens the list that contains it. */
  target: "object" | "list";
}

export interface PortalLinkInput {
  cloud: CloudEnvironment;
  category: TaskCategory;
  objectId: string;
  objectName: string;
  /** OpenIntuneBaseline policy type (`_oibPolicyType`). Used for the baseline category only. */
  policyType?: string;
}

type Portal = "intune" | "entra";

/** Admin portal origins per cloud. Every supported cloud must have an entry. */
const PORTAL_ORIGINS: Record<CloudEnvironment, Record<Portal, string>> = {
  global: {
    intune: "https://intune.microsoft.com",
    entra: "https://entra.microsoft.com",
  },
};

const PORTAL_NAMES: Record<Portal, string> = {
  intune: "Intune",
  entra: "Entra admin center",
};

interface ObjectRoute {
  target: "object";
  portal: Portal;
  path: (id: string) => string;
}

interface ListRoute {
  target: "list";
  portal: Portal;
  path: string;
  listName: string;
}

type Route = ObjectRoute | ListRoute;

const COMPLIANCE_LIST: ListRoute = {
  target: "list",
  portal: "intune",
  path: "/#view/Microsoft_Intune_DeviceSettings/DevicesComplianceMenu/~/policies",
  listName: "Compliance policies",
};

const CONFIGURATION_LIST: ListRoute = {
  target: "list",
  portal: "intune",
  path: "/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration",
  listName: "Configuration profiles",
};

const CATEGORY_ROUTES: Partial<Record<TaskCategory, Route>> = {
  groups: {
    target: "object",
    portal: "entra",
    path: (id) => `/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${id}`,
  },
  conditionalAccess: {
    target: "object",
    portal: "entra",
    path: (id) => `/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/${id}`,
  },
  win32Apps: {
    target: "object",
    portal: "intune",
    path: (id) => `/#view/Microsoft_Intune_Apps/SettingsMenu/~/0/appId/${id}`,
  },
  filters: {
    target: "list",
    portal: "intune",
    path: "/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/assignmentFilters",
    listName: "Assignment filters",
  },
  // The task does not record whether the policy is a v1 or a Settings Catalog compliance policy.
  compliance: COMPLIANCE_LIST,
};

/**
 * OpenIntuneBaseline policy types with a known list route. App protection,
 * update rings, and driver update profiles have no route from a public source.
 */
const BASELINE_ROUTES: Record<string, Route> = {
  SettingsCatalog: CONFIGURATION_LIST,
  DeviceConfiguration: CONFIGURATION_LIST,
  CompliancePolicies: COMPLIANCE_LIST,
};

function getRoute(category: TaskCategory, policyType: string | undefined): Route | null {
  if (category === "baseline") {
    return policyType ? BASELINE_ROUTES[policyType] ?? null : null;
  }
  return CATEGORY_ROUTES[category] ?? null;
}

/**
 * Map a created object to an admin portal link. Returns null when no reliable
 * route is known for the cloud, the category, or the policy type.
 */
export function getPortalLink({ cloud, category, objectId, objectName, policyType }: PortalLinkInput): PortalLink | null {
  const origins = PORTAL_ORIGINS[cloud];
  const route = getRoute(category, policyType);
  if (!origins || !route || !objectId) return null;

  const portalName = PORTAL_NAMES[route.portal];
  const origin = origins[route.portal];

  if (route.target === "object") {
    const label = `Open in ${portalName}`;
    return {
      href: `${origin}${route.path(encodeURIComponent(objectId))}`,
      label,
      accessibleName: `${label}: ${objectName}`,
      target: "object",
    };
  }

  const label = `Open ${route.listName} in ${portalName}`;
  return {
    href: `${origin}${route.path}`,
    label,
    accessibleName: `${label} (list that contains ${objectName})`,
    target: "list",
  };
}

const NO_LINKS: ReadonlyMap<string, PortalLink> = new Map();

/**
 * Portal links for the objects that the tasks created, keyed by task ID.
 * Only successful live create tasks with a created object get a link.
 * A run without a known cloud gets no links.
 */
export function getCreatedObjectLinks(
  tasks: readonly HydrationTask[],
  cloud: CloudEnvironment | undefined,
  isPreview: boolean,
): ReadonlyMap<string, PortalLink> {
  if (!cloud || isPreview) return NO_LINKS;
  const links = new Map<string, PortalLink>();
  for (const task of tasks) {
    const { createdObject } = task;
    if (!createdObject || task.status !== "success" || task.operation !== "create") continue;
    const link = getPortalLink({
      cloud,
      category: task.category,
      objectId: createdObject.id,
      objectName: task.itemName,
      policyType: createdObject.policyType,
    });
    if (link) links.set(task.id, link);
  }
  return links.size > 0 ? links : NO_LINKS;
}
