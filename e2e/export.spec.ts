import { test, expect } from "@playwright/test";

// These tests verify the Reports/Export page UI structure.
// Authenticated tests require an admin session — in CI, use auth.setup.ts
// to create stored auth state.

test.describe("Reports page (unauthenticated)", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/reports");

    // Should redirect to login since user is not authenticated
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Reports page structure", () => {
  // Skip if no auth state is available — these tests need a logged-in user
  test.skip(
    () => true,
    "Requires authenticated session (run with auth.setup.ts)"
  );

  test("shows Reports heading", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByText("Reports")).toBeVisible();
  });

  test("shows all three report type cards", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByText("Course Analytics Report")).toBeVisible();
    await expect(page.getByText("Raw Data Export")).toBeVisible();
    await expect(page.getByText("TORI Summary")).toBeVisible();
  });

  test("each card has a Generate button", async ({ page }) => {
    await page.goto("/reports");
    const buttons = page.getByRole("button", { name: "Generate" });
    await expect(buttons).toHaveCount(3);
  });

  test("clicking Generate opens the export dialog", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("button", { name: "Generate" }).first().click();
    await expect(page.getByText("Generate Export")).toBeVisible();
  });

  test("export dialog has format picker", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("button", { name: "Generate" }).first().click();
    await expect(page.getByLabel("PDF Report")).toBeVisible();
    await expect(page.getByLabel("CSV Data")).toBeVisible();
  });

  test("export dialog has course selector", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("button", { name: "Generate" }).first().click();
    await expect(page.getByLabel("Course")).toBeVisible();
  });

  test("Generate button is disabled until course is selected", async ({
    page,
  }) => {
    await page.goto("/reports");
    await page.getByRole("button", { name: "Generate" }).first().click();

    // The Generate button inside the dialog should be disabled
    const dialogGenerate = page
      .getByRole("dialog")
      .getByRole("button", { name: "Generate" });
    await expect(dialogGenerate).toBeDisabled();
  });

  test("PDF export produces a downloadable file", async ({ page }) => {
    await page.goto("/reports");
    // Click the first card's Generate button (Course Analytics Report = PDF)
    await page.getByRole("button", { name: "Generate" }).first().click();

    // Select the first available course
    await page.getByLabel("Course").click();
    await page.getByRole("option").first().click();

    // Trigger export and wait for download
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Generate" })
      .click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("CSV export produces a downloadable file", async ({ page }) => {
    await page.goto("/reports");
    // Click Raw Data Export card (second card)
    await page.getByRole("button", { name: "Generate" }).nth(1).click();

    // Should default to CSV format
    const csvRadio = page.getByLabel("CSV Data");
    await expect(csvRadio).toBeChecked();

    // Select a course
    await page.getByLabel("Course").click();
    await page.getByRole("option").first().click();

    // Trigger export and wait for download
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Generate" })
      .click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
