# Heatmap Evidence & Thread Panel — Implementation Plan

## Overview

Add interactive drill-down to the Insights heatmap. Clicking any data point (classic cell, sparkline dot, or small-multiples tag) opens a popover showing direct quotes from that student's reflections tagged with that TORI category. Each quote has a "View full conversation" link that opens a slide-in panel on the right showing the complete chat thread, while the main insights content shifts left to make room.

## Current State

### What exists today

- **HeatmapView.tsx** (`src/components/insights/HeatmapView.tsx`) — 3 display modes: Classic (colored table), Sparkline (SVG polyline rows), Small Multiples (tag-list cards). Hover shows tag name + count but NO evidence/quotes.
- **Heatmap backend** (`src/server/services/analytics/heatmap.ts`) — returns `matrix`, `rowLabels`, `colLabels`, `rowOrder`, `colOrder`. Does NOT return database IDs for students or tags, only display names. Does NOT return comment text.
- **Schema** (`src/server/types/schema.ts`) — `HeatmapData` type has no `rowIds`/`colIds` fields. No query exists for fetching evidence for a specific (student, tag) pair. No `thread(id)` query exists (threads are only reachable via `Assignment.threads`). The `HeatmapMode` enum still includes `CLUSTERED` and `DOT` which are no longer used by the frontend.
- **Explorer components** — `CommentCard.tsx` renders a single comment with role styling, student name, timestamp, and TORI chips. `ThreadView.tsx` renders threads filtered by student. These can be reused in the thread panel.
- **Existing GQL queries** — `GET_ASSIGNMENT_THREADS` in `src/lib/queries/explorer.ts` fetches threads with full comments for a course. There is no single-thread-by-ID query.
- **Test infrastructure** — vitest is installed (`pnpm test` runs `vitest run`) but there are zero test files and no `vitest.config.ts`. Tests run inside the Docker container via `docker compose exec chat-explorer-dev pnpm test`.

### Data model relationships

```
Student ─── Comment ─── CommentToriTag ─── ToriTag
                │
              Thread ─── Assignment ─── Course
```

- `Comment` has: `id`, `threadId`, `studentId`, `role`, `text`, `timestamp`, `orderIndex`
- `CommentToriTag` has: `commentId`, `toriTagId` (junction table)
- `ToriTag` has: `id`, `name`, `domain`, `domainNumber`, `categoryNumber`, `description`
- `StudentConsent` has: `studentId`, `institutionId`, `courseId`, `status` (INCLUDED/EXCLUDED)

---

## Phase 0: Test Infrastructure

Before writing any feature code, set up the test framework so tests can be written alongside each phase.

### 0a. Create `vitest.config.ts`

**New file: `vitest.config.ts`** (project root)

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests run inside Docker with access to Postgres
    // Use a test database or transaction rollback pattern
    setupFiles: ["src/server/test-setup.ts"],
  },
});
```

### 0b. Create test setup file

**New file: `src/server/test-setup.ts`**

This file initializes the TypeORM data source for test runs. Tests run inside the Docker container where the Postgres DB is available.

```typescript
import { AppDataSource } from "./data-source.js";
import { beforeAll, afterAll } from "vitest";

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
```

**Note:** If the data source requires env vars (DB host, etc.), ensure the test command runs inside Docker: `docker compose exec chat-explorer-dev pnpm test`.

---

## Phase 1: Backend — Extend Heatmap with IDs + Evidence Query

### 1a. Add `rowIds` and `colIds` to heatmap response

The frontend needs actual database IDs (not just display names) to query for evidence.

**File: `src/server/services/analytics/heatmap.ts`**

In the `HeatmapData` interface, add:
```typescript
rowIds: string[];   // student UUIDs, same order as rowLabels
colIds: string[];   // ToriTag UUIDs, same order as colLabels
```

In the `getHeatmap` function, the data is already available:
- `studentIds` (line ~39) maps to rows — use this for `rowIds`
- `allTags` (line ~67) contains tag objects — use `allTags.map(t => t.id)` for `colIds`

Add both to the return object at line ~116.

**File: `src/server/types/schema.ts`**

Update the `HeatmapData` GraphQL type (around line 292):
```graphql
type HeatmapData {
  matrix: [[Float!]!]!
  rowLabels: [String!]!
  colLabels: [String!]!
  rowIds: [ID!]!      # NEW
  colIds: [ID!]!      # NEW
  rowOrder: [Int!]!
  colOrder: [Int!]!
  mode: HeatmapMode!
  scaling: ScalingMode!
}
```

Also clean up the `HeatmapMode` enum — remove unused values:
```graphql
enum HeatmapMode {
  CLASSIC
}
```

And update the TypeScript type in `src/server/services/analytics/types.ts`:
```typescript
export type HeatmapMode = "CLASSIC";
```

**File: `src/lib/queries/analytics.ts`**

Update the `GET_HEATMAP` query (around line 110) to also request `rowIds` and `colIds`.

### 1b. New `heatmapCellEvidence` query

Returns the actual comment text for a specific (student, TORI tag) pair within a scope.

**File: `src/server/services/analytics/heatmap.ts`** — add new function:

```typescript
export interface CellEvidence {
  commentId: string;
  text: string;           // full comment text
  threadId: string;
  threadName: string;
  timestamp: string | null;
}

