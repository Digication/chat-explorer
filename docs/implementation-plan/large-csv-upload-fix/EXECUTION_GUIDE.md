# Execution Guide

This plan fixes the large-CSV-upload failure in chat-explorer. **Eight phases** covering code changes (01–04), the full test pyramid (05–06), one-time data cleanup (07), and browser verification (08). Each phase is a self-contained work order — an agent with no prior context reads one phase file, executes it, and reports back.

## Execution Modes

### Mode A: Manual (human-driven, recommended for this plan)

Run each phase in a fresh chat session:

1. `/implement execute docs/implementation-plan/large-csv-upload-fix/01-error-surfacing.md`
2. `/implement execute docs/implementation-plan/large-csv-upload-fix/02-disk-storage.md`
3. `/implement execute docs/implementation-plan/large-csv-upload-fix/03-streaming-parser.md`
4. `/implement execute docs/implementation-plan/large-csv-upload-fix/04-batched-inserts.md`
5. `/implement execute docs/implementation-plan/large-csv-upload-fix/05-tests.md`
6. `/implement execute docs/implementation-plan/large-csv-upload-fix/06-http-e2e-tests.md`
7. `/implement execute docs/implementation-plan/large-csv-upload-fix/07-csv-sanitization.md` (or simply `/fix-csv <path>` from the user)
8. `/implement execute docs/implementation-plan/large-csv-upload-fix/08-browser-verification.md`

Each phase commits its own changes **where applicable** — phase 07 (CSV sanitization) operates on a user file outside the repo, and phase 08 (browser verification) doesn't modify code unless it finds a problem, so neither one has a mandatory commit.

### Mode B: Automated (orchestrator agent)

Sub-agent spawning pattern (sequential, since each phase depends on the prior one):

```
Agent({
  description: "Phase 01 error surfacing",
  prompt: "Read and execute docs/implementation-plan/large-csv-upload-fix/01-error-surfacing.md. Create/modify all files per the phase doc and run the verification commands. Commit at the end per the phase's instructions.",
  model: "sonnet"
})
// wait for completion, verify
// repeat for 02, 03

Agent({
  description: "Phase 04 row-chunked inserts",
  prompt: "Read and execute docs/implementation-plan/large-csv-upload-fix/04-batched-inserts.md",
  model: "opus" // correctness-critical DB logic — do not downgrade
})

Agent({
  description: "Phase 05 unit + integration tests",
  prompt: "Read and execute docs/implementation-plan/large-csv-upload-fix/05-tests.md",
  model: "sonnet"
})

Agent({
  description: "Phase 06 HTTP + E2E tests",
  prompt: "Read and execute docs/implementation-plan/large-csv-upload-fix/06-http-e2e-tests.md",
  model: "sonnet"
})

// Phase 07 is CSV sanitization — invoke the /fix-csv skill directly, not via sub-agent.
// Phase 08 is browser verification — driven interactively with Chrome MCP, not by a sub-agent.
```

## Phase Execution Order

| Phase | Prompt File | Model | Dependencies | Can Parallelize With |
|-------|-------------|-------|--------------|----------------------|
| 01 | `01-error-surfacing.md` | sonnet | — | — |
| 02 | `02-disk-storage.md` | sonnet | 01 | — |
| 03 | `03-streaming-parser.md` | sonnet | 02 | — |
| 04 | `04-batched-inserts.md` | **opus** | 03 | — |
| 05 | `05-tests.md` | sonnet | 04 | 07 (no code dep) |
| 06 | `06-http-e2e-tests.md` | sonnet | 04 (needs working endpoints) | 07 (no code dep) |
| 07 | `07-csv-sanitization.md` | interactive (`/fix-csv` Skill) | — | 05, 06 (no code) |
| 08 | `08-browser-verification.md` | interactive (human + Chrome MCP) | 06 + 07 | — |

## Dependency Graph

```
01 ──▶ 02 ──▶ 03 ──▶ 04 ──┬──▶ 05 ──┐
                          │         │
                          └──▶ 06 ──┼──▶ 08
                                    │
                        07 ─────────┘
```

Phases 01–04 are strictly sequential. Phases 05 and 06 both depend on 04 but are otherwise independent (05 tests the functions directly; 06 tests through HTTP + the UI) — they can run in parallel if desired. Phase 07 (CSV sanitization) has no code dependency and can run at any time. Phase 08 is the final gate and requires all test phases (05 + 06) AND the sanitization (07) to be complete.

## Recommended Execution for Maximum Parallelism

The code chain 01 → 02 → 03 → 04 is strict. After that:

- **Parallel opportunity 1:** Phases 05 and 06 after phase 04 completes. Two chat sessions in separate worktrees, merge before phase 08.
- **Parallel opportunity 2:** Phase 07 (CSV sanitization) any time after starting. Runs independently on a user file.

