/**
 * Saved scope profiles: named target selections that the user can apply again in the
 * target selection step.
 *
 * A profile holds the selection only: the selected categories and the selected item names
 * (or template paths) per category. It holds no tenant ID, tenant name, account, operation
 * mode, or run confirmation. Thus profiles are device presets, and sign-out does not clear them.
 */
import { z } from "@/lib/utils/zod";
import { SCOPE_PROFILES_STORAGE_KEY } from "@/lib/storageKeys";

export const MAX_PROFILES = 50;
export const MAX_PROFILE_NAME_LENGTH = 80;
export const MAX_ITEMS_PER_CATEGORY = 2000;
export const MAX_ITEM_LENGTH = 500;
/** Largest profile file that import reads. */
export const MAX_IMPORT_FILE_BYTES = 512 * 1024;
export const PROFILE_EXPORT_FORMAT = "intune-hydration-kit-scope-profiles";

/** The selection part of a profile. Category keys are strings, so a removed category does not invalidate the store. */
export interface ScopeSelection {
  targets: string[];
  /** Selected item names per category. "baseline" and "cisBaseline" hold template paths. */
  items: Record<string, string[]>;
}

export interface ScopeProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  selection: ScopeSelection;
}

const isoDateSchema = z.string().refine(
  (value) => !Number.isNaN(Date.parse(value)),
  { message: "Expected an ISO date." },
);
const nameSchema = z.string().trim().min(1).max(MAX_PROFILE_NAME_LENGTH);
const itemListSchema = z.array(z.string().min(1).max(MAX_ITEM_LENGTH)).max(MAX_ITEMS_PER_CATEGORY);
const categoryKeySchema = z.string().regex(/^[A-Za-z0-9]{1,40}$/);

const selectionSchema = z.strictObject({
  targets: z.array(categoryKeySchema).max(40),
  items: z.record(categoryKeySchema, itemListSchema),
});

const profileSchema = z.strictObject({
  id: z.string().min(1).max(100),
  name: nameSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  selection: selectionSchema,
});

const storeSchema = z.strictObject({
  version: z.literal(1),
  profiles: z.array(profileSchema).max(MAX_PROFILES),
});

const exportSchema = z.strictObject({
  format: z.literal(PROFILE_EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: isoDateSchema,
  profiles: z.array(profileSchema).min(1).max(MAX_PROFILES),
});

export type StorageWriteResult = { ok: true } | { ok: false; reason: "unavailable" | "full" };

/** Return the browser localStorage, or null when the browser blocks it. */
export function getProfileStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Read the saved profiles. A missing, damaged, or unreadable store gives an empty list. */
export function readProfiles(storage: Storage | null): ScopeProfile[] {
  if (!storage) return [];
  try {
    const value = storage.getItem(SCOPE_PROFILES_STORAGE_KEY);
    if (!value) return [];
    const parsed = storeSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data.profiles : [];
  } catch {
    return [];
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

/** Write the profile list. Never throws: the result tells the caller when storage is blocked or full. */
export function writeProfiles(storage: Storage | null, profiles: ScopeProfile[]): StorageWriteResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  const store = storeSchema.parse({ version: 1, profiles });
  try {
    storage.setItem(SCOPE_PROFILES_STORAGE_KEY, JSON.stringify(store));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? "full" : "unavailable" };
  }
}

function sortUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** Copy a selection into the stored form: only selected categories, sorted, without duplicates. */
export function normalizeSelection(selection: ScopeSelection): ScopeSelection {
  const targets = [...new Set(selection.targets)];
  const items: Record<string, string[]> = {};
  for (const target of targets) {
    const targetItems = selection.items[target];
    if (targetItems && targetItems.length > 0) items[target] = sortUnique(targetItems);
  }
  return { targets, items };
}

function newProfileId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

function validateName(name: string, profiles: ScopeProfile[], exceptId?: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ProfileError("Enter a profile name.");
  if (trimmed.length > MAX_PROFILE_NAME_LENGTH) {
    throw new ProfileError(`Use a profile name of ${MAX_PROFILE_NAME_LENGTH} characters or fewer.`);
  }
  if (profiles.some((profile) => profile.id !== exceptId && sameName(profile.name, trimmed))) {
    throw new ProfileError(`A profile with the name "${trimmed}" exists. Use a different name.`);
  }
  return trimmed;
}

/** Add a profile for the selection. Throws ProfileError for a bad name, an empty selection, or a full list. */
export function addProfile(
  profiles: ScopeProfile[],
  name: string,
  selection: ScopeSelection,
  now = new Date(),
): ScopeProfile[] {
  const validName = validateName(name, profiles);
  const normalized = normalizeSelection(selection);
  if (normalized.targets.length === 0) throw new ProfileError("Select at least one category before you save a profile.");
  if (profiles.length >= MAX_PROFILES) {
    throw new ProfileError(`You can save ${MAX_PROFILES} profiles at most. Delete a profile first.`);
  }
  const timestamp = now.toISOString();
  const profile = profileSchema.parse({
    id: newProfileId(),
    name: validName,
    createdAt: timestamp,
    updatedAt: timestamp,
    selection: normalized,
  });
  return [...profiles, profile];
}

export function renameProfile(profiles: ScopeProfile[], id: string, name: string, now = new Date()): ScopeProfile[] {
  const validName = validateName(name, profiles, id);
  return profiles.map((profile) =>
    profile.id === id ? { ...profile, name: validName, updatedAt: now.toISOString() } : profile,
  );
}

export function deleteProfile(profiles: ScopeProfile[], id: string): ScopeProfile[] {
  return profiles.filter((profile) => profile.id !== id);
}

/** Serialize profiles for a JSON file download. */
export function serializeProfilesExport(profiles: ScopeProfile[], now = new Date()): string {
  return JSON.stringify(
    exportSchema.parse({
      format: PROFILE_EXPORT_FORMAT,
      version: 1,
      exportedAt: now.toISOString(),
      profiles,
    }),
    null,
    2,
  );
}

/** Check the file before the app reads it. */
export function validateProfileFile(file: { name: string; size: number }): void {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ProfileError(`The file is too large. Use a profile file of ${MAX_IMPORT_FILE_BYTES / 1024} KB or less.`);
  }
  if (!file.name.toLowerCase().endsWith(".json")) {
    throw new ProfileError("Select a JSON profile file that this app exported.");
  }
}

