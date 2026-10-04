import type { GraphClient } from "@/lib/graph/client";
import type { HydrationTask } from "@/types/hydration";
import { findByNamePrecedence, normalizeName } from "./utils";
import { cleanPolicyRecursively, cleanSettingsCatalogPolicy } from "./cleaners";

export interface BaselineMatchCandidate {
  id: string;
  name?: string;
  displayName?: string;
}

/** Use the same name rules for the baseline preview and execution. Partial matches are excluded. */
export function findBaselineMatch<T extends { name?: string; displayName?: string }>(policyType: string, name: string, policies?: T[]): T | undefined {
  const getName = (policy: T) => policy.name ?? policy.displayName;
  if (policyType === "CompliancePolicies") {
    return policies?.find((policy) => getName(policy)?.toLowerCase().trim() === name.toLowerCase().trim());
  }
  if (policyType === "AppProtection") {
    return policies?.find((policy) => getName(policy)?.toLowerCase() === name.toLowerCase());
  }
  return findByNamePrecedence(policies, name, normalizeName(name), getName, false);
}

const BASELINE_ENDPOINTS: Record<string, string> = {
  SettingsCatalog: "/deviceManagement/configurationPolicies",
  CompliancePolicies: "/deviceManagement/deviceCompliancePolicies",
  V1Compliance: "/deviceManagement/deviceCompliancePolicies",
  DeviceConfiguration: "/deviceManagement/deviceConfigurations",
  UpdatePolicies: "/deviceManagement/deviceConfigurations",
  DriverUpdateProfiles: "/deviceManagement/windowsDriverUpdateProfiles",
};

/** Get the read endpoint for a supported baseline policy type. */
export function getBaselineEndpoint(policyType: string): string | undefined {
  return BASELINE_ENDPOINTS[policyType];
}

const IGNORED_FIELDS = new Set([
  "id", "createdDateTime", "lastModifiedDateTime",
  "version", "assignments", "isAssigned", "settingCount", "creationSource",
]);

const UNORDERED_SETTING_COLLECTIONS = new Set([
  "settings", "children", "simpleSettingCollectionValue", "choiceSettingCollectionValue", "groupSettingCollectionValue",
]);

function collectionSortKey(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(collectionSortKey));
  if (!value || typeof value !== "object") return JSON.stringify(value) ?? "";
  const record = value as Record<string, unknown>;
  const instance = record.settingInstance as Record<string, unknown> | undefined;
  const definition = instance?.settingDefinitionId ?? record.settingDefinitionId;
  return JSON.stringify([typeof definition === "string" ? definition : "",
    Object.keys(record).filter((key) => key !== "@odata.type").sort()
      .map((key) => [key, collectionSortKey(record[key])])]);
}

function comparable(value: unknown, root = false, field = ""): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => comparable(item));
    return UNORDERED_SETTING_COLLECTIONS.has(field)
      ? items.sort((left, right) => collectionSortKey(left).localeCompare(collectionSortKey(right)))
      : items;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !IGNORED_FIELDS.has(key) && !(root && ["name", "displayName", "description"].includes(key)) && !key.startsWith("_") &&
    (!key.includes("@odata.") || key === "@odata.type")
  ).map(([key, nested]) => [key, comparable(nested, false, key)]));
}

interface ComparisonDetails {
  differences: string[];
  missing: string[];
  memberCounts?: { baseline: number; tenant: number };
}

function compareOwnedFields(expected: unknown, actual: unknown, path: string, details: ComparisonDetails, definition = ""): void {
  if (expected === undefined) return;
  // Graph can omit type annotations that the export includes. A returned type must still agree.
  if (actual === undefined && path.endsWith("@odata.type")) return;
  if (actual === undefined) {
    details.missing.push(path);
    return;
  }
  if (Array.isArray(expected)) {
    const before = details.differences.length;
    if (!Array.isArray(actual) || expected.length !== actual.length) {
      details.differences.push(path);
    } else {
      expected.forEach((value, index) => compareOwnedFields(value, actual[index], `${path}[${index}]`, details, definition));
    }
    if (details.differences.length > before && Array.isArray(actual) &&
      definition.endsWith("localusersandgroups_configure_groupconfiguration_accessgroup_users") &&
      path.endsWith("simpleSettingCollectionValue")) {
      details.memberCounts = { baseline: expected.length, tenant: actual.length };
    }
    return;
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
      details.differences.push(path);
      return;
    }
    const record = expected as Record<string, unknown>;
    const currentDefinition = typeof record.settingDefinitionId === "string" ? record.settingDefinitionId : definition;
    Object.entries(record).forEach(([key, value]) =>
      compareOwnedFields(value, (actual as Record<string, unknown>)[key], path ? `${path}.${key}` : key, details, currentDefinition)
    );
    return;
  }
  if (expected !== actual) details.differences.push(path);
}

