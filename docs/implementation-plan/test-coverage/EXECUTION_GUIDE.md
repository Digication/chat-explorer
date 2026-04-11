# Test Coverage — Execution Guide

## Execution Order

```
Phase 1 (pure functions)     ──┐
Phase 2 (analytics core)     ──┤
Phase 3 (composite + integ.) ──┼──► Phase 6 (E2E) ──► Phase 7 (Browser) ──► Phase 8 (CI)
Phase 4 (data services)      ──┤
Phase 5 (AI + resolvers)     ──┘
```

**Phases 1–5:** Independent unit/integration tests. Can run in parallel.
**Phase 6:** Independent E2E tests. Can run any time.
**Phase 7:** Browser usability (requires running app + Chrome MCP). Run after all test files exist.
**Phase 8:** CI/CD pipeline. Run last — creates GitHub Actions workflow.

## Recommended Parallel Groups

- **Group A:** Phase 1 + Phase 2 (in parallel, worktree isolation)
- **Group B:** Phase 3 + Phase 4 (in parallel, worktree isolation)
- **Group C:** Phase 5 (largest phase, opus model — run alone)
- **Group D:** Phase 6 (quick E2E, sonnet)
- **Group E:** Phase 7 (browser verification — interactive, not a sub-agent)
- **Group F:** Phase 8 (CI pipeline, sonnet)

## Model Recommendations

| Phase | Model | Why |
|-------|-------|-----|
| 1 | sonnet | Pure function tests, formulaic |
| 2 | sonnet | Repetitive mock pattern across 3 files |
| 3 | sonnet | Threshold tests + simple integration tests |
| 4 | sonnet | RBAC branching is deterministic once mocks are right |
| 5 | opus | 4 files, 42 tests. ai-chat has 8 branches + 10-step orchestration. Critical mock path detail (llm/index.js not provider.js). |
| 6 | sonnet | Simple Playwright structure tests |
| 7 | — | Interactive Chrome MCP — not a sub-agent |
| 8 | sonnet | Single YAML file + CLAUDE.md edit |

## Commit Strategy

One commit per phase:
```
test(phase-1): pure function tests — cache, text-signals, ai-instructions, llm provider (35 tests)
test(phase-2): analytics core tests — engagement, tori, network (33 tests)
test(phase-3): composite analytics + integration tests — recommendations, insights, scope, consent SQL (32 tests)
test(phase-4): data service tests — consent, dedup, tori-extractor (35 tests)
test(phase-5): AI + resolver tests — ai-chat, chat/consent/institution resolvers (42 tests)
test(phase-6): E2E expansion — upload, insights, chat, settings pages (15 tests)
docs(phase-7): browser usability verification report
ci(phase-8): GitHub Actions pipeline — typecheck + tests on push/PR
```

## Critical One-Shot Gotchas

These issues were identified during plan review and WILL cause failures if not followed:

### 1. Integration test file names (Phase 3)
Vitest server project only matches `*.test.ts`. Files named `.integration.test.ts` won't run.
**Rule:** Name them `scope-integration.test.ts` and `consent-integration.test.ts` (hyphenated, not dotted).

### 2. ai-chat.ts LLM mock path (Phase 5)
`ai-chat.ts` imports from `"./llm/index.js"` (barrel), NOT `"./llm/provider.js"`.
**Rule:** `vi.mock("./llm/index.js", ...)` — match the source import path exactly.

### 3. Per-entity getRepository routing (Phases 4 & 5)
Services call `getRepository(StudentConsent)` and `getRepository(CourseAccess)` in the same function. A single shared mock repo causes interference.
**Rule:** Use a `Map<EntityClass, MockRepo>` and route in `mockGetRepository.mockImplementation(...)`.

### 4. Environment variable safety (Phase 1)
Server test-setup.ts connects to Postgres using env vars. If a test corrupts `process.env.DATABASE_URL`, all subsequent server tests fail.
**Rule:** Use `vi.stubEnv()` / `vi.unstubAllEnvs()` — never mutate `process.env` directly.

### 5. findOneBy vs findOne (Phase 5)
`ai-chat.ts` uses `sessionRepo.findOneBy({ id })`, not `findOne({ where: { id } })`. The mock must have `findOneBy`.
**Rule:** Include both `findOne` and `findOneBy` in every mock repo.

### 6. Tori extractor cache reset (Phase 4)
`extractToriTags` uses a module-level cache. `resetToriCache()` must be called in `beforeEach` BEFORE the mock `repo.find()` is invoked.
**Rule:** Call `resetToriCache()` first in `beforeEach`, then clear mocks.

### 7. Louvain community IDs (Phase 2)
Community numbering is non-deterministic (depends on iteration order). Test community COUNT, not specific IDs.
**Rule:** `expect(communities.length).toBe(2)`, not `expect(communities[0].id).toBe(0)`.

## Troubleshooting

### "Cannot find module './scope.js'" in vi.mock
The `.js` extension is required for ESM imports. Always use `.js` even though source is `.ts`.

### withCache mock doesn't bypass
Ensure the mock calls `compute()` and returns `{ data, cached: false }`.

### TypeORM QueryBuilder chain mocking
```typescript
const mockQb = {
  innerJoin: vi.fn().mockReturnThis(),
  innerJoinAndSelect: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  addSelect: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  addOrderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  getMany: vi.fn().mockResolvedValue([]),
  getRawMany: vi.fn().mockResolvedValue([]),
  getOne: vi.fn().mockResolvedValue(null),
  getRawOne: vi.fn().mockResolvedValue(null),
  getCount: vi.fn().mockResolvedValue(0),
};
```

### resolveScope mock return shape
Must match `ResolvedScope` exactly:
```typescript
{
  comments: Array<{
    id: string; externalId: string; threadId: string;
    studentId: string | null; role: string; text: string;
    orderIndex: number; timestamp: Date | null;
    totalComments: number | null; grade: string | null;
  }>,
  consentedStudentIds: string[],
  excludedCount: number,
  threads: Array<{ id: string; assignmentId: string; name: string }>,
}
```

### Integration tests: empty DB
Integration tests in Phase 3 skip gracefully if no seed data exists (like `heatmap.test.ts`). They pass vacuously on a fresh DB.

### E2E: connection refused
Pre-existing issue — Playwright `baseURL` targets localhost:5173 which isn't accessible inside Docker. New tests follow the same pattern.

### CI: server tests fail without Postgres
Server tests (all `src/server/**/*.test.ts`) run `test-setup.ts` which connects to Postgres. On push (no Postgres service), only run client tests. On PR (with Postgres service), run all tests.

## Test Type Summary

| Type | Count | Runner | CI Tier |
|------|-------|--------|---------|
| Unit (mocked) | ~166 | Vitest | Push (client) + PR (all) |
| Integration (real DB) | ~11 | Vitest | PR only |
| E2E (headless) | ~15 | Playwright | Not in CI yet |
| Browser usability | ~20 | Chrome MCP | Manual |
| **Total** | **~212** | | |

## Final Verification

After all phases:
```bash
# Unit + integration tests — target ~340 total
docker compose exec app pnpm test

# E2E
docker compose exec app npx playwright test --reporter=line

# CI — push a branch and check GitHub Actions
git push origin feat/test-coverage

# Browser usability — Phase 7 Chrome MCP checklist
```
