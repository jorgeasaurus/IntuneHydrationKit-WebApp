/**
 * Template comparison for existing tenant objects.
 *
 * Builds the template-owned fields of an object the same way the create path builds
 * the request body, normalizes the Graph read of the object, and compares the two
 * with the baseline comparison (compareBaselinePayloads). Only fields that the
 * template defines are compared. Names, descriptions, assignments, IDs, timestamps,
 * version counters and OData annotations are not compared.
 *
 * False drift is the main failure mode, so each object type has its own normalizer
 * for the changes that Graph makes to a stored object (property order, omitted
 * defaults, enum case, collection order).
 */

import { buildConditionalAccessCreatePlan } from "@/lib/graph/conditionalAccess";
import type { FilterTemplate, GroupTemplate } from "@/lib/templates/loader";
import type { DeviceFilter, DeviceGroup } from "@/types/graph";
import { compareBaselinePayloads } from "../baselineEvidence";
import { cleanPolicyRecursively } from "../cleaners";
import { buildFilterCreateBody, buildGroupCreateBody } from "../existingObjects";

/** Object types that the kit can compare with a template. */
export type CompareKind =
  | "group"
  | "filter"
  | "conditionalAccess"
  | "compliance"
  | "SettingsCatalog"
  | "DeviceConfiguration"
  | "DriverUpdateProfiles";

export interface SettingDifference {
  /** Path of the template-owned field, for example "conditions.users.excludeGroups". */
  path: string;
  /** Template value as JSON. Not set for types whose values are not shown. */
  template?: string;
  /** Tenant value as JSON. Not set for types whose values are not shown. */
  tenant?: string;
}

export interface ObjectComparison {
  status: "matches" | "differs" | "cannotCompare";
  differences: SettingDifference[];
  reason: string;
}

/**
 * Types whose differences show the template and tenant values. Settings Catalog and
 * other baseline payloads can hold sensitive values, so they show the path only
 * (the same rule as the run evidence).
 */
const SHOW_VALUES: ReadonlySet<CompareKind> = new Set(["group", "filter", "conditionalAccess", "compliance"]);

const ZERO_GUID = "00000000-0000-0000-0000-000000000000";
const MAX_VALUE_LENGTH = 200;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/** Rules are compared without case and with collapsed white space: Entra and Intune rule syntax ignores both. */
function normalizeRule(value: unknown): unknown {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().toLowerCase() : value;
}

function lowerString(value: unknown): unknown {
  return typeof value === "string" ? value.toLowerCase() : value;
}

/**
 * Lower-case every string, sort arrays of primitive values, and drop null values.
 * Used for payloads whose strings are enum values, IDs or well-known keywords.
 */
function normalizeDeep(value: unknown): unknown {
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) {
    const items = value.map(normalizeDeep);
    return items.every(isPrimitive)
      ? items.toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : items;
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== null && nested !== undefined)
      .map(([key, nested]) => [key, normalizeDeep(nested)])
  );
}

/**
 * Accept the defaults that Graph gives an unset template field: an empty list that
 * Graph returns as null or leaves out, and a null that Graph leaves out.
 * Changes `expected` and `actual` in place.
 */
function reconcileDefaults(expected: JsonRecord, actual: JsonRecord): void {
  for (const [key, value] of Object.entries(expected)) {
    const current = actual[key];
    if (value === null && (current === undefined || current === null)) {
      delete expected[key];
    } else if (Array.isArray(value) && value.length === 0 && (current === undefined || current === null)) {
      actual[key] = [];
    } else if (isRecord(value) && isRecord(current)) {
      reconcileDefaults(value, current);
    }
  }
}

function pick(source: JsonRecord, keys: readonly string[], normalize: (key: string, value: unknown) => unknown): JsonRecord {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, normalize(key, source[key])])
  );
}

const GROUP_FIELDS = ["groupTypes", "mailEnabled", "securityEnabled", "membershipRule", "membershipRuleProcessingState"] as const;

function normalizeGroupField(key: string, value: unknown): unknown {
  if (key === "membershipRule") return normalizeRule(value);
  if (key === "groupTypes") return Array.isArray(value) ? normalizeDeep(value) : value;
  return lowerString(value);
}

const FILTER_FIELDS = ["platform", "rule"] as const;

function normalizeFilterField(key: string, value: unknown): unknown {
  return key === "rule" ? normalizeRule(value) : lowerString(value);
}

/** Conditional Access fields that the comparison never uses. The kit never changes the state. */
const CONDITIONAL_ACCESS_EXCLUDED: ReadonlySet<string> = new Set(["displayName", "state", "@odata.type"]);

function conditionalAccessExpected(template: JsonRecord): JsonRecord {
  const { payload } = buildConditionalAccessCreatePlan(template);
  return normalizeDeep(omit(payload, CONDITIONAL_ACCESS_EXCLUDED)) as JsonRecord;
}

function omit(record: JsonRecord, keys: ReadonlySet<string>): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key)));
}

const COMPLIANCE_RULE_SERVER_FIELDS: ReadonlySet<string> = new Set(["ruleName", "id"]);
const SERVER_ID_FIELD: ReadonlySet<string> = new Set(["id"]);