export async function getHeatmapCellEvidence(
  scope: AnalyticsScope,
  studentId: string,
  toriTagId: string
): Promise<CellEvidence[]> {
  // ── Step 1: Direct consent check (lightweight, NOT resolveScope) ────
  //
  // Do NOT call resolveScope() here — it loads ALL comments for the entire
  // scope into memory, which is wasteful when we only need comments for
  // one student + one tag.
  //
  // Instead, check consent directly:
  const consentRepo = AppDataSource.getRepository(StudentConsent);

  // Check institution-level exclusion
  const instExclusion = await consentRepo.findOne({
    where: {
      studentId,
      institutionId: scope.institutionId,
      courseId: IsNull(),
      status: ConsentStatus.EXCLUDED,
    },
  });
  if (instExclusion) return [];

  // Check course-level exclusion (if scope has a courseId)
  if (scope.courseId) {
    const courseExclusion = await consentRepo.findOne({
      where: {
        studentId,
        institutionId: scope.institutionId,
        courseId: scope.courseId,
        status: ConsentStatus.EXCLUDED,
      },
    });
    if (courseExclusion) return [];
  }

  // ── Step 2: Direct evidence query ───────────────────────────────────
  const qb = AppDataSource.getRepository(Comment)
    .createQueryBuilder("c")
    .innerJoin(CommentToriTag, "ctt", "ctt.commentId = c.id")
    .innerJoin("c.thread", "t")
    .innerJoin("t.assignment", "a")
    .select([
      "c.id AS commentId",
      "c.text AS text",
      "c.threadId AS threadId",
      "t.name AS threadName",
      "c.timestamp AS timestamp",
    ])
    .where("c.studentId = :studentId", { studentId })
    .andWhere("ctt.toriTagId = :toriTagId", { toriTagId })
    .andWhere("c.role = :role", { role: "USER" })
    .andWhere("a.courseId IN (SELECT id FROM course WHERE institutionId = :instId)", {
      instId: scope.institutionId,
    });

  if (scope.courseId) {
    qb.andWhere("a.courseId = :courseId", { courseId: scope.courseId });
  }
  if (scope.assignmentId) {
    qb.andWhere("t.assignmentId = :assignmentId", { assignmentId: scope.assignmentId });
  }

  qb.orderBy("c.timestamp", "ASC", "NULLS LAST")
    .addOrderBy("c.orderIndex", "ASC")
    .limit(20);

  const rows = await qb.getRawMany();

  return rows.map((r) => ({
    commentId: r.commentId ?? r.commentid,
    text: r.text,
    threadId: r.threadId ?? r.threadid,
    threadName: r.threadName ?? r.threadname,
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : null,
  }));
}
```

**Important implementation note:** The raw query column names may be lowercased by Postgres. Use fallbacks like `r.commentId ?? r.commentid` or use column aliases with double-quotes. Test the actual column names returned.

**File: `src/server/types/schema.ts`** — add new types and query:

```graphql
type CellEvidence {
  commentId: ID!
  text: String!
  threadId: ID!
  threadName: String!
  timestamp: String
}

input CellEvidenceInput {
  scope: AnalyticsScopeInput!
  studentId: ID!
  toriTagId: ID!
}