/** Compare template-owned fields. Missing Graph fields are not proof of equality. */
export function compareBaselinePayloads(template: Record<string, unknown>, actual: Record<string, unknown>, policyType: string): NonNullable<HydrationTask["drift"]> {
  const clean = policyType === "SettingsCatalog" ? cleanSettingsCatalogPolicy : cleanPolicyRecursively;
  const expected = comparable(clean(template), true) as Record<string, unknown>;
  const received = comparable(actual, true) as Record<string, unknown>;
  if (JSON.stringify(expected).includes("SecretSettingValue")) {
    return { status: "notChecked", differences: [], reason: "Secret setting values cannot be verified from Graph read responses." };
  }
  const details: ComparisonDetails = { differences: [], missing: [] };
  compareOwnedFields(expected, received, "", details);
  const { differences, missing, memberCounts } = details;
  if (differences.length) {
    const memberLabel = /Local Administrators/i.test(String(template.name ?? template.displayName ?? ""))
      ? "Local administrator members" : "Local group members";
    const summary = memberCounts
      ? `${memberLabel} differ from the baseline (baseline: ${memberCounts.baseline}; tenant: ${memberCounts.tenant}).`
      : "Policy settings differ from the baseline.";
    return { status: "different", differences, reason: `${summary} The existing policy was not changed.${missing.length ? ` ${missing.length} field(s) could not be checked.` : ""}` };
  }
  if (missing.length || Object.keys(expected).length === 0) {
    return { status: "notChecked", differences: [], reason: `Graph did not return all template-owned fields. ${missing.length} field(s) could not be checked.` };
  }
  return { status: "matches", differences: [], reason: "The returned template-owned fields match. Names, descriptions, assignments, and Graph metadata are excluded." };
}

/** Build the Settings Catalog route used by the Intune policy summary. */
function settingsCatalogPortalUrl(id: string, policy: Record<string, unknown>): string {
  const template = policy.templateReference as { templateId?: string } | undefined;
  return `https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/PolicySummaryBlade/policyId/${encodeURIComponent(id)}/technology/${encodeURIComponent(String(policy.technologies ?? ""))}/templateId/${encodeURIComponent(template?.templateId ?? "")}/platformName/${encodeURIComponent(String(policy.platforms ?? ""))}`;
}

/** Record an existing match and check settings with GET requests only. */
export async function recordBaselineMatch(
  task: HydrationTask,
  template: Record<string, unknown>,
  existing: Omit<BaselineMatchCandidate, "id"> & { id?: string },
  policyType: string,
  client: GraphClient
): Promise<void> {
  if (!existing.id) {
    task.drift = { status: "notChecked", differences: [], reason: "The matched policy did not include an ID." };
    return;
  }
  const name = existing.name ?? existing.displayName ?? "";
  task.match = {
    id: existing.id,
    name,
    matchType: name.toLowerCase() === task.itemName.toLowerCase() ? "exact" : "normalized",
    ...(policyType === "SettingsCatalog" ? { portalUrl: settingsCatalogPortalUrl(existing.id, template) } : {}),
  };
  task.drift = { status: "notChecked", differences: [], reason: "Settings comparison is not available for this policy type." };
  const endpoint = getBaselineEndpoint(policyType);
  if (!endpoint) return;
  try {
    const path = `${endpoint}/${encodeURIComponent(existing.id)}`;
    const expansion = policyType === "CompliancePolicies" || policyType === "V1Compliance"
      ? "?$expand=scheduledActionsForRule($expand=scheduledActionConfigurations)" : "";
    const actual = await client.get<Record<string, unknown>>(`${path}${expansion}`);
    if (policyType === "SettingsCatalog") {
      actual.settings = await client.getCollection(`${path}/settings`);
    }
    task.drift = compareBaselinePayloads(template, actual, policyType);
  } catch {
    task.drift = { status: "notChecked", differences: [], reason: "Graph settings could not be read. The existing policy was not changed." };
  }
}
