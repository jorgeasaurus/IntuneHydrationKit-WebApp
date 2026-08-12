import { test, expect } from "@playwright/test";
import { APP_SETTINGS_STORAGE_KEY } from "../lib/storageKeys";

test.describe("Landing Page", () => {
  test("renders hero section", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /intune hydration kit/i })
    ).toBeVisible();
  });

  test("shows sign-in button when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /sign in with microsoft/i })
    ).toBeVisible();
  });

  test("shows version badge", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("v2.6", { exact: true })).toBeVisible();
  });

  test("has no unexpected console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore known CSP warnings from analytics scripts in dev
        if (text.includes("Content Security Policy")) return;
        errors.push(text);
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  test("has correct page title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/intune hydration kit/i);
  });

  test("renders feature cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/guarded by default/i)).toBeVisible();
  });

  test("links to PowerShell module on GitHub", async ({ page }) => {
    await page.goto("/");
    const link = page
      .getByRole("link", { name: /powershell module/i })
      .first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      "href",
      /github\.com\/jorgeasaurus\/IntuneHydrationKit/
    );
  });

  test("keeps the hero preview below the copy at intermediate desktop widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1067, height: 1102 });
    await page.goto("/");

    await expect(page.locator(".landing-demo-column")).toHaveCount(0);
    await expect(page.locator(".landing-mobile-preview")).toBeVisible();
  });

  test("template page nav links return to landing sections", async ({ page }) => {
    await page.goto("/templates");

    await page.getByRole("link", { name: "Features" }).click();
    await page.waitForURL(/\/#features$/);
    await expect(page.getByText(/built for repeatable tenant work/i)).toBeVisible();

    await page.goto("/templates");
    await page.getByRole("link", { name: "Configurations" }).click();
    await page.waitForURL(/\/#what-gets-deployed$/);
    await expect(page.getByText(/available configurations/i)).toBeVisible();

    await page.goto("/templates");
    await page.getByRole("link", { name: "FAQs" }).click();
    await page.waitForURL(/\/#faq$/);
    await expect(page.getByRole("heading", { name: /frequently asked questions/i })).toBeVisible();
  });
});

test.describe("Protected Routes", () => {
  test("wizard redirects to landing when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/wizard");
    await page.waitForURL("/");
    expect(page.url()).toMatch(/\/$/);
  });

  test("dashboard redirects to landing when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL("/");
    expect(page.url()).toMatch(/\/$/);
  });

  test("results redirects to landing when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/results");
    await page.waitForURL("/");
    expect(page.url()).toMatch(/\/$/);
  });
});

test.describe("Glass visual system", () => {
  test("discards retired theme settings and keeps the fixed glass visual system", async ({ page }) => {
    await page.addInitScript((storageKey) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ stopOnFirstError: false, theme: "dark" })
      );
    }, APP_SETTINGS_STORAGE_KEY);

    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/\b(?:dark|light|corporate-1999)\b/);
    await expect(page.getByRole("heading", { name: /intune hydration kit/i })).toHaveCSS(
      "color",
      "rgb(255, 255, 255)"
    );
    expect(
      await page.evaluate(
        (storageKey) => localStorage.getItem(storageKey),
        APP_SETTINGS_STORAGE_KEY
      )
    ).toBe('{"stopOnFirstError":false}');
  });
});
