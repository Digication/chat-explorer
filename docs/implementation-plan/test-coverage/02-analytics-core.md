# Phase 2 — Analytics Core Service Tests (33 tests)

**Context:** No prior phases required. Tests engagement, tori, and network analytics services with all dependencies mocked.

## Files to Read Before Writing Tests

- `src/server/services/analytics/engagement.ts` — category distribution + modal category
- `src/server/services/analytics/tori.ts` — tag frequencies + co-occurrence n-grams
- `src/server/services/analytics/network.ts` — co-occurrence graph + Louvain community detection
- `src/server/services/analytics/types.ts` — ALL_REFLECTION_CATEGORIES array order
- `src/server/entities/CommentReflectionClassification.ts` — entity shape for engagement mock

## Shared Mock Pattern (all 3 files)

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
const mockGetRepository = vi.fn();
vi.mock("../../data-source.js", () => ({
  AppDataSource: { getRepository: (...args: unknown[]) => mockGetRepository(...args) },
}));
```

### ResolvedScope helper
```typescript
function makeResolved(comments: Array<{id: string; studentId: string | null; role: string; text: string}>) {
  const studentIds = [...new Set(comments.filter(c => c.studentId).map(c => c.studentId!))];
  return {
    comments: comments.map((c, i) => ({
      ...c, externalId: c.id, threadId: "t1", orderIndex: i, timestamp: null, totalComments: null, grade: null,
    })),
    consentedStudentIds: studentIds,
    excludedCount: 0,
    threads: [],
  };
}
```

## Step 1: engagement.test.ts (11 tests)

**File to create:** `src/server/services/analytics/engagement.test.ts`

Mock `CommentReflectionClassification` repository — `createQueryBuilder().where().getMany()` returns classification records.

### Critical logic to test
- Line 75-76: Only `role === "USER"` comments with non-null `studentId` are processed
- Line 58: `>=` comparison in `modalCategory()` — **later categories in ALL_REFLECTION_CATEGORIES win ties** (not higher depth generically — it's array position that matters, and the array IS ordered from lowest to highest depth, so "higher depth wins ties" is correct but the mechanism is `>=`)
- Line 109: Unclassified comments default to `DESCRIPTIVE_WRITING`
- Line 140-142: Scope-wide distribution counts **modal categories per student**, NOT per-comment categories

### Test list

1. **Empty comments → empty results** — no USER comments → `perComment: [], perStudent: [], categoryDistribution: all zeros`
2. **Filters out ASSISTANT role comments** — 1 USER + 1 ASSISTANT → perComment has 1 entry
3. **Filters out comments without studentId** — USER comment with `studentId: null` → perComment empty (line 76 requires truthy studentId)
4. **Classified comment maps to its category** — classification has `category: "DIALOGIC_REFLECTION"` → perComment[0].category is DIALOGIC_REFLECTION
5. **Unclassified comment defaults to DESCRIPTIVE_WRITING** — comment with no matching classification → perComment[0].category is DESCRIPTIVE_WRITING
6. **Includes evidenceQuote and rationale from classification** — classification with both fields → mapped to perComment entry
7. **perStudent aggregates category distribution** — student s1 with 2 DIALOGIC + 1 DESCRIPTIVE_WRITING → `dist.DIALOGIC_REFLECTION === 2, dist.DESCRIPTIVE_WRITING === 1`
8. **modalCategory tie-breaking: later array position wins** — student with equal counts of DESCRIPTIVE_WRITING (1) and CRITICAL_REFLECTION (1) → modal is CRITICAL_REFLECTION (later in ALL_REFLECTION_CATEGORIES)
9. **modalCategory with all-zero distribution → CRITICAL_REFLECTION** — With all counts at 0: `bestCount` starts at -1, `DW: 0 >= -1` → best=DW (bestCount=0), `DR: 0 >= 0` → best=DR, `DLG: 0 >= 0` → best=DLG, `CR: 0 >= 0` → best=CR. Final answer: CRITICAL_REFLECTION. This is a defensive edge case — in production, `modalCategory` is only called on distributions with at least 1 comment, so all-zero never occurs. But the test ensures the `>=` tie-breaking logic is correct.
10. **Scope-wide distribution counts modal categories, not comment categories** — 2 students: s1 modal=DIALOGIC, s2 modal=CRITICAL → `categoryDistribution.DIALOGIC_REFLECTION === 1, .CRITICAL_REFLECTION === 1`
11. **Meta includes consent counts** — resolveScope returns `consentedStudentIds: ["s1","s2"], excludedCount: 3` → meta matches

## Step 2: tori.test.ts (12 tests)

**File to create:** `src/server/services/analytics/tori.test.ts`

Mock `CommentToriTag` repository (innerJoinAndSelect + getMany) and `ToriTag` repository (find).

### Critical logic to test
- Line 132: Deduplication within a comment: `[...new Set(tags)].sort()`
- Lines 135-140: Pairs = all 2-combinations using `i < j` loop
- Lines 142-150: Triples = 3-combinations, capped at 20
- Lines 152-162: Quads = 4-combinations, capped at 10
- Line 107: Frequency percent = `(count / totalAssociations) * 100`, guarded by `totalAssociations > 0`
- Line 121: Coverage percent = `(students.size / totalStudents) * 100`, guarded by `totalStudents > 0`

### Test list

1. **Empty comments → empty everything** — no comment IDs → tagFrequencies [], coOccurrencePairs [], etc.
2. **Single tag on one comment → frequency 100%** — 1 tag, 1 association → percent 100
3. **Two tags → correct frequency percentages** — tag A appears 3 times, tag B appears 1 time → A=75%, B=25%
4. **Tag frequencies sorted descending by count** — tag A=1, tag B=3 → output order is [B, A]
5. **Tag coverage: student deduplication** — student s1 has tag A twice (2 comments) → coverage shows 1 student, not 2
6. **Co-occurrence pairs: 2 tags on 1 comment → 1 pair** — comment has [tagA, tagB] → 1 pair with count=1
7. **Co-occurrence pairs: same 2 tags on 2 comments → count=2** — two comments each with [tagA, tagB] → 1 pair with count=2
8. **Co-occurrence deduplication: duplicate tag IDs on same comment → treated as single** — comment has [tagA, tagA, tagB] → 1 pair (deduplication via Set)
9. **Co-occurrence triples: 3 tags → 1 triple** — comment has [A, B, C] → 1 triple
10. **Co-occurrence triples capped at 20** — generate data producing 25+ triples → output has exactly 20
11. **Co-occurrence quads capped at 10** — generate data producing 15+ quads → output has exactly 10
12. **Missing tag metadata → defaults to "Unknown"** — tag association references unknown tagId → tagName and domain are "Unknown"

## Step 3: network.test.ts (10 tests)

**File to create:** `src/server/services/analytics/network.test.ts`

Same mock setup as tori.test.ts (uses same repositories).

### Critical logic to test
- Default `minEdgeWeight` is `2` (line 136 parameter default)
- Filter uses strict `<` (line 186: `if (weight < minEdgeWeight) continue`)
- Louvain: max 10 iterations, stops on no improvement
- Louvain: `totalWeight === 0` → returns initial communities unchanged
- Nodes only appear if they have at least 1 edge

### Test list

1. **Empty comments → empty nodes, edges, communities** — no data → all arrays empty
2. **Two tags on one comment → one edge with weight=1** — one comment, two tags → 1 edge, 2 nodes
3. **Default minEdgeWeight=2 filters weight-1 edges** — 1 comment with 2 tags (weight=1) → edge filtered out → empty nodes/edges (nodes only if they have edges)
4. **Two comments with same tag pair → weight=2, passes default filter** — 2 comments each with [A,B] → 1 edge weight=2, 2 nodes
5. **Custom minEdgeWeight=1 keeps weight-1 edges** — pass `minEdgeWeight: 1` → edge kept
6. **Edge at exact minEdgeWeight boundary passes** — weight=2, minEdgeWeight=2 → kept (filter is `< 2`, not `<= 2`)
7. **Node degree calculation** — node A connected to B and C → degree=2
8. **Louvain: two disconnected clusters → two communities** — tags [A,B] always together, [C,D] always together, never mixed → assert `communities.length === 2` (don't assert specific community IDs — numbering depends on iteration order)
9. **Louvain: single fully-connected cluster → one community** — all tags always together → assert `communities.length === 1`
10. **Isolated tags (no co-occurrence) → excluded from output** — tag E only appears alone → not in nodes

## Verification

```bash
docker compose exec app pnpm test -- --reporter=verbose
```

Expected: 33 new tests pass.

## When done

Report: files created, exact test count per file, total new tests, any failures and resolutions.
