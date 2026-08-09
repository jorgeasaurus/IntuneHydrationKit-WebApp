import { expect, test } from "@playwright/test";

test.describe("Sign-in", () => {
  test("opens the Microsoft sign-in window directly from the call to action", async ({ page }) => {
    await page.goto("/");

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: /sign in with microsoft/i }).click();
    const popup = await popupPromise;

    await popup.waitForURL(/login\.microsoftonline\.com/, { timeout: 30_000 });
  });
});
