# Plan 5.4 — Student Profile & Cross-Course Comparison

**Status:** ✅ Complete (merged to main 2026-04-11, commit `a25903c`)
**Priority:** Done
**Depends on:** Plans 1-4 (all complete)

## Why this feature exists

The app shows class-level analytics (Insights page) and individual conversations (Chat Explorer), but there's no way to see a single student's full picture across assignments, or to compare how reflection quality differs between courses. Instructors need both views: zoom in on one student, and zoom out to compare courses.

---

## Design Decisions (decided upfront to avoid ambiguity)

1. **Single query per page, not multi-query.** The existing Insights page uses separate queries per visualization because each component is independent. The student profile is different — it's one student's data, small payload, and all sections load together. A single `studentProfile` query avoids multiple round trips and simplifies loading/error states.

2. **Text signals cut from v1.** The 7 raw averages (avgQuestionCount, avgSentenceLength, etc.) have no clear UI story for instructors. Cut them. Can be added later if requested.

3. **Visualization: raw SVG, no new libraries.** The codebase uses raw SVG for sparklines (GrowthVisualization) and the network graph. The donut chart and bar charts should use raw SVG too. No Recharts or D3 dependency.

4. **PII safety is a hard requirement.** Every student name rendering MUST use `getDisplayName()` from `useUserSettings()`. This applies to page title, breadcrumbs, evidence cards, and the URL doesn't expose the name (only studentId).

5. **Scope is session state, not URL state.** The route is `/insights/student/:studentId` — scope comes from `useInsightsScope()` context (same as all other pages). Deep links won't restore scope, matching existing behavior. If the student has no data in the current scope, show an empty state with a message.

6. **Existing `StudentProfile` type collision.** The schema already has `StudentProfile` (from `instructionalInsights`). The new type will be named `StudentProfileReport` to avoid collision. The existing type stays unchanged.

---

## Feature A: Student Profile Page

### Phase A1 — Backend service

**New file:** `src/server/services/analytics/student-profile.ts`

```typescript
export interface EvidenceHighlight {
  commentId: string;
  text: string;                          // full comment text
  category: ReflectionCategory;
  evidenceQuote: string | null;          // from classifier
  rationale: string | null;              // from classifier
  assignmentName: string;
  threadId: string;
  timestamp: Date | null;
}

export interface PerAssignmentBreakdown {
  assignmentId: string;
  assignmentName: string;
  date: string;                          // ISO date string
  modalCategory: ReflectionCategory;
  commentCount: number;
  categoryDistribution: ReflectionCategoryDistribution;
}

export interface StudentProfileReport {
  studentId: string;
  name: string;
  totalComments: number;
  totalWordCount: number;
  avgWordCount: number;
  threadCount: number;
  assignmentCount: number;
  overallCategoryDistribution: ReflectionCategoryDistribution;
  perAssignment: PerAssignmentBreakdown[];   // ordered chronologically
  toriTagDistribution: TagFrequency[];       // full list, sorted by count desc
  topToriTags: string[];                     // top 5 tag names
  evidenceHighlights: EvidenceHighlight[];   // up to 5, highest-category first
}
```

**Implementation approach:**
1. Call `resolveScope(scope)` where `scope.studentIds = [studentId]`
2. Filter to USER role comments with non-null studentId (same as engagement.ts lines 75-77)
3. If 0 comments found, return empty report (all zeros, empty arrays) — NOT an error
4. Query `CommentReflectionClassification` for all comment IDs (same pattern as engagement.ts lines 90-96)
5. Group comments by assignment (via thread → assignment mapping, same as growth.ts lines 42-61)
6. For each assignment: compute `modalCategory` using `modalOf()` helper (reuse from growth.ts), count, and per-assignment distribution
7. Query `CommentToriTag` for comment IDs → build TagFrequency[] (reuse tori.ts pattern lines 56-110)
8. Select top 5 evidence highlights: take classified comments, sort by category ordinal descending (critical > dialogic > descriptive reflection > descriptive writing), take first 5
9. Wrap in `withCache()` with key `studentProfile:${studentId}:${JSON.stringify(scope)}`

