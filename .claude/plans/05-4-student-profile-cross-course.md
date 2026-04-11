# Plan 5.4 — Student Profile & Cross-Course Comparison

**Status:** Not started
**Priority:** Active — next feature to build
**Depends on:** Plans 1-4 (all complete)

## Why this feature exists

The app shows class-level analytics (Insights page) and individual conversations (Chat Explorer), but there's no way to see a single student's full picture across assignments, or to compare how reflection quality differs between courses. Instructors need both views: zoom in on one student, and zoom out to compare courses.

## Feature A: Student Profile Page

A per-student report showing their reflection journey, TORI tag distribution, and growth across assignments.

### Phase A1 — Backend service

**New file:** `src/server/services/analytics/student-profile.ts`

Aggregates existing analytics for one student within the current scope:

```typescript
export interface StudentProfileReport {
  studentId: string;
  name: string;
  totalComments: number;
  totalWordCount: number;
  avgWordCount: number;
  threadCount: number;
  assignmentCount: number;
  categoryDistribution: ReflectionCategoryDistribution;
  growthTrajectory: GrowthDataPoint[];       // per-assignment modal category
  toriTagDistribution: TagFrequency[];       // full tag frequency list
  topToriTags: string[];                     // top 5
  textSignalAverages: StudentTextSignals;    // avg of 7 text signal metrics
  evidenceHighlights: EvidenceHighlight[];   // 3-5 best classified comments
}
```

- Reuses `resolveScope()` with `studentIds: [studentId]`
- Reuses `withCache()` for memoization
- Pulls reflection classifications from `comment_reflection_classification` table
- Pulls TORI tags from existing `tori.ts` logic
- Pulls text signals from existing `text-signals.ts` logic
- Pulls growth trajectory from existing `growth.ts` logic

### Phase A2 — Schema + resolver

**File:** `src/server/types/schema.ts` — add types:
- `StudentProfileReport`
- `StudentTextSignals` (7 avg metrics)
- `EvidenceHighlight` (commentId, text, category, evidenceQuote, assignmentName)
- `StudentProfileResult` (data + meta)
- Query: `studentProfile(scope: AnalyticsScopeInput!, studentId: ID!): StudentProfileResult!`

**File:** `src/server/resolvers/analytics.ts` — add `studentProfile` resolver following `validateScope` pattern.

### Phase A3 — Frontend page

**New route:** `/insights/student/:studentId` in `src/App.tsx`

**New page:** `src/pages/StudentProfilePage.tsx`

Layout (matching InsightsPage Section pattern with Paper+Typography):
1. **Header:** Student name (PII-safe via `getDisplayName`), breadcrumb back to Insights
2. **Summary cards:** Comment count, assignment count, modal reflection category, top TORI tags
3. **Reflection trajectory:** Reuse sparkline/growth pattern from `GrowthVisualization.tsx`, filtered to one student
4. **Category distribution:** Donut chart showing DESCRIPTIVE_WRITING / DESCRIPTIVE_REFLECTION / DIALOGIC_REFLECTION / CRITICAL_REFLECTION breakdown (colors from `CATEGORY_CONFIG`)
5. **TORI tag distribution:** Horizontal bar chart adapted from `ToriTagFrequencies.tsx`
6. **Evidence highlights:** 3-5 quoted comments with category chips and assignment context

**New query:** `GET_STUDENT_PROFILE` in `src/lib/queries/analytics.ts`

### Phase A4 — Navigation wiring

- **StudentEngagementTable:** Make student name a clickable link to `/insights/student/:studentId`
- **GrowthVisualization:** Add click handler on student data points to navigate to profile
- **Breadcrumbs:** Add "← Back to Insights" navigation on the profile page

## Feature B: Cross-Course Comparison

Side-by-side comparison of analytics across 2+ courses within an institution.

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
  topToriTags: string[];  // top 5
  avgWordCount: number;
  growthRate: number;     // % of students who moved up ≥1 category
}

export interface CrossCourseComparison {
  courses: CourseMetricsSummary[];
}
```

- Runs existing analytics per-course using scoped `AnalyticsScope`
- Authorization: institution_admin/digication_admin for any course; instructors only for courses they have access to

### Phase B2 — Schema + resolver

- Types: `CourseMetricsSummary`, `CrossCourseComparison`, `CrossCourseResult`
- Input: `CrossCourseInput { institutionId, courseIds }`
- Query: `crossCourseComparison(input: CrossCourseInput!): CrossCourseResult!`

### Phase B3 — Frontend page

**New route:** `/insights/compare` in `src/App.tsx`

**New page:** `src/pages/CrossCourseComparisonPage.tsx`

Layout:
1. **Course picker:** Multi-select dropdown (min 2 courses)
2. **Comparison table:** Side-by-side columns per course — student count, comment count, category distribution (stacked horizontal bar), top TORI tags (chips), growth rate, avg word count
3. **Visual comparison chart:** Grouped/stacked bar chart of category distributions

### Phase B4 — Navigation wiring

- "Compare Courses" button on InsightsPage, visible at institution-level scope (no course selected)
- Accessible from scope selector breadcrumbs

## Components to reuse vs. create

**Reuse directly:** ScopeSelector, InsightsScopeContext, ThreadPanel, CATEGORY_CONFIG/COLORS/LABELS, resolveScope(), withCache(), Section pattern, getDisplayName()

**Reuse with adaptation:** Sparkline rendering from GrowthVisualization, tag frequency bars from ToriTagFrequencies, evidence card pattern from EvidencePopover, MetricsCards layout

**Create new:** StudentProfilePage, CrossCourseComparisonPage, CategoryDonutChart, CourseComparisonTable, student-profile.ts service, cross-course.ts service

## Implementation order

Feature A first (A1→A2→A3→A4), then Feature B (B1→B2→B3→B4). Feature A has standalone value and establishes patterns Feature B reuses.

## Tests

- Unit tests for `student-profile.ts` service (mock scope resolver, verify aggregation)
- Unit tests for `cross-course.ts` service
- Resolver tests following pattern in `src/server/resolvers/admin.test.ts`
- Component tests for new pages (render, loading, error states)
- Browser verification after each phase
