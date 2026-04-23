# Phase 09 — Completion Note

Post-execution record of the large-CSV-upload-fix plan. Captures what actually shipped, the two bugs found in verification that the plan docs didn't predict, and the end-state evidence.

## Commit chronology

All commits landed on `main`.

| Phase | Commit | Title |
|---|---|---|
| 01 | `310d36f` | `fix(upload): phase 01 - surface real error messages from upload endpoints` |
| 02 | `7159fc7` | `feat(upload): phase 02 - disk storage + 250 MB cap` |
| 03 | `fc33c6a` | `feat(upload): phase 03 - streaming CSV parser` |
| 04 | `109a5e5` | `perf(upload): phase 04 - row-chunked transactions with batched inserts` |
| 05 | `b801347` | `test(upload): phase 05 - unit + integration tests` |
| 06 | `ce42807` | `test(upload): phase 06 - HTTP + Playwright E2E tests` |
| 06.1 | `44fdd76` | `test(upload): isolate synthetic fixture institutions by domain` |
| 07 | — | no commit (CSV sanitization runs on a user file outside the repo) |
| 08 | `740c729` | `fix(upload): [post-verification] dedupe tori pairs and skip conflicting inserts` |

## Bugs the plan missed

### Bug 1 — shared-institution test pollution (caught between phases 06 and 07)

**Symptom:** After phase 06 added a Playwright E2E test, re-running phase 05's integration tests produced 2 failures. The "many-assignments" preview counted 300 of 2000 comments as duplicates, and the idempotency test reported all 2000 as new.

**Cause:** The synthetic CSV fixture hardcoded `example.digication.com` as the submission URL. `detectInstitution()` keyed off that hostname, found the existing `example` institution (created in earlier E2E runs), and checked dedup against its 300 leftover comments — not against the fresh per-run institution the integration test had created via `RUN_SUFFIX`.

**Fix (commit `44fdd76`):**
- Added an 8th `domain` argument to `scripts/generate-synthetic-csv.mjs`.
- `upload.test.ts` now passes `TEST_INSTITUTION_DOMAIN` so `detectInstitution()` picks its own fresh institution.
- `e2e/upload-flow.spec.ts` passes a unique `e2e-upload-<RUN>.digication.com` so subsequent runs don't pollute the shared `example` institution.
- Also fixed a latent typecheck error: `role: "instructor"` → `role: UserRole.INSTRUCTOR`.

**Why the plan missed it:** The plan assumed `RUN_SUFFIX` alone would isolate institutions. It didn't consider that `detectInstitution()` binds to a URL hostname the CSV carries, not to an ID the test creates.

### Bug 2 — duplicate TORI pair within a thread (caught during phase 08)

**Symptom:** First real-file upload failed with `duplicate key value violates unique constraint "IDX_4556ab1239bbd53a3fa46aaa95"` — the unique index on `comment_tori_tag (commentId, toriTagId)`. Pass B had committed 2,954 new comments, Pass C died mid-insert, Pass D (UploadLog) never ran.

**Cause:** `extractToriForThread` walked the sorted-by-orderIndex comments and, for each assistant reply, emitted one `ToriAssociation` per TORI tag it found. When a thread had two consecutive assistant replies that both mentioned the same TORI category (common — the Digication TORI extractor outputs `(TORI: Self-Efficacy)` across many turns), both replies produced the same `(precedingStudentCommentId, toriTagId)` pair. The unique index rejected the second insert.

**Fix (commit `740c729`):**
- `tori-extractor.ts`: track emitted `(studentCommentId, toriTagId)` pairs in a `Set` inside the per-thread loop and skip duplicates.
- `upload.ts` Pass C: switch `manager.insert(CommentToriTag, batch)` to a query-builder insert with `.orIgnore()` (ON CONFLICT DO NOTHING) — belt-and-suspenders safety for partial retries and cross-upload races.
- Added a regression test covering "two assistant replies mention same tag".

**Recovery:** Deleted the 2,954 partially-uploaded comments (cascaded to tori tags, reflection classifications, etc.) by filtering on `uploadedById` + `importedAt`. Re-uploaded cleanly with the fix in place.

**Why the plan missed it:** The plan focused on DB-write volume (transaction size, batch size, event-loop responsiveness) and didn't audit Pass C's insert semantics against the unique index the TORI table enforces. Synthetic test fixtures didn't exercise the "same tag across multiple assistant replies" pattern — real Digication exports do.

## End-state evidence

From the successful re-upload of `ai-chat-report-7255-2026-04-22-fixed.csv`:

- **UploadLog row:** `totalRows=5058, newComments=2954, skippedDuplicates=0, toriTagsExtracted=2282, uploadedAt=2026-04-23 02:03:43 UTC`.
- **DB delta:** 1,595 → 4,549 comments (+2,954). 1,072 → 3,354 comment_tori_tag rows (+2,282).
- **CSV-shape note:** 5,058 data rows but only 2,954 distinct `Comment ID` values — the Digication export duplicates rows (same comment appears under multiple enrollment/assignment contexts). The parser's `new Set` collapses them. This is expected.
- **Diamond check:** `SELECT COUNT(*) FROM comment WHERE text LIKE '%' || E'\uFFFD' || '%'` returns 0.
- **Rendered UI scan:** `/chat` page HTML contains 0 U+FFFD, 0 curly quotes, 0 em/en dashes — the sanitization (phase 07) removed everything upstream.
- **Temp cleanup:** `data/uploads/tmp/` empty after success.
- **Permanent storage:** `data/uploads/2026-04/6e62e50e-5299-4108-9ae3-d9b4bd993488_ai-chat-report-7255-2026-04-22-fixed.csv` (77.9 MB).

## Test-suite state at completion

- Vitest: 48 files, 360/360 passing (full `docker compose exec app pnpm test`).
- Typecheck: clean (`docker compose exec app pnpm typecheck`).
- Playwright: `e2e/upload-flow.spec.ts` passing.

## Follow-ups deliberately NOT done

- **Root-cause fix in the Digication CSV exporter.** The 286,232 character substitutions phase 07 made are a pre-processing band-aid. A permanent fix belongs in the exporter that emits curly quotes, em dashes, and already-corrupted U+FFFD. Separate work item.
- **End-to-end streaming (parse → transform → insert).** The current phase 03 parser streams from disk but still collects rows into an in-memory array. A true pipeline would further cut peak memory and let uploads begin writing to the DB before the full file has been parsed. The current design handles 250 MB comfortably; this is a future optimization.
- **Server-side sanitization inside the upload handler.** Silent rewriting of user input is a behavior change that deserves its own design discussion — see phase 07 rationale.
