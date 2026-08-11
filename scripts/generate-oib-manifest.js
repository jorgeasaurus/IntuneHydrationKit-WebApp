#!/usr/bin/env node
/**
 * Script to generate manifest.json for OpenIntuneBaseline
 * Run this after adding/updating baseline files
 *
 * Usage: node scripts/generate-oib-manifest.js
 */

const fs = require('fs');
const path = require('path');

const OIB_DIR = path.join(__dirname, '../public/IntuneTemplates/OpenIntuneBaseline');
const MANIFEST_PATH = path.join(OIB_DIR, 'manifest.json');

function getJsonFiles(dir, basePath = '') {
  const files = [];

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      // Skip hidden directories
      if (entry.name.startsWith('.')) continue;

      files.push(...getJsonFiles(fullPath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json') {
      files.push(relativePath);
    }
  }

  return files;
}

function parseFilePath(filePath) {
  // Parse path like "WINDOWS/IntuneManagement/SettingsCatalog/Win - OIB - SC - Policy.json"
  // or "BYOD/AppProtection/Android - Baseline - BYOD - App Protection.json"
  const parts = filePath.split(path.sep);

  let platform = '';
  let policyType = '';
  let displayName = '';

  if (parts.length >= 1) {
    platform = parts[0]; // WINDOWS, MACOS, BYOD, WINDOWS365
  }

  // Find the policy type from folder structure
  // Includes: SettingsCatalog, CompliancePolicies, AppProtection, DeviceConfiguration, UpdatePolicies, DriverUpdateProfiles
  for (let i = 1; i < parts.length - 1; i++) {
    if (['SettingsCatalog', 'CompliancePolicies', 'AppProtection', 'DeviceConfiguration', 'UpdatePolicies', 'DriverUpdateProfiles'].includes(parts[i])) {
      policyType = parts[i];
      break;
    }
  }

  // Get display name from filename (remove .json extension)
  displayName = parts[parts.length - 1].replace('.json', '');

  return { platform, policyType, displayName };
}

// Map platform names to friendly display names
const PLATFORM_DISPLAY_NAMES = {
  'WINDOWS': 'Windows',
  'MACOS': 'macOS',
  'BYOD': 'BYOD (Bring Your Own Device)',
  'WINDOWS365': 'Windows 365 Cloud PC',
};

function generateManifest() {
  console.log('Scanning OpenIntuneBaseline directory...');

  const jsonFiles = getJsonFiles(OIB_DIR);
  const existingManifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { files: [] };
  const existingDisplayNames = new Map(
    existingManifest.files.map(file => [file.path, file.displayName])
  );

  console.log(`Found ${jsonFiles.length} JSON files`);

  const files = jsonFiles.map(filePath => {
    const { platform, policyType, displayName } = parseFilePath(filePath);
    const webPath = filePath.replace(/\\/g, '/');
    return {
      path: webPath,
      platform,
      policyType,
      displayName: existingDisplayNames.get(webPath) || displayName,
    };
  });

  // Sort by platform, then policyType, then displayName
  files.sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    if (a.policyType !== b.policyType) return a.policyType.localeCompare(b.policyType);
    return a.displayName.localeCompare(b.displayName);
  });

  // Build platform summary
  const platformSummary = {};
  for (const file of files) {
    if (!platformSummary[file.platform]) {
      platformSummary[file.platform] = {
        name: PLATFORM_DISPLAY_NAMES[file.platform] || file.platform,
        count: 0,
      };
    }
    platformSummary[file.platform].count++;
  }

  // Convert to array format
  const platforms = Object.entries(platformSummary).map(([id, data]) => ({
    id,
    name: data.name,
    count: data.count,
  }));

  const manifest = {
    totalFiles: files.length,
    platforms,
    files: files.map(({ path, displayName }) => ({ path, displayName })),
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(`Manifest generated at: ${MANIFEST_PATH}`);
  console.log(`Total files: ${files.length}`);

  // Print platform summary
  console.log('\nPlatform breakdown:');
  for (const plat of platforms) {
    console.log(`  ${plat.name}: ${plat.count} files`);
  }
}

generateManifest();
