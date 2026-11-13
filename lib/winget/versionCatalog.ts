/**
 * The WinGet version catalog: the versions of popular apps in microsoft/winget-pkgs.
 *
 * scripts/sync-winget-versions.js writes public/winget-versions.json, and a scheduled
 * workflow keeps it current. This module validates the file. A file that does not match
 * the schema is rejected completely; no part of it is used.
 */
import { z } from "@/lib/utils/zod";
import { PINNABLE_VERSION_PATTERN } from "@/lib/winget/versionText";

/** Site-relative URL of the bundled catalog file. */
export const WINGET_VERSION_CATALOG_URL = "/winget-versions.json";

const ARCHITECTURES = ["arm", "arm64", "neutral", "x64", "x86"] as const;
const INSTALLER_TYPES = [
  "appx",
  "burn",
  "exe",
  "font",
  "inno",
  "msi",
  "msix",
  "nullsoft",
  "portable",
  "pwa",
  "wix",
  "zip",
] as const;
const SCOPES = ["machine", "user"] as const;

const installerTypeSchema = z.enum(INSTALLER_TYPES);

const installerSchema = z.strictObject({
  architecture: z.enum(ARCHITECTURES),
  installerType: installerTypeSchema,
  nestedInstallerType: installerTypeSchema.nullable(),
  /** Null when the manifest does not state a scope. */
  scope: z.enum(SCOPES).nullable(),
  url: z.url({ protocol: /^https?$/ }),
});

const versionSchema = z.strictObject({
  version: z.string().trim().min(1),
  /** True only for the newest version of the app. */
  latest: z.boolean(),
  /** True for every version other than the newest. */
  bestEffort: z.boolean(),
  /** Release date from the manifest (YYYY-MM-DD), or null when the manifest has none. */
  releaseDate: z.iso.date().nullable(),
  installers: z.array(installerSchema).min(1),
});

const appSchema = z
  .strictObject({
    templateId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    packageIdentifier: z.string().regex(/^[^.\s/]+(\.[^.\s/]+)+$/),
    displayName: z.string().trim().min(1),
    publisher: z.string().trim().min(1),
    manifestPath: z.string().regex(/^manifests\/[0-9a-z]\/\S+$/),
    versions: z.array(versionSchema).min(1),
  })
  .superRefine((app, context) => {
    const seen = new Set<string>();
    app.versions.forEach((version, index) => {
      if (version.latest !== (index === 0) || version.bestEffort !== (index !== 0)) {
        context.addIssue({
          code: "custom",
          path: ["versions", index],
          message: "Only the first version is latest; every other version is best effort",
        });
      }
      if (seen.has(version.version)) {
        context.addIssue({ code: "custom", path: ["versions", index, "version"], message: "Duplicate version" });
      }
      seen.add(version.version);
    });
  });

const catalogSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    repository: z.literal("microsoft/winget-pkgs"),
    keptVersionCount: z.number().int().positive(),
    apps: z.array(appSchema).min(1),
  })
  .superRefine((catalog, context) => {
    const templateIds = new Set<string>();
    const packageIds = new Set<string>();
    catalog.apps.forEach((app, index) => {
      const packageKey = app.packageIdentifier.toLowerCase();
      if (templateIds.has(app.templateId) || packageIds.has(packageKey)) {
        context.addIssue({ code: "custom", path: ["apps", index], message: "Duplicate app" });
      }
      templateIds.add(app.templateId);
      packageIds.add(packageKey);
      if (app.versions.length > catalog.keptVersionCount) {
        context.addIssue({
          code: "custom",
          path: ["apps", index, "versions"],
          message: `More than ${catalog.keptVersionCount} versions`,
        });
      }
    });
  });

export type WinGetVersionCatalog = z.infer<typeof catalogSchema>;
export type WinGetCatalogApp = WinGetVersionCatalog["apps"][number];
export type WinGetCatalogVersion = WinGetCatalogApp["versions"][number];
export type WinGetCatalogInstaller = WinGetCatalogVersion["installers"][number];
export type WinGetArchitecture = WinGetCatalogInstaller["architecture"];

/**
 * Validates catalog data. Throws when the data does not match the schema, including
 * when it has a field that the schema does not know.
 */
