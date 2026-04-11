# Phase 8 — GitHub Actions CI/CD Pipeline

**Context:** Phases 1–7 created ~192 tests. Currently there is no CI — pushing to `main` deploys directly to Railway with zero quality gates. This phase adds GitHub Actions workflows to validate every push.

## Goal

Set up a two-tier CI pipeline:
1. **Fast CI** (every push): typecheck + unit tests (~30s)
2. **Full CI** (PRs to main): typecheck + all tests + build verification (~2min)

## Files to Read Before Implementation

- `package.json` — existing scripts: `typecheck`, `test`, `build`, `e2e`
- `docker-compose.yml` — Postgres setup for integration tests
- `docs/deployment.md` — Railway auto-deploy setup

## Step 1: Fast CI Workflow

**File to create:** `.github/workflows/ci.yml`

This runs on every push to any branch. It's fast because it only runs mocked unit tests (no Postgres service needed).

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  typecheck-and-test:
    name: Typecheck & Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests (client)
        run: pnpm vitest run --project client

  # Full suite only on PRs to main
  full-test:
    name: Full Test Suite
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 10

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: dev
          POSTGRES_PASSWORD: dev
          POSTGRES_DB: chat-explorer
        options: >-
          --health-cmd "pg_isready -U dev"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: All tests (unit + integration)
        run: pnpm test
        env:
          DATABASE_URL: postgresql://dev:dev@localhost:5432/chat-explorer

      - name: Build
        run: pnpm build
```

### Design decisions

**Why client tests only on push (not server tests)?**
Server tests connect to Postgres via the test-setup.ts `beforeAll`. Without a Postgres service, they'd fail. Client tests (jsdom) have no DB dependency. Running client tests on every push catches frontend regressions fast.

Alternatively, server tests that are fully mocked (Phases 1-5) would work without Postgres IF the test-setup.ts didn't unconditionally connect. But changing test-setup.ts is production code modification, which this plan avoids. So we split:
- Push: client tests only (fast, no DB)
- PR: all tests with Postgres service (complete)

**Why no E2E in CI?**
Playwright E2E tests need a running app server (Express + Vite), which requires all env vars (Google OAuth, LLM keys, etc.). Setting this up in CI adds significant complexity and cost. The E2E tests are also mostly `test.skip()` anyway. Add E2E CI as a follow-up when auth fixtures are implemented.

**Concurrency: cancel-in-progress**
If you push twice quickly, the first run is cancelled. This prevents queue buildup on active branches.

**Timeout: 5 min (fast) / 10 min (full)**
Generous but bounded. Current tests run in ~8s locally; CI adds setup overhead.

## Step 2: Branch Protection (manual — document only)

After CI is working, configure branch protection in GitHub:

1. Go to **Settings → Branches → Add branch protection rule**
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ��� Require status checks to pass: `Typecheck & Unit Tests`, `Full Test Suite`
   - ✅ Require branches to be up to date
4. This prevents direct pushes to `main` and ensures every deploy passes CI

**Note:** Don't set this up yet — the team may need to adjust. Document it as a recommended follow-up.

## Step 3: Update CLAUDE.md with CI info

**File to modify:** `CLAUDE.md` (root)

Add a CI section:

```markdown
# CI/CD
- **CI:** GitHub Actions (`.github/workflows/ci.yml`)
  - Every push: typecheck + client unit tests
  - PRs to main: typecheck + all tests (unit + integration) + build
- **Deploy:** Railway auto-deploys on merge to `main`
- **Branch protection:** Recommended but not yet enforced (see `docs/implementation-plan/test-coverage/08-ci-cd.md`)
```

## Verification

1. Push a branch with the new workflow file
2. Verify the "Typecheck & Unit Tests" job runs and passes on GitHub Actions
3. Open a PR to main — verify the "Full Test Suite" job also runs

```bash
git checkout -b feat/test-coverage
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions pipeline — typecheck + tests on push/PR"
git push -u origin feat/test-coverage
# Check GitHub Actions tab for the running workflow
```

## When done

Report: workflow file created, CI run URL, pass/fail status, any adjustments needed.
