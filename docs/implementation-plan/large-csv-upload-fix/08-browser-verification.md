# Phase 08 — Browser Verification

You are performing the final end-to-end verification for the large-CSV-upload fix in the chat-explorer project.

**Context:** Phases 01–07 are complete:
- 01–04 rebuilt the upload pipeline: disk storage, 250 MB cap, streaming parse, row-chunked transactions (5,000 rows per transaction) with batched inserts (`manager.insert` at 500 rows per INSERT statement) and a parent pre-pass so comment transactions never block on parent-entity creation.
- 05 added unit + integration tests and they pass.
- 06 added HTTP-layer + Playwright E2E tests; both pass against a synthetic small CSV.
- 07 ran the `/fix-csv` skill against the real 75 MB file, producing a sibling `*-fixed.csv` with curly quotes, em/en dashes, non-breaking spaces, and U+FFFD replacement characters cleaned up. **Upload the `-fixed.csv`, not the original** — the original would import black-diamond characters into the DB and defeat the purpose of the exercise.

The whole reason for this plan is that real 75 MB / 252,800-row file that previously returned a 500. This phase uploads the cleaned version through the running app and confirms it succeeds.

Per the project's mandatory browser verification rule in `.claude/CLAUDE.md`: the finish line is the browser, not passing tests.

## Overview

- Boot the app with `docker compose up -d --build`.
- Confirm Caddy is running and `https://chat-explorer.localhost` resolves.
- Sign in to the app.
- Upload the real 75 MB CSV through the UI and watch server logs.
- Verify the preview succeeds, the commit succeeds, counts match expectations, and no OOM / timeout / cert error occurred.
- Query the DB to confirm row counts landed.
- Tear down.

## Steps

### 1. Pre-flight checks

**Commands:**

```bash
# Make sure Caddy is running (handles https://chat-explorer.localhost routing).
docker ps --filter name=caddy --format "{{.Names}} {{.Status}}"
# Expected: caddy container listed as "Up ..."

# If not running:
#   cd ~/caddy && docker compose up -d
# (Only do this after confirming the caddy compose file exists at that path.)

# Verify the CLEANED file we're going to upload (output of phase 06).
FILE="$HOME/Digication Dropbox/Jeffrey Yan/Mac (2)/Downloads/ai-chat-report-7255-2026-04-22-fixed.csv"
ls -lh "$FILE"
# Expected: roughly the same size as the original ~75 MB (very slightly smaller
# after curly-char replacement). If this path doesn't exist, phase 06 wasn't
# run or was run against a different file — go back and run phase 06 first.
```

If the user's actual file moves (for example to a new Downloads location), adjust the `FILE` variable — this phase isn't about proving a specific path, it's about exercising the cleaned 75 MB worst-case CSV.

### 2. Boot the app

```bash
cd /Users/jeffreyyan/code/chat-explorer
docker compose up -d --build
# Wait a few seconds for the server to come up.
docker compose logs --tail=50 chat-explorer
```

Expected log lines:
- `Server running at http://0.0.0.0:4000`
- No ENOENT on `data/uploads/tmp/` (phase 02 creates it at boot).
- No TypeORM schema sync errors.

### 3. Tail the server logs in a second terminal

```bash
docker compose logs -f app
```

Leave this open for the rest of the phase. You should be watching this while the upload runs.

### 4. Browser verification (Chrome MCP preferred)

If Chrome MCP (`mcp__Claude_in_Chrome__*`) is connected, follow these specific steps:

1. **Open a tab and navigate.** `mcp__Claude_in_Chrome__tabs_create_mcp` with `url: "https://chat-explorer.localhost"`. If the cert is rejected, retry with `http://chat-explorer.localhost` — Caddy redirects to HTTPS and Chrome accepts the redirect's cert.
2. **Authenticate.** Two options, depending on what's faster:
   - **Option A (preferred): use the existing dev session.** If the user is already logged in via Google OAuth in their main Chrome profile, the cookie should persist — `read_page` to confirm. If not logged in, ask the user to sign in via the UI in their normal Chrome browser, then re-attach Chrome MCP. Do NOT attempt to drive the OAuth flow with `javascript_tool` — it requires user interaction with the Google consent screen.
   - **Option B: reuse the test session from phase 06.** Run `docker compose exec app node scripts/create-test-session.mjs > /tmp/session.json`, parse out the `sessionToken`, and inject it as a cookie via Chrome MCP's `javascript_tool`: `document.cookie = "better-auth.session_token=<token>; path=/; domain=chat-explorer.localhost"; window.location.href = "/upload";`. This sidesteps OAuth entirely.
