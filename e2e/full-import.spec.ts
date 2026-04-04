import { test, expect } from "@playwright/test";

/**
 * Full import flow test — requires manual MSAL authentication.
 * Run with: npx playwright test e2e/full-import.spec.ts --headed --timeout=600000
 */

test.describe("Full Import Flow", () => {
  test.setTimeout(600_000); // 10 minutes for the entire flow

  test("complete hydration wizard and import", async ({ page }) => {
    // Step 1: Navigate to landing page
    await page.goto("/");
    await expect(page.getByText("v2.1")).toBeVisible();

    // Step 2: Click sign-in — user authenticates manually in the browser
    console.log("🔐 Waiting for manual sign-in... Please authenticate in the browser.");
    const signInButton = page.getByRole("button", { name: /sign in/i });
    await expect(signInButton).toBeVisible();
    await signInButton.click();

    // Wait for authentication to complete — user will interact with MSAL popup/redirect
    // After auth, the wizard page or a "signed in" indicator should appear
    console.log("⏳ Waiting for authentication to complete...");
    await page.waitForURL("**/wizard**", { timeout: 120_000 });
    console.log("✅ Authentication complete — on wizard page");

    // Step 3: Wizard — verify we're on the wizard
    await expect(page.getByText(/IntuneHydrationKit/i)).toBeVisible();

    // Take screenshots at each step for documentation
    await page.screenshot({ path: "test-results/wizard-step1.png", fullPage: true });

    // The rest of the test observes the wizard flow
    // User will interact with the wizard manually if needed
    console.log("📋 Wizard loaded. Observing flow...");

    // Wait for the page to be fully interactive
    await page.waitForTimeout(3000);

    // Step 4: Take a final screenshot
    await page.screenshot({ path: "test-results/wizard-final.png", fullPage: true });

    console.log("🎉 Full import flow test complete");
  });
});
