#!/usr/bin/env node
/**
 * Sync OpenIntuneBaseline templates from upstream repository
 *
 * Downloads the latest IntuneManagement policy JSONs from
 * SkipToTheEndpoint/OpenIntuneBaseline and updates our local copy.
 * After syncing, regenerates the OIB manifest.
 *
 * Usage:
 *   node scripts/sync-oib-templates.js              # full sync
 *   node scripts/sync-oib-templates.js --check-only # report if updates available (no writes)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const UPSTREAM_REPO = "SkipToTheEndpoint/OpenIntuneBaseline";
const UPSTREAM_BRANCH = "main";
const OIB_DIR = path.join(
  __dirname,
  "../public/IntuneTemplates/OpenIntuneBaseline"
);
const TRACKING_FILE = path.join(OIB_DIR, ".upstream-sha");

// Platforms whose IntuneManagement/ subfolder we sync
const INTUNE_MANAGEMENT_PLATFORMS = ["WINDOWS", "MACOS", "WINDOWS365"];

// Additional platform folders with non-standard structures
const EXTRA_PLATFORM_FOLDERS = [
  { platform: "BYOD", subdir: "AppProtection" },
];

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf-8", ...opts }).trim();
}

function getUpstreamHeadSha() {
  const output = run(
    `git ls-remote https://github.com/${UPSTREAM_REPO}.git refs/heads/${UPSTREAM_BRANCH}`
  );
  return output.split(/\s/)[0];
}

function getLocalSha() {
  if (fs.existsSync(TRACKING_FILE)) {
    return fs.readFileSync(TRACKING_FILE, "utf-8").trim();
  }
  return null;
}

function writeLocalSha(sha) {
  fs.writeFileSync(TRACKING_FILE, sha + "\n");
}

/**
 * Recursively collect all files under `dir` relative to `base`
 * Returns sorted array of relative paths
 */
function collectFiles(dir, base = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push(path.relative(base, full));
    }
  }
  return results.sort();
}

/**
 * Recursively remove a directory (rm -rf equivalent)
 */
function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Copy directory tree from src to dest, creating parent dirs as needed
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  const checkOnly = process.argv.includes("--check-only");

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  OpenIntuneBaseline Template Sync                ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`  Upstream : ${UPSTREAM_REPO} (${UPSTREAM_BRANCH})`);

  // 1. Check upstream HEAD
  console.log("\n▶ Checking upstream HEAD...");
  const upstreamSha = getUpstreamHeadSha();
  const localSha = getLocalSha();

  console.log(`  Upstream SHA : ${upstreamSha}`);
  console.log(`  Local SHA    : ${localSha || "(none – first sync)"}`);

  if (localSha === upstreamSha) {
    console.log("\n✔ Templates are up-to-date. Nothing to do.");
    process.exit(0);
  }

  console.log("\n⚡ Update available.");

  if (checkOnly) {
    console.log("  (--check-only mode, skipping download)");
    // Exit code 2 signals "update available" for CI callers
    process.exit(2);
  }

  // 2. Download upstream tarball
  const tmpDir = path.join(
    require("os").tmpdir(),
    `oib-sync-${Date.now()}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  const tarballUrl = `https://github.com/${UPSTREAM_REPO}/archive/${UPSTREAM_BRANCH}.tar.gz`;
  const tarballPath = path.join(tmpDir, "oib.tar.gz");

  console.log(`\n▶ Downloading tarball from ${UPSTREAM_BRANCH}...`);
  run(`curl -fsSL "${tarballUrl}" -o "${tarballPath}"`);

  console.log("▶ Extracting...");
  run(`tar -xzf "${tarballPath}" -C "${tmpDir}"`);

  // The extracted folder is named OpenIntuneBaseline-<branch>
  const extractedDir = fs
    .readdirSync(tmpDir)
    .map((d) => path.join(tmpDir, d))
    .find((d) => fs.statSync(d).isDirectory());

  if (!extractedDir) {
    console.error("✗ Failed to find extracted directory");
    rmrf(tmpDir);
    process.exit(1);
  }
  console.log(`  Extracted to: ${path.basename(extractedDir)}`);

  // 3. Collect before-state for diff reporting
  const beforeFiles = collectFiles(OIB_DIR).filter(
    (f) => f.endsWith(".json") && f !== "manifest.json"
  );

  // 4. Clear existing platform folders and re-copy from upstream
  console.log("\n▶ Syncing platform templates...");
  let totalCopied = 0;

  for (const platform of INTUNE_MANAGEMENT_PLATFORMS) {
    const srcDir = path.join(extractedDir, platform, "IntuneManagement");
    const destDir = path.join(OIB_DIR, platform, "IntuneManagement");

    if (!fs.existsSync(srcDir)) {
      console.log(`  ⊘ ${platform}/IntuneManagement – not found upstream, skipping`);
      continue;
    }

    // Remove old and copy fresh
    rmrf(path.join(OIB_DIR, platform));
    fs.mkdirSync(path.join(OIB_DIR, platform), { recursive: true });
    const copied = copyDirRecursive(srcDir, destDir);
    totalCopied += copied;
    console.log(`  ✔ ${platform}/IntuneManagement – ${copied} files`);
  }

  for (const { platform, subdir } of EXTRA_PLATFORM_FOLDERS) {
    const srcDir = path.join(extractedDir, platform, subdir);
    const destDir = path.join(OIB_DIR, platform, subdir);

    if (!fs.existsSync(srcDir)) {
      console.log(`  ⊘ ${platform}/${subdir} – not found upstream, skipping`);
      continue;
    }

    rmrf(path.join(OIB_DIR, platform));
    fs.mkdirSync(path.join(OIB_DIR, platform), { recursive: true });
    const copied = copyDirRecursive(srcDir, destDir);
    totalCopied += copied;
    console.log(`  ✔ ${platform}/${subdir} – ${copied} files`);
  }

  console.log(`\n  Total files copied: ${totalCopied}`);

  // 5. Regenerate manifest
  console.log("\n▶ Regenerating OIB manifest...");
  run("node scripts/generate-oib-manifest.js", { cwd: path.join(__dirname, "..") });

  // 6. Record upstream SHA
  writeLocalSha(upstreamSha);

  // 7. Diff summary
  const afterFiles = collectFiles(OIB_DIR).filter(
    (f) => f.endsWith(".json") && f !== "manifest.json"
  );

  const beforeSet = new Set(beforeFiles);
  const afterSet = new Set(afterFiles);
  const added = afterFiles.filter((f) => !beforeSet.has(f));
  const removed = beforeFiles.filter((f) => !afterSet.has(f));
  const kept = afterFiles.filter((f) => beforeSet.has(f));

  console.log("\n────────────────────────────────────────");
  console.log("  Summary");
  console.log("────────────────────────────────────────");
  console.log(`  Upstream SHA : ${upstreamSha.slice(0, 10)}`);
  console.log(`  Total policies: ${afterFiles.length}`);
  console.log(`  Added    : ${added.length}`);
  console.log(`  Removed  : ${removed.length}`);
  console.log(`  Unchanged/Modified: ${kept.length}`);

  if (added.length > 0 && added.length <= 20) {
    console.log("\n  New policies:");
    for (const f of added) console.log(`    + ${f}`);
  }
  if (removed.length > 0 && removed.length <= 20) {
    console.log("\n  Removed policies:");
    for (const f of removed) console.log(`    - ${f}`);
  }

  // 8. Cleanup temp dir
  rmrf(tmpDir);

  console.log("\n✔ Sync complete.");
}

main().catch((err) => {
  console.error("✗ Sync failed:", err.message || err);
  process.exit(1);
});