# Add to Query type:
heatmapCellEvidence(input: CellEvidenceInput!): [CellEvidence!]!
```

**File: `src/server/resolvers/analytics.ts`** — add resolver:

```typescript
heatmapCellEvidence: async (
  _: unknown,
  { input }: { input: { scope: ScopeInput; studentId: string; toriTagId: string } },
  ctx: GraphQLContext
) => {
  const validated = await validateScope(ctx, input.scope);
  return getHeatmapCellEvidence(validated, input.studentId, input.toriTagId);
},
```

**File: `src/lib/queries/analytics.ts`** — add frontend query:

```graphql
export const GET_HEATMAP_CELL_EVIDENCE = gql`
  query HeatmapCellEvidence($input: CellEvidenceInput!) {
    heatmapCellEvidence(input: $input) {
      commentId
      text
      threadId
      threadName
      timestamp
    }
  }
`;
```

### 1c. New `thread(id)` query

The thread panel needs to load a single thread by ID with all its comments.

**File: `src/server/types/schema.ts`** — add to Query type:
```graphql
thread(id: ID!): Thread
```

**File: `src/server/resolvers/course.ts`** — add resolver:
```typescript
thread: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
  requireAuth(ctx);
  const repo = AppDataSource.getRepository(Thread);
  const thread = await repo.findOne({ where: { id } });
  if (!thread) return null;

  // Auth: verify the user has access to the course this thread belongs to.
  // IMPORTANT: Always check access — do NOT return the thread if we can't
  // verify the assignment/course chain.
  const assignmentRepo = AppDataSource.getRepository(Assignment);
  const assignment = await assignmentRepo.findOne({ where: { id: thread.assignmentId } });
  if (!assignment) return null;  // orphaned thread — treat as not found
  await requireCourseAccess(ctx, assignment.courseId);

  return thread;
},
```

**Security note:** The original plan had `if (assignment) await requireCourseAccess(...)` which would skip the auth check if the assignment wasn't found — returning the thread without authorization. Fixed above: if assignment is missing, return null.

The existing `Thread.comments` field resolver (line 132 of `course.ts`) already handles loading comments for a thread, so no additional work needed there.

**File: `src/lib/queries/explorer.ts`** — add thread-by-ID query here (NOT in analytics.ts, since this is thread data, not analytics):

```graphql
export const GET_THREAD_BY_ID = gql`
  query ThreadById($id: ID!) {
    thread(id: $id) {
      id
      name
      comments {
        id
        role
        text
        timestamp
        orderIndex
        studentId
        student {
          id
          displayName
        }
        toriTags {
          id
          name
          domain
        }
      }
    }
  }
`;
```

### 1d. Tests for Phase 1

**New file: `src/server/services/analytics/heatmap.test.ts`**

Tests run inside Docker with real Postgres. Each test should use a transaction that rolls back to avoid polluting state.

```typescript
import { describe, it, expect } from "vitest";

