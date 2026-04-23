# Phase 0 — Overview

## Project Summary

A 75 MB CSV upload (252,800 rows, with individual cells containing student papers up to ~100 KB of text) is returning a generic 500 from `POST /api/upload/commit`. Root cause is three stacked issues: a 50 MB multer file-size cap that blocks the upload before it runs, a synchronous CSV parser that loads the whole file into RAM and blocks the event loop, and a single giant DB transaction that performs ~250,000 individual `manager.save()` calls and will hit Postgres statement/lock timeouts long before it completes. On top of that, the route handler returns a generic `"Failed to commit upload"` string so the real error never reaches the client.

This plan rebuilds the upload pipeline to handle files up to **250 MB** and ~**500,000 rows** — including pathological shapes like 8,000 students under a single assignment — without running out of memory or timing out, while preserving all existing behavior (deduplication, TORI extraction, replace-mode, CourseAccess grants, UploadLog, background reflection classification). The change is scoped to the upload path — no schema changes, no changes to downstream consumers. A separate one-time data-sanitization phase cleans up the specific bad-encoding CSV that prompted this work.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| HTTP / multipart | Express 5 + multer (already installed) |
| CSV parsing | `csv-parse` streaming API (already installed — currently using `csv-parse/sync`) |
| DB | TypeORM + Postgres (no changes) |
| Language | TypeScript (ESM, NodeNext) |
| Tests | Vitest (unit + integration + HTTP) + Playwright (E2E) |

## Architecture Overview

**Before:**

```
client ──▶ multer (memory, 50 MB cap) ──▶ Buffer ──▶ csv-parse/sync (blocking) ──▶ 1 giant txn { 250k × manager.save() } ──▶ 500
```

**After:**

```
client ──▶ multer (disk, 250 MB cap) ──▶ temp file on disk
                                           │
                                           ▼
                        createReadStream ──▶ csv-parse (streaming, non-blocking)
                                           │
                                           ▼
                               RawCsvRow[] in memory (parsing complete)
                                           │
                                           ▼
        saveUploadedFile rename temp → permanent (no extra in-memory copy)
                                           │
                                           ▼
  PASS A: parent pre-pass — chunked txns (≤500/txn) create missing
          Courses, Assignments, Threads, Students → lookup maps by ext/sys id
                                           │
                                           ▼
  PASS B: comment pass — rows chunked 5000/txn; each txn runs
          manager.insert(Comment, 500-row batches) using parent lookup maps
                                           │
                                           ▼
  PASS C: TORI pass — per-thread association extraction, batched insert of
          CommentToriTag (500/INSERT) in short per-thread transactions
                                           │
                                           ▼
  PASS D: finalize — one small txn for CourseAccess + UploadLog
                                           │
                                           ▼
                        real error details surfaced in 500 response body
```

Transaction size is now a function of **row count**, not data shape — 8,000-student single-assignment imports chunk the same way a 10-assignment CSV does.

## Phase Dependency Graph

```
       ┌─────────────────────────────┐
       │ 01 error-surfacing          │
       │ (middleware + err messages) │
       └──────────────┬──────────────┘
                      │
       ┌──────────────▼──────────────┐
       │ 02 disk-storage + 250MB cap │
       │ (signatures: Buffer → path) │
       └──────────────┬──────────────┘
                      │
       ┌──────────────▼──────────────┐
       │ 03 streaming parser         │
       │ (parseCsvFile(path))        │
       └──────────────┬──────────────┘
                      │
       ┌──────────────▼──────────────┐
       │ 04 row-chunked inserts      │
       │ (parents pre-pass; 5000/txn │
       │  × insert 500/batch)        │
       └──────────────┬──────────────┘
                      │
       ┌──────────────▼──────────────┐
       │ 05 unit + integration tests │
       │ (parser + commitUpload)     │
       └──────────────┬──────────────┘
                      │
       ┌──────────────▼──────────────┐
       │ 06 HTTP + Playwright E2E    │
       │ (multipart + browser flow)  │
       └──────────────┬──────────────┘
                      │
       ┌──────────────▼──────────────┐
       │ 07 csv sanitization         │
       │ (run /fix-csv on real file) │
       └──────────────┬──────────────┘
                      │
       ┌──────────────▼──────────────┐
       │ 08 browser verification     │
       │ (upload cleaned 75MB CSV)   │
       └─────────────────────────────┘
```

