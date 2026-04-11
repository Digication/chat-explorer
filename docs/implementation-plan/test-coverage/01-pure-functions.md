# Phase 1 — Pure Function Tests (35 tests)

**Context:** No prior phases needed. These modules have zero or minimal external dependencies.

## Goal

Test analytics cache, text signals, AI instructions, and LLM provider factory. All are pure functions or depend only on environment variables.

## Files to Read Before Writing Tests

- `src/server/services/analytics/cache.ts` — in-memory Map cache with TTL
- `src/server/services/analytics/text-signals.ts` — 7 text analysis signals + aggregation
- `src/server/services/ai-instructions.ts` — system prompt builder (pure string template)
- `src/server/services/llm/provider.ts` — factory + env var checks
- `src/server/services/analytics/types.ts` — AnalyticsScope type
- `src/server/services/analytics/scope.ts` — ResolvedScope interface shape

## Step 1: cache.test.ts (10 tests)

**File to create:** `src/server/services/analytics/cache.test.ts`

Each test MUST call `cacheClear()` in `beforeEach` so tests are independent — no shared state between tests.

### Test list

1. **cacheGet returns null for a miss** — `cacheGet("nonexistent")` → `null`
2. **cacheSet + cacheGet returns the value** — set "key1" to `{x: 42}`, get → `{x: 42}`
3. **cacheGet returns null after TTL expires** — use `vi.useFakeTimers()`, set with 1000ms TTL, advance 1001ms, get → `null`. Restore with `vi.useRealTimers()` in afterEach.
4. **cacheGet returns value before TTL expires** — set with 5000ms TTL, advance 4000ms, get → value
5. **cacheInvalidate institution-wide clears all entries for that institution** — set 3 entries (institution-wide, course1, course2 all at inst-1), invalidate with `{institutionId: "inst-1"}` (no courseId), all 3 → null
6. **cacheInvalidate course-level clears matching course + institution-wide entries, keeps other courses** — set inst-wide + course-c1 + course-c2 entries, invalidate `{institutionId: "inst-1", courseId: "c1"}` → inst-wide and c1 cleared, c2 kept
7. **cacheInvalidate does not affect other institutions** — set entry for inst-2, invalidate inst-1 → inst-2 entry still present
8. **withCache calls compute on miss, returns cached=false** — pass compute fn, verify it was called once, `cached` is false
9. **withCache returns cached value on hit, compute not called** — call withCache twice with same key, second time compute should NOT be called, `cached` is true. Important: use different compute mocks for each call to verify the first value is returned.
10. **cacheClear empties entire store** — set 2 entries, cacheClear(), both → null

## Step 2: text-signals.test.ts (12 tests)

**File to create:** `src/server/services/analytics/text-signals.test.ts`

### Mock setup
```typescript
const mockResolveScope = vi.fn();
vi.mock("./scope.js", () => ({
  resolveScope: (...args: unknown[]) => mockResolveScope(...args),
}));
vi.mock("./cache.js", () => ({
  withCache: vi.fn(async (_key: string, _scope: unknown, compute: () => Promise<unknown>) => ({
    data: await compute(), cached: false,
  })),
}));
```

### Helper: makeComment
```typescript
function makeComment(id: string, text: string, role = "USER", studentId: string | null = "s1") {
  return { id, externalId: id, threadId: "t1", studentId, role, text, orderIndex: 0, timestamp: null, totalComments: null, grade: null };
}
```

### Test list

1. **Filters to USER role only** — pass one USER and one ASSISTANT comment → perComment has 1 entry
2. **Counts question marks** — text `"What happened? Why? I'm not sure."` → questionCount = 2
3. **Computes average sentence length** — text `"Hello world. Goodbye."` → 2 sentences, avg = (2+1)/2 = 1.5 words
4. **Computes lexical diversity (type-token ratio)** — text `"the the the cat"` → 2 unique / 4 total = 0.5
5. **Counts hedging phrases (case insensitive)** — text `"I think maybe we should. Perhaps not."` → 3 (i think, maybe, perhaps)
6. **Counts evidence phrases** — text `"For example, research shows that data suggests improvement."` → 3
7. **Counts logical connectors** — text `"Because of this, therefore we act. However, it failed."` → 3
8. **Counts specificity (numbers + quotes)** — text `'There were 42 students and "excellent results" in 3.5 years.'` → 3 (42, 3.5, "excellent results")
9. **Handles empty text** — all signals are 0, no errors
10. **Computes aggregate stats: mean, median** — two comments with questionCount 0 and 3 → mean 1.5, median 1.5 (even count: (0+3)/2)
11. **Computes aggregate stats: stddev** — two comments with values [0, 4] → mean 2, variance (4+4)/2=4, stddev = 2
12. **Meta includes scope and consent counts** — pass `consentedStudentIds: ["s1","s2"]`, `excludedCount: 1` → verify meta fields

## Step 3: ai-instructions.test.ts (5 tests)

**File to create:** `src/server/services/ai-instructions.test.ts`

Read the file first to get the exact `SystemPromptContext` interface. This is a pure function — no mocks needed.

### Test list

1. **Returns a non-empty string** — minimal input → string.length > 0
2. **Includes scope label in output** — pass `scope: "CS 101 — Fall 2025"` → output contains "CS 101 — Fall 2025"
3. **Includes data context in output** — pass `data: "Student A: 5 comments"` → output contains "Student A: 5 comments"
4. **showPII=true includes full name permission** — output contains "full name" or "refer to students by their full name"
5. **showPII=false includes privacy warning** — output contains "Do NOT reveal full student names" or "initials only"

## Step 4: provider.test.ts (8 tests)

**File to create:** `src/server/services/llm/provider.test.ts`

### Mock setup
Mock the three provider constructors to avoid real SDK imports:
```typescript
vi.mock("./openai.js", () => ({ OpenAIProvider: vi.fn().mockImplementation(() => ({ name: "openai" })) }));
vi.mock("./anthropic.js", () => ({ AnthropicProvider: vi.fn().mockImplementation(() => ({ name: "anthropic" })) }));
vi.mock("./google.js", () => ({ GoogleProvider: vi.fn().mockImplementation(() => ({ name: "google" })) }));
```

**Environment variable safety:** Use `vi.stubEnv()` to set env vars and `vi.unstubAllEnvs()` in `afterEach` to restore. This prevents env var changes from leaking into other test files (the server test-setup.ts connects to Postgres using env vars — corrupting `DATABASE_URL` would break everything).

```typescript
afterEach(() => {
  vi.unstubAllEnvs();
});
```

### Test list

1. **getAvailableProviders returns empty when no keys set** — delete all 3 env vars → `[]`
2. **getAvailableProviders includes "openai" when OPENAI_API_KEY is set** — set it → includes "openai"
3. **getAvailableProviders includes "google" when GOOGLE_AI_API_KEY is set** — set it → includes "google"
4. **getAvailableProviders returns all 3 when all keys set** — set all → length 3
5. **getLLMProvider("google") returns provider when key exists** — set GOOGLE_AI_API_KEY → returns object with name "google"
6. **getLLMProvider("openai") throws when OPENAI_API_KEY is missing** — delete env var → throws
7. **getLLMProvider with unknown name throws** — pass "unknown" → throws
8. **MODEL_CATALOG has entries for all 3 providers** — verify `openai`, `anthropic`, `google` keys exist, each has at least 1 model with `id` and `label`

## Verification

```bash
docker compose exec app pnpm test -- --reporter=verbose
```

Expected: 35 new tests pass. No existing tests affected.

## When done

Report: files created, exact test count per file, total new tests, any failures encountered and how they were resolved.