describe("getHeatmapCellEvidence", () => {
  it("returns comments matching the given student and TORI tag", async () => {
    // Setup: need a student, comment, toriTag, commentToriTag in the DB
    // (seed data or test fixtures)
    // Call getHeatmapCellEvidence(scope, studentId, toriTagId)
    // Assert: returns array of CellEvidence with correct fields
  });

  it("returns empty array when student is consent-excluded at institution level", async () => {
    // Setup: student with EXCLUDED consent
    // Assert: returns []
  });

  it("returns empty array when student is consent-excluded at course level", async () => {
    // Setup: student with course-level EXCLUDED consent
    // Assert: returns []
  });

  it("only returns USER role comments, not ASSISTANT or SYSTEM", async () => {
    // Setup: same student+tag on both USER and ASSISTANT comments
    // Assert: only USER comments returned
  });

  it("respects scope.assignmentId filter", async () => {
    // Setup: comments in two different assignments
    // Assert: only comments from the scoped assignment returned
  });

  it("limits results to 20", async () => {
    // Setup: 25+ comments for one student+tag
    // Assert: exactly 20 returned
  });

  it("returns empty array when no matching comments exist", async () => {
    // Assert: returns [] not null/error
  });
});
```

**New file: `src/server/resolvers/course.test.ts`** (or add to existing if it existed)

```typescript
describe("thread(id) resolver", () => {
  it("returns null for non-existent thread ID", async () => { ... });

  it("returns null when assignment is missing (orphaned thread)", async () => { ... });

  it("throws auth error when user lacks course access", async () => { ... });

  it("returns thread with comments when authorized", async () => { ... });
});
```

**Test fixture strategy:** If the project doesn't have test seed data yet, create a `src/server/test-fixtures.ts` with helper functions like `createTestStudent()`, `createTestComment()`, etc. that insert rows and return them. Each test should clean up after itself (or use transactions).

---

## Phase 2: Frontend — Evidence Popover

### 2a. New `EvidencePopover` component

**New file: `src/components/insights/EvidencePopover.tsx`**

Props:
```typescript
interface EvidencePopoverProps {
  anchorEl: HTMLElement | null;        // always a DOM element, never raw SVG
  studentId: string;
  studentName: string;
  toriTagId: string;
  toriTagName: string;
  count: number;                       // the heatmap cell value
  scope: AnalyticsScope;
  onClose: () => void;
  onViewThread: (threadId: string, studentName: string) => void;
}
```

Behavior:
- Uses MUI `Popover` anchored to `anchorEl`
- On mount, fires `GET_HEATMAP_CELL_EVIDENCE` query via `useLazyQuery`
- Shows loading skeleton while fetching
- Renders a scrollable list (max height ~300px) of evidence cards:
  - Each card shows: truncated quote text (~200 chars with ellipsis), thread name, timestamp
  - A "View full conversation →" link that calls `onViewThread(threadId, studentName)` and then `onClose()`
- Header shows: tag name (bold), count mentions, student name
- Close on click-away (MUI Popover default)
- Empty state: "No evidence found" message (shouldn't happen if count > 0, but handle gracefully)

### 2b. Wire up click handlers in HeatmapView

**File: `src/components/insights/HeatmapView.tsx`**

Add state and the `onViewThread` prop:
```typescript
interface HeatmapViewProps {
  onViewThread?: (threadId: string, studentName: string) => void;
}

// Inside the component:
const [popoverState, setPopoverState] = useState<{
  anchorEl: HTMLElement;
  studentId: string;
  studentName: string;
  toriTagId: string;
  toriTagName: string;
  count: number;
} | null>(null);
```

**Design decision:** Store resolved IDs/names directly in `popoverState` rather than storing matrix indices. This avoids the confusing `rowIndex`-vs-`rowOrder[rowIndex]` ambiguity. The click handler resolves the indices at click time.

Extract `rowIds` and `colIds` from the heatmap query response:
```typescript
const rowIds: string[] = hm.rowIds;
const colIds: string[] = hm.colIds;
```

#### Classic mode click handler

On each `<td>`, add an `onClick`. Keep the hover `<Tooltip>` for lightweight preview:

```tsx
<Tooltip title={`${rowLabels[ri]} × ${colLabels[ci]}: ${raw}`} arrow>
  <td
    onClick={(e) => {
      if (raw === 0) return;  // skip zero-value cells
      setPopoverState({
        anchorEl: e.currentTarget as HTMLElement,
        studentId: rowIds[ri],
        studentName: rowLabels[ri],
        toriTagId: colIds[ci],
        toriTagName: colLabels[ci],
        count: raw,
      });
    }}
    style={{ cursor: raw > 0 ? "pointer" : "default", /* ...existing styles */ }}
  >
```

#### Sparkline mode click handler

**Critical:** The sparkline uses `preserveAspectRatio="none"` which distorts SVG elements. Clicking a `<circle>` would give MUI Popover a distorted anchor position. Instead, anchor to the parent `<td>` element.

```tsx
// In the Sparkline component, add an onDotClick prop:
function Sparkline({
  values,
  labels,
  globalMax,
  onDotClick,
}: {
  values: number[];
  labels: string[];
  globalMax: number;
  onDotClick?: (colIndex: number, event: React.MouseEvent<SVGElement>) => void;
}) {
  // ... existing code ...
  // On each <g> group:
  <g
    key={i}
    style={{ cursor: values[i] > 0 ? "pointer" : "default" }}
    onClick={(e) => {
      if (values[i] > 0 && onDotClick) onDotClick(i, e);
    }}
  >
```

In the sparkline row rendering:
```tsx
<Sparkline
  values={values}
  labels={colOrder.map((ci) => colLabels[ci])}
  globalMax={maxVal}
  onDotClick={(localColIdx, e) => {
    const ci = colOrder[localColIdx];
    // Anchor to the <td>, not the SVG circle
    const td = (e.target as Element).closest("td") as HTMLElement;
    setPopoverState({
      anchorEl: td,
      studentId: rowIds[ri],
      studentName: rowLabels[ri],
      toriTagId: colIds[ci],
      toriTagName: colLabels[ci],
      count: matrix[ri]?.[ci] ?? 0,
    });
  }}
/>
```

#### Small multiples mode click handler

Extend `StudentTagCard` props:

```typescript
interface StudentTagCardProps {
  name: string;
  values: number[];
  labels: string[];
  studentId: string;       // NEW
  colIds: string[];        // NEW — tag IDs in same order as labels
  onTagClick?: (event: React.MouseEvent<HTMLElement>, toriTagId: string, toriTagName: string, count: number) => void;  // NEW
}
```

Each tag row in the list becomes clickable:
```tsx
<Box
  component="li"
  key={label}
  onClick={(e: React.MouseEvent<HTMLElement>) => {
    if (onTagClick) onTagClick(e, colIds[originalIndex], label, count);
  }}
  sx={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    py: "1px",
    cursor: "pointer",
    borderRadius: 0.5,
    "&:hover": { bgcolor: "action.hover" },
  }}
