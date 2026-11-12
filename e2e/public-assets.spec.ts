import { test, expect } from "@playwright/test";

/**
 * Signed-out checks that need no Microsoft Graph connection.
 *
 * Graph error handling (401, 403, 429, 500 and UnknownError) runs only after
 * sign-in, so a signed-out browser cannot reach it. The unit tests in
 * __tests__/unit/graph and __tests__/unit/utils/retry.test.ts cover it.
 */

test.describe("Signed-out Graph isolation", () => {
  for (const path of ["/", "/templates"]) {
    test(`${path} sends no Graph requests before sign-in`, async ({ page }) => {
      const graphRequests: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).hostname.endsWith("graph.microsoft.com")) {
          graphRequests.push(request.url());
        }
      });

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      expect(graphRequests).toEqual([]);
    });
  }
});

test.describe("Template files", () => {
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
