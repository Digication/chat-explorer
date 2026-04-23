import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Load the auth session written by global-setup so this test starts logged in.
// Other spec files that test unauthenticated flows don't load this state.
test.use({ storageState: join(process.cwd(), "playwright", ".auth", "user.json") });

async function generateSyntheticCsv(outPath: string, rows: number): Promise<void> {
  // Pass a time-based offset so repeated runs don't collide on comment IDs.
  // The generator accepts: outPath rowCount bigTextChars shape commentOffset entityOffset
  const commentOffset = Date.now() % 10_000_000;
  const entityOffset = commentOffset;
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        "scripts/generate-synthetic-csv.mjs",
        outPath,
        String(rows),
        "0",
        "many-assignments",
        String(commentOffset),
        String(entityOffset),
      ],
      { stdio: "inherit" }
    );
    p.on("exit", (c) =>
      c === 0 ? resolve() : reject(new Error(`generator exited ${c}`))
    );
  });
}

let tempDir: string;
let fixturePath: string;

test.beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "e2e-upload-"));
  fixturePath = join(tempDir, "synthetic.csv");
  // Small fixture keeps E2E snappy. We're testing the UI flow, not scale.
  await generateSyntheticCsv(fixturePath, 300);
});

test.afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("authenticated user can upload a CSV end-to-end", async ({ page }) => {
  // Global setup has already logged us in via storageState.
  await page.goto("/upload");

  // Should see the Upload heading without being redirected to /login.
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/upload/i).first()).toBeVisible({ timeout: 15_000 });

  // Set the file directly on the hidden input — bypasses the click/drag UI
  // (which is finicky under headless automation) and still exercises the
  // onChange handler that fires a real preview request.
  const fileInput = page.getByTestId("upload-file-input");
  await fileInput.setInputFiles(fixturePath);

  // Preview call fires. Wait for the Confirm button to appear.
  const commitBtn = page.getByTestId("upload-commit-btn");
  await expect(commitBtn).toBeVisible({ timeout: 20_000 });
  await expect(commitBtn).toBeEnabled();

  // Click Confirm → commit request. The success screen has
  // data-testid="upload-complete".
  await commitBtn.click();
  await expect(page.getByTestId("upload-complete")).toBeVisible({
    timeout: 120_000,
  });

  // Cross-check: the success panel contains the "Upload Complete" heading
  // and at least one non-zero count.
  const complete = page.getByTestId("upload-complete");
  await expect(complete).toContainText(/Upload Complete/i);
  await expect(complete).toContainText(/\d/); // has a digit somewhere
});
