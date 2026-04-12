import { test, expect } from "@playwright/test";

test.describe("Settings page (unauthenticated)", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Settings page structure", () => {
  test.skip(() => true, "Requires authenticated session");

  test("shows Settings heading", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Settings")).toBeVisible();
  });
});
