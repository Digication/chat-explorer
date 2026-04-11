# Phase 4 — Data Services: Consent, Dedup, TORI Extractor (35 tests)

**Context:** No prior phases required. All dependencies mocked.

## Files to Read Before Writing Tests

- `src/server/services/consent.ts` — RBAC, upsert, bulk set, query filter
- `src/server/services/dedup.ts` — batch duplicate detection
- `src/server/services/tori-extractor.ts` — regex extraction + thread association
- `src/server/entities/StudentConsent.ts` — ConsentStatus enum values
- `src/server/entities/User.ts` — UserRole enum values

## Step 1: consent.test.ts (14 tests)

**File to create:** `src/server/services/consent.test.ts`

### Mock setup

**Critical: per-entity repository routing.** The consent service calls `getRepository` with two different entity classes — `StudentConsent` and `CourseAccess`. If they share one mock, a `findOne` mock for CourseAccess will interfere with StudentConsent lookups. Use a Map-based router:

```typescript
import { StudentConsent } from "../entities/StudentConsent.js";
import { CourseAccess } from "../entities/CourseAccess.js";

// Per-entity mock repos
const consentRepo = {
  findOne: vi.fn(),
  find: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockImplementation((r) => Promise.resolve({ ...r, updatedAt: new Date() })),
  create: vi.fn().mockImplementation((data) => data),
  count: vi.fn(),
};
const courseAccessRepo = {
  findOne: vi.fn(), // Used by canManageConsent for instructor checks
};
const mockGetRawMany = vi.fn();

vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === StudentConsent) return consentRepo;
      if (entity === CourseAccess) return courseAccessRepo;
      return { findOne: vi.fn(), find: vi.fn().mockResolvedValue([]) };
    }),
    createQueryBuilder: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawMany: mockGetRawMany,
    })),
  },
}));
```

Now tests can independently control what `consentRepo.findOne` vs `courseAccessRepo.findOne` returns.

### canManageConsent RBAC (internal function, tested via setStudentConsent)

The RBAC rules from lines 26-47:
- DIGICATION_ADMIN → always true
- Different institution → always false
- INSTITUTION_ADMIN at same institution → true
- INSTRUCTOR + no courseId → false (cannot set institution-wide)
- INSTRUCTOR + courseId + has CourseAccess → true
- INSTRUCTOR + courseId + no CourseAccess → false

### Test list

