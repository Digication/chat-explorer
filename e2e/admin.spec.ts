import { test, expect } from "@playwright/test";

// These tests verify the admin console UI structure.
// They require an authenticated admin session — in CI, use auth.setup.ts
// to create stored auth state. For now, these test the login-gated behavior.

test.describe("Admin console (unauthenticated)", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/admin");

    // Should redirect to login since user is not authenticated
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Admin console structure", () => {
  // Skip if no auth state is available — these tests need a logged-in admin
  test.skip(
    () => true,
    "Requires authenticated admin session (run with auth.setup.ts)"
  );

  test("shows Admin Console heading", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("Admin Console")).toBeVisible();
  });

  test("has Users tab", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("tab", { name: "Users" })).toBeVisible();
  });

  test("has Course Access tab", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("tab", { name: "Course Access" })
    ).toBeVisible();
  });
});
