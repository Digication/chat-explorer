# Phase 16 — E2E Tests

You are writing end-to-end tests for the **Chat Analysis** app.

**Context:** Phases 01–15 built and unit-tested the complete application. The app runs at `https://chat-analysis.localhost` with Google OAuth login, CSV upload with TORI extraction, consent management, Insights page with smart recommendations, Chat Explorer with bottom bar/carousel/panels, AI chat with multi-provider support, and reports/export. Unit tests pass.

**Note:** Tests that require Google OAuth or LLM API keys should skip gracefully when credentials are not available. Focus on testing with a pre-authenticated session cookie or mock auth.

## Goal

Set up Playwright and write E2E tests covering all major user flows: login, CSV upload, insights rendering, chat explorer interaction, consent management, and AI chat.

## Overview

- Configure Playwright for the Docker-based dev environment
- Use test fixtures for CSV data
- Test login page rendering and OAuth redirect
- Test the CSV upload flow end-to-end
- Test insights page rendering with data
- Test chat explorer navigation and interaction
- Test consent toggle behavior
- Test AI chat send/receive flow

## Steps

### 1. Configure Playwright

**Files to create:** `playwright.config.ts`

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: 1,
  timeout: 30000,
  use: {
    baseURL: "https://chat-analysis.localhost",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

Add Playwright as a dev dependency:

```bash
pnpm add -D @playwright/test
```

### 2. Create test fixtures

**Files to create:** `e2e/fixtures/sample-data.csv`

A small CSV file (10–15 rows) with the same column structure the app expects. Include:
- 2 threads with 3–4 comments each
- 2 students
- Mix of user and assistant roles
- AI responses that contain TORI-tagged text (e.g. "TORI: Comprehension, Application")
- At least one "done" summary response that should be skipped

This fixture is used by the upload test to verify the full pipeline.

### 3. Test login page

**Files to create:** `e2e/login.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test("shows sign in button when not authenticated", async ({ page }) => {
    await page.goto("/");
    // Should redirect to or show login page
    await expect(page.getByText("Sign in with Google")).toBeVisible();
  });

  test("shows app title on login page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Chat Analysis")).toBeVisible();
  });

  test("sign in button triggers Google OAuth redirect", async ({ page }) => {
    await page.goto("/");
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("accounts.google.com") || r.status() === 302),
      page.getByText("Sign in with Google").click(),
    ]);
    // Verify the redirect was initiated (may fail if no Google credentials configured)
    // This test validates the auth flow is wired up, not that OAuth completes
  });
});
```

### 4. Test CSV upload flow (requires auth)

**Files to create:** `e2e/csv-upload.spec.ts`

Tests for the upload pipeline. These tests skip if no auth session is available:

- Upload the fixture CSV file via the upload UI
- Verify the upload preview shows the expected row count
- Commit the upload
- Verify the data appears in the sidebar navigation (new course/assignment)
- Verify navigating to Insights shows metrics cards with data from the upload

### 5. Test insights page (requires auth)

**Files to create:** `e2e/insights.spec.ts`

Tests that verify the Insights page structure renders correctly when authenticated and data exists:

- Metrics cards section renders with non-zero values
- Heatmap section renders with view mode and scale mode controls
- Clicking a different view mode changes the heatmap rendering
- Network graph section renders with visible nodes
- Co-occurrence lists show tag pairs
- Smart recommendations section shows at least one recommendation

### 6. Test chat explorer (requires auth)

**Files to create:** `e2e/chat-explorer.spec.ts`

Tests for the Chat Explorer page and its interaction model:

- Bottom bar is visible at the bottom of the page with student names
- Clicking a student in the bottom bar carousel opens the thread view in the center area
- Thread view shows comments in chronological order
- TORI filter chips are visible and clickable
- Clicking the student list icon opens the left slide-out panel
- Clicking the AI chat icon opens the right slide-out panel
- Panels can be closed by clicking outside or pressing Escape

### 7. Test consent management (requires auth)

**Files to create:** `e2e/consent.spec.ts`

Tests for the consent toggle:

- Navigate to a student in the Chat Explorer
- Toggle the student's consent to "excluded"
- Verify the student disappears from analytics views (navigate to Insights and check)
- Toggle the student back to "included"
- Verify the student reappears in analytics

### 8. Test AI chat (requires auth + API key)

**Files to create:** `e2e/ai-chat.spec.ts`

Tests for the AI chat panel. Skip gracefully if no LLM API keys are configured:

- Open the AI chat panel from the Chat Explorer
- Type a message and send it
- Verify a response appears from the assistant
- Verify the suggestion chips appear
- Send a follow-up message referencing the previous response
- Reload the page and verify the conversation persists (session saved in DB)
- Verify the model picker is visible and shows available providers

## Files to Create

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright configuration |
| `e2e/fixtures/sample-data.csv` | Test fixture CSV file |
| `e2e/login.spec.ts` | Login page and OAuth redirect tests |
| `e2e/csv-upload.spec.ts` | CSV upload flow tests |
| `e2e/insights.spec.ts` | Insights page rendering tests |
| `e2e/chat-explorer.spec.ts` | Chat explorer interaction tests |
| `e2e/consent.spec.ts` | Consent toggle behavior tests |
| `e2e/ai-chat.spec.ts` | AI chat send/receive tests |

## Verification

```bash
# Install Playwright browsers
docker compose exec app npx playwright install chromium

# Run E2E tests
docker compose run --rm e2e
```

Expected: Login page tests pass always. Authenticated tests skip gracefully when no session cookie is configured. AI chat tests skip when no API keys are configured. When running with full auth and API keys, all tests pass.

## When done

Report: files created (with summary per file), verification results (test pass/fail counts), and any issues encountered.
