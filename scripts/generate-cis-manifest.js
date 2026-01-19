#!/usr/bin/env node
/**
 * Script to generate manifest.json for CIS Intune Baselines
 * Run this after adding/updating CIS baseline files
 *
 * Usage: node scripts/generate-cis-manifest.js
 */

const fs = require('fs');
const path = require('path');

const CIS_BASELINES_DIR = path.join(__dirname, '../public/CISIntuneBaselines');
const MANIFEST_PATH = path.join(CIS_BASELINES_DIR, 'manifest.json');

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
  // Parse path like "1.0 - Android Benchmarks/Android Compliance/Baseline - Android Enterprise - Device Health.json"
  const parts = filePath.split(path.sep);

  let category = '';
  let subcategory = '';
  let displayName = '';

  if (parts.length >= 1) {
    category = parts[0];
  }
  if (parts.length >= 2) {
    subcategory = parts[1];
  }
  if (parts.length >= 3) {
    // Get display name from filename (remove .json extension)
    displayName = parts[parts.length - 1].replace('.json', '');
  } else if (parts.length === 2) {
    displayName = parts[1].replace('.json', '');
  }

  return { category, subcategory, displayName };
}

// Map category folder names to friendly IDs
const CATEGORY_ID_MAP = {
  '1.0 - Android Benchmarks': 'cis-android',
  '2.0 - Apple Benchmarks': 'cis-apple',
  '3.0 - Browser Benchmarks': 'cis-browser',
  '4.0 - CIS Benchmarks': 'cis-windows-cis',
  '5.0 - Linux Benchmarks': 'cis-linux',
  '6.0 - Microsoft Endpoint Security Benchmarks': 'cis-endpoint-security',
  '7.0 - Visual Studio Benchmarks': 'cis-visual-studio',
  '8.0 - Windows 11 Benchmarks': 'cis-windows-11',
  '9.0 - Windows Cloud PC and AVD': 'cis-cloud-pc',
};

const CATEGORY_DISPLAY_NAMES = {
  '1.0 - Android Benchmarks': 'Android Benchmarks',
  '2.0 - Apple Benchmarks': 'Apple Benchmarks',
  '3.0 - Browser Benchmarks': 'Browser Benchmarks',
  '4.0 - CIS Benchmarks': 'CIS Windows 11 Benchmarks',
  '5.0 - Linux Benchmarks': 'Linux Benchmarks',
  '6.0 - Microsoft Endpoint Security Benchmarks': 'Microsoft Endpoint Security',
  '7.0 - Visual Studio Benchmarks': 'Visual Studio Benchmarks',
  '8.0 - Windows 11 Benchmarks': 'Windows 11 Benchmarks',
  '9.0 - Windows Cloud PC and AVD': 'Windows Cloud PC & AVD',
};

const CATEGORY_DESCRIPTIONS = {
  '1.0 - Android Benchmarks': 'Android Enterprise and compliance policies',
  '2.0 - Apple Benchmarks': 'macOS and iOS security configurations',
  '3.0 - Browser Benchmarks': 'Chrome and Edge browser security settings',
  '4.0 - CIS Benchmarks': 'CIS security benchmarks for Windows 11 and macOS',
  '5.0 - Linux Benchmarks': 'Linux compliance policies',
  '6.0 - Microsoft Endpoint Security Benchmarks': 'Endpoint Security antivirus and firewall policies',
  '7.0 - Visual Studio Benchmarks': 'Visual Studio and VS Code security settings',
  '8.0 - Windows 11 Benchmarks': 'Windows 11 BitLocker, Edge, and M365 Apps settings',
  '9.0 - Windows Cloud PC and AVD': 'Azure Virtual Desktop and Windows 365 policies',
};

function generateManifest() {
  console.log('Scanning CIS Baselines directory...');

  const jsonFiles = getJsonFiles(CIS_BASELINES_DIR);

  console.log(`Found ${jsonFiles.length} JSON files`);

  const files = jsonFiles.map(filePath => {
    const { category, subcategory, displayName } = parseFilePath(filePath);
    return {
      path: filePath.replace(/\\/g, '/'), // Normalize path separators for web
      category,
      subcategory,
      displayName,
    };
  });

  // Sort by category, then subcategory, then displayName
  files.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.subcategory !== b.subcategory) return a.subcategory.localeCompare(b.subcategory);
    return a.displayName.localeCompare(b.displayName);
  });

  // Build category summary
  const categorySummary = {};
  for (const file of files) {
    if (!categorySummary[file.category]) {
      categorySummary[file.category] = {
        id: CATEGORY_ID_MAP[file.category] || file.category.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: CATEGORY_DISPLAY_NAMES[file.category] || file.category,
        description: CATEGORY_DESCRIPTIONS[file.category] || '',
        count: 0,
        subcategories: {},
      };
    }
    categorySummary[file.category].count++;

    if (!categorySummary[file.category].subcategories[file.subcategory]) {
      categorySummary[file.category].subcategories[file.subcategory] = 0;
    }
    categorySummary[file.category].subcategories[file.subcategory]++;
  }

  // Convert to array format
  const categories = Object.entries(categorySummary).map(([folder, data]) => ({
    id: data.id,
    folder,
    name: data.name,
    description: data.description,
    count: data.count,
    subcategories: Object.entries(data.subcategories).map(([name, count]) => ({
      name,
      count,
    })),
  }));

  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalFiles: files.length,
    categories,
    files,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(`Manifest generated at: ${MANIFEST_PATH}`);
  console.log(`Total files: ${files.length}`);

  // Print category summary
  console.log('\nCategory breakdown:');
  for (const cat of categories) {
    console.log(`  ${cat.name} (${cat.id}): ${cat.count} files`);
  }
}

generateManifest();