export function parseWinGetVersionCatalog(data: unknown): WinGetVersionCatalog {
  const result = catalogSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    throw new Error(`The WinGet version catalog is not valid${where}: ${issue?.message ?? "unknown error"}`);
  }
  return result.data;
}

/** Fetches and validates the bundled catalog. Throws when the file cannot load or is not valid. */
export async function fetchWinGetVersionCatalog(): Promise<WinGetVersionCatalog> {
  const response = await fetch(WINGET_VERSION_CATALOG_URL);
  if (!response.ok) {
    throw new Error(`The WinGet version catalog did not load (HTTP ${response.status}).`);
  }
  return parseWinGetVersionCatalog(await response.json());
}

/** Returns the catalog app for a WinGet package identifier (case-insensitive), or undefined. */
export function findWinGetCatalogApp(
  catalog: WinGetVersionCatalog,
  packageIdentifier: string
): WinGetCatalogApp | undefined {
  const key = packageIdentifier.toLowerCase();
  return catalog.apps.find((app) => app.packageIdentifier.toLowerCase() === key);
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

/** Returns the architectures that the installers of a version support, sorted. */
export function getVersionArchitectures(version: WinGetCatalogVersion): WinGetArchitecture[] {
  return uniqueSorted(version.installers.map((installer) => installer.architecture));
}

/** Returns the installer types of a version, sorted. */
export function getVersionInstallerTypes(version: WinGetCatalogVersion): string[] {
  return uniqueSorted(version.installers.map((installer) => installer.installerType));
}

/**
 * True when the kit can pin the version: it has a machine-scope x64 installer (the wrapper
 * installs with "--scope machine" and the app is x64 only), and its version text is safe for
 * the winget command line.
 */
export function isPinnableVersion(version: WinGetCatalogVersion): boolean {
  return (
    PINNABLE_VERSION_PATTERN.test(version.version) &&
    version.installers.some((installer) => installer.architecture === "x64" && installer.scope === "machine")
  );
}

/** The versions of an app that the kit can pin, newest first. */
export function getPinnableVersions(app: WinGetCatalogApp): WinGetCatalogVersion[] {
  return app.versions.filter(isPinnableVersion);
}

/**
 * True when the kit offers the app: its newest catalog version has a machine-scope x64
 * installer. "Latest" installs the newest version with "--scope machine" and no version, so
 * an app whose newest version cannot be installed that way is not offered, even when an
 * older version could be pinned.
 */
export function isOfferableApp(app: WinGetCatalogApp): boolean {
  const newest = app.versions[0];
  return newest !== undefined && isPinnableVersion(newest);
}

/** Maximum number of pinned apps in one selection. */
const MAX_PINNED_APPS = 100;

/** A pinned version as it is stored: the version text only. Catalog membership is checked at use. */
export const winGetVersionChoiceSchema = z.string().regex(PINNABLE_VERSION_PATTERN);

/**
 * Pinned versions per Win32 app template ID. An app that is not in the record uses the latest
 * version. Strict: an invalid key or version rejects the whole record.
 */
export const winGetVersionSelectionSchema = z
  .record(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64), winGetVersionChoiceSchema)
  .refine((record) => Object.keys(record).length <= MAX_PINNED_APPS, {
    message: `More than ${MAX_PINNED_APPS} pinned versions.`,
  });

export type WinGetVersionSelection = z.infer<typeof winGetVersionSelectionSchema>;

/**
 * Returns the catalog version for a pinned choice. Throws when the app is not in the catalog,
 * the version is not in the catalog for that app, or the kit cannot pin that version.
 */
export function resolvePinnedVersion(
  catalog: WinGetVersionCatalog,
  packageIdentifier: string,
  version: string
): WinGetCatalogVersion {
  const app = findWinGetCatalogApp(catalog, packageIdentifier);
  if (!app) {
    throw new Error(`${packageIdentifier} is not in the WinGet version catalog.`);
  }
  const entry = app.versions.find((candidate) => candidate.version === version);
  if (!entry) {
    throw new Error(`Version ${version} of ${packageIdentifier} is not in the WinGet version catalog.`);
  }
  if (!isPinnableVersion(entry)) {
    throw new Error(`Version ${version} of ${packageIdentifier} has no machine-scope x64 installer, so it cannot be pinned.`);
  }
  return entry;
}