**What to reuse (import, don't duplicate):**
- `resolveScope()` from `scope.ts`
- `withCache()` from `cache.ts`
- `ReflectionCategoryDistribution`, `AnalyticsScope`, `AnalyticsResult` from `types.ts`
- `TagFrequency` from `tori.ts` (or re-export from types)
- `modalOf()` — currently a local function in growth.ts. **Extract to a shared util** (`src/server/services/analytics/utils.ts`) so both growth.ts and student-profile.ts can import it. This is the only refactor needed.

### Phase A2 — Schema + resolver

**File:** `src/server/types/schema.ts` — add:

```graphql
type EvidenceHighlight {
  commentId: ID!
  text: String!
  category: ReflectionCategory!
  evidenceQuote: String
  rationale: String
  assignmentName: String!
  threadId: ID!
  timestamp: String
}

type PerAssignmentBreakdown {
  assignmentId: ID!
  assignmentName: String!
  date: String!
  modalCategory: ReflectionCategory!
  commentCount: Int!
  categoryDistribution: ReflectionCategoryDistribution!
}

type StudentProfileReport {
  studentId: ID!
  name: String!
  totalComments: Int!
  totalWordCount: Int!
  avgWordCount: Float!
  threadCount: Int!
  assignmentCount: Int!
  overallCategoryDistribution: ReflectionCategoryDistribution!
  perAssignment: [PerAssignmentBreakdown!]!
  toriTagDistribution: [TagFrequency!]!
  topToriTags: [String!]!
  evidenceHighlights: [EvidenceHighlight!]!
}

type StudentProfileResult {
  data: StudentProfileReport!
  meta: AnalyticsMeta!
}
```

Add to Query type:
```graphql
studentProfile(scope: AnalyticsScopeInput!, studentId: ID!): StudentProfileResult!
```

**File:** `src/server/resolvers/analytics.ts` — add resolver:

```typescript
studentProfile: async (_: any, args: { scope: ScopeInput; studentId: string }, ctx: GraphQLContext) => {
  const scope = await validateScope(ctx, args.scope);
  return getStudentProfile(scope, args.studentId);
},
```

### Phase A3 — Frontend page

**New route in `src/App.tsx`:** Add `/insights/student/:studentId` as a child route inside the protected route group (alongside `/insights`, `/chat`, etc.). It inherits `InsightsScopeProvider` and `UserSettingsProvider` from the parent.

**New file:** `src/pages/StudentProfilePage.tsx`

**New query in `src/lib/queries/analytics.ts`:**
```typescript
export const GET_STUDENT_PROFILE = gql`
  query GetStudentProfile($scope: AnalyticsScopeInput!, $studentId: ID!) {
    studentProfile(scope: $scope, studentId: $studentId) {
      data {
        studentId
        name
        totalComments
        totalWordCount
        avgWordCount
        threadCount
        assignmentCount
        overallCategoryDistribution {
          DESCRIPTIVE_WRITING
          DESCRIPTIVE_REFLECTION
          DIALOGIC_REFLECTION
          CRITICAL_REFLECTION
        }
        perAssignment {
          assignmentId
          assignmentName
          date
          modalCategory
          commentCount
          categoryDistribution {
            DESCRIPTIVE_WRITING
            DESCRIPTIVE_REFLECTION
            DIALOGIC_REFLECTION
            CRITICAL_REFLECTION
          }
        }
        toriTagDistribution {
          tagId
          tagName
          domain
          count
          percent
        }
        topToriTags
        evidenceHighlights {
          commentId
          text
          category
          evidenceQuote
          rationale
          assignmentName
          threadId
          timestamp
        }
      }
      meta { consentedStudentCount excludedStudentCount computedAt cached }
    }
  }
`;
```

**Page layout (top to bottom):**

1. **Breadcrumb header:** `Insights > Student Profile: {getDisplayName(name)}`
   - "Insights" is a `<Link to="/insights">` for click navigation
   - Compact `ScopeSelector` below breadcrumb (same as if it were on InsightsPage)

2. **Summary cards row** (4 cards in a Grid, matching MetricsCards visual pattern):
   - Total comments (number)
   - Assignments (number)
   - Modal reflection category (colored chip from CATEGORY_CONFIG)
   - Top TORI tags (up to 3 chips)

3. **Reflection trajectory section** (Paper, outlined):
   - Title: "Reflection Growth"
   - Reuse the sparkline SVG approach from GrowthVisualization: X axis = assignments (chronological), Y axis = 4 ordinal lanes (one per category)
   - Single student, so this is one sparkline row — render it larger (height ~120px instead of 48px)
   - Each dot is clickable → sets `openThread` state with the first thread from that assignment
   - Below the sparkline: a mini-table showing assignment name + date + category chip for each point

4. **Category distribution section** (Paper, outlined):
   - Title: "Reflection Category Breakdown"
   - Raw SVG donut chart (outer radius ~80px, inner ~50px, 4 slices)
   - Legend below: category label + count + percent, using CATEGORY_COLORS
   - Each slice/legend item is clickable → opens EvidencePopover filtered to `studentId` + that category (if the existing `GET_HEATMAP_CELL_EVIDENCE` supports category filtering; if not, just show all evidence for the student)

5. **TORI tag distribution section** (Paper, outlined):
   - Title: "TORI Tag Profile"
   - Horizontal bar chart (raw SVG), max 10 tags shown, "Show all" toggle if >10
   - Each bar is clickable → opens EvidencePopover with `studentId` + `toriTagId`
   - Bar colors from DOMAIN_COLORS (same as ToriTagFrequencies.tsx)

6. **Evidence highlights section** (Paper, outlined):
   - Title: "Notable Reflections"
   - Up to 5 cards, each showing:
     - Category chip (colored)
     - Assignment name + date
     - Evidence quote (from classifier) in italics, or first 200 chars of comment text if no quote
     - "View full conversation →" link that calls `onViewThread(threadId, name)`

7. **ThreadPanel** (slide-in from right, same pattern as InsightsPage):
   - Managed via `openThread` state
   - Backdrop click closes

**Empty state:** If `totalComments === 0`, show a centered message: "No reflection data found for this student in the current scope." with a link back to Insights.

**Loading state:** Skeleton placeholders matching the card + section layout (MUI `<Skeleton>` components).

**Error state:** Standard Apollo error display with retry button.

### Phase A4 — Navigation wiring

**File:** `src/components/insights/StudentEngagementTable.tsx`
- Change: student name click → `navigate(`/insights/student/${studentId}`)` using `useNavigate()` from react-router
- The existing popover behavior (EvidencePopover on click) moves to a secondary action: info icon button at end of row
- This is a behavior change — the primary click on a student name now navigates instead of showing a popover

**File:** `src/components/insights/GrowthVisualization.tsx`
- In sparkline view: make the student name (left label) a clickable link to `/insights/student/${studentId}`
- In matrix view: same — student name column cells are links
- In delta view: same

**File:** `src/pages/StudentProfilePage.tsx`
- Breadcrumb "Insights" link uses `<Link to="/insights">` (react-router)
- Browser back button works naturally (react-router history)

---

## Feature B: Cross-Course Comparison

### Phase B1 — Backend service

**New file:** `src/server/services/analytics/cross-course.ts`

```typescript
export interface CourseMetricsSummary {
  courseId: string;
  courseName: string;
  studentCount: number;
  commentCount: number;
  threadCount: number;
  assignmentCount: number;
  categoryDistribution: ReflectionCategoryDistribution;
  topToriTags: string[];    // top 5
  avgWordCount: number;
  growthRate: number;       // 0-100, % of students who improved
}

export interface CrossCourseComparison {
  courses: CourseMetricsSummary[];
}
```

**Implementation approach:**
1. Accept `institutionId` + `courseIds: string[]` (min 2, max 10)
2. For each courseId, build `AnalyticsScope { institutionId, courseId }`
3. Run in **parallel** using `Promise.all()`:
   - `resolveScope(scope)` → get comments, threads, consented students
   - `getEngagement(scope)` → get category distribution
   - `getToriAnalysis(scope)` → get top tags
   - `getGrowth(scope)` → get per-student trajectories
4. These calls hit `withCache()` so repeated comparisons are fast
5. **Growth rate calculation:** For each student in the growth result, compare their first assignment's `modalCategory` ordinal to their last assignment's. Count students where last > first. `growthRate = (improvedCount / totalStudents) * 100`.
6. Compute `avgWordCount` from resolved comments: `sum(text.split(/\s+/).length) / comments.length`
7. Get course names from Course entity
8. Wrap in `withCache()` with key `crossCourse:${JSON.stringify(courseIds.sort())}`

**Authorization in the resolver (NOT the service):**
```typescript
crossCourseComparison: async (_: any, args: { input: CrossCourseInput }, ctx: GraphQLContext) => {
  requireAuth(ctx);
  // Validate access to EVERY course
  for (const courseId of args.input.courseIds) {
    await requireCourseAccess(ctx, courseId);
  }
  return getCrossCourseComparison(args.input.institutionId, args.input.courseIds);
},
```

### Phase B2 — Schema + resolver

```graphql
type CourseMetricsSummary {
  courseId: ID!
  courseName: String!
  studentCount: Int!
  commentCount: Int!
  threadCount: Int!
  assignmentCount: Int!
  categoryDistribution: ReflectionCategoryDistribution!
  topToriTags: [String!]!
  avgWordCount: Float!
  growthRate: Float!
}

type CrossCourseComparison {
  courses: [CourseMetricsSummary!]!
}

type CrossCourseResult {
  data: CrossCourseComparison!
  meta: AnalyticsMeta!
}

input CrossCourseInput {
  institutionId: ID!
  courseIds: [ID!]!
}
```

Add to Query:
```graphql
crossCourseComparison(input: CrossCourseInput!): CrossCourseResult!
```

### Phase B3 — Frontend page

**New route:** `/insights/compare` in `src/App.tsx`

**New file:** `src/pages/CrossCourseComparisonPage.tsx`

**New query in `src/lib/queries/analytics.ts`:**
```typescript
export const GET_CROSS_COURSE_COMPARISON = gql`
  query GetCrossCourseComparison($input: CrossCourseInput!) {
    crossCourseComparison(input: $input) {
      data {
        courses {
          courseId
          courseName
          studentCount
          commentCount
          threadCount
          assignmentCount
          categoryDistribution { ... }
          topToriTags
          avgWordCount
          growthRate
        }
      }
      meta { ... }
    }
  }
`;
```

**Page layout:**

1. **Header:** Breadcrumb `Insights > Compare Courses`

2. **Course picker:** MUI `Autocomplete` with `multiple` prop, listing all courses in the institution (from existing `GET_COURSES` query). Disabled until 2+ selected. "Compare" button triggers the query.

3. **Comparison table** (MUI Table):
   | Metric | Course A | Course B | Course C |
   |--------|----------|----------|----------|
   | Students | 24 | 18 | 31 |
   | Comments | 186 | 142 | 220 |
   | Assignments | 5 | 4 | 6 |
   | Avg word count | 84 | 62 | 91 |
   | Growth rate | 42% | 28% | 55% |
   | Top reflection | Chip | Chip | Chip |

4. **Stacked bar comparison** (raw SVG):
   - One horizontal stacked bar per course
   - 4 segments colored by CATEGORY_COLORS
   - Width proportional to percentage
   - Legend below

5. **TORI tag overlap** (simple):
   - For each course, show top 5 tags as chips
   - Tags appearing in multiple courses get a "shared" badge

**Empty state:** "Select at least 2 courses to compare."
**Loading state:** Skeleton table.

### Phase B4 — Navigation wiring

- **InsightsPage:** Add a "Compare Courses" button (MUI Button, outlined) in the header area. Only visible when scope has no courseId selected (institution-level view). Links to `/insights/compare`.
- **Sidebar:** No change — comparison is a sub-feature of Insights, not a top-level nav item.

---

## Refactoring Required

### Extract `modalOf()` to shared util

**Current location:** `src/server/services/analytics/growth.ts` (lines 161-180), local function

**Move to:** `src/server/services/analytics/utils.ts` (new file)

```typescript
export function modalOf(categories: ReflectionCategory[]): ReflectionCategory
```

**Update imports in:** `growth.ts`, `student-profile.ts`

This is the only refactor. Everything else is additive.

---

## Complete Test Matrix

### Server Unit Tests

**File:** `src/server/services/analytics/student-profile.test.ts`

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Returns empty report for student with 0 comments | All counts 0, empty arrays, no error thrown |
| 2 | Correctly aggregates comment count and word count | totalComments, totalWordCount, avgWordCount math |
| 3 | Computes overall category distribution | Sums across all assignments |
| 4 | Computes per-assignment breakdown correctly | Groups by assignment, chronological order, per-assignment modal |
| 5 | Handles student with only 1 assignment | perAssignment has 1 entry, growth trajectory is a single point |
| 6 | Handles student with unclassified comments | Falls back to DESCRIPTIVE_WRITING (matching engagement.ts behavior) |
| 7 | TORI tag distribution is sorted by count desc | Most frequent tag first |
| 8 | Top 5 tags are correct subset | Matches first 5 of sorted distribution |
| 9 | Evidence highlights sorted by category ordinal | Critical > Dialogic > Descriptive Reflection > Descriptive Writing |
| 10 | Evidence highlights capped at 5 | Even if student has 50 classified comments |
| 11 | Cache key includes studentId and scope | Verify withCache called with correct key |
| 12 | Respects scope filtering | Student scoped to course A doesn't include course B data |

**File:** `src/server/services/analytics/cross-course.test.ts`

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Returns metrics for each requested course | courses.length matches input courseIds.length |
| 2 | Computes growth rate correctly — all improved | 100% when every student's last > first |
| 3 | Computes growth rate correctly — none improved | 0% when no student improved |
| 4 | Computes growth rate correctly — mixed | Correct percentage for partial improvement |
| 5 | Handles course with 0 students | studentCount 0, growthRate 0, empty tags |
| 6 | Handles course with 1 student, 1 assignment | growthRate 0 (can't measure growth from 1 point) |
| 7 | Top 5 TORI tags are correct | Sorted by frequency, capped at 5 |
| 8 | Runs course analytics in parallel | Mock services, verify Promise.all pattern (timing) |
| 9 | Rejects fewer than 2 courseIds | Throws validation error |
| 10 | Rejects more than 10 courseIds | Throws validation error |

**File:** `src/server/services/analytics/utils.test.ts`

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | modalOf returns most frequent category | Basic majority |
| 2 | modalOf breaks ties toward higher depth | Critical wins over Descriptive when tied |
| 3 | modalOf handles single-element array | Returns that element |
| 4 | modalOf handles empty array | Throws or returns DESCRIPTIVE_WRITING (define behavior) |

### Server Resolver Tests

**File:** `src/server/resolvers/analytics.test.ts` (add to existing, or new section)

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | studentProfile requires auth | Unauthenticated → throws |
| 2 | studentProfile validates scope access | Instructor without course access → throws |
| 3 | studentProfile returns data for valid request | Happy path with real DB data |
| 4 | crossCourseComparison requires auth | Unauthenticated → throws |
| 5 | crossCourseComparison validates ALL courseIds | Instructor with access to course A but not B → throws |
| 6 | crossCourseComparison happy path | Returns metrics for each course |

### Client Component Tests

**File:** `src/pages/__tests__/StudentProfilePage.test.tsx`

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Renders loading skeleton while query in flight | Skeleton elements visible |
| 2 | Renders student name using getDisplayName | PII safety — mock useUserSettings |
| 3 | Renders summary cards with correct values | Comment count, assignment count, modal category chip |
| 4 | Renders reflection trajectory sparkline | SVG element with correct number of dots |
| 5 | Renders category donut chart | SVG with 4 arc paths |
| 6 | Renders TORI tag bars | Correct number of bars, sorted by count |
| 7 | Renders evidence highlights | Up to 5 cards with category chips |
| 8 | Shows empty state when totalComments is 0 | "No reflection data" message visible |
| 9 | Shows error state on GraphQL error | Error message + retry button |
| 10 | Breadcrumb "Insights" link points to /insights | Correct href |
| 11 | Clicking evidence "View conversation" calls onViewThread | Mock callback verification |
| 12 | Clicking TORI tag bar opens EvidencePopover | Popover appears with correct studentId + tagId |

**File:** `src/pages/__tests__/CrossCourseComparisonPage.test.tsx`

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Renders course picker | Autocomplete element visible |
| 2 | Compare button disabled with <2 courses selected | Button disabled state |
| 3 | Renders comparison table after query | Correct number of columns |
| 4 | Renders stacked bar chart | SVG with stacked segments |
| 5 | Shows empty state before selection | "Select at least 2 courses" message |
| 6 | Shows loading skeleton during query | Skeleton table visible |
| 7 | Shows error state on GraphQL error | Error message |

**File:** `src/components/insights/__tests__/StudentEngagementTable.test.tsx` (add tests)

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Student name is a link to /insights/student/:id | Correct href on anchor/Link |
| 2 | Info icon opens EvidencePopover (not name click) | Click info → popover; click name → no popover |

### E2E Tests (Playwright)

**File:** `e2e/student-profile.spec.ts`

| # | Test | Auth required? | What it verifies |
|---|------|---------------|-----------------|
| 1 | Unauthenticated visit to /insights/student/xxx redirects to /login | No | Route protection works |
| 2 | Student profile page renders with valid studentId | Yes (skip in CI) | Page loads, key sections visible |
| 3 | Back to Insights link navigates correctly | Yes (skip in CI) | Breadcrumb navigation works |
| 4 | Navigating from Engagement table to profile works | Yes (skip in CI) | Click student name → profile page loads |

**File:** `e2e/cross-course.spec.ts`

| # | Test | Auth required? | What it verifies |
|---|------|---------------|-----------------|
| 1 | Unauthenticated visit to /insights/compare redirects to /login | No | Route protection works |
| 2 | Compare page loads, shows course picker | Yes (skip in CI) | Basic rendering |
| 3 | Compare button disabled until 2 courses selected | Yes (skip in CI) | UI validation |

Note: Authenticated E2E tests are marked `test.skip()` following existing pattern (e2e/admin.spec.ts), designed for CI with auth setup.

### Browser Verification (Chrome MCP — manual after each phase)

**After Phase A1+A2 (backend done):**
- Not browser-testable yet. Verify via `docker compose exec chat-explorer pnpm test` — all new server tests pass.

**After Phase A3 (frontend page):**
1. Navigate to `/insights/student/{known-student-id}` directly
2. Verify: page loads without console errors (check dev tools)
3. Verify: summary cards show correct numbers
4. Verify: sparkline renders with dots at correct Y positions
5. Verify: donut chart renders with correct proportions and colors
6. Verify: TORI tag bars are visible and sorted
7. Verify: evidence highlights show category chips
8. Verify: "View full conversation" link opens ThreadPanel
9. Verify: with PII toggle ON, student name shows initials

**After Phase A4 (navigation wired):**
10. Go to Insights page → Student Engagement table
11. Click a student name → verify navigation to `/insights/student/:id`
12. Verify: page loads with that student's data
13. Click "Insights" breadcrumb → verify navigation back to `/insights`
14. Go to Growth visualization → click student name → verify navigation
15. Use browser back button → verify return to Insights page

**After Phase B3+B4 (cross-course page):**
16. Go to Insights (institution-level, no course selected)
17. Verify: "Compare Courses" button is visible
18. Click it → verify navigation to `/insights/compare`
19. Select 2 courses → click Compare
20. Verify: table renders with correct column count
21. Verify: stacked bars render with correct colors
22. Select a course scope on Insights → verify "Compare Courses" button is hidden

---

## Implementation Order (phased, with test gates)

| Phase | What ships | Test gate before moving on |
|-------|-----------|---------------------------|
| A0 | Extract `modalOf()` to `utils.ts`, add utils tests | `pnpm test` passes, growth.ts still works |
| A1 | `student-profile.ts` service | 12 unit tests pass |
| A2 | Schema + resolver additions | 6 resolver tests pass |
| A3 | StudentProfilePage + route + query | 12 component tests pass + browser checks 1-9 |
| A4 | Navigation wiring (Engagement table + Growth links) | 2 component tests pass + browser checks 10-15 + E2E tests |
| B1 | `cross-course.ts` service | 10 unit tests pass |
| B2 | Schema + resolver | 6 resolver tests pass (from analytics resolver file) |
| B3 | CrossCourseComparisonPage + route + query | 7 component tests pass + browser checks 16-22 |
| B4 | Navigation wiring (InsightsPage button) | E2E tests pass |

**Total new tests: ~55** (12 + 10 + 4 + 6 + 12 + 7 + 2 + 4 + 3 = 60 tests across unit/component/E2E)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `TagFrequency` type not exported from tori.ts | Medium | Blocks A1 | Check import; if not exported, add export (1-line change) |
| `GET_HEATMAP_CELL_EVIDENCE` doesn't filter by category | Medium | Blocks A3 donut click | Check schema; if missing, the donut chart click just shows all evidence for the student (acceptable v1 degradation) |
| Student has comments but no classifications (backfill incomplete) | Low | Wrong category display | Use DESCRIPTIVE_WRITING fallback (matching engagement.ts) |
| Cross-course query is slow (5+ courses) | Medium | Bad UX | Promise.all parallelization + withCache means second load is instant. Add loading indicator. Cap at 10 courses. |
| Route `/insights/student/:studentId` conflicts with other routes | Low | Broken routing | Test in App.tsx — React Router matches specific paths before parameterized ones, so `/insights/compare` must be declared BEFORE `/insights/student/:studentId` |

---

## Files Changed (complete list)

**New files (8):**
- `src/server/services/analytics/student-profile.ts`
- `src/server/services/analytics/cross-course.ts`
- `src/server/services/analytics/utils.ts`
- `src/server/services/analytics/student-profile.test.ts`
- `src/server/services/analytics/cross-course.test.ts`
- `src/server/services/analytics/utils.test.ts`
- `src/pages/StudentProfilePage.tsx`
- `src/pages/CrossCourseComparisonPage.tsx`

**New test files (5):**
- `src/pages/__tests__/StudentProfilePage.test.tsx`
- `src/pages/__tests__/CrossCourseComparisonPage.test.tsx`
- `e2e/student-profile.spec.ts`
- `e2e/cross-course.spec.ts`
- (utils.test.ts listed above)

**Modified files (7):**
- `src/server/services/analytics/growth.ts` — remove local `modalOf()`, import from utils
- `src/server/types/schema.ts` — add new types + query
- `src/server/resolvers/analytics.ts` — add 2 resolvers
- `src/server/resolvers/index.ts` — update if needed
- `src/lib/queries/analytics.ts` — add 2 queries
- `src/App.tsx` — add 2 routes
- `src/components/insights/StudentEngagementTable.tsx` — student name → link
- `src/components/insights/GrowthVisualization.tsx` — student name → link
- `src/pages/InsightsPage.tsx` — add "Compare Courses" button
