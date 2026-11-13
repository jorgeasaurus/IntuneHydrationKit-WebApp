/**
 * Pure functions that build the WinGet version catalog (public/winget-versions.json).
 *
 * scripts/sync-winget-versions.js does the network work and calls these functions.
 * This module has no network or file access, so the unit tests can run it with fixtures.
 */

const { parse: parseYaml } = require("yaml");

/** Version of the catalog file format. Increase it when the shape of the file changes. */
const CATALOG_SCHEMA_VERSION = 1;
const MANIFEST_REPOSITORY = "microsoft/winget-pkgs";
/** Number of versions that the catalog keeps for each app. */
const KEPT_VERSION_COUNT = 5;
/**
 * Number of upstream versions that the sync examines for each app. The sync examines
 * older versions only when newer versions have no usable installer.
 */
const MAX_CANDIDATE_VERSIONS = KEPT_VERSION_COUNT * 2;

const ARCHITECTURES = ["arm", "arm64", "neutral", "x64", "x86"];
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
];
const SCOPES = ["machine", "user"];
const UINT64_MAX = 18446744073709551615n;

// ────────────────────────────────────────────
// Manifest paths
// ────────────────────────────────────────────

/**
 * Returns the folder of a package in microsoft/winget-pkgs. Every "." in the package
 * identifier starts a new folder: "Microsoft.Sysinternals.PsTools" becomes
 * "manifests/m/Microsoft/Sysinternals/PsTools".
 */
function manifestPathFor(packageIdentifier) {
  if (typeof packageIdentifier !== "string" || !/^[^.\s/]+(\.[^.\s/]+)+$/.test(packageIdentifier)) {
    throw new Error(`Invalid WinGet package identifier: ${JSON.stringify(packageIdentifier)}`);
  }
  return ["manifests", packageIdentifier[0].toLowerCase(), ...packageIdentifier.split(".")].join("/");
}

/**
 * Returns the names of the child folders from a Git tree listing (not recursive) of a
 * package folder. Most child folders are versions. Some are sub-packages (for example
 * Google.Chrome.Beta in Google/Chrome/Beta); they have no "<Id>.installer.yaml" for the
 * package, so selectVersions skips them.
 */
function listVersionFolders(treeEntries) {
  return treeEntries.filter((entry) => entry.type === "tree").map((entry) => entry.path);
}

// ────────────────────────────────────────────
// WinGet version comparison
// ────────────────────────────────────────────

/**
 * Splits a version string into parts with the rules of the WinGet client
 * (AppInstaller Version class, src/AppInstallerSharedLib/Versions.cpp):
 *
 * 1. Remove spaces at the start and the end.
 * 2. When the first digit comes before the first ".", remove all characters before
 *    that digit ("v1.2" becomes "1.2"; "beta.1" does not change).
 * 3. Split on ".". Each part is a number (the leading digits, as an unsigned 64-bit
 *    integer) and a text suffix (the characters after the digits). A part with no
 *    leading digits has the number 0 and the full part as its suffix. A number that
 *    is larger than 64 bits becomes 0 and the full part becomes the suffix.
 * 4. Remove parts that are 0 with no suffix from the end ("1.0.0" becomes "1").
 */
function parseWinGetVersion(raw) {
  let text = String(raw).trim();
  const digitPos = text.search(/[0-9]/);
  const splitPos = text.indexOf(".");
  if (digitPos !== -1 && (splitPos === -1 || digitPos < splitPos)) {
    text = text.slice(digitPos);
  }

  const parts = text.split(".").map(parseVersionPart);
  while (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (last.number !== 0n || last.suffix !== "") break;
    parts.pop();
  }
  return parts;
}

function parseVersionPart(segment) {
  const part = segment.trim();
  const digits = /^[0-9]+/.exec(part);
  if (!digits) return { number: 0n, suffix: part };
  const number = BigInt(digits[0]);
  if (number > UINT64_MAX) return { number: 0n, suffix: part };
  return { number, suffix: part.slice(digits[0].length) };
}

