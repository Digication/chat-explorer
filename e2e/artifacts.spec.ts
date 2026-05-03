import { test, expect } from "@playwright/test";

// The artifact routes are gated behind ProtectedRoute (any authenticated
// user). These minimal checks mirror the pattern in upload.spec.ts —
// full authenticated flows live in the server-side integration tests.

test.describe("Artifacts page (unauthenticated)", () => {
  test("redirects /artifacts to login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/artifacts");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects /artifacts/:id to login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/artifacts/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Artifacts page structure", () => {
  test.skip(() => true, "Requires authenticated session");

  test("shows Artifacts heading", async ({ page }) => {
    await page.goto("/artifacts");
    await expect(page.getByText("Artifacts")).toBeVisible();
  });

  test("has an Upload button", async ({ page }) => {
    await page.goto("/artifacts");
    await expect(page.getByRole("button", { name: /upload/i })).toBeVisible();
  });
});
