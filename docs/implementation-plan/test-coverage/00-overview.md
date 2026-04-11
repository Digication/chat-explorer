# Test Coverage Pass — Overview

## Why

The app has 151 unit tests and 21 E2E tests, but most backend services have zero dedicated test coverage. Deploys go straight to production on push to `main` with no quality gates. This plan adds comprehensive tests AND a GitHub Actions CI pipeline so every push is validated before it reaches Railway.

## Current State

### Tests (151 unit / 21 E2E)
- Admin resolvers + components (48 tests)
- Export resolver + service + PDF rendering (39 tests)
- CSV parser (3), analytics utils (7), heatmap (4), classifier (15)
- Client components: sidebar, bottom bar, carousel, auth, login, student profile, cross-course, chat bubble, insights visualizations

### CI/CD: None
- No `.github/workflows/` directory
- Railway auto-deploys on push to `main` with no checks
- No typecheck, no tests, no build verification before production

### Untested (target of this plan)
| Category | Files | Lines |
|----------|-------|-------|
| Analytics infra | cache.ts | 86 |
| Analytics services | text-signals, engagement, tori, network, recommendations, instructional-insights | ~1,270 |
| Data services | tori-extractor, consent, dedup | 474 |
| AI services | ai-chat, ai-instructions, llm/provider | 460 |
| Resolvers | chat, consent, institution | 407 |

## Test Types

| Type | Tool | What it catches | Phases |
|------|------|----------------|--------|
| **Unit tests** (mocked) | Vitest | Logic bugs, branch coverage, edge cases, regressions | 1–5 |
| **Integration tests** (real DB) | Vitest + Postgres | SQL correctness, consent filter queries, scope resolution | 3 |
| **E2E tests** (headless browser) | Playwright | Auth redirects, page structure | 6 |
| **Browser usability tests** (live app) | Chrome MCP | Runtime errors, missing data states, GraphQL failures, CSS issues, real user flows | 7 |
| **CI pipeline** | GitHub Actions | Typecheck + unit tests on every push; full suite on PRs to main | 8 |

## Phase Dependency Graph

```
Phase 1 (pure functions)     ──┐
Phase 2 (analytics core)     ──┤
Phase 3 (composite + integ.) ──┼──► Phase 6 (E2E) ──► Phase 7 (Browser usability)
Phase 4 (consent + tori-ext) ──┤                             │
Phase 5 (AI + resolvers)     ──┘                             ▼
                                                     Phase 8 (CI/CD)
```

Phases 1–5 are independent (all deps mocked). Phase 6 is independent. Phase 7 requires the running app. Phase 8 can run after Phase 1 (just needs tests to exist).

## Phase Summary

| Phase | Files Tested | Tests | Model |
|-------|-------------|-------|-------|
| 01 | cache, text-signals, ai-instructions, llm/provider | 35 | sonnet |
| 02 | engagement, tori, network | 33 | sonnet |
| 03 | recommendations, instructional-insights, scope integration, consent SQL integration | 32 | sonnet |
| 04 | consent service, dedup, tori-extractor | 35 | sonnet |
| 05 | ai-chat service, chat/consent/institution resolvers | 42 | opus |
| 06 | E2E: upload, insights, chat, settings pages | 15 | sonnet |
| 07 | Browser usability via Chrome MCP (~20 checks) | — | — |
| 08 | GitHub Actions CI pipeline + test categorization | — | sonnet |
| **Total** | | **~192 tests + CI** | |

## File Inventory

### Test Files to Create

| File | Phase | Tests |
|------|-------|-------|
| `src/server/services/analytics/cache.test.ts` | 1 | 10 |
| `src/server/services/analytics/text-signals.test.ts` | 1 | 12 |
| `src/server/services/ai-instructions.test.ts` | 1 | 5 |
| `src/server/services/llm/provider.test.ts` | 1 | 8 |
| `src/server/services/analytics/engagement.test.ts` | 2 | 11 |
| `src/server/services/analytics/tori.test.ts` | 2 | 12 |
| `src/server/services/analytics/network.test.ts` | 2 | 10 |
| `src/server/services/analytics/recommendations.test.ts` | 3 | 11 |
| `src/server/services/analytics/instructional-insights.test.ts` | 3 | 10 |
| `src/server/services/analytics/scope-integration.test.ts` | 3 | 6 |
| `src/server/services/consent-integration.test.ts` | 3 | 5 |
| `src/server/services/consent.test.ts` | 4 | 14 |
| `src/server/services/dedup.test.ts` | 4 | 6 |
| `src/server/services/tori-extractor.test.ts` | 4 | 15 |
| `src/server/services/ai-chat.test.ts` | 5 | 20 |
| `src/server/resolvers/chat.test.ts` | 5 | 10 |
| `src/server/resolvers/consent.test.ts` | 5 | 7 |
| `src/server/resolvers/institution.test.ts` | 5 | 10 |
| `e2e/upload.spec.ts` | 6 | 4 |
| `e2e/insights.spec.ts` | 6 | 4 |
| `e2e/chat.spec.ts` | 6 | 4 |
| `e2e/settings.spec.ts` | 6 | 3 |

### CI/CD Files to Create (Phase 8)

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Main CI pipeline — typecheck + unit tests on push, full suite on PR |
| `.github/workflows/e2e.yml` | E2E tests on PR to main (separate workflow, heavier) |

### No Production Code Modified
This plan only creates test files and CI config.

## CI/CD Strategy

### Problem
Right now, pushing to `main` triggers an immediate Railway deploy with zero validation. A broken import, a type error, or a failing test goes straight to production.

### Solution: Two-Tier CI

| Trigger | What runs | Time | Purpose |
|---------|-----------|------|---------|
| **Every push** (any branch) | Typecheck + unit tests (mocked only) | ~30s | Fast smoke test — catches type errors and logic regressions |
| **PR to main** | Typecheck + ALL unit tests + integration tests + build | ~2min | Full quality gate before production deploy |
| **Post-merge to main** | Railway auto-deploy (existing) | ~2min | Deploy to production |

### Why two tiers
- **Unit tests (mocked)** are fast (~8s locally). Running them on every push gives instant feedback without slowing down development.
- **Integration tests** need Postgres, which requires a service container in CI. This is heavier (~30s setup). Running only on PRs to `main` keeps feature-branch pushes fast.
- **E2E tests** need a running app server + browser. They're the slowest and most flaky. Run only on PRs to `main` in a separate workflow to not block the fast CI.
- **Build verification** (`pnpm build`) catches Vite + TypeScript compilation issues that `typecheck` alone misses (e.g., missing runtime imports). Run on PRs.

### Test Categories (package.json scripts)

```jsonc
{
  "test": "vitest run",                    // ALL tests (unit + integration)
  "test:unit": "vitest run --project client --project server", // Fast: mocked only
  "test:ci": "vitest run",                 // Same as test, for CI clarity
  "e2e": "npx playwright test"             // E2E (needs running app)
}
```

No new scripts needed — `vitest run` already runs everything. The CI workflow controls what runs by selecting the right command.

## Verification

After all phases:
```bash
docker compose exec app pnpm test          # ~340 total tests
docker compose exec app npx playwright test # E2E
# Phase 7: Chrome MCP browser verification
# Phase 8: Push a branch, verify GitHub Actions runs
```