1. **getStudentConsent returns mapped records** — find returns 2 records → returns 2 ConsentRecords with correct fields
2. **getStudentConsent returns empty for unknown student** — find returns [] → []
3. **isStudentExcluded: institution-wide exclusion → true** — first findOne returns excluded record → true
4. **isStudentExcluded: course-level exclusion → true** — first findOne returns null, second returns excluded → true
5. **isStudentExcluded: no exclusions → false** — both findOne return null → false
6. **isStudentExcluded: institution-wide checked first** — verify first findOne uses `courseId: IsNull()` (institution-wide takes priority)
7. **setStudentConsent: DIGICATION_ADMIN succeeds** — role DIGICATION_ADMIN → does NOT throw, save called
8. **setStudentConsent: INSTITUTION_ADMIN at same institution succeeds** — same institutionId → save called
9. **setStudentConsent: INSTITUTION_ADMIN at different institution → throws** — different institutionId → throws "permission"
10. **setStudentConsent: INSTRUCTOR with courseId + CourseAccess → succeeds** — findOne returns access record → save called
11. **setStudentConsent: INSTRUCTOR without courseId → throws** — `courseId: null` → throws (instructors can't set institution-wide)
12. **setStudentConsent: INSTRUCTOR without CourseAccess → throws** — findOne returns null for access → throws
13. **setStudentConsent: upserts existing record** — findOne returns existing → updates status on same record, calls save
14. **setAllStudentsConsent: counts updated students** — getRawMany returns 3 studentIds → `{ updated: 3 }`, save called 3 times

## Step 2: dedup.test.ts (6 tests)

**File to create:** `src/server/services/dedup.test.ts`

### Mock setup
Mock 4 repositories (Thread, Comment, Student, Assignment) with different return values.

### Critical edge case: `["__none__"]` sentinel
Lines 27-65 use `ids.length ? ids : ["__none__"]` to prevent empty `IN ()` SQL errors.

### Test list

1. **All empty arrays → all result Sets empty** — pass empty arrays for all 4 → `{ existingThreadIds: Set(0), existingCommentIds: Set(0), ... }`
2. **All IDs exist in DB → Sets contain all input IDs** — mock all queries to return matching records → each Set matches input
3. **No IDs exist → all Sets empty** — mock all queries to return [] → empty Sets
4. **Mixed: some exist, some don't** — threads ["t1","t2"] but DB only has "t1" → existingThreadIds has "t1" only
5. **Empty array uses __none__ sentinel** — pass empty threadIds → verify the query receives `["__none__"]` parameter (spy on getMany args)
6. **Returns Sets (not arrays)** — verify each field is instanceof Set for O(1) lookup

## Step 3: tori-extractor.test.ts (15 tests)

**File to create:** `src/server/services/tori-extractor.test.ts`

### Mock setup
```typescript
vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({
      find: vi.fn().mockResolvedValue([
        { id: "t1", name: "Perspective Shifting", domain: "Cognitive-Analytical" },
        { id: "t2", name: "Emotional Differentiation", domain: "Emotional-Affective" },
        { id: "t3", name: "Pattern Recognition", domain: "Cognitive-Analytical" },
      ]),
    })),
  },
}));
```

**Execution order matters:** Call `resetToriCache()` in `beforeEach` BEFORE configuring mock return values. The cache reset clears the module-level `cachedToriTags` variable, so the next call to `extractToriTags` will invoke `repo.find()` — which must be mocked before that happens.

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  resetToriCache(); // Clear cached tags FIRST
  // Mock repo.find is already set up via vi.mock above — it returns the canned tags on every call
});
```

### isDoneMessage tests (7)

1. **"I'm done" → true** (pattern: `\bi'?m\s+done\b`)
2. **"im done" → true** (apostrophe optional)
3. **"That's all" → true**
4. **"Nothing else" → true**
5. **"Done for now" → true**
6. **"Thank you, that's it" → true** (comma optional pattern)
7. **"I'm not done yet, let me explain my thinking about this topic." → false** — contains "done" but not matching the short "I'm done" pattern. Verify this because the `\b` word boundary + short pattern should NOT match longer sentences where "done" is embedded differently. Actually the regex `\bi'?m\s+done\b` WILL match "I'm done" within a longer sentence. The function returns true if ANY pattern matches. So test: `"Let me explain more about this topic and continue reflecting."` → false (no done patterns at all).

### extractToriTags tests (5)

8. **Explicit format: "(TORI: Perspective Shifting)" → extracts tag t1** — finds the tag by name
9. **Explicit format with multiple: "(TORI: Perspective Shifting, Pattern Recognition)" → extracts 2 tags** — comma-separated in one match
10. **Natural language mention: "...shows strong perspective shifting in the response..." → extracts t1** — substring match
11. **Case insensitive: "(TORI: PERSPECTIVE SHIFTING)" → extracts tag** — case doesn't matter
12. **No matches → empty array** — text with no TORI references → `[]`

### extractToriForThread tests (3)

13. **Associates AI response tags with preceding student comment** — [USER at idx 0, ASSISTANT at idx 1] → associations link ASSISTANT tags to USER comment ID
14. **Skips non-ASSISTANT comments** — [USER, USER] → no associations (no ASSISTANT to extract from)
15. **Skips if student sent done message** — [USER "I'm done", ASSISTANT "(TORI: Perspective Shifting)"] → no associations (done guard)

## Verification

```bash
docker compose exec app pnpm test -- --reporter=verbose
```

Expected: 35 new tests pass.

## When done

Report: files created, test counts, any issues.