>
```

**Important:** The tag list is sorted by count (descending) and filtered to non-zero. We need to track the original index back to `colIds`. Do this by building the tag array with the original index:

```typescript
const tags = labels
  .map((label, i) => ({ label, count: values[i], colId: colIds[i] }))
  .filter((t) => t.count > 0)
  .sort((a, b) => b.count - a.count);
```

Then `onTagClick` uses `tag.colId` directly instead of looking up by index.

In the HeatmapView rendering for small multiples:
```tsx
<StudentTagCard
  key={ri}
  name={rowLabels[ri]}
  values={colOrder.map((ci) => matrix[ri]?.[ci] ?? 0)}
  labels={colOrder.map((ci) => colLabels[ci])}
  studentId={rowIds[ri]}
  colIds={colOrder.map((ci) => colIds[ci])}
  onTagClick={(e, toriTagId, toriTagName, count) => {
    setPopoverState({
      anchorEl: e.currentTarget as HTMLElement,
      studentId: rowIds[ri],
      studentName: rowLabels[ri],
      toriTagId,
      toriTagName,
      count,
    });
  }}
/>
```

#### Render the popover

```tsx
{popoverState && (
  <EvidencePopover
    anchorEl={popoverState.anchorEl}
    studentId={popoverState.studentId}
    studentName={popoverState.studentName}
    toriTagId={popoverState.toriTagId}
    toriTagName={popoverState.toriTagName}
    count={popoverState.count}
    scope={scope}
    onClose={() => setPopoverState(null)}
    onViewThread={(threadId, studentName) => {
      setPopoverState(null);  // close the popover first
      onViewThread?.(threadId, studentName);
    }}
  />
)}
```

---

## Phase 3: Slide-in Thread Panel

### 3a. Page-level layout change

**File: `src/pages/InsightsPage.tsx`**

Current layout (line 35):
```tsx
<Box sx={{ maxWidth: 1200, mx: "auto", py: 4, px: 2 }}>
```

Change to a flex row:
```tsx
<Box sx={{ display: "flex", minHeight: "100vh" }}>
  {/* Main insights content — grows to fill, shifts left when panel is open */}
  <Box
    sx={{
      flex: 1,
      minWidth: 0,    // prevent flex child from overflowing
      maxWidth: openThread ? "calc(100% - 420px)" : 1200,
      mx: openThread ? 0 : "auto",
      py: 4,
      px: 2,
      transition: "max-width 0.3s ease, margin 0.3s ease",
    }}
  >
    {/* existing sections... */}

    {/* Heatmap — pass onViewThread */}
    <Section id="heatmap" title="Reflection Heatmap">
      <HeatmapView onViewThread={handleViewThread} />
    </Section>

    {/* ...remaining sections unchanged... */}
  </Box>

  {/* Slide-in thread panel */}
  {openThread && (
    <ThreadPanel
      threadId={openThread.threadId}
      studentName={openThread.studentName}
      onClose={() => setOpenThread(null)}
    />
  )}
</Box>
```

State:
```typescript
const [openThread, setOpenThread] = useState<{
  threadId: string;
  studentName: string;
} | null>(null);