In practice, for a single-operator flow:
1. Do 01 → 02 → 03 → 04 sequentially (each in fresh context).
2. Do 05 and 06 in either order — they don't conflict (different test files).
3. Do 07 while 05/06 are running, or immediately after.
4. Phase 08 last.

Don't try to run 04 before 03 is finished — 04 depends on `parseCsvFile` existing.

If you want to parallelize across something else (e.g., work on an unrelated ticket while this plan runs), do that in a different branch.

## Constraints

- **Fresh context per phase** — don't pass context from phase N to phase N+1; the phase doc is the complete brief.
- **Commit after each code phase** — each phase doc ends with a specific `git commit -m "..."` command. Follow it. Use `feat(upload): ...`, `fix(upload): ...`, `perf(upload): ...`, or `test(upload): ...` per the project's Conventional Commits rule. Phases 07 and 08 don't require commits.
- **Verification must pass before the next phase.** If `pnpm typecheck` fails at the end of a phase, stop and fix it in the same phase — don't move on.
- **Do not skip phases.** Each phase is load-bearing: 02's cap relies on 01's handler; 04's test coverage relies on 03's streaming parser; 06's E2E tests rely on 04's correct behavior; 08's verification relies on both test phases passing AND the cleaned file from 07.
- **Phase 08 cannot be done by tests alone.** The project's `.claude/CLAUDE.md` mandates browser verification for anything that affects the UI, and the upload UI is affected here. Chrome MCP drives this; see phase 08 for specifics.
- **Don't skip phase 07 even though it's not code.** Skipping it means re-importing known-bad data (black-diamond characters) — the very thing the user flagged when approving this plan.

## Model Selection Guide

| Phase | Model | Reason |
|-------|-------|--------|
| 01 | sonnet | Straightforward middleware add + handler tweak |
| 02 | sonnet | Mechanical storage swap + signature change |
| 03 | sonnet | Streaming pattern is well-trodden; ~150 LOC |
| 04 | **opus** | Restructures the core DB write path into a four-pass pipeline (parents → comments → TORI → finalize). Correctness is critical — dedup, parent lookup correctness across chunks, transaction scope, FK order, batch sizing. Do not downgrade. |
| 05 | sonnet | Test generation + boilerplate |
| 06 | sonnet | More test infrastructure — HTTP + Playwright boilerplate, session helper, data-testids |
| 07 | interactive | Invokes the existing `/fix-csv` skill on the user's actual file; no code change |
| 08 | interactive | Requires human oversight + Chrome MCP |

## Environment Setup

Prerequisites before running any phase:

