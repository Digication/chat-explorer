# Phase 3 — Composite Analytics + Integration Tests (32 tests)

**Context:** No prior phases required. Recommendations and instructional-insights call other analytics services (all mocked). Integration tests use real DB.

## Files to Read Before Writing Tests

- `src/server/services/analytics/recommendations.ts` — 4 heuristic rules
- `src/server/services/analytics/instructional-insights.ts` — student profiles, tag exemplars, prompt patterns
- `src/server/services/analytics/scope.ts` — resolveScope (for integration test)
- `src/server/services/consent.ts` — applyConsentFilter (for integration test)

## Step 1: recommendations.test.ts (11 tests)

**File to create:** `src/server/services/analytics/recommendations.test.ts`

### Mock setup
```typescript
vi.mock("./scope.js", () => ({ resolveScope: vi.fn() }));
vi.mock("./cache.js", () => ({
  withCache: vi.fn(async (_k, _s, compute) => ({ data: await compute(), cached: false })),
}));
const mockGetEngagement = vi.fn();
const mockGetToriAnalysis = vi.fn();
const mockGetNetwork = vi.fn();
vi.mock("./engagement.js", () => ({ getEngagement: (...a) => mockGetEngagement(...a) }));
vi.mock("./tori.js", () => ({ getToriAnalysis: (...a) => mockGetToriAnalysis(...a) }));
vi.mock("./network.js", () => ({ getNetwork: (...a) => mockGetNetwork(...a) }));
```

### Critical thresholds (from reading the source)
- Empty comments → "Upload Data" HIGH (line 23)
- Top 3 tag frequency > 60% of total applications → "Tag Frequency Chart" HIGH (line 53)
- ≥2 students AND ≥3 distinct modal categories → "Depth Band Distribution" HIGH (line 65, 69)
- Network avg degree > 3 → "Network Graph" MEDIUM (line 84)
- ≥6 students AND max category < 70% of total students → "Clustered Heatmap" MEDIUM (line 95, 106)
- No recommendations triggered → "Overview Dashboard" MEDIUM (line 117)
- Sort order: HIGH (0) → MEDIUM (1) → LOW (2)

### Test list

1. **Empty comments → single "Upload Data" HIGH recommendation** — resolveScope returns empty comments → exactly 1 rec with visualization "Upload Data"
2. **Tag diversity: top 3 > 60% → "Tag Frequency Chart" HIGH** — tag frequencies [50, 10, 5, ...] total=100, top3=65 > 60 → HIGH
3. **Tag diversity: top 3 ≤ 60% → no tag frequency rec** — [20, 20, 20, 20, 20] total=100, top3=60 → NOT > 60, no rec
4. **Tag diversity: 0 total applications → no tag rec** — tagFrequencies empty → skip check
5. **Category spread: 3+ categories → "Depth Band Distribution" HIGH** — 3 students each with different modal → HIGH
6. **Category spread: only 1 student → no depth rec** — single student → `perStudent.length > 1` fails
7. **Category spread: 2 categories → no depth rec** — 2 students both DIALOGIC and CRITICAL → `categoriesUsed.size >= 3` fails
8. **Network: avgDegree > 3 → "Network Graph" MEDIUM** — nodes with degrees [4, 4] → avg 4 > 3 → MEDIUM
9. **Clustering: ≥6 students, max < 70% → "Clustered Heatmap" MEDIUM** — 6 students, categoryDistribution {DW:2, DR:2, DLG:1, CR:1}, max=2, 2/6=0.33 < 0.7 → MEDIUM
10. **Clustering: max ≥ 70% → no clustering rec** — 10 students, categoryDistribution {DW:7, DR:1, DLG:1, CR:1}, 7/10=0.7 → NOT < 0.7, no rec
11. **No heuristics triggered → "Overview Dashboard" MEDIUM fallback** — data exists but no thresholds met → single MEDIUM rec

## Step 2: instructional-insights.test.ts (10 tests)

**File to create:** `src/server/services/analytics/instructional-insights.test.ts`

### Mock setup
Same resolveScope/withCache/AppDataSource mocks plus:
```typescript
const mockGetEngagement = vi.fn();
vi.mock("./engagement.js", () => ({ getEngagement: (...a) => mockGetEngagement(...a) }));
```

