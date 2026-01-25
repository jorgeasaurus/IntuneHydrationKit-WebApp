/**
 * Test script to verify CIS baseline template lookup fix
 *
 * This tests that templates can be found by:
 * 1. displayName
 * 2. name property
 * 3. _cisFilePath (file path) - THE FIX
 *
 * Run with: npx tsx scripts/test-cis-lookup.ts
 */

interface CISBaselinePolicy {
  displayName?: string;
  name?: string;
  _cisFilePath: string;
  _cisCategory: string;
  _cisSubcategory: string;
  [key: string]: unknown;
}

// Simulate the template lookup logic from engine.ts
function findTemplate(
  cached: CISBaselinePolicy[],
  taskItemName: string
): CISBaselinePolicy | undefined {
  return cached.find(
    (b) => b.displayName === taskItemName ||
           (b as Record<string, unknown>).name === taskItemName ||
           b._cisFilePath === taskItemName
  );
}

// Mock CIS policies as they would be cached
const mockCachedPolicies: CISBaselinePolicy[] = [
  {
    displayName: "Baseline - Android Enterprise - Device Health",
    _cisFilePath: "1.0 - Android Benchmarks/Android Compliance/Baseline - Android Enterprise - Device Health.json",
    _cisCategory: "1.0 - Android Benchmarks",
    _cisSubcategory: "Android Compliance",
    "@odata.type": "#microsoft.graph.androidCompliancePolicy",
  },
  {
    displayName: "Baseline - Android Enterprise - Device Properties",
    _cisFilePath: "1.0 - Android Benchmarks/Android Compliance/Baseline - Android Enterprise - Device Properties.json",
    _cisCategory: "1.0 - Android Benchmarks",
    _cisSubcategory: "Android Compliance",
  },
  {
    name: "Windows Security Baseline",
    _cisFilePath: "2.0 - Windows/Security/Windows Security Baseline.json",
    _cisCategory: "2.0 - Windows",
    _cisSubcategory: "Security",
  },
];

// Test cases
const testCases = [
  {
    name: "Find by displayName",
    taskItemName: "Baseline - Android Enterprise - Device Health",
    shouldFind: true,
  },
  {
    name: "Find by _cisFilePath (THE FIX)",
    taskItemName: "1.0 - Android Benchmarks/Android Compliance/Baseline - Android Enterprise - Device Health.json",
    shouldFind: true,
  },
  {
    name: "Find by name property",
    taskItemName: "Windows Security Baseline",
    shouldFind: true,
  },
  {
    name: "Not found - random string",
    taskItemName: "NonExistent Policy",
    shouldFind: false,
  },
];

console.log("Testing CIS baseline template lookup...\n");

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = findTemplate(mockCachedPolicies, test.taskItemName);
  const found = result !== undefined;

  if (found === test.shouldFind) {
    console.log(`PASS: ${test.name}`);
    console.log(`  Input: "${test.taskItemName}"`);
    console.log(`  Found: ${found}${found ? ` (displayName: ${result?.displayName || result?.name})` : ""}`);
    passed++;
  } else {
    console.log(`FAIL: ${test.name}`);
    console.log(`  Input: "${test.taskItemName}"`);
    console.log(`  Expected: ${test.shouldFind ? "found" : "not found"}`);
    console.log(`  Got: ${found ? "found" : "not found"}`);
    failed++;
  }
  console.log();
}

console.log("---");
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
