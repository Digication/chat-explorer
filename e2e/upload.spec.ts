import { test, expect } from "@playwright/test";

test.describe("Upload page (unauthenticated)", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/upload");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Upload page structure", () => {
  test.skip(() => true, "Requires authenticated session");

  test("shows Upload heading", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByText("Upload")).toBeVisible();
  });

  test("has a file upload area", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByText(/csv|upload|drag/i)).toBeVisible();
  });
});