Mock `AppDataSource.getRepository` to return different mock repos for CommentToriTag, ToriTag, and Student entities.

### Critical logic (from reading source)
- Student profiles: top 3 tags per student, sorted by frequency desc
- Tag exemplars: top 3 comments per tag, sorted by reflection depth ordinal (CRITICAL=3 > DIALOGIC=2 > DESCRIPTIVE_REFLECTION=1 > DESCRIPTIVE_WRITING=0)
- Prompt patterns: only include prompts appearing in ≥2 threads (line 264 filter)
- Category distribution: counts students by modal category → percent of total
- Text excerpt: first 200 chars of comment text (line 195)
- Word count: `text.trim().split(/\s+/).filter(Boolean).length`

### Test list

1. **Empty scope → empty everything** — no comments → studentProfiles [], tagExemplars [], promptPatterns []
2. **Student profile: top 3 tags per student** — student with 5 different tags → topToriTags has 3 entries, sorted by count desc
3. **Student profile: modalCategory from engagement data** — engagement returns modal DIALOGIC for s1 → profile.modalCategory is DIALOGIC
4. **Student profile: avgWordCount calculated correctly** — 2 comments with 10 and 20 words → avgWordCount = 15
5. **Tag exemplars: sorted by reflection depth descending** — tag has comments at 4 depth levels → exemplar picks CRITICAL first, then DIALOGIC, then DESCRIPTIVE_REFLECTION
6. **Tag exemplars: capped at 3 per tag** — tag has 5 comments → only 3 exemplars
7. **Tag exemplars: text excerpt truncated to 200 chars** — comment with 300-char text → excerpt is 200 chars
8. **Prompt patterns: only prompts in ≥2 threads** — prompt A in 3 threads, prompt B in 1 thread → only prompt A in output
9. **Prompt patterns: sorted by threadCount descending** — prompt A in 5 threads, prompt B in 3 → A before B
10. **Category distribution: percentages** — 10 students: 4 DESCRIPTIVE_WRITING, 3 DIALOGIC, 2 CRITICAL, 1 DESCRIPTIVE_REFLECTION → DW=40%, DLG=30%, CR=20%, DR=10%

## Step 3: scope-integration.test.ts (6 tests)

**File to create:** `src/server/services/analytics/scope-integration.test.ts`

**This uses the REAL database** — follows the pattern from `heatmap.test.ts`. Tests gracefully skip if no data exists.

### Why integration tests here
`resolveScope` builds complex SQL with:
- 4-table JOIN chain (comment → thread → assignment → course)
- Consent filtering via NOT EXISTS subqueries
- Optional filters for courseId, assignmentId, studentIds
Pure mocking can't validate these SQL paths.

### Test list

1. **Returns empty result for non-existent institutionId** — fake UUID → `comments: [], consentedStudentIds: [], excludedCount: 0`
2. **Returns comments filtered by institutionId** — if data exists in DB, verify comments all belong to the scope's institution (or skip if no data)
3. **courseId filter narrows results** — if data exists, pass a courseId, verify returned comments are from that course only
4. **Consent-excluded students are filtered out** — if consent data exists, verify excluded students' comments are not in the result
5. **consentedStudentIds only includes participating students** — verify returned studentIds all have at least 1 comment in scope (not institution-wide roster)
6. **threads array matches comments** — verify every threadId in comments has a matching entry in threads array

## Step 4: consent-integration.test.ts (5 tests)

**File to create:** `src/server/services/consent-integration.test.ts`

Uses real DB. Tests `applyConsentFilter` and `isStudentExcluded` with actual SQL.

### Test list

1. **applyConsentFilter returns a valid query builder** — apply to a simple comment query → calling `.getMany()` does not throw
2. **isStudentExcluded returns false for non-existent student** — fake UUID → false
3. **isStudentExcluded returns false when no exclusion records exist** — if DB has students without consent records → false
4. **applyConsentFilter does not throw on empty tables** — apply filter when student_consent table has no matching rows → query executes successfully
5. **getStudentConsent returns empty array for unknown student** — fake UUID → `[]`

## Verification

```bash
docker compose exec app pnpm test -- --reporter=verbose
```

Expected: 32 new tests pass (21 unit + 11 integration).

## When done

Report: files created, test counts, any integration test skips due to missing DB data.
