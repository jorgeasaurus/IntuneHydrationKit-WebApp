/**
 * Builds a readable list of the settings that a template payload configures.
 * Settings Catalog payloads list each setting definition and its value. Other
 * payloads list their configured properties, with nested objects shown as dotted
 * paths.
 */

export interface TemplateSettingRow {
  label: string;
  value: string;
}

export interface TemplateSettingsSummary {
  kind: "settingsCatalog" | "properties";
  rows: TemplateSettingRow[];
}

const MAX_PROPERTY_DEPTH = 4;

/** Keys that are metadata, identity, or shown elsewhere on the page. */
const IGNORED_KEYS = new Set([
  "id",
  "displayName",
  "name",
  "description",
  "createdDateTime",
  "lastModifiedDateTime",
  "modifiedDateTime",
  "version",
  "roleScopeTagIds",
  "settingCount",
  "creationSource",
  "priorityMetaData",
  "assignments",
  "settings",
  "templateReference",
  "detectionScriptContent",
  "installScriptContent",
  "uninstallScriptContent",
]);

function isIgnoredKey(key: string): boolean {
  return (
    IGNORED_KEYS.has(key) ||
    key.startsWith("@odata.") ||
    key.includes("@odata.") ||
    key.startsWith("#") ||
    key.startsWith("_")
  );
}

function formatScalar(value: unknown): string | null {
  if (typeof value === "string") {
    return value.length > 0 ? value : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function stripDefinitionPrefix(value: string, definitionId: string): string {
  return value.startsWith(`${definitionId}_`) ? value.slice(definitionId.length + 1) : value;
}

type SettingInstance = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
}

function collectChildren(values: Record<string, unknown>[]): SettingInstance[] {
  return values.flatMap((value) => asRecords(value.children));
}

function flattenSettingInstance(instance: SettingInstance, rows: TemplateSettingRow[]): void {
  const definitionId =
    typeof instance.settingDefinitionId === "string" ? instance.settingDefinitionId : "";
  const choice = asRecord(instance.choiceSettingValue);
  const simple = asRecord(instance.simpleSettingValue);
  const simpleCollection = asRecords(instance.simpleSettingCollectionValue);
  const choiceCollection = asRecords(instance.choiceSettingCollectionValue);
  const groupValue = asRecord(instance.groupSettingValue);
  const groupValues = [
    ...asRecords(instance.groupSettingCollectionValue),
    ...(groupValue ? [groupValue] : []),
  ];

  let value: string | null = null;
  if (choice) {
    const choiceValue = formatScalar(choice.value);
    value = choiceValue ? stripDefinitionPrefix(choiceValue, definitionId) : null;
  } else if (simple) {
    value = formatScalar(simple.value);
  } else if (simpleCollection.length > 0) {
    value = simpleCollection
      .map((entry) => formatScalar(entry.value))
      .filter(Boolean)
      .join(", ");
  } else if (choiceCollection.length > 0) {
    value = choiceCollection
      .map((entry) => formatScalar(entry.value))
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => stripDefinitionPrefix(entry, definitionId))
      .join(", ");
  }

  if (definitionId && value) {
    rows.push({ label: definitionId, value });
  }

  const children = [
    ...(choice ? asRecords(choice.children) : []),
    ...collectChildren(choiceCollection),
    ...collectChildren(groupValues),
  ];
  children.forEach((child) => flattenSettingInstance(child, rows));
}

/** Removes rows that repeat the same label and value, so each row has a unique key. */
function uniqueRows(rows: TemplateSettingRow[]): TemplateSettingRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.label}=${row.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeSettingsCatalog(settings: unknown[]): TemplateSettingRow[] {
  const rows: TemplateSettingRow[] = [];
  asRecords(settings).forEach((setting) => {
    const instance = asRecord(setting.settingInstance);
    if (instance) {
      flattenSettingInstance(instance, rows);
    }
  });
  return uniqueRows(rows);
}

function summarizeProperties(
  record: Record<string, unknown>,
  prefix: string,
  depth: number,
  rows: TemplateSettingRow[]
): void {
  Object.entries(record).forEach(([key, value]) => {
    if (isIgnoredKey(key) || value === null || value === undefined) {
      return;
    }

    const label = prefix ? `${prefix}.${key}` : key;
    const scalar = formatScalar(value);
    if (scalar !== null) {
      rows.push({ label, value: scalar });
      return;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return;
      }

      const scalars = value.map(formatScalar);
      rows.push({
        label,
        value: scalars.every((entry) => entry !== null)
          ? scalars.join(", ")
          : `${value.length} item${value.length === 1 ? "" : "s"}`,
      });
      return;
    }

    const nested = asRecord(value);
    if (nested && depth < MAX_PROPERTY_DEPTH) {
      summarizeProperties(nested, label, depth + 1, rows);
    }
  });
}

/**
 * Returns the configured settings of a payload, or null when the payload has no
 * setting that the summary can show.
 */
export function summarizeTemplateSettings(payload: unknown): TemplateSettingsSummary | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  if (Array.isArray(record.settings) && record.settings.length > 0) {
    const rows = summarizeSettingsCatalog(record.settings);
    if (rows.length > 0) {
      return { kind: "settingsCatalog", rows };
    }
  }

  const rows: TemplateSettingRow[] = [];
  summarizeProperties(record, "", 0, rows);
  return rows.length > 0 ? { kind: "properties", rows } : null;
}

/** Returns the Graph OData type of a payload, or undefined. */
export function getPayloadODataType(payload: unknown): string | undefined {
  const value = asRecord(payload)?.["@odata.type"];
  return typeof value === "string" ? value : undefined;
}
