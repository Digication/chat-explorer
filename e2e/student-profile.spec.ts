import { test, expect } from "@playwright/test";

test.describe("Student Profile Page", () => {
  test("unauthenticated visit redirects to /login", async ({ page }) => {
    await page.goto("/insights/student/some-id");
    await expect(page).toHaveURL(/\/login/);
  });

  // Authenticated tests require a valid session — skip in CI without auth setup
  test.skip("loads student profile page with valid studentId", async ({ page }) => {
    await page.goto("/insights/student/test-student-id");
    await expect(page.getByText("Student Profile")).toBeVisible();
    await expect(page.getByText("Reflection Growth")).toBeVisible();
    await expect(page.getByText("TORI Tag Profile")).toBeVisible();
  });

  test.skip("back to Insights link navigates correctly", async ({ page }) => {
    await page.goto("/insights/student/test-student-id");
    await page.click('a:has-text("Insights")');
    await expect(page).toHaveURL(/\/insights$/);
  });
});
