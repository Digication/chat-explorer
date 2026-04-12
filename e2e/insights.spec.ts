import { test, expect } from "@playwright/test";

test.describe("Insights page (unauthenticated)", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/insights");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Insights page structure", () => {
  test.skip(() => true, "Requires authenticated session");

  test("shows Insights heading or dashboard", async ({ page }) => {
    await page.goto("/insights");
    await expect(page.getByText(/insight/i)).toBeVisible();
  });

  test("has course selector", async ({ page }) => {
    await page.goto("/insights");
    await expect(page.getByText(/course/i)).toBeVisible();
  });
});
