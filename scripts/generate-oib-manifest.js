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

  // Find the policy type (SettingsCatalog, CompliancePolicies, AppProtection)
  for (let i = 1; i < parts.length - 1; i++) {
    if (['SettingsCatalog', 'CompliancePolicies', 'AppProtection'].includes(parts[i])) {
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

// Map policy types to descriptions
const POLICY_TYPE_DESCRIPTIONS = {
  'SettingsCatalog': 'Settings Catalog configuration policies',
  'CompliancePolicies': 'Device compliance policies',
  'AppProtection': 'App protection policies (MAM)',
};

function generateManifest() {
  console.log('Scanning OpenIntuneBaseline directory...');

  const jsonFiles = getJsonFiles(OIB_DIR);

  console.log(`Found ${jsonFiles.length} JSON files`);

  const files = jsonFiles.map(filePath => {
    const { platform, policyType, displayName } = parseFilePath(filePath);
    return {
      path: filePath.replace(/\\/g, '/'), // Normalize path separators for web
      platform,
      policyType,
      displayName,
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
        policyTypes: {},
      };
    }
    platformSummary[file.platform].count++;

    if (!platformSummary[file.platform].policyTypes[file.policyType]) {
      platformSummary[file.platform].policyTypes[file.policyType] = 0;
    }
    platformSummary[file.platform].policyTypes[file.policyType]++;
  }

  // Convert to array format
  const platforms = Object.entries(platformSummary).map(([id, data]) => ({
    id,
    name: data.name,
    count: data.count,
    policyTypes: Object.entries(data.policyTypes).map(([type, count]) => ({
      type,
      description: POLICY_TYPE_DESCRIPTIONS[type] || type,
      count,
    })),
  }));

  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalFiles: files.length,
    platforms,
    files,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(`Manifest generated at: ${MANIFEST_PATH}`);
  console.log(`Total files: ${files.length}`);

  // Print platform summary
  console.log('\nPlatform breakdown:');
  for (const plat of platforms) {
    console.log(`  ${plat.name}: ${plat.count} files`);
    for (const pt of plat.policyTypes) {
      console.log(`    - ${pt.type}: ${pt.count}`);
    }
  }
}

generateManifest();