/**
 * Compares two parts:
 * 1. The larger number is the larger part.
 * 2. With equal numbers, a part with no suffix is larger than a part with a suffix
 *    ("1" is larger than "1-beta").
 * 3. With two suffixes, compare them without case, character by character. WinGet uses
 *    ICU case folding; this function uses toLowerCase, which gives the same result for
 *    the ASCII text that version strings use.
 */
function compareVersionParts(a, b) {
  if (a.number !== b.number) return a.number < b.number ? -1 : 1;
  if (a.suffix === b.suffix) return 0;
  if (a.suffix === "") return 1;
  if (b.suffix === "") return -1;
  const left = a.suffix.toLowerCase();
  const right = b.suffix.toLowerCase();
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Compares two WinGet version strings. Returns a negative number when `a` is older,
 * a positive number when `a` is newer, and 0 when WinGet sees them as the same version.
 *
 * Parts are compared from left to right. When all common parts are equal, the version
 * with more parts is newer. Because trailing zero parts are removed first, "1.0" equals
 * "1". As in WinGet, "1.0-beta" is newer than "1.0", because "1.0" becomes "1" and the
 * longer version wins; but "1.1-beta" is older than "1.1".
 */
function compareWinGetVersions(a, b) {
  const left = parseWinGetVersion(a);
  const right = parseWinGetVersion(b);
  for (let i = 0; i < left.length; i++) {
    if (i >= right.length) return 1;
    const result = compareVersionParts(left[i], right[i]);
    if (result !== 0) return result;
  }
  return left.length < right.length ? -1 : 0;
}

/**
 * Sorts versions newest first. Versions that WinGet sees as equal ("24.09" and "24.9")
 * are sorted by their text, so the order is always the same.
 */
function sortVersionsNewestFirst(versions) {
  return [...versions].sort((a, b) => {
    const result = compareWinGetVersions(b, a);
    if (result !== 0) return result;
    if (a === b) return 0;
    return a < b ? 1 : -1;
  });
}

// ────────────────────────────────────────────
// Installer manifests
// ────────────────────────────────────────────

function optionalString(value, field, context) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${context}: ${field} must be a text value`);
  }
  const text = value.trim();
  return text === "" ? null : text;
}

function requiredString(value, field, context) {
  const text = optionalString(value, field, context);
  if (text === null) throw new Error(`${context}: ${field} is missing`);
  return text;
}

function knownValue(value, allowed, field, context) {
  const normalized = value.toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new Error(`${context}: unknown ${field} "${value}"`);
  }
  return normalized;
}

/** Returns the date when it is a valid calendar date in YYYY-MM-DD form; otherwise null. */
function releaseDateOrNull(value) {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

/**
 * Parses an installer manifest ("<Id>.installer.yaml"). Keys at the root of the manifest
 * apply to every installer that does not set them. All YAML values are read as text
 * (failsafe schema), so a version such as 24.10 stays "24.10" and does not become a number.
 *
 * Returns the version, the release date (YYYY-MM-DD or null), and the installers with
 * architecture, installer type, nested installer type, scope, URL, and SHA-256.
 * Throws when the manifest is not valid for the expected package and version.
 */
function parseInstallerManifest(yamlText, expected) {
  const context = `${expected.packageIdentifier} ${expected.version}`;
  let doc;
  try {
    doc = parseYaml(yamlText, { schema: "failsafe", uniqueKeys: true });
  } catch (error) {
    throw new Error(`${context}: installer manifest is not valid YAML (${error.message})`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`${context}: installer manifest is not a YAML mapping`);
  }

  const manifestType = requiredString(doc.ManifestType, "ManifestType", context);
  if (manifestType.toLowerCase() !== "installer") {
    throw new Error(`${context}: ManifestType is "${manifestType}", expected "installer"`);
  }
  const packageIdentifier = requiredString(doc.PackageIdentifier, "PackageIdentifier", context);
  if (packageIdentifier.toLowerCase() !== expected.packageIdentifier.toLowerCase()) {
    throw new Error(`${context}: PackageIdentifier is "${packageIdentifier}"`);
  }
  const version = requiredString(doc.PackageVersion, "PackageVersion", context);
  if (version !== expected.version) {
    throw new Error(`${context}: PackageVersion is "${version}", expected the folder name`);
  }
  if (!Array.isArray(doc.Installers) || doc.Installers.length === 0) {
    throw new Error(`${context}: Installers is missing or empty`);
  }

  const rootType = optionalString(doc.InstallerType, "InstallerType", context);
  const rootNestedType = optionalString(doc.NestedInstallerType, "NestedInstallerType", context);
  const rootScope = optionalString(doc.Scope, "Scope", context);
  const rootReleaseDate = releaseDateOrNull(optionalString(doc.ReleaseDate, "ReleaseDate", context));
  const installerDates = [];

  const installers = doc.Installers.map((entry, index) => {
    const where = `${context} installer ${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${where}: installer is not a YAML mapping`);
    }
    const installerType = optionalString(entry.InstallerType, "InstallerType", where) ?? rootType;
    if (installerType === null) throw new Error(`${where}: InstallerType is missing`);
    const nestedType =
      optionalString(entry.NestedInstallerType, "NestedInstallerType", where) ?? rootNestedType;
    const scope = optionalString(entry.Scope, "Scope", where) ?? rootScope;
    const date = releaseDateOrNull(optionalString(entry.ReleaseDate, "ReleaseDate", where));
    if (date !== null) installerDates.push(date);
    const url = requiredString(entry.InstallerUrl, "InstallerUrl", where);
    if (!/^https?:\/\/\S+$/i.test(url)) throw new Error(`${where}: InstallerUrl is not an HTTP URL`);

    return {
      architecture: knownValue(requiredString(entry.Architecture, "Architecture", where), ARCHITECTURES, "Architecture", where),
      installerType: knownValue(installerType, INSTALLER_TYPES, "InstallerType", where),
      nestedInstallerType: nestedType === null ? null : knownValue(nestedType, INSTALLER_TYPES, "NestedInstallerType", where),
      scope: scope === null ? null : knownValue(scope, SCOPES, "Scope", where),
      url,
      sha256: optionalString(entry.InstallerSha256, "InstallerSha256", where)?.toUpperCase() ?? null,
    };
  });

  installerDates.sort();
  const releaseDate = rootReleaseDate ?? installerDates[installerDates.length - 1] ?? null;
  return { version, releaseDate, installers };
}

// ────────────────────────────────────────────
// Version selection
// ────────────────────────────────────────────

/**
 * Selects the versions for the catalog, newest first.
 *
 * For each version, newest first, until `keep` versions are selected or
 * `maxCandidates` versions were examined:
 * 1. Read the installer manifest. A folder with no installer manifest is a sub-package,
 *    not a version; skip it and do not count it.
 * 2. Remove each installer whose URL the newest version that uses it lists with a
 *    different SHA-256. The vendor replaced the file at that URL, so WinGet rejects the
 *    old hash.
 * 3. Check each remaining installer URL. Remove the installers that do not resolve.
 * 4. Select the version when at least one installer remains.
 *
 * `readManifest(version)` returns a parsed manifest, or null when the folder has no
 * installer manifest. `checkUrl(url)` returns true when
 * the URL resolves. Both can be async.
 */
async function selectVersions({
  versions,
  readManifest,
  checkUrl,
  keep = KEPT_VERSION_COUNT,
  maxCandidates = MAX_CANDIDATE_VERSIONS,
}) {
  // URL -> SHA-256 of the newest version that uses the URL. That is the file the URL
  // gives now, as far as the manifests tell.
  const newestHashes = new Map();
  const selected = [];
  const skipped = [];

  let examined = 0;
  for (const version of sortVersionsNewestFirst(versions)) {
    if (selected.length >= keep || examined >= maxCandidates) break;
    const manifest = await readManifest(version);
    if (manifest === null) {
      skipped.push({ version, reason: "not a version folder (no installer manifest)" });
      continue;
    }
    examined++;

    const notReplaced = manifest.installers.filter((installer) => {
      const current = newestHashes.get(installer.url);
      return current === undefined || current === null || installer.sha256 === null || current === installer.sha256;
    });
    for (const installer of manifest.installers) {
      if (!newestHashes.has(installer.url)) newestHashes.set(installer.url, installer.sha256);
    }

    const results = await Promise.all(notReplaced.map((installer) => checkUrl(installer.url)));
    const usable = notReplaced.filter((_, index) => results[index] === true);

    if (usable.length === 0) {
      skipped.push({
        version,
        reason: notReplaced.length === 0 ? "installer files replaced by a newer version" : "installer URLs do not resolve",
      });
      continue;
    }
    selected.push({ ...manifest, installers: usable });
  }

  return { selected, skipped };
}

// ────────────────────────────────────────────
// Catalog output
// ────────────────────────────────────────────

function compareText(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function catalogInstallers(installers) {
  const byKey = new Map();
  for (const installer of installers) {
    const entry = {
      architecture: installer.architecture,
      installerType: installer.installerType,
      nestedInstallerType: installer.nestedInstallerType,
      scope: installer.scope,
      url: installer.url,
    };
    byKey.set(JSON.stringify(entry), entry);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      compareText(a.architecture, b.architecture) ||
      compareText(a.installerType, b.installerType) ||
      compareText(a.nestedInstallerType ?? "", b.nestedInstallerType ?? "") ||
      compareText(a.scope ?? "", b.scope ?? "") ||
      compareText(a.url, b.url)
  );
}

/**
 * Builds the catalog entry of one app from its selected manifests. The newest version
 * gets `latest: true`; every other version gets `bestEffort: true`.
 */
function buildAppEntry(app, selectedManifests) {
  if (selectedManifests.length === 0) {
    throw new Error(`${app.packageIdentifier}: no version has a usable installer`);
  }
  const versions = selectedManifests
    .slice()
    .sort((a, b) => compareWinGetVersions(b.version, a.version) || compareText(b.version, a.version))
    .map((manifest, index) => ({
      version: manifest.version,
      latest: index === 0,
      bestEffort: index !== 0,
      releaseDate: manifest.releaseDate,
      installers: catalogInstallers(manifest.installers),
    }));

  return {
    templateId: app.templateId,
    packageIdentifier: app.packageIdentifier,
    displayName: app.displayName,
    publisher: app.publisher,
    manifestPath: manifestPathFor(app.packageIdentifier),
    versions,
  };
}

/**
 * Returns the catalog file text. The apps are sorted by template id and the file has no
 * timestamps, so the same upstream data always gives the same bytes.
 */
function serializeCatalog(appEntries) {
  const catalog = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    repository: MANIFEST_REPOSITORY,
    keptVersionCount: KEPT_VERSION_COUNT,
    apps: appEntries.slice().sort((a, b) => compareText(a.templateId, b.templateId)),
  };
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

/** Checks the curated app list and returns it sorted by template id. */
function validateAppList(apps) {
  if (!Array.isArray(apps) || apps.length === 0) throw new Error("The app list is empty");
  const ids = new Set();
  const packages = new Set();
  for (const app of apps) {
    for (const field of ["templateId", "packageIdentifier", "displayName", "publisher"]) {
      if (typeof app[field] !== "string" || app[field].trim() === "") {
        throw new Error(`App list entry ${JSON.stringify(app)} has no ${field}`);
      }
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(app.templateId)) {
      throw new Error(`Invalid template id "${app.templateId}"`);
    }
    manifestPathFor(app.packageIdentifier);
    const packageKey = app.packageIdentifier.toLowerCase();
    if (ids.has(app.templateId) || packages.has(packageKey)) {
      throw new Error(`Duplicate app list entry "${app.templateId}" (${app.packageIdentifier})`);
    }
    ids.add(app.templateId);
    packages.add(packageKey);
  }
  return apps.slice().sort((a, b) => compareText(a.templateId, b.templateId));
}

module.exports = {
  CATALOG_SCHEMA_VERSION,
  KEPT_VERSION_COUNT,
  MANIFEST_REPOSITORY,
  MAX_CANDIDATE_VERSIONS,
  buildAppEntry,
  compareWinGetVersions,
  listVersionFolders,
  manifestPathFor,
  parseInstallerManifest,
  parseWinGetVersion,
  selectVersions,
  serializeCatalog,
  sortVersionsNewestFirst,
  validateAppList,
};
