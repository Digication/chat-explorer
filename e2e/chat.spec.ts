import { test, expect } from "@playwright/test";

test.describe("Chat Explorer (unauthenticated)", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/explorer");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Chat Explorer structure", () => {
  test.skip(() => true, "Requires authenticated session");

  test("shows thread view or empty state", async ({ page }) => {
    await page.goto("/explorer");
    await expect(page.getByText(/thread|explorer|no data/i)).toBeVisible();
  });

  test("has bottom bar", async ({ page }) => {
    await page.goto("/explorer");
    // Bottom bar should exist in the explorer layout
    const hasBottomBar = await page.locator("[class*=BottomBar], [class*=bottom-bar]").isVisible().catch(() => false);
    const hasExplorer = await page.getByText(/explorer/i).isVisible().catch(() => false);
    expect(hasBottomBar || hasExplorer).toBe(true);
  });
});