3. **Confirm landed on /upload.** Call `read_page` and confirm the page contains "Upload" or the file-picker affordance.
4. **Upload the file.** Use Chrome MCP's `javascript_tool` to populate the file input via a `DataTransfer` (browser security blocks programmatic file selection on raw inputs):

   ```javascript
   // Create a fake DataTransfer with the file bytes loaded via fetch from
   // a file:// URL won't work in Chrome — instead, ask the user to drag the
   // file into the upload area while Chrome MCP is watching.
   ```

   Realistically: Chrome MCP cannot programmatically attach a 75 MB file from the host filesystem (browser sandbox blocks it). **Drive the file selection manually:** ask the user to click into the Chrome window and drag the `-fixed.csv` onto the upload area. Then use Chrome MCP for the post-pick steps (read accessibility tree, click "Confirm Upload", wait for the success state, capture a screenshot).
5. **Watch the preview step.** Use `read_page` after a short delay to confirm the preview pane appeared and shows the expected counts (~252,800 total rows, near-zero duplicates if this is a fresh upload). If the preview returned an error, the response body now contains the real error message (Phase 01's fix) — capture and surface it.
6. **Commit.** Find the "Confirm Upload" button via the data-testid added in Phase 06 (`document.querySelector('[data-testid="upload-commit-btn"]').click()` via `javascript_tool`). Wait — the commit can take 2–3 minutes for 252k rows.
7. **Wait for success.** Poll `document.querySelector('[data-testid="upload-complete"]')` every ~10 seconds until present, with a max wait of 5 minutes. When present, capture a screenshot via `mcp__Claude_in_Chrome__javascript_tool` running `document.body.scrollIntoView()` then take a Chrome MCP screenshot.
8. **Spot-check for diamonds.** Pick a random thread URL from the imported data (use the DB query in step 6 to get a thread id, then construct the URL). Navigate, `read_page`, and grep the rendered text for U+FFFD. Expected: zero matches. If any are found, phase 07's sanitization missed something — investigate before declaring done.
9. **Check console for errors.** Call `mcp__Claude_in_Chrome__read_console_messages`. No errors expected.

If Chrome MCP is not connected:

- Stop. Tell the user Chrome MCP is required for this phase per `.claude/CLAUDE.md`.
- Offer to drive verification a different way: run the Playwright E2E from phase 06 against the real cleaned CSV (would need to swap the synthetic fixture for the real `-fixed.csv` path). That covers the upload flow but not the visual diamond-check.
- Do NOT declare the phase done from any other signal.

### 5. Server-log expectations during the upload

In the tailing terminal, you should see:

- Multer writes the file to `data/uploads/tmp/<uuid>__ai-chat-report-7255-2026-04-22-fixed.csv`.
- No `LIMIT_FILE_SIZE` errors.
- Parser logs (if TypeORM/csv-parse logging is on) — the parse should take ~5–15 seconds but NOT block other requests.
- A parent pre-pass with short transactions (courses → assignments → threads → students), each committing chunks of up to 500 entities.
- Then a stream of short transactions for the comment pass, each covering ~5,000 rows and containing several multi-row INSERT statements (one per 500-row batch).
- The final `INSERT INTO "upload_log"` at the end (note: singular table name).
- No `ETIMEDOUT`, `canceling statement due to statement timeout`, or `out of memory` errors.
- The request returns a 200 JSON response.

### 6. Database sanity check

All table names are SINGULAR (TypeORM default naming) — `institution`, `course`, `assignment`, `thread`, `comment`, `upload_log`.

```bash
# Confirm comment count increased in the institution associated with the upload.
docker compose exec db psql -U dev -d chat-explorer -c "
  SELECT i.name, COUNT(c.id) as comment_count
  FROM institution i
  JOIN course co ON co.\"institutionId\" = i.id
  JOIN assignment a ON a.\"courseId\" = co.id
  JOIN thread t ON t.\"assignmentId\" = a.id
  JOIN comment c ON c.\"threadId\" = t.id
  GROUP BY i.name
  ORDER BY comment_count DESC
  LIMIT 5;
"
```

Expected: the institution from the uploaded file shows ~252,800 comments (may be lower if many were duplicates of a prior upload; compare against the number the UI reported).

```bash
# Confirm the UploadLog entry. The column is uploadedAt, not createdAt.
docker compose exec db psql -U dev -d chat-explorer -c "
  SELECT \"originalFilename\", \"totalRows\", \"newComments\", \"skippedDuplicates\",
         \"toriTagsExtracted\", \"uploadedAt\"
  FROM upload_log
  ORDER BY \"uploadedAt\" DESC
  LIMIT 3;
"
```

Expected: the most recent row shows `totalRows = 252800` and a matching `newComments + skippedDuplicates` sum.

```bash
# Diamond residue check at the SQL level (independent confirmation of the
# Chrome MCP step 8 spot-check).
docker compose exec db psql -U dev -d chat-explorer -c "
  SELECT COUNT(*) AS rows_with_diamonds
  FROM comment
  WHERE text LIKE '%' || E'\\uFFFD' || '%';
"
```

Expected: **0**. If non-zero, phase 07 (sanitization) didn't catch all U+FFFD characters before the upload. Stop and investigate.

### 7. Event-loop-responsiveness check (optional but recommended)

While the next upload is running, from another terminal:

```bash
# Hit a lightweight endpoint during the upload and confirm it responds within <500 ms.
time curl -k -sS -o /dev/null -w "%{http_code}" https://chat-explorer.localhost/api/health
```

Expected: 200 (or whatever the health endpoint normally returns), and the time line shows real < 500 ms. This confirms the event loop is not blocked by the streaming parser.

### 8. Clean up temp files

```bash
ls data/uploads/tmp/
# Expected: empty
ls data/uploads/$(date +%Y-%m)/
# Expected: contains the uploaded CSV under its UUID-prefixed name.
```

If `data/uploads/tmp/` is NOT empty, the cleanup path has a bug — investigate which code path left the file behind.

### 9. Shutdown

Leave the app running for the user. Do NOT run `docker compose down` — the user almost certainly wants to keep using the app after the verification.

## Verification Checklist

- [ ] App booted with `docker compose up -d --build` — no errors.
- [ ] `https://chat-explorer.localhost` loaded in a real browser — no cert failure, login worked.
- [ ] Preview of the cleaned 75 MB CSV completed and showed expected counts.
- [ ] Commit of the cleaned 75 MB CSV completed with a 200 response.
- [ ] Server logs show short per-chunk transactions with batched multi-row INSERTs (not 250k individual INSERTs, not one giant transaction).
- [ ] Server logs show NO OOM, NO statement timeout, NO LIMIT_FILE_SIZE.
- [ ] Event-loop check: `/api/health` responded < 500 ms during upload.
- [ ] DB row counts match the UI-reported counts.
- [ ] Chrome MCP spot-check (step 8): opened a random thread, accessibility tree contains NO U+FFFD characters.
- [ ] SQL diamond check (step 6): `SELECT COUNT(*) FROM comment WHERE text LIKE '%' || E'\\uFFFD' || '%'` returns 0.
- [ ] `data/uploads/tmp/` is empty after upload completes.
- [ ] Committed CSV present in `data/uploads/<year-month>/`.
- [ ] Screenshot of the success state captured via Chrome MCP for the user record.

All 12 boxes must be checked before declaring the fix complete.

## When done

Report:
- Total time from "click upload" to success screen.
- Peak memory reported by `docker stats $(docker compose ps -q app)` during the upload (optional — if not captured, say "not captured").
- Counts from the UI (new comments, new threads, etc.).
- Counts from the DB SELECT — should match.
- Contents of `data/uploads/tmp/` after success (should be empty).
- Any issues encountered, even if worked around.

If any verification step fails, do NOT declare the fix done. Diagnose the failing step, fix it (which may require returning to an earlier phase), and re-run phase 08 from the top.

**No commit for this phase** — verification only, no code changes. If a code change was required to fix a problem found here, that change should be committed as a hotfix on top of the relevant earlier phase's commit, with a message like `fix(upload): [post-verification] <one-line description>`.