Phases 01–06 are **strictly sequential** on the code side: each depends on interface/behavior changes made by the prior phase. Phase 07 (CSV sanitization) is a one-time data-cleaning step on the real user file and has no code dependency — it can technically run anytime before phase 08, but placing it after tests means we don't sanitize until we know the code is solid. Phase 08 is the final gate and requires 06 (all tests green) **and** 07 (file cleaned) to be done first.

## Phase Summary

| Phase | Title | Description |
|-------|-------|-------------|
| 01 | Error surfacing | Add an Express error-handling middleware for multer + upload routes; return the real error name, code, and message in the 500/413 body; log stack server-side. |
| 02 | Disk storage + raised cap | Switch multer from `memoryStorage()` to `diskStorage()` writing to `data/uploads/tmp/`. Raise limit to 250 MB. Change `previewUpload`/`commitUpload` signatures from `Buffer` to `filePath: string`. Update `saveUploadedFile` to rename the temp file. Clean up temp files on preview failure/success. |
| 03 | Streaming parser | Replace `parseCsvBuffer(buffer)` with `parseCsvFile(filePath)` using `csv-parse` streaming API + `createReadStream`. Sniff first 8 KB for UTF-8 vs Windows-1252 and pipe through a `TextDecoder` transform for non-UTF-8. Keep row array in memory (rows are still collected at the end) but don't block the event loop during parsing. |
| 04 | Row-chunked inserts | **Decouple transaction size from data shape.** Replace the single giant transaction with a four-pass orchestrator: (A) parent pre-pass — create all Courses/Assignments/Threads/Students in chunked transactions (≤ 500 entities per commit), building lookup maps; (B) comment pass — chunk rows into transactions of 5,000 each, use `manager.insert(Comment, batch)` with 500 rows per INSERT; (C) TORI pass — per-thread batched inserts; (D) finalize — one small transaction for `CourseAccess` + `UploadLog`. Scales to 8,000-student single-assignment cases without long transactions. |
| 05 | Unit + integration tests | Unit tests for `parseCsvFile` (streaming, encoding fallback, malformed rows). Integration tests for `commitUpload` using TWO synthetic fixture shapes — many-assignments AND single-assignment-many-students — hitting the real Postgres DB. Verify counts match and re-uploading is idempotent. Each test uses a unique `RUN_SUFFIX` so concurrent / repeated runs don't collide on the shared dev/test DB. |
| 06 | HTTP + Playwright E2E tests | Close the test pyramid. (a) Add `data-testid`s to `CsvUploadCard`. (b) Add `scripts/create-test-session.mjs` that makes a test user + Better Auth session row directly in the DB (bypassing the invite-only hook). (c) HTTP-layer tests using Node 24's built-in `fetch` + `FormData` against the live dev server — verify 401/400/200 and that Phase 01's error messages surface correctly. (d) Playwright test that drives the real UI: load the app with the test session cookie as storage state, pick a file via the testid, click Confirm, assert `upload-complete`. (e) Cleanup script for test data. |
| 07 | CSV sanitization | **One-time data cleanup** of the real 75 MB file. Invoke the existing `/fix-csv` skill via the Skill tool to replace curly quotes, em/en dashes, non-breaking hyphens, zero-width spaces, and already-corrupted U+FFFD characters with safe ASCII equivalents. Produces a sibling `*-fixed.csv`. Verify row counts with `csv.reader` (NOT `wc -l`). Out-of-scope fix for the root cause (Digication's exporter) — this is a user-invocable pre-processing step. No code commit. |
| 08 | Browser verification | Boot the app via `docker compose up -d --build`, upload the cleaned CSV (`*-fixed.csv`) through the running app via Chrome MCP. Verify successful preview → commit, watch server logs for short per-chunk transactions and no OOM / no timeout, confirm row counts via the UI and a `SELECT COUNT(*)` on `comment`, spot-check a thread in the UI for clean (non-diamond) text, run a SQL query to confirm 0 rows with U+FFFD. |

## Change Inventory

### Backend files

| Category | Files |
|----------|-------|
| Modified | `src/server/index.ts` (multer config, error middleware, route handlers) |
| Modified | `src/server/services/csv-parser.ts` (streaming parser, path-based API) |
| Modified | `src/server/services/upload.ts` (signatures, four-pass orchestration, batched inserts) |
| New | `src/server/services/csv-parser.test.ts` (unit tests) |
| New | `src/server/services/upload.test.ts` (integration tests) |
| New | `src/server/upload.http.test.ts` (HTTP-layer tests via built-in fetch) |
| New | `scripts/generate-synthetic-csv.mjs` (fixture generator, checked in) |
| New | `scripts/create-test-session.mjs` (test-user + Better Auth session creation) |
| New | `scripts/cleanup-test-data.mjs` (test-data cleanup helper) |

### Frontend files

| Category | Files |
|----------|-------|
| Modified | `src/components/upload/CsvUploadCard.tsx` (adds 3 `data-testid` attrs for E2E) |

The existing error display already surfaces `data.error` from the response body, so Phase 01's richer error messages will appear automatically in the existing Alert component.

### E2E / test infra

| Category | Files |
|----------|-------|
| New | `e2e/global-setup.ts` (Playwright global setup — writes storage state with auth cookie) |
| New | `e2e/upload-flow.spec.ts` (Playwright E2E test for the full upload journey) |
| Modified | `playwright.config.ts` (wire in global setup + storage state) |
| Modified | `.gitignore` (adds `playwright/.auth/`) |
| Modified | `package.json` (adds `test:http`, `test:all` scripts) |

### Infrastructure files

| Category | Files |
|----------|-------|
| No change | `.gitignore` for `data/uploads/` (already present on line 10) |
| No change | `docker-compose.yml` (no new services, no new ports) |
| No change | Database migrations (no schema changes) |

## Key Decisions & Assumptions

1. **Disk storage over in-memory storage** — Multer's `memoryStorage()` keeps the entire upload in RAM as a single `Buffer`. With a 250 MB cap that's a ~250 MB hit per concurrent upload, plus the parsed row array on top (~500 MB for a worst-case file). Disk storage streams the multipart body to a temp file, so the process never holds the whole file in RAM. Trade-off: adds a disk I/O step and requires temp-file cleanup, but cuts peak memory by ~250 MB per upload.

2. **Row-chunked transactions with a parent pre-pass (NOT per-assignment transactions)** — An earlier draft proposed one transaction per assignment. That still fails for the real worst case: a single assignment at this institution can have 8,000 students and hundreds of thousands of comments. Chunking by assignment just recreates the same problem in miniature. Instead: (a) create parent entities up front in their own chunked transactions (parents are low-volume regardless of CSV shape), then (b) process comments in chunks of 5,000 rows per transaction, each transaction holding at most 5,000 row-level locks for a few seconds. This decouples transaction size from data shape. Trade-off: no atomicity across chunks — if the import fails halfway, some chunks have committed. Acceptable because dedup makes re-running safe and the user can see progress in the UI.

3. **Batched `manager.insert()` instead of per-row `manager.save()`** — `manager.save()` issues one INSERT + one SELECT-for-identity per row (250,000 round trips). `manager.insert()` with an array of rows issues a single multi-row INSERT. Expected speedup: 50–100×. Trade-off: `insert()` returns identifiers only, not full entities, so we reconstruct the in-memory data needed for TORI extraction from what we already have.

4. **Streaming parse, but rows are still collected in memory** — A true end-to-end streaming pipeline (parse → transform → insert row-by-row) would require restructuring dedup and parent-entity creation, which are a much larger refactor. Collecting rows into an array after streaming gives us the event-loop-unblocking benefit for 75 MB now, and sets up a cleaner pipeline for a future end-to-end streaming pass if needed.

5. **UTF-8 sniffing via 8 KB sample** — The current parser decodes the whole buffer twice (UTF-8 strict, fall back to Windows-1252). With streaming we can't easily do that. Sampling the first 8 KB and committing to one encoding for the whole file is what 99% of CSV libraries do; real-world files do not mix encodings mid-stream.

6. **Preview keeps uploading the full file** — The existing client flow uploads the file twice (once for preview, once for commit). We are NOT changing that in this plan — the fix would require either caching preview results server-side or client-side chunking, both out of scope. Preview simply uses the same disk-storage temp file and deletes it after responding.

7. **CSV sanitization is a separate one-time step, not a new server feature** — The Digication exporter emits curly quotes, em dashes, and sometimes pre-corrupted U+FFFD bytes that render as black diamonds in the UI. There is an existing user-invocable skill (`/fix-csv`) that cleans these out. Building this into the server is tempting but explicitly out of scope: (a) the root fix belongs in the exporter, (b) server-side silent rewriting of user data is a behavior change that deserves its own design discussion, (c) the encoding-detection layer in phase 03 already catches the *structural* encoding problem (Windows-1252 vs UTF-8); U+FFFD is a different issue — it's data that was corrupted before we saw it. So we run `/fix-csv` as a phase in this plan for the specific file that motivated the fix, and leave a permanent solution for a future effort.

- **Assumption:** Railway's Postgres statement_timeout is ≥ 60 s (default for Railway Postgres is typically 0 = unlimited, but we design for 60 s worst case). Row-chunked transactions of ~5k rows complete in seconds.
- **Assumption:** The Docker dev container has enough disk space for 250 MB temp files under `data/uploads/`. The existing `saveUploadedFile` already writes here, so this is already working.
- **Assumption:** The user is running this in dev via `docker compose up -d --build` and has Caddy running. Phase 08 will verify this.
- **Assumption:** Dev Postgres service name is `db`, app service name is `app`, database name is `chat-explorer`, DB user is `dev` — verified against `docker-compose.yml` and `scripts/upload-direct.mjs:24`.
- **Assumption:** Better Auth's session cookie is named `better-auth.session_token` and the raw token value (no signature suffix) is accepted — verified against `scripts/upload-direct.mjs:102` which uses this pattern successfully.

## Verification Strategy

| Tier | Command | When |
|------|---------|------|
| Typecheck | `docker compose exec app pnpm typecheck` | After every code phase |
| Unit tests | `docker compose exec app pnpm test csv-parser` | After phase 03, 05 |
| Integration tests | `docker compose exec app pnpm test upload` | After phase 04, 05 |
| HTTP tests | `docker compose exec app pnpm test src/server/upload.http.test.ts` | After phase 06 |
| Full vitest suite | `docker compose exec app pnpm test` | After phase 05, 06 |
| Playwright E2E | `pnpm e2e` (on host) | After phase 06 |
| Manual smoke | Watch `docker compose logs -f app` during phase 08 upload | Phase 08 |
| Browser verification | Chrome MCP drives upload of real cleaned 75 MB CSV | Phase 08 |

Dev server is reached at `https://chat-explorer.localhost` (Caddy). If Chrome MCP is available, use it for the browser verification; otherwise, phase 06's Playwright E2E (optionally pointed at the real file) is the best alternative.