/** Parse an exported profile file. Throws ProfileError with a message for the user. */
export function parseProfilesExport(text: string): ScopeProfile[] {
  if (text.length > MAX_IMPORT_FILE_BYTES) {
    throw new ProfileError(`The file is too large. Use a profile file of ${MAX_IMPORT_FILE_BYTES / 1024} KB or less.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProfileError("The file is not valid JSON.");
  }
  const parsed = exportSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProfileError(
      "The file is not a scope profile export from Intune Hydration Kit, or it contains unknown fields.",
    );
  }
  return parsed.data.profiles.map((profile) => ({ ...profile, selection: normalizeSelection(profile.selection) }));
}

/**
 * Add imported profiles with new IDs. A name that exists gets a number suffix.
 * Returns the new list and the number of profiles added.
 */
export function mergeImportedProfiles(
  profiles: ScopeProfile[],
  imported: ScopeProfile[],
  now = new Date(),
): { profiles: ScopeProfile[]; added: number } {
  if (profiles.length + imported.length > MAX_PROFILES) {
    throw new ProfileError(
      `The import would give more than ${MAX_PROFILES} profiles. Delete profiles first.`,
    );
  }
  const next = [...profiles];
  for (const profile of imported) {
    let name = profile.name;
    for (let suffix = 2; next.some((existing) => sameName(existing.name, name)); suffix += 1) {
      const tail = ` (${suffix})`;
      name = `${profile.name.slice(0, MAX_PROFILE_NAME_LENGTH - tail.length)}${tail}`;
    }
    next.push({ ...profile, id: newProfileId(), name, updatedAt: now.toISOString() });
  }
  return { profiles: next, added: imported.length };
}

export interface DroppedProfileItem {
  category: string;
  /** Missing item, or null when the full category does not exist or has no remaining items. */
  item: string | null;
}

/**
 * Resolve a profile selection against the current template catalog.
 * Items that no longer exist are dropped and reported. A category with no remaining items is
 * dropped and reported too, because the wizard needs at least one item per selected category.
 *
 * @param catalog Available item names per category. A category that is not a key is unknown.
 */
export function resolveSelection(
  selection: ScopeSelection,
  catalog: Record<string, ReadonlySet<string>>,
): { selection: ScopeSelection; dropped: DroppedProfileItem[] } {
  const dropped: DroppedProfileItem[] = [];
  const targets: string[] = [];
  const items: Record<string, string[]> = {};

  for (const target of selection.targets) {
    const available = catalog[target];
    if (!available) {
      dropped.push({ category: target, item: null });
      continue;
    }
    const kept: string[] = [];
    for (const item of selection.items[target] ?? []) {
      if (available.has(item)) kept.push(item);
      else dropped.push({ category: target, item });
    }
    if (kept.length === 0) {
      dropped.push({ category: target, item: null });
      continue;
    }
    targets.push(target);
    items[target] = kept;
  }

  return { selection: { targets, items }, dropped };
}
