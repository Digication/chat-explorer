import { test, expect } from "@playwright/test";

test.describe("Admin access control", () => {
  test("unauthenticated user cannot access /admin", async ({ page }) => {
    await page.goto("/admin");

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);

    // Login page should be visible
    await expect(page.getByText("Sign in with Google")).toBeVisible();
  });

  test("login page does not show admin navigation", async ({ page }) => {
    await page.goto("/login");

    // The sidebar (with Admin link) should not be visible on login page
    await expect(page.getByText("Admin Console")).not.toBeVisible();
  });
});
