#!/usr/bin/env node
/**
 * Sync the WinGet version catalog from microsoft/winget-pkgs
 *
 * For each app in templates/wingetApps.json, reads the version folders of the package,
 * keeps the newest versions that have usable installers, and writes
 * public/winget-versions.json. The output has no timestamps, so the same upstream data
 * always gives the same file. The scheduled workflow opens a pull request only when the
 * file changes.
 *
 * The script reads one commit of microsoft/winget-pkgs for the full run. It checks each
 * installer URL with a HEAD request (or a GET request for 1 byte when the server refuses
 * HEAD). It does not download installers and does not verify hashes.
 *
 * Set GITHUB_TOKEN to use the authenticated GitHub API rate limit.
 *
 * Usage:
 *   node scripts/sync-winget-versions.js
 */

const fs = require("fs");
const path = require("path");
const {
  KEPT_VERSION_COUNT,
  MANIFEST_REPOSITORY,
  buildAppEntry,
  listVersionFolders,
  manifestPathFor,
  parseInstallerManifest,
  selectVersions,
  serializeCatalog,
  validateAppList,
} = require("./winget-catalog");

const APP_LIST_FILE = path.join(__dirname, "../templates/wingetApps.json");
const OUTPUT_FILE = path.join(__dirname, "../public/winget-versions.json");
const UPSTREAM_BRANCH = "master";
const USER_AGENT = "winget-version-catalog-sync";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;
/** Longest wait for a GitHub rate limit reset before the sync stops. */
const MAX_RATE_LIMIT_WAIT_MS = 120_000;
/** The sync stops when more than this share of URL checks has a transient failure. */
const MAX_TRANSIENT_FAILURE_RATIO = 0.25;

const token = process.env.GITHUB_TOKEN?.trim() || null;

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt) {
  return 1000 * 2 ** (attempt - 1);
}

function retryAfterMs(response) {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function encodePath(repoPath) {
  return repoPath.split("/").map(encodeURIComponent).join("/");
}

/**
 * Sends a request to GitHub. Retries server errors and secondary rate limits. Waits for a
 * primary rate limit reset when it is near; otherwise it stops with a clear message.
 */
async function githubRequest(url, accept, { allowNotFound = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    const headers = { Accept: accept, "User-Agent": USER_AGENT, "X-GitHub-Api-Version": "2022-11-28" };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`GET ${url} failed: ${error.message}`);
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.ok) return response;
    if (allowNotFound && response.status === 404) return null;

    const rateLimited =
      response.status === 429 ||
      (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") ||
      (response.status === 403 && response.headers.get("retry-after") !== null);
    if (rateLimited && attempt < MAX_ATTEMPTS) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const waitMs =
        retryAfterMs(response) ?? (Number.isFinite(reset) ? reset * 1000 - Date.now() + 1000 : backoffMs(attempt));
      if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
        throw new Error(
          `GitHub rate limit reached for ${url}. Set GITHUB_TOKEN or try again after ${new Date(Date.now() + waitMs).toISOString()}.`
        );
      }
      console.log(`  ⏳ GitHub rate limit, waiting ${Math.ceil(waitMs / 1000)}s`);
      await sleep(Math.max(waitMs, 1000));
      continue;
    }
    if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw new Error(`GET ${url} failed: HTTP ${response.status} ${response.statusText}`);
  }
}

async function githubJson(apiPath) {
  const response = await githubRequest(`https://api.github.com${apiPath}`, "application/vnd.github+json");
  return response.json();
}

async function getUpstreamCommit() {
  const ref = await githubJson(`/repos/${MANIFEST_REPOSITORY}/git/ref/heads/${UPSTREAM_BRANCH}`);
  const sha = ref?.object?.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Unexpected response for ${MANIFEST_REPOSITORY} ${UPSTREAM_BRANCH}`);
  }
  return sha;
}

/**
 * Lists the direct children of the package folder with one Git tree request. The Git
 * tree API has no pagination; it marks a listing that is too large as truncated.
 */
async function getPackageTree(commitSha, manifestPath) {
  const tree = await githubJson(
    `/repos/${MANIFEST_REPOSITORY}/git/trees/${commitSha}:${encodePath(manifestPath)}`
  );
  if (!Array.isArray(tree?.tree)) throw new Error(`Unexpected tree response for ${manifestPath}`);
  if (tree.truncated) throw new Error(`The tree listing for ${manifestPath} is truncated`);
  return tree.tree;
}

/** Returns the text of a file at the commit, or null when the file does not exist. */
async function getRawFile(commitSha, repoPath) {
  const response = await githubRequest(
    `https://raw.githubusercontent.com/${MANIFEST_REPOSITORY}/${commitSha}/${encodePath(repoPath)}`,
    "text/plain",
    { allowNotFound: true }
  );
  return response === null ? null : response.text();
}

