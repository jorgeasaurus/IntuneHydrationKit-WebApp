import { expect, test } from "@playwright/test";

test.describe("Sign-in", () => {
  test("opens the Microsoft sign-in window directly from the call to action", async ({ context, page }) => {
    await context.route("https://login.microsoftonline.com/**", async (route) => {
      await route.fulfill({
        body: "<!doctype html><title>Microsoft sign-in test target</title>",
        contentType: "text/html",
        status: 200,
      });
    });
    await page.goto("/");

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: /sign in with microsoft/i }).click();
    const popup = await popupPromise;

    await popup.waitForURL(/login\.microsoftonline\.com/, { timeout: 30_000 });
    expect(new URL(popup.url()).searchParams.get("redirect_uri")).toBe(
      new URL(page.url()).origin
    );
  });
});