const handleViewThread = useCallback((threadId: string, studentName: string) => {
  setOpenThread({ threadId, studentName });
}, []);
```

#### Responsive behavior

On screens narrower than ~900px, the panel should overlay the content instead of squeezing it:

```tsx
// On the thread panel container:
sx={{
  width: 420,
  flexShrink: 0,
  // On small screens, position absolutely to overlay
  "@media (max-width: 900px)": {
    position: "fixed",
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1200,
    boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
  },
}}
```

On the main content, remove the max-width constraint on small screens:
```tsx
maxWidth: openThread
  ? { xs: "100%", md: "calc(100% - 420px)" }
  : 1200,
```

### 3b. New `ThreadPanel` component

**New file: `src/components/insights/ThreadPanel.tsx`**

Props:
```typescript
interface ThreadPanelProps {
  threadId: string;
  studentName: string;
  onClose: () => void;
}
```

Layout:
- Fixed width: 420px
- Full viewport height, scrollable independently (`overflow-y: auto`)
- Sticky header with: student name, thread title, close (X) button using MUI `IconButton` + `CloseIcon`
- Body: list of comments using the existing `CommentCard` component (imported from `@/components/explorer/CommentCard`)
- Fetches thread data via `GET_THREAD_BY_ID` from `@/lib/queries/explorer`
- Shows loading skeletons while fetching
- Error state with retry button
- Left border or subtle shadow to visually separate from main content

```
┌────────────────────────────────────┐
│  Jane Doe                    [X]   │  ← sticky header
│  Thread: Week 3 Reflection         │
├────────────────────────────────────┤
│  ┌─ Student ─────────────────────┐ │
│  │ "I noticed that when I..."    │ │
│  │ [T4-Observation] [T1-Recall]  │ │
│  └───────────────────────────────┘ │
│  ┌─ AI Assistant ────────────────┐ │
│  │ "That's a great observation..." │ │
│  └───────────────────────────────┘ │
│  ┌─ Student ─────────────────────┐ │
│  │ "Looking back at the sim..."  │ │
│  │ [T5-Analysis]                 │ │
│  └───────────────────────────────┘ │
│           ...scrollable...          │
└────────────────────────────────────┘
```

#### Panel replacement behavior

When the user clicks a different "View full conversation" link while the panel is already open, the panel **replaces** the current thread with the new one. The `openThread` state is simply overwritten — React re-renders `ThreadPanel` with the new `threadId`, which triggers a new `GET_THREAD_BY_ID` query. No special logic needed.

### 3c. Prop threading

The `onViewThread` callback flows from `InsightsPage` → `HeatmapView` → `EvidencePopover`. Only 2 levels deep — pass as props, no React context needed.

```
InsightsPage
  ├── state: openThread
  ├── handler: handleViewThread = (threadId, studentName) => setOpenThread(...)
  │
  └── Section "Reflection Heatmap"
       └── HeatmapView (receives onViewThread prop)
            ├── popoverState (local state)
            └── EvidencePopover (receives onViewThread from HeatmapView)
                 └── "View full conversation" link
                      → calls onViewThread(threadId, studentName)
                      → also calls onClose() to dismiss popover
