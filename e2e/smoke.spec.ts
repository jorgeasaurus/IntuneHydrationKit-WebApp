import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("renders hero section", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /bootstrap your intune tenant/i })
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
    await expect(page.getByText("v2.2")).toBeVisible();
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
    await expect(page.getByText(/safety first/i)).toBeVisible();
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

  test("template page nav links return to landing sections", async ({ page }) => {
    await page.goto("/templates");

    await page.getByRole("link", { name: "Features" }).click();
    await page.waitForURL(/\/#features$/);
    await expect(page.getByText(/core features/i)).toBeVisible();

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

test.describe("Theme", () => {
  test("defaults to dark mode", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);
  });

  test("applies dark color scheme", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("style", /color-scheme:\s*dark/);
  });
});
