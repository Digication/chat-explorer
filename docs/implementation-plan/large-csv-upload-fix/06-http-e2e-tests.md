# Phase 06 — HTTP-layer + Playwright E2E Tests

You are closing the test pyramid for the chat-explorer CSV upload rewrite. After this phase, the upload pipeline is exercised at three levels: unit (parser), integration (commitUpload function), **HTTP (multipart request → Express → response)**, and **E2E (browser → UI → request → success UI)**.

**Context:** Phases 01–04 rewrote the upload pipeline (disk storage, streaming parse, row-chunked inserts). Phase 05 added unit + function-level integration tests. This phase adds the two missing test tiers the user explicitly asked for: HTTP-level tests (that go through multer, the error middleware, and the route handler) and Playwright E2E tests (that drive the real UI and confirm the full user journey works). It also adds the test-infrastructure pieces those tests need: a session-creation helper (so tests can authenticate without going through Better Auth's OAuth flow), and `data-testid` attributes on the CSV upload UI.

## Overview

- Add three `data-testid` attributes to `src/components/upload/CsvUploadCard.tsx` so Playwright tests have stable selectors (no UI text dependencies).
- Add `scripts/create-test-session.mjs` — creates an in-DB test user (directly in the `user` table to bypass Better Auth's invite-only hook) and a Better Auth session row. Prints the session cookie. Used by both HTTP and E2E tests.
- Add `src/server/upload.http.test.ts` — vitest test that uses Node's built-in `fetch` to call the live dev server's upload endpoints at `http://localhost:4000`. Covers 401 without auth, 413 on oversized uploads (via env override), 400 on non-CSV, and 200 end-to-end with a real session cookie.
- Add `e2e/global-setup.ts` — Playwright global setup that runs `create-test-session.mjs`, captures the cookie, and writes a storage state file that tests reuse. Eliminates per-test login.
- Add `e2e/upload-flow.spec.ts` — Playwright test that picks a small generated CSV via the UI, clicks Confirm Upload, and asserts the success state.
- Update `playwright.config.ts` to wire in the global setup and use the storage state.
- Add `supertest` is NOT needed — we use Node 24's built-in `fetch` + `FormData`. No new runtime deps.
- Add `data/uploads/e2e-fixtures/` for the generated small CSV used by the E2E test (gitignored via `data/uploads/` entry).

## Steps

### 1. Add stable test selectors to the upload UI

**Files to modify:** `src/components/upload/CsvUploadCard.tsx`

Add three `data-testid` attributes. Keep them minimal — don't change behavior, don't change layout.

Find the hidden file input (around line 198):

```tsx
          {/* Hidden file input */}
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
```

Change to:

```tsx
          {/* Hidden file input */}
          <input
            ref={inputRef}
            data-testid="upload-file-input"
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
```

Find the "Confirm Upload" button (around line 293):

```tsx
            <Button
              variant="contained"
              onClick={handleCommit}
              disabled={!preview.detectedInstitutionId}
            >
              {replaceMode ? "Confirm Upload & Replace" : "Confirm Upload"}
            </Button>
```

Change to:

```tsx
            <Button
              data-testid="upload-commit-btn"
              variant="contained"
              onClick={handleCommit}
              disabled={!preview.detectedInstitutionId}
            >
              {replaceMode ? "Confirm Upload & Replace" : "Confirm Upload"}
            </Button>
```

Find the "Upload Complete" success state (around line 317):

```tsx
      {/* Step 5: Done! */}
      {step === "done" && commitResult && (
        <Box sx={{ textAlign: "center", py: 2 }}>
          <CheckCircleOutlineIcon
            sx={{ fontSize: 48, color: "success.main", mb: 1 }}
          />
          <Typography variant="h6" fontWeight={500} gutterBottom>
            Upload Complete
          </Typography>
```

Change to:

```tsx
      {/* Step 5: Done! */}
      {step === "done" && commitResult && (
        <Box data-testid="upload-complete" sx={{ textAlign: "center", py: 2 }}>
          <CheckCircleOutlineIcon
            sx={{ fontSize: 48, color: "success.main", mb: 1 }}
          />
          <Typography variant="h6" fontWeight={500} gutterBottom>
            Upload Complete
          </Typography>
```

No other UI changes. The data-testids are the sole interface tests depend on.

### 2. Add the test-session helper

**Files to create:** `scripts/create-test-session.mjs`

This script creates a throwaway test user AND a Better Auth session row linked to that user, then prints JSON with the cookie name/value/expiry. It runs inside the app container via `docker compose exec app node scripts/create-test-session.mjs`. It bypasses Better Auth's invite-only hook by writing directly to the `user` table via the `pg` client — which is the same technique `scripts/upload-direct.mjs` uses.

```javascript
#!/usr/bin/env node
/**
 * Create a test user + Better Auth session, print the session cookie as JSON.
 *
 * Usage:
 *   docker compose exec app node scripts/create-test-session.mjs [email]
 *
 * Prints:
 *   {
 *     "userId": "...",
 *     "email": "...",
 *     "sessionToken": "...",
 *     "cookieName": "better-auth.session_token",
 *     "cookieValue": "<token>",
 *     "expiresAt": "2026-04-29T..."
 *   }
 *
 * Both HTTP tests and Playwright global setup parse this JSON.
 */
import pg from "pg";
import crypto from "node:crypto";

const { Client } = pg;

const email = process.argv[2] || `e2e-test-${Date.now()}@example.com`;
const userId = `e2e-user-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const sessionId = `e2e-session-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const sessionToken = crypto.randomBytes(32).toString("hex");
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://dev:dev@localhost:5432/chat-explorer",
});

await client.connect();
try {
  // Ensure the test institution exists (users must have one).
  const instRow = await client.query(
    `INSERT INTO "institution" ("name", "domain", "slug")
     VALUES ($1, $2, $3)
     ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name"
     RETURNING id`,
    ["E2E Test Institution", "e2e-test.digication.com", "e2e-test"]
  );
  const institutionId = instRow.rows[0].id;

  // Create the user. Written directly to "user" table — does NOT go through
  // Better Auth, so the invite-only hook in src/server/auth.ts is not invoked.
  await client.query(
    `INSERT INTO "user" ("id", "name", "email", "role", "institutionId", "emailVerified")
     VALUES ($1, $2, $3, 'digication_admin', $4, true)
     ON CONFLICT ("email") DO NOTHING`,
    [userId, "E2E Test User", email, institutionId]
  );

  // Create the Better Auth session. "user" and "session" column names
  // match the Better Auth migration in src/server/migrations/1775574200000-*.
  await client.query(
    `INSERT INTO "session" ("id", "token", "expiresAt", "userId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [sessionId, sessionToken, expiresAt, userId]
  );

  const out = {
    userId,
    email,
    institutionId,
    sessionId,
    sessionToken,
    cookieName: "better-auth.session_token",
    // Better Auth expects the cookie value to be `<token>.<signature>` OR just
    // the raw token, depending on config. This repo's auth.ts uses the default
    // secureCookies setup — raw token works when cookie secret is unset.
    // If 401s, check src/server/auth.ts for cookieSecret / cookiePrefix.
    cookieValue: sessionToken,
    expiresAt: expiresAt.toISOString(),
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await client.end();
}
```

Notes:
- **User.role is `'digication_admin'`** so the test user can upload (verify against `src/server/entities/User.ts`; role enum values are lowercase: `'instructor'`, `'institution_admin'`, `'digication_admin'`).
- User.id is explicitly set because `@PrimaryColumn()` doesn't auto-generate.
- Cookie name `better-auth.session_token` matches the value already used by `scripts/upload-direct.mjs:102` — confirmed working.

### 3. Add the HTTP-layer test

**Files to create:** `src/server/upload.http.test.ts`

Uses Node 24's built-in `fetch` + `FormData` to hit the running dev server at `http://localhost:4000` (the same container the tests run in). Tests the full Express stack: multer → auth middleware → route handler → service → error middleware.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openAsBlob } from "node:fs";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:4000";

interface TestSession {
  userId: string;
  email: string;
  institutionId: string;
  sessionToken: string;
  cookieName: string;
  cookieValue: string;
}

async function createTestSession(): Promise<TestSession> {
  // Spawn the session-creation script; parse the JSON it prints.
  return new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ["scripts/create-test-session.mjs"],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    let out = "";
    p.stdout.on("data", (c) => (out += c.toString()));
    p.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`session script exited ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function generateSyntheticCsv(outPath: string, rows = 100): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ["scripts/generate-synthetic-csv.mjs", outPath, String(rows)],
      { stdio: "inherit" }
    );
    p.on("exit", (c) =>
      c === 0 ? resolve() : reject(new Error(`generator exited ${c}`))
    );
  });
}

let session: TestSession;
let tempDir: string;
let fixturePath: string;

beforeAll(async () => {
  session = await createTestSession();
  tempDir = await mkdtemp(join(tmpdir(), "upload-http-"));
  fixturePath = join(tempDir, "synthetic.csv");
  await generateSyntheticCsv(fixturePath, 100);
}, 60_000);

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("POST /api/upload/preview", () => {
  it("returns 401 without a session cookie", async () => {
    const form = new FormData();
    form.append(
      "file",
      await openAsBlob(fixturePath),
      "synthetic.csv"
    );
    const res = await fetch(`${BASE_URL}/api/upload/preview`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when file is not a CSV", async () => {
    const txtPath = join(tempDir, "notacsv.txt");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(txtPath, "hello world");

    const form = new FormData();
    form.append("file", await openAsBlob(txtPath), "notacsv.txt");

    const res = await fetch(`${BASE_URL}/api/upload/preview`, {
      method: "POST",
      body: form,
      headers: {
        Cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/csv/i);
  });

  it("returns 200 with preview counts when authenticated", async () => {
    const form = new FormData();
    form.append("file", await openAsBlob(fixturePath), "synthetic.csv");

    const res = await fetch(`${BASE_URL}/api/upload/preview`, {
      method: "POST",
      body: form,
      headers: {
        Cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRows).toBeGreaterThan(0);
    expect(body.newComments).toBeGreaterThan(0);
  }, 30_000);
});

describe("POST /api/upload/commit", () => {
  it("commits the CSV and returns result counts", async () => {
    const form = new FormData();
    form.append("file", await openAsBlob(fixturePath), "synthetic.csv");
    form.append("institutionId", session.institutionId);

    const res = await fetch(`${BASE_URL}/api/upload/commit`, {
      method: "POST",
      body: form,
      headers: {
        Cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newComments).toBeGreaterThan(0);
    expect(body.uploadLogId).toBeTruthy();
  }, 60_000);

  it("surfaces a useful error message on failure", async () => {
    // Empty form → multer throws "MulterError: Unexpected field" OR the route
    // rejects with "No file provided". Either way, the response body should
    // include an error field with a real message (not just "Failed to commit").
    const res = await fetch(`${BASE_URL}/api/upload/commit`, {
      method: "POST",
      body: new FormData(),
      headers: {
        Cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    });

    expect([400, 500]).toContain(res.status);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.error).not.toBe("Failed to commit upload"); // Phase 01's fix
  });
});
```

**Cleanup note:** this test does not delete the institution/user/session it creates. That's intentional — it keeps the test idempotent (can run again using a different email because `create-test-session.mjs` suffixes with `Date.now()`) and avoids the FK-constraint dance. Accumulated test data can be cleaned via a single `DELETE FROM "user" WHERE email LIKE 'e2e-test-%'` cascade.

### 4. Add the Playwright global setup

**Files to create:** `e2e/global-setup.ts`

This runs once before all Playwright tests, creates a test session, and writes `playwright/.auth/user.json` storage state. Tests then load that storage state to start out already logged in.

```typescript
import { FullConfig } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

interface TestSession {
  cookieName: string;
  cookieValue: string;
  expiresAt: string;
  institutionId: string;
}

async function createTestSession(): Promise<TestSession> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ["scripts/create-test-session.mjs"],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    let out = "";
    p.stdout.on("data", (c) => (out += c.toString()));
    p.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`session script exited ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const session = await createTestSession();

  const storageStatePath = join(
    process.cwd(),
    "playwright",
    ".auth",
    "user.json"
  );
  await mkdir(dirname(storageStatePath), { recursive: true });

  // Playwright's storageState is a { cookies: [...], origins: [...] } structure.
  // We set the Better Auth cookie for the app's domain.
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";
  const url = new URL(baseURL);

  const state = {
    cookies: [
      {
        name: session.cookieName,
        value: session.cookieValue,
        domain: url.hostname,
        path: "/",
        expires: Math.floor(new Date(session.expiresAt).getTime() / 1000),
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax" as const,
      },
    ],
    origins: [
      {
        origin: baseURL,
        localStorage: [
          // Stash the institutionId so tests can send it with commit requests
          // if they need to, without calling create-test-session again.
          { name: "e2e.institutionId", value: session.institutionId },
        ],
      },
    ],
  };

  await writeFile(storageStatePath, JSON.stringify(state, null, 2), "utf8");
  console.log(`[global-setup] Wrote storage state to ${storageStatePath}`);
}

export default globalSetup;
```

### 5. Wire global setup into Playwright config

**Files to modify:** `playwright.config.ts`

Change from:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    ignoreHTTPSErrors: true,
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
```

To:

```typescript
import { defineConfig } from "@playwright/test";
import { join } from "node:path";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000, // upload flow takes >30s when the CSV is large
  retries: 0,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    ignoreHTTPSErrors: true,
    headless: true,
    // Automatically load the cookie written by global-setup so every test
    // starts logged in. Individual tests can override by passing
    // `test.use({ storageState: undefined })` if they need anon state.
    storageState: join(process.cwd(), "playwright", ".auth", "user.json"),
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
```

Add `playwright/.auth/` to `.gitignore`:

```gitignore
# Playwright E2E auth state
playwright/.auth/
```

### 6. Add the Playwright upload flow test

**Files to create:** `e2e/upload-flow.spec.ts`

```typescript
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function generateSyntheticCsv(outPath: string, rows: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ["scripts/generate-synthetic-csv.mjs", outPath, String(rows)],
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
  await expect(page.getByText(/upload/i).first()).toBeVisible();

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
    timeout: 45_000,
  });

  // Cross-check: the success panel contains the "Upload Complete" heading
  // and at least one non-zero count.
  const complete = page.getByTestId("upload-complete");
  await expect(complete).toContainText(/Upload Complete/i);
  await expect(complete).toContainText(/\d/); // has a digit somewhere
});
```

### 7. Add a pnpm script for running the full test pyramid

**Files to modify:** `package.json`

Find the existing `scripts` block and add (or modify) these lines:

```json
{
  "scripts": {
    // ... existing scripts ...
    "test:http": "vitest run src/server/upload.http.test.ts",
    "test:all": "pnpm test && pnpm e2e"
  }
}
```

No new dependencies — the tests use built-in `fetch`, `FormData`, and the existing `pg` + `@playwright/test` packages.

### 8. Add the test-user cleanup script

**Files to create:** `scripts/cleanup-test-data.mjs`

```javascript
#!/usr/bin/env node
/**
 * Removes all E2E test users, sessions, and related data.
 * Idempotent — safe to run multiple times.
 *
 * Run: docker compose exec app node scripts/cleanup-test-data.mjs
 */
import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://dev:dev@localhost:5432/chat-explorer",
});
await client.connect();

try {
  // Delete in FK-safe order. Cascades (ON DELETE CASCADE for session→user)
  // would handle some of this automatically, but being explicit is safer.
  const users = await client.query(
    `SELECT id FROM "user" WHERE email LIKE 'e2e-test-%@example.com' OR id LIKE 'e2e-user-%'`
  );
  const userIds = users.rows.map((r) => r.id);

  if (userIds.length > 0) {
    await client.query(`DELETE FROM "session" WHERE "userId" = ANY($1::text[])`, [userIds]);
    await client.query(`DELETE FROM "course_access" WHERE "userId" = ANY($1::text[])`, [userIds]);
    await client.query(`DELETE FROM "upload_log" WHERE "uploadedById" = ANY($1::text[])`, [userIds]);
    // Comments uploaded by test user — cascade via threads/assignments/courses would be complex.
    // Instead, find them by uploadedById and delete them directly (studentId FKs stay intact).
    await client.query(
      `DELETE FROM "comment_tori_tag" WHERE "commentId" IN (SELECT id FROM "comment" WHERE "uploadedById" = ANY($1::text[]))`,
      [userIds]
    );
    await client.query(`DELETE FROM "comment" WHERE "uploadedById" = ANY($1::text[])`, [userIds]);
    await client.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [userIds]);
  }

  // E2E institution cascade: nothing to do — institution is shared, keep it.
  // If the institution is empty and test-only, leave it alone (cheap).

  console.log(`Cleaned up ${userIds.length} test users and their data.`);
} finally {
  await client.end();
}
```

## Verification

```bash
# 1. Bring the dev server up so HTTP tests have something to hit.
docker compose up -d --build

# 2. Run the HTTP test in isolation first — fastest feedback.
docker compose exec app pnpm test src/server/upload.http.test.ts

# 3. Run all unit + integration + HTTP tests.
docker compose exec app pnpm test

# 4. Run Playwright E2E tests from the host (NOT inside the container —
#    Playwright downloads browsers onto the host by default).
pnpm e2e

# 5. Cleanup after the test suite (optional — each run creates new test data
#    with unique suffixes, so this is house-keeping, not correctness).
docker compose exec app node scripts/cleanup-test-data.mjs
```

Expected outcomes:
- `upload.http.test.ts`: 5 tests pass (401 without auth, 400 on non-CSV, 200 preview, 200 commit, error-message surface).
- `upload-flow.spec.ts`: 1 test passes (full browser flow ends on upload-complete panel).
- No remaining `e2e-test-%@example.com` users in the DB after cleanup script.

## When done

Report:
- Files created (6: `scripts/create-test-session.mjs`, `scripts/cleanup-test-data.mjs`, `src/server/upload.http.test.ts`, `e2e/global-setup.ts`, `e2e/upload-flow.spec.ts`, `.gitignore` update).
- Files modified (2: `src/components/upload/CsvUploadCard.tsx`, `playwright.config.ts`).
- Output of `pnpm test` — should include the 5 new HTTP tests passing.
- Output of `pnpm e2e` — should show the new upload-flow test passing.
- Any surprises — especially around Better Auth cookie handling (if `cookieValue: sessionToken` returns 401, check whether the auth.ts sets a cookie prefix or signing secret that the raw token doesn't match).

**Commit this phase:**

```bash
git add -A
git commit -m "test(upload): phase 06 - HTTP + Playwright E2E tests"
```
