import { test, expect } from "@playwright/test";

test.describe("Cross-Course Comparison Page", () => {
  test("unauthenticated visit redirects to /login", async ({ page }) => {
    await page.goto("/insights/compare");
    await expect(page).toHaveURL(/\/login/);
  });

  // Authenticated tests require a valid session — skip in CI without auth setup
  test.skip("loads compare page with course picker", async ({ page }) => {
    await page.goto("/insights/compare");
    await expect(page.getByText("Compare Courses")).toBeVisible();
    await expect(page.getByText("Select at least 2 courses")).toBeVisible();
  });

  test.skip("Compare button is disabled until 2 courses selected", async ({ page }) => {
    await page.goto("/insights/compare");
    const btn = page.getByRole("button", { name: "Compare" });
    await expect(btn).toBeDisabled();
  });
});
