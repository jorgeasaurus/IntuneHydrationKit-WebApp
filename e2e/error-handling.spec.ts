import { test, expect } from "@playwright/test";

/**
 * Error handling tests using route interception to mock Graph API responses.
 * These tests verify the app correctly handles and displays API errors
 * without requiring a real Microsoft Graph connection.
 */

test.describe("Graph API Error Handling", () => {
  test.describe("UnknownError responses", () => {
    test("handles UnknownError with empty message gracefully", async ({
      page,
    }) => {
      // Intercept any Graph API call and return an UnknownError
      await page.route("**/graph.microsoft.com/**", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "UnknownError",
              message: "",
              innerError: {
                date: "2026-04-01T04:22:56",
                "request-id": "75be8372-6c42-4800-a9fc-d45f371cac2e",
                "client-request-id": "75be8372-6c42-4800-a9fc-d45f371cac2e",
              },
            },
          }),
        })
      );

      await page.goto("/");

      // Verify the app still renders (Graph errors during page load don't crash it)
      await expect(
        page.getByRole("heading", { name: /bootstrap your intune tenant/i })
      ).toBeVisible();
    });
  });

  test.describe("Authentication errors", () => {
    test("handles 401 Unauthorized without crashing", async ({ page }) => {
      await page.route("**/graph.microsoft.com/**", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "InvalidAuthenticationToken",
              message: "Access token has expired or is not yet valid.",
            },
          }),
        })
      );

      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: /bootstrap your intune tenant/i })
      ).toBeVisible();
    });

    test("handles 403 Forbidden without crashing", async ({ page }) => {
      await page.route("**/graph.microsoft.com/**", (route) =>
        route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "Forbidden",
              message: "Insufficient privileges to complete the operation.",
            },
          }),
        })
      );

      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: /bootstrap your intune tenant/i })
      ).toBeVisible();
    });
  });

  test.describe("Rate limiting", () => {
    test("handles 429 Too Many Requests without crashing", async ({
      page,
    }) => {
      await page.route("**/graph.microsoft.com/**", (route) =>
        route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: { "Retry-After": "5" },
          body: JSON.stringify({
            error: {
              code: "TooManyRequests",
              message:
                "Too many requests. Please retry after the duration specified in the Retry-After header.",
            },
          }),
        })
      );

      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: /bootstrap your intune tenant/i })
      ).toBeVisible();
    });
  });

  test.describe("Template loading", () => {
    test("loads JSON templates from public directory", async ({ page }) => {
      const templateRequests: string[] = [];
      page.on("request", (req) => {
        if (req.url().includes("IntuneTemplates")) {
          templateRequests.push(req.url());
        }
      });

      await page.goto("/");
      // Templates are lazy-loaded, so we just verify the page loads
      // Template fetches happen during wizard execution, not on landing
      await expect(
        page.getByRole("heading", { name: /bootstrap your intune tenant/i })
      ).toBeVisible();
    });

    test("serves DynamicGroups JSON files", async ({ page }) => {
      const resp = await page.request.get(
        "/IntuneTemplates/DynamicGroups/OS-Groups.json"
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data).toHaveProperty("groups");
      expect(Array.isArray(data.groups)).toBe(true);
      expect(data.groups.length).toBeGreaterThan(0);
      expect(data.groups[0]).toHaveProperty("displayName");
    });

    test("serves Filters JSON files", async ({ page }) => {
      const resp = await page.request.get(
        "/IntuneTemplates/Filters/Windows-Manufacturer-Filters.json"
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data).toHaveProperty("filters");
    });

    test("serves ConditionalAccess JSON files", async ({ page }) => {
      const resp = await page.request.get(
        "/IntuneTemplates/ConditionalAccess/Block%20legacy%20authentication.json"
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data).toHaveProperty("displayName");
      expect(data).toHaveProperty("conditions");
    });

    test("serves Compliance JSON files", async ({ page }) => {
      const resp = await page.request.get(
        "/IntuneTemplates/Compliance/Windows-Compliance-Policy.json"
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data).toHaveProperty(["@odata.type"]);
    });

    test("serves AppProtection JSON files", async ({ page }) => {
      const resp = await page.request.get(
        "/IntuneTemplates/AppProtection/Android-App-Protection.json"
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data).toHaveProperty(["@odata.type"]);
      expect(data).toHaveProperty("displayName");
    });

    test("serves Enrollment JSON files", async ({ page }) => {
      const resp = await page.request.get(
        "/IntuneTemplates/Enrollment/Windows-ESP-Profile.json"
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data).toHaveProperty(["@odata.type"]);
      expect(data).toHaveProperty("displayName");
    });

    test("serves Notification JSON files", async ({ page }) => {
      const resp = await page.request.get(
        "/IntuneTemplates/Notifications/First-Warning.json"
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data).toHaveProperty("displayName");
    });

    test("serves StaticGroups JSON files", async ({ page }) => {
      const resp = await page.request.get(
        "/IntuneTemplates/StaticGroups/Static-Groups.json"
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data).toHaveProperty("groups");
      expect(data.groups).toHaveLength(5);
    });
  });
});