function normalizeComplianceActions(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((rule) => {
    if (!isRecord(rule)) return rule;
    // Graph returns ruleName as null, so it is not a template-owned field after create.
    const rest = omit(rule, COMPLIANCE_RULE_SERVER_FIELDS);
    const configurations = Array.isArray(rest.scheduledActionConfigurations)
      ? rest.scheduledActionConfigurations
          .map((configuration) => {
            if (!isRecord(configuration)) return configuration;
            const owned = omit(configuration, SERVER_ID_FIELD);
            // An empty notification template ID is stored as the zero GUID.
            if (owned.notificationTemplateId === "" || owned.notificationTemplateId === null) {
              owned.notificationTemplateId = ZERO_GUID;
            }
            return owned;
          })
          .toSorted((left, right) =>
            String(isRecord(left) ? left.actionType : "").localeCompare(String(isRecord(right) ? right.actionType : ""))
          )
      : rest.scheduledActionConfigurations;
    return { ...rest, scheduledActionConfigurations: configurations };
  });
}

function normalizeCompliance(policy: JsonRecord): JsonRecord {
  const { scheduledActionsForRule, ...rest } = policy;
  const normalized = normalizeDeep(rest) as JsonRecord;
  if (scheduledActionsForRule !== undefined) {
    normalized.scheduledActionsForRule = normalizeDeep(normalizeComplianceActions(scheduledActionsForRule));
  }
  return normalized;
}

/** Reason why a template cannot be compared, or undefined when it can. */
export function getCannotCompareReason(kind: CompareKind, template: JsonRecord): string | undefined {
  if (kind === "compliance") {
    if (template.deviceCompliancePolicyScript || template.deviceCompliancePolicyScriptDefinition) {
      return "Custom compliance uses a discovery script that is created for each tenant, so its settings are not compared.";
    }
    if (!template["@odata.type"]) {
      return "Settings Catalog compliance settings are not compared.";
    }
  }
  return undefined;
}

/** Template-owned fields and the normalized Graph object, ready for comparison. */
function prepare(kind: CompareKind, template: JsonRecord, actual: JsonRecord): { expected: JsonRecord; received: JsonRecord } {
  switch (kind) {
    case "group": {
      const body = buildGroupCreateBody(template as unknown as GroupTemplate | DeviceGroup) as unknown as JsonRecord;
      return { expected: pick(body, GROUP_FIELDS, normalizeGroupField), received: pick(actual, GROUP_FIELDS, normalizeGroupField) };
    }
    case "filter": {
      const body = buildFilterCreateBody(template as unknown as FilterTemplate | DeviceFilter) as unknown as JsonRecord;
      return { expected: pick(body, FILTER_FIELDS, normalizeFilterField), received: pick(actual, FILTER_FIELDS, normalizeFilterField) };
    }
    case "conditionalAccess":
      return { expected: conditionalAccessExpected(template), received: normalizeDeep(actual) as JsonRecord };
    case "compliance":
      return {
        expected: normalizeCompliance(cleanPolicyRecursively(template) as JsonRecord),
        received: normalizeCompliance(actual),
      };
    default:
      return { expected: template, received: actual };
  }
}

function valueAt(root: unknown, path: string): unknown {
  let current = root;
  let rest = path;
  while (rest) {
    if (rest.startsWith("[")) {
      const match = rest.match(/^\[(\d+)\]/);
      if (!match || !Array.isArray(current)) return undefined;
      current = current[Number(match[1])];
      rest = rest.slice(match[0].length);
      continue;
    }
    if (rest.startsWith(".")) rest = rest.slice(1);
    if (!isRecord(current)) return undefined;
    // Keys can contain dots ("@odata.type"), so take the longest key that the path starts with.
    const key = Object.keys(current)
      .filter((candidate) => rest === candidate || rest.startsWith(`${candidate}.`) || rest.startsWith(`${candidate}[`))
      .sort((left, right) => right.length - left.length)[0];
    if (key === undefined) return undefined;
    current = current[key];
    rest = rest.slice(key.length);
  }
  return current;
}

function formatValue(value: unknown): string {
  const text = value === undefined ? "(not set)" : JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

/**
 * Compare an existing tenant object with its template. GET responses only; nothing is written.
 * `actual` is the Graph read of the object (for Settings Catalog, with its settings collection).
 */
export function compareWithTemplate(kind: CompareKind, template: JsonRecord, actual: JsonRecord): ObjectComparison {
  const cannotCompare = getCannotCompareReason(kind, template);
  if (cannotCompare) return { status: "cannotCompare", differences: [], reason: cannotCompare };

  const { expected, received } = prepare(kind, structuredClone(template), structuredClone(actual));
  reconcileDefaults(expected, received);
  const policyType = kind === "SettingsCatalog" ? "SettingsCatalog" : kind;
  const result = compareBaselinePayloads(expected, received, policyType);

  if (result.status === "notChecked") {
    return { status: "cannotCompare", differences: [], reason: result.reason ?? "The object could not be compared." };
  }
  if (result.status === "matches") {
    return { status: "matches", differences: [], reason: "The template-owned settings match." };
  }
  const showValues = SHOW_VALUES.has(kind);
  return {
    status: "differs",
    differences: result.differences.map((path) =>
      showValues
        ? { path, template: formatValue(valueAt(expected, path)), tenant: formatValue(valueAt(received, path)) }
        : { path }
    ),
    reason: `${result.differences.length} template-owned setting(s) differ from the template.`,
  };
}

/** Readable one-line form of a difference, for reports and task evidence. */
export function formatDifference(difference: SettingDifference): string {
  return difference.template === undefined
    ? difference.path
    : `${difference.path}: tenant ${difference.tenant} -> template ${difference.template}`;
}