```

---

## Phase 4: Integration Details

### Click flow (end to end)

1. User clicks a heatmap cell (classic), sparkline dot, or small-multiples tag
2. **Guard: if the cell value is 0, do nothing** (no popover for empty cells)
3. `HeatmapView` sets `popoverState` with resolved IDs/names → `EvidencePopover` mounts
4. `EvidencePopover` fires `GET_HEATMAP_CELL_EVIDENCE` query with studentId + toriTagId
5. Popover shows quotes: truncated text (~200 chars), thread name, "View full conversation →" link
6. User clicks "View full conversation →"
7. `EvidencePopover` calls `onViewThread(threadId, studentName)` and `onClose()`
8. `InsightsPage` sets `openThread` → `ThreadPanel` mounts on the right, main content shifts left
9. `ThreadPanel` fires `GET_THREAD_BY_ID` query
10. Panel renders full chat thread using `CommentCard` components
11. User clicks X → `InsightsPage` sets `openThread` to null → panel unmounts, content shifts back
12. If user clicks a different cell while panel is open → popover opens normally, clicking "View full conversation" replaces the panel content

### Hover behavior (preserved)

Hover still shows lightweight tooltips (tag name + count) across all modes:
- **Classic**: MUI `<Tooltip>` wrapper on `<td>` — works alongside `onClick`
- **Sparkline**: SVG `<title>` elements on each dot group — native browser tooltip
- **Small multiples**: MUI `<Tooltip>` can wrap each tag row (optional, since the tag name and count are already visible as text)

Clicking replaces the tooltip with the evidence popover.

### Edge cases

| Scenario | Behavior |
|----------|----------|
| Click a cell with count = 0 | Do nothing (no popover) |
| Evidence query returns empty (shouldn't happen if count > 0) | Show "No quotes found" message in popover |
| Thread query fails or returns null | Show error state with retry in the panel |
| Click different cell while popover is open | Close current popover, open new one |
| Click "View conversation" while panel already shows different thread | Panel replaces with new thread |
| Screen width < 900px with panel open | Panel overlays content (fixed position) instead of squeezing |
| User navigates away from Insights page | Panel closes (component unmounts) |

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `vitest.config.ts` | **NEW** | Vitest configuration with `@/` alias and test setup |
| `src/server/test-setup.ts` | **NEW** | Test lifecycle: initialize/destroy TypeORM data source |
| `src/server/services/analytics/heatmap.ts` | EDIT | Add `rowIds`/`colIds` to return data; add `getHeatmapCellEvidence()` with direct consent check |
| `src/server/services/analytics/heatmap.test.ts` | **NEW** | Tests for evidence query: consent, scope filtering, role filtering, limits, empty results |
| `src/server/services/analytics/types.ts` | EDIT | Simplify `HeatmapMode` to just `"CLASSIC"` |
| `src/server/types/schema.ts` | EDIT | Add `rowIds`/`colIds` to `HeatmapData`; clean up `HeatmapMode` enum; add `CellEvidence` type, `CellEvidenceInput`, `heatmapCellEvidence` query; add `thread(id: ID!): Thread` query |
| `src/server/resolvers/analytics.ts` | EDIT | Add `heatmapCellEvidence` resolver |
| `src/server/resolvers/course.ts` | EDIT | Add `thread(id)` resolver with safe auth (return null if assignment missing) |
| `src/server/resolvers/course.test.ts` | **NEW** | Tests for thread resolver: not found, orphaned, auth, success |
| `src/lib/queries/analytics.ts` | EDIT | Update `GET_HEATMAP` to request `rowIds`/`colIds`; add `GET_HEATMAP_CELL_EVIDENCE` query |
| `src/lib/queries/explorer.ts` | EDIT | Add `GET_THREAD_BY_ID` query |
| `src/components/insights/EvidencePopover.tsx` | **NEW** | MUI Popover with lazy-loaded evidence quotes and "View full conversation" links |
| `src/components/insights/ThreadPanel.tsx` | **NEW** | Slide-in right panel showing full chat thread using `CommentCard` |
| `src/components/insights/HeatmapView.tsx` | EDIT | Add `onViewThread` prop; add click handlers to all 3 modes with zero-value guard; update `Sparkline` to accept `onDotClick`; update `StudentTagCard` to accept `studentId`, `colIds`, `onTagClick`; render `EvidencePopover` |
| `src/pages/InsightsPage.tsx` | EDIT | Flex layout with responsive breakpoint; conditional `ThreadPanel`; manage `openThread` state; pass `handleViewThread` to `HeatmapView` |

## Build Order

1. **Test infra**: `vitest.config.ts` + `test-setup.ts`
2. **Backend data**: `heatmap.ts` — add `rowIds`/`colIds` to return + `getHeatmapCellEvidence()` function
3. **Backend schema**: `schema.ts` — types, queries, enum cleanup; `types.ts` — simplify HeatmapMode
4. **Backend resolvers**: `analytics.ts` (evidence resolver) + `course.ts` (thread resolver with safe auth)
5. **Backend tests**: `heatmap.test.ts` + `course.test.ts` — run with `docker compose exec chat-explorer-dev pnpm test`
6. **Frontend queries**: `analytics.ts` (update GET_HEATMAP, add evidence query) + `explorer.ts` (add thread query)
7. **Frontend components**: `EvidencePopover.tsx` + `ThreadPanel.tsx`
8. **Frontend wiring**: `HeatmapView.tsx` — click handlers, popover state, updated Sparkline/StudentTagCard props
9. **Frontend layout**: `InsightsPage.tsx` — flex layout, openThread state, responsive breakpoint
10. **Integration test**: `docker compose up -d --build` → verify click → popover → panel flow works end to end
