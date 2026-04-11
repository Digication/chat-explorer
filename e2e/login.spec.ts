import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("renders both Google and magic link sign-in options", async ({
    page,
  }) => {
    await page.goto("/login");

    // Google sign-in button
    await expect(page.getByText("Sign in with Google")).toBeVisible();

    // Magic link section
    await expect(page.getByPlaceholder("Enter your email")).toBeVisible();
    await expect(page.getByText("Send magic link")).toBeVisible();
  });

  test("redirects unauthenticated user to /login", async ({ page }) => {
    await page.goto("/");

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows validation error for empty email on magic link", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByText("Send magic link").click();

    await expect(
      page.getByText("Please enter your email address.")
    ).toBeVisible();
  });
});
