import { expect, test } from "@playwright/test";

test("centers the cloud selection dialog in the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: /sign in with microsoft/i }).last().click();
  const dialog = page.getByRole("dialog", { name: /select cloud environment/i });
  await expect(dialog).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width / 2).toBeCloseTo(640, 0);
  expect(box!.y + box!.height / 2).toBeCloseTo(450, 0);
});