// ────────────────────────────────────────────
// Installer URL checks
// ────────────────────────────────────────────

const urlResults = new Map();
const urlStats = { checked: 0, transient: 0 };

/**
 * Sends one request and classifies the result:
 * - "ok": status 2xx (after redirects)
 * - "missing": status 4xx other than 408 and 429 (the file is not there)
 * - "transient": network error, timeout, 408, 429, or 5xx
 */
async function probe(url, method) {
  const headers = { "User-Agent": USER_AGENT };
  if (method === "GET") headers.Range = "bytes=0-0";
  try {
    const response = await fetch(url, {
      method,
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // Do not read the body. A server that ignores the Range header could send the full file.
    await response.body?.cancel().catch(() => {});
    if (response.ok) return "ok";
    if (response.status === 408 || response.status === 429 || response.status >= 500) return "transient";
    return "missing";
  } catch {
    return "transient";
  }
}

/** Returns true when the installer URL resolves. Each URL is checked once per run. */
async function checkUrlOnce(url) {
  let last = "transient";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await probe(url, "HEAD");
    if (last === "ok") return true;
    // Some servers refuse HEAD (403, 405, 501). Ask for 1 byte with GET.
    last = await probe(url, "GET");
    if (last === "ok") return true;
    if (last === "missing") return false;
    if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt));
  }
  urlStats.transient++;
  console.warn(`  ⚠ ${url} did not respond after ${MAX_ATTEMPTS} attempts; treated as unreachable`);
  return false;
}

function checkUrl(url) {
  if (!urlResults.has(url)) {
    urlStats.checked++;
    urlResults.set(url, checkUrlOnce(url));
  }
  return urlResults.get(url);
}

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  WinGet Version Catalog Sync                     ║");
  console.log("╚══════════════════════════════════════════════════╝");

  const apps = validateAppList(JSON.parse(fs.readFileSync(APP_LIST_FILE, "utf8")));
  console.log(`  Upstream : ${MANIFEST_REPOSITORY} (${UPSTREAM_BRANCH})`);
  console.log(`  Apps     : ${apps.length}`);
  console.log(`  Keep     : ${KEPT_VERSION_COUNT} versions per app`);
  console.log(`  Auth     : ${token ? "GITHUB_TOKEN" : "none (60 API requests per hour)"}`);

  const commitSha = await getUpstreamCommit();
  console.log(`  Commit   : ${commitSha}`);

  const entries = [];
  for (const app of apps) {
    const manifestPath = manifestPathFor(app.packageIdentifier);
    console.log(`\n▶ ${app.displayName} (${app.packageIdentifier})`);

    const versions = listVersionFolders(await getPackageTree(commitSha, manifestPath));
    if (versions.length === 0) throw new Error(`${app.packageIdentifier}: no version folders in ${manifestPath}`);

    const { selected, skipped } = await selectVersions({
      versions,
      readManifest: async (version) => {
        const text = await getRawFile(commitSha, `${manifestPath}/${version}/${app.packageIdentifier}.installer.yaml`);
        return text === null
          ? null
          : parseInstallerManifest(text, { packageIdentifier: app.packageIdentifier, version });
      },
      checkUrl,
    });

    for (const { version, reason } of skipped) console.log(`  ⊘ ${version} – ${reason}`);
    const entry = buildAppEntry(app, selected);
    for (const version of entry.versions) {
      const label = version.latest ? "latest" : "best effort";
      const architectures = [...new Set(version.installers.map((installer) => installer.architecture))].join(", ");
      console.log(`  ✔ ${version.version} (${label}; ${architectures})`);
    }
    entries.push(entry);
  }

  if (urlStats.checked > 0 && urlStats.transient / urlStats.checked > MAX_TRANSIENT_FAILURE_RATIO) {
    throw new Error(
      `${urlStats.transient} of ${urlStats.checked} installer URLs did not respond. The network is not reliable; the catalog was not written.`
    );
  }

  const output = serializeCatalog(entries);
  const previous = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, "utf8") : null;
  if (previous === output) {
    console.log("\n✔ The catalog did not change.");
    return;
  }
  fs.writeFileSync(OUTPUT_FILE, output);
  const versionCount = entries.reduce((total, entry) => total + entry.versions.length, 0);
  console.log(`\n✔ Wrote ${path.relative(process.cwd(), OUTPUT_FILE)}: ${entries.length} apps, ${versionCount} versions.`);
}

main().catch((err) => {
  console.error("✗ Sync failed:", err.message || err);
  process.exit(1);
});