- Docker Compose is running locally: `docker compose up -d --build` in `/Users/jeffreyyan/code/chat-explorer`.
- Shared Caddy proxy running (`docker ps --filter name=caddy` shows it up). If not: `cd ~/caddy && docker compose up -d`. See `references/CADDY_ROUTING.md`.
- `DATABASE_URL` is wired into the `app` service (already done in `docker-compose.yml`).
- Pnpm works inside the container: `docker compose exec app pnpm --version`.
- Node 24+ — confirmed in `docker-compose.yml:2` (`node:24-bookworm`). Required for `TextDecoder` streaming support, top-level await, and built-in `fetch` + `FormData` in tests.
- Docker services are named **`app`** (Node container, port 4000) and **`db`** (Postgres). DB user `dev`, database name `chat-explorer` — per `scripts/upload-direct.mjs:24`.
- For phase 06 E2E: Playwright is run from the HOST (not inside the container) via `pnpm e2e`. Browsers install to the host on first run.
- For phase 08: Chrome MCP must be connected (extension installed in Chrome).

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| Phase 02: `ENOENT: data/uploads/tmp/` on first upload after boot | multer tried to write before `mkdir` ran | Ensure `await fs.mkdir(UPLOAD_TMP_DIR, { recursive: true })` runs at module init, not inside the upload handler. Check the `multer` config block order in `src/server/index.ts`. |
| Phase 03: `TypeError: parser is not async iterable` | `csv-parse` import resolved to the sync shim | Import `parse as parseStream` from `csv-parse` (no `/sync` suffix). Check the import block. |
| Phase 03: Parser throws on Windows-1252 files | Encoding sniffer returned utf-8 because the first 8 KB happened to be ASCII | Increase sniff size, or sniff at 8 KB AND check if any subsequent chunk has invalid UTF-8 bytes. A cheap fix: if the parser emits a parse error, retry with `windows-1252`. |
| Phase 04: `insert(Comment, batch)` returns empty `identifiers` | Comment entity uses `@BeforeInsert()` UUID hook that TypeORM doesn't apply to batch `insert()` | Generate UUIDs in `NewCommentDraft` with `randomUUID()` and pass them as `id` in each draft. Then zip IDs from the drafts directly instead of reading `result.identifiers`. |
| Phase 04: `could not serialize access due to concurrent update` | Two upload requests ran against the same institution concurrently | Acceptable — we don't lock the institution. Each chunk's transaction commits independently. The second request will see some rows as duplicates on its next run. Not a bug. |
| Phase 04: `Internal: threadId missing for row ...` thrown in the comment pass | A thread referenced by a comment wasn't created in the parent pre-pass | The parent pre-pass is expected to create every distinct thread that appears in the rows. If this fires, the collection loop in `importParents` missed something. Most likely cause: the row has a non-empty `threadId` but an empty/invalid `assignmentId` so the thread was skipped. Check the filtering logic in the `for (const row of rows)` loop that populates `threadSpecs`. |
| Phase 04: Parent pre-pass takes > 60 s on 8k-student data | `ensureStudent` runs a `findOne` per student, which is ~1 ms against local Postgres but can be ~5 ms against Railway | Short-circuit the `findOne` when `dedup.existingStudentSystemIds.has(systemId)` is false (i.e., we already know this student is new — no need to look them up). Same applies to `ensureThread`. The phase doc already has this check; confirm it wasn't dropped. |
| Phase 05: "DataSource is not initialized" | Phase 05 relies on `src/server/test-setup.ts` (hooked into vitest's `setupFiles`) to init AppDataSource. If the test file doesn't match the setupFiles glob, the init never runs. | Confirm the test file lives under a path vitest includes (e.g., `src/server/services/*.test.ts`). Do NOT call `AppDataSource.initialize()` inside the test — that double-inits and errors. |
| Phase 05: FK constraint violation on cleanup | Tests ran concurrently with the same `RUN_SUFFIX` (extremely unlikely) OR a prior failed run left rows behind | `RUN_SUFFIX` includes `Date.now() + randomUUID().slice(0, 8)` so collisions are essentially impossible. If you see this, check for stale rows with `SELECT * FROM "user" WHERE email LIKE 'upload-test-%@example.com'` and clear them manually. |
| Phase 06: HTTP test returns 401 despite valid session | Better Auth cookie format mismatch — e.g., the server expects a signed cookie but `create-test-session.mjs` wrote a raw token | Check `src/server/auth.ts` for cookieSecret/cookiePrefix config. If it uses a cookie prefix or signing, adjust `cookieValue` in `create-test-session.mjs` to match. `scripts/upload-direct.mjs:102` is the reference for what format currently works. |
| Phase 06: Playwright test times out waiting for `upload-complete` | Commit runs longer than the 45s default test timeout for this step | Bump the timeout in `expect(...).toBeVisible({ timeout: 120_000 })`. Synthetic 300-row fixture should finish in <10s; if it's slower, check that the database is reachable and not swamped. |
| Phase 06: `global-setup.ts` fails to spawn the session script | Path resolution from Playwright's CWD differs from test file's location | Use `join(process.cwd(), "scripts/create-test-session.mjs")` explicitly. Playwright runs from the repo root. |
| Phase 07: `/fix-csv` reports ERROR: for the input file | File path has spaces or special characters and the shell didn't quote it | Re-run with the path in double quotes. The user's actual path has spaces — always quote it. |
| Phase 07: `-fixed.csv` has different row count than input | CSV reader/writer encountered malformed quoting; fix-csv's CSV-aware parser may have split or merged rows | Open both files with `csv.reader` (NOT `wc -l`) and diff. Usually caused by an unescaped quote in the source — hand-fix the row in the original and re-run fix-csv. |
| Phase 08: Chrome MCP not connected | User hasn't installed the extension | Stop. Ask the user to install the extension. Fallback: run the Phase 06 Playwright test against the real cleaned CSV (swap the fixture path). Do NOT declare the fix complete on tests alone. |
| Phase 08: Upload still 500s | Root cause wasn't on this list | Read the error message returned in the response body (Phase 01 made that work) AND the `docker compose logs app` output. Paste both into the next diagnosis cycle. |
| Phase 08: SQL diamond check finds non-zero rows | Phase 07 missed some U+FFFD characters | Re-run `/fix-csv` with a larger buffer for context-inference, or hand-fix the specific rows. Do NOT mark phase 08 done — re-run phase 07 then phase 08. |

## Rollback

Each phase commits independently. To roll back a specific phase:

```bash
git log --oneline --grep "upload" -- src/server/services/upload.ts src/server/services/csv-parser.ts src/server/index.ts
# Identify the phase NN commit
git revert <commit-sha>
```

Reverting partial phases (e.g., 04 but not 03) may leave a non-building state because 04 depends on 03's signatures. In that case, revert down to the last clean checkpoint (end of phase 03) instead.
