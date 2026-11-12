/**
 * Builds a readable list of the settings that a template payload configures.
 * Settings Catalog payloads list each setting definition and its value. Settings
 * inside a collection entry (for example, one firewall rule) keep the entry they
 * belong to. Other payloads list their configured properties, with nested
 * objects shown as dotted paths.
 */

export interface TemplateSettingRow {
  /** Unique identity of the row: the entry path, the label, and the value. */
  key: string;
  label: string;
  value: string;
  /** The collection entry that contains the setting, for example "..._{firewallrulename} #2". */
  entry?: string;
}

export interface TemplateSettingsSummary {
  kind: "settingsCatalog" | "properties";
  rows: TemplateSettingRow[];
}

const MAX_PROPERTY_DEPTH = 4;

/** Top-level keys that are metadata, identity of the payload, or shown elsewhere on the page. */
const IGNORED_TOP_LEVEL_KEYS = new Set([
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

/** Graph annotations and actions are metadata at every level. */
function isAnnotationKey(key: string): boolean {
  return key.includes("@odata.") || key.startsWith("#");
}

/**
 * Only the payload's own metadata is ignored. Nested keys such as
 * `grantControls.authenticationStrength.id` are configuration references and stay.
 */
function isIgnoredKey(key: string, depth: number): boolean {
  return (
    isAnnotationKey(key) ||
    (depth === 0 && (IGNORED_TOP_LEVEL_KEYS.has(key) || key.startsWith("_")))
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

function entryLabel(definitionId: string, index: number, count: number): string | null {
  return count > 1 ? `${definitionId} #${index + 1}` : null;
}

function joinEntry(parent: string | undefined, segment: string | null): string | undefined {
  if (!segment) return parent;
  return parent ? `${parent} › ${segment}` : segment;
}

function flattenSettingInstance(
  instance: SettingInstance,
  entry: string | undefined,
  rows: TemplateSettingRow[]
): void {
  const definitionId =
    typeof instance.settingDefinitionId === "string" ? instance.settingDefinitionId : "";
  const choice = asRecord(instance.choiceSettingValue);
  const simple = asRecord(instance.simpleSettingValue);
  const simpleCollection = asRecords(instance.simpleSettingCollectionValue);
  const choiceCollection = asRecords(instance.choiceSettingCollectionValue);
  const groupValue = asRecord(instance.groupSettingValue);
  const groupCollection = asRecords(instance.groupSettingCollectionValue);

  let value: string | null = null;
  if (choice) {
    const choiceValue = formatScalar(choice.value);
    value = choiceValue ? stripDefinitionPrefix(choiceValue, definitionId) : null;
  } else if (simple) {
    value = formatScalar(simple.value);
  } else if (simpleCollection.length > 0) {
    value = simpleCollection
      .map((item) => formatScalar(item.value))
      .filter(Boolean)
      .join(", ");
  } else if (choiceCollection.length > 0) {
    value = choiceCollection
      .map((item) => formatScalar(item.value))
      .filter((item): item is string => Boolean(item))
      .map((item) => stripDefinitionPrefix(item, definitionId))
      .join(", ");
  }

  if (definitionId && value) {
    rows.push({
      key: `${entry ?? ""}|${definitionId}=${value}`,
      label: definitionId,
      value,
      ...(entry ? { entry } : {}),
    });
  }

  const visitChildren = (children: unknown, childEntry: string | undefined) =>
    asRecords(children).forEach((child) => flattenSettingInstance(child, childEntry, rows));

  if (choice) visitChildren(choice.children, entry);
  if (groupValue) visitChildren(groupValue.children, entry);
  [choiceCollection, groupCollection].forEach((collection) =>
    collection.forEach((item, index) =>
      visitChildren(
        item.children,
        joinEntry(entry, entryLabel(definitionId, index, collection.length))
      )
    )
  );
}

/** Removes rows that repeat the same setting and value inside the same collection entry. */
function uniqueRows(rows: TemplateSettingRow[]): TemplateSettingRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

function summarizeSettingsCatalog(settings: unknown[]): TemplateSettingRow[] {
  const rows: TemplateSettingRow[] = [];
  asRecords(settings).forEach((setting) => {
    const instance = asRecord(setting.settingInstance);
    if (instance) {
      flattenSettingInstance(instance, undefined, rows);
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
    if (isIgnoredKey(key, depth) || value === null || value === undefined) {
      return;
    }

    const label = prefix ? `${prefix}.${key}` : key;
    const scalar = formatScalar(value);
    if (scalar !== null) {
      rows.push({ key: label, label, value: scalar });
      return;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return;
      }

      const scalars = value.map(formatScalar);
      rows.push({
        key: label,
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
