# Insights Critique — 2026-04-12 — Implementation Plan (Revised)

Phased implementation for the 17 items from the Round 2 critique. Incorporates all findings from the critique review. Each phase includes backend prerequisites, exact files/changes, unit tests, and browser verification steps. Phases are independently deployable.

**Deferred to future work:**
- Clickable student names in AI Chat free-text responses (requires NLP entity detection + student ID matching — fundamentally different from structured data click handlers)

---

## Phase 7 — Quick Fixes & Polish (LOW risk)

Items: #1, #2, #4, #11

### 7.1 Decimal Precision (Item #1)

**Root cause:** `applyScaling()` in `src/server/services/analytics/heatmap.ts` (lines 146-166) divides counts by row/global max, producing unrounded floats (e.g., `3/7 = 0.42857...`). Frontend renders them as-is.

**Files to change:**
- `src/components/insights/HeatmapView.tsx`
  - Add helper at top of file:
    ```typescript
    const fmt = (v: number, s: string) => s === "RAW" ? String(v) : v.toFixed(2);
    ```
  - Classic mode cell (line 547): `{raw > 0 ? raw : null}` → `{raw > 0 ? fmt(raw, scaling) : null}`
  - Classic mode tooltip (line 518): `${raw}` → `${fmt(raw, scaling)}`
  - Sparkline mode: Check if tooltips display raw values — apply same formatting
  - Small Multiples mode (line 202): `{count}` — apply same formatting if `scaling !== "RAW"`
  - Pass `scaling` prop down to any sub-components that display values

**Unit tests (`src/components/insights/__tests__/HeatmapView.test.tsx` — new file):**
- Render Classic mode with ROW scaling → cell values show max 2 decimal places
- Render Classic mode with RAW scaling → cell values are integers
- Render Classic mode with GLOBAL scaling → cell values show max 2 decimal places
- Tooltip text uses same formatting

**Browser verification:**
- Insights → Heatmap → switch to Row scaling → verify all cell values have ≤ 2 decimal places
- Switch to Global scaling → same check
- Switch to Raw → values are integers
- Repeat for Sparkline and Small Multiples modes

---

### 7.2 All-Student Summary Row for Classic (Item #2)

**Files to change:**
- `src/components/insights/HeatmapView.tsx`
  - Classic mode (lines 453-557): Add summary row at top of `<tbody>`.
  - Reuse aggregation logic from Sparkline mode (lines 354-356):
    ```typescript
    const summaryValues = colOrder.map((ci) =>
      rowOrder.reduce((sum, ri) => sum + (matrix[ri]?.[ci] ?? 0), 0),
    );
    ```
  - Style: Match Sparkline's `#f5f7fa` background, `#1565c0` text, `fontWeight: 700` (line 371).
  - Label: "All Students" in sticky left column.
  - Summary row cells should NOT be clickable (no single student to drill into).

**Unit tests:**
- `HeatmapView.test.tsx`: Classic mode renders "All Students" row with correct column sums
- `HeatmapView.test.tsx`: Summary row cells are not clickable

**Browser verification:**
- Insights → Heatmap → Classic → verify "All Students" row at top
- Verify totals match manual addition of column values
- Verify summary row is visually distinct (blue text, gray background)

---

### 7.3 Fix "View Full Conversation" in Student Panel (Item #4)

**Root cause:** `StudentProfilePage.tsx` line 354 calls `handleViewThread(threadId, name)` which sets local `openThread` state (line 92-97). When rendered inside the Faculty Panel (`embedded` prop), the local modal renders but may not work correctly because the component is already inside the panel.

**Fix approach:** When `embedded` is true, use `panel.openThread()` instead of local modal state.

**Files to change:**
- `src/pages/StudentProfilePage.tsx`
  - Accept `onViewThread?: (threadId: string, studentName: string) => void` prop
  - In `handleViewThread`: if `onViewThread` prop exists, call it instead of setting local state
  - Remove local ThreadPanel modal when embedded (it's redundant — panel handles it)

- `src/components/faculty-panel/FacultyPanel.tsx`
  - Pass `onViewThread={panel.openThread}` to `StudentProfilePage` when rendering Student tab

**Unit tests:**
- `StudentProfilePage.test.tsx`: When `onViewThread` prop provided, clicking "View full conversation" calls it with correct `threadId` and `studentName`
- `StudentProfilePage.test.tsx`: When `onViewThread` prop NOT provided (standalone), clicking opens local modal

**Browser verification:**
- Insights → click student name → Student tab opens → scroll to Notable Reflections → click "View full conversation" → Thread tab opens with correct conversation
- Verify back button returns to Student tab

---

### 7.4 Verify Student Panel Growth Diagrams (Item #11)

**Audit against Phase 4 plan:**
- ReflectionTrajectory (sparkline across assignments) — **exists** (lines 391-525)
- CategoryDonut (depth category breakdown) — **exists** (lines 528-627)
- ToriTagBars (tag distribution) — **exists** (lines 630-700+)
- ToriTagTrends (per-assignment trends) — **exists conditionally** (lines 308-311)
- Delta Heatmap — **check if present**, add if missing
- Slope Chart — **check if present**, add if missing

**Action:** Read `StudentProfilePage.tsx` and compare against the Phase 4 plan's TORI visualization list. If Delta Heatmap or Slope Chart are missing, implement them following the existing visualization patterns.

**Browser verification:**
- Student panel → scroll through all sections → verify all planned visualizations render with data

---

## Phase 8 — Clickable Student Names & Navigation (MODERATE risk)

Items: #3, #5, #6

**Prerequisite — Backend: Verify evidence query returns student info:**
Before starting frontend work, check if `GET_HEATMAP_CELL_EVIDENCE` and TORI tag evidence queries return `studentId` and student name on each evidence item. If not, add:
- `studentId` field to evidence item type in `src/server/types/schema.ts`
- `studentName` field (or nested `student { name }` relation) in the resolver
- Update `EvidencePopover.tsx`'s query to request these fields

**Backend test:** Evidence query returns `studentId` and `studentName` for each item.

### 8.1 Clickable Student Names Everywhere (Item #3)

**Core pattern:** Every student name component gets an `onStudentClick?: (studentId: string, name: string) => void` callback. Wired to `panel.openStudentProfile()` from the page level.

**Files to change (by component):**

1. **HeatmapView.tsx** — Student name in row labels
   - Classic mode (line 509): Wrap `getDisplayName(rowLabels[ri])` in a `<Typography component="button">` with `onClick={() => onStudentClick?.(rowIds[ri], rowLabels[ri])}` and `cursor: pointer` styling
   - Sparkline mode (line ~365): Same pattern for row labels
   - Small Multiples mode (line ~435): Card headers with student name → clickable
   - Add `onStudentClick` to component props

2. **EvidencePopover.tsx** — Student name in evidence list
   - Add `onStudentClick` to props interface
   - Render student name as clickable link at top of popover (when `studentName` is present)
   - When showing tag drill-down evidence (multiple students), render student name per evidence item group and make each clickable
   - Close popover when student name is clicked (user is navigating away)

3. **ThreadView.tsx** — Student name in thread header
   - The student name display at the top of the thread should be clickable
   - Add `onStudentClick` prop; wire to the student name element
   - When inside Faculty Panel: clicking calls `panel.openStudentProfile()`, which pushes onto history stack. Back button returns to thread. **Verify `FacultyPanelContext` history stack handles Thread → Student → back-to-Thread navigation.**

4. **ThreadPanel.tsx** — Pass `onStudentClick` through to ThreadView

5. **FacultyPanel.tsx** — Wire callbacks
   - Thread tab: Pass `onStudentClick={(id, name) => panel.openStudentProfile(id, name)}` to ThreadPanel
   - This pushes Student onto the history stack; back button returns to Thread

6. **InsightsPage.tsx** — Wire `onStudentClick` to all child components
   - Pass `onStudentClick={handleOpenStudent}` (already defined) to: `HeatmapView`, `ToriTagFrequencies`, `GrowthVisualization`, `DepthBands`
   - Some of these may already have `onOpenStudent` — unify naming

**Unit tests:**
- `HeatmapView.test.tsx`: Click student name in Classic mode → `onStudentClick` called with correct `studentId` and name
- `HeatmapView.test.tsx`: Click student name in Sparkline mode → same
- `HeatmapView.test.tsx`: Click student name in Small Multiples mode → same
- `EvidencePopover.test.tsx`: Student name rendered and clickable when `onStudentClick` provided
- `FacultyPanelContext.test.tsx`: History stack supports Thread → Student → back-to-Thread navigation

**Browser verification:**
- Insights → Heatmap Classic → click student name → Faculty Panel opens to Student tab
- Insights → Heatmap → click cell → popover → click student name → Faculty Panel opens
- Faculty Panel → Thread tab → click student name in header → navigates to Student tab
- Faculty Panel → Student tab → click back → returns to Thread tab

---

### 8.2 TORI Tag Drill-Down with Student Names (Item #5)

**Prerequisite:** Backend evidence query must return student info (see Phase 8 prerequisite above).

**Files to change:**
- `src/components/insights/EvidencePopover.tsx`
  - When opened for a tag (no specific student), group evidence items by student
  - Show student name as a section header for each group
  - Make student name clickable → `onStudentClick`
  - Show student name even when popover is for a single student (as a header)

- `src/components/insights/ToriTagFrequencies.tsx`
  - Pass `onStudentClick` through to `EvidencePopover`

**Unit tests:**
- `EvidencePopover.test.tsx`: Tag drill-down groups evidence by student
- `EvidencePopover.test.tsx`: Each student group header is clickable
- `EvidencePopover.test.tsx`: Student names use `getDisplayName()` formatting

**Browser verification:**
- Insights → TORI Tag Frequencies → click "Pattern Recognition (22)" → popover shows evidence grouped by student name
- Click a student name in the popover → Faculty Panel opens to that student

---

### 8.3 Student Selector in Panel (Item #6)

**New component:** `src/components/faculty-panel/StudentSearchAutocomplete.tsx`

**Implementation:**
- MUI `Autocomplete` with `freeSolo` and debounced input
- Data source: `GET_STUDENT_PROFILES` query (same as Chat Explorer), filtered by current scope's `institutionId` and optionally `courseId`
- On select: Call `panel.openStudentProfile(selectedStudent.id, selectedStudent.name)`
- Show prominently at top of Student tab when no student is loaded
- Show as a compact search bar when a student IS loaded (allows switching)

**Files to change:**
- New file: `src/components/faculty-panel/StudentSearchAutocomplete.tsx`
- `src/components/faculty-panel/FacultyPanel.tsx`
  - Student tab: Render `StudentSearchAutocomplete` above `StudentProfilePage`
  - When no student selected: Show the autocomplete full-width with placeholder "Search for a student..."
  - When student selected: Show compact autocomplete with current student name pre-filled

**Unit tests:**
- `StudentSearchAutocomplete.test.tsx`: Renders with placeholder when no student selected
- `StudentSearchAutocomplete.test.tsx`: Filtering works — typing narrows the list
- `StudentSearchAutocomplete.test.tsx`: Selecting a student calls `onSelect` with correct id and name
- `FacultyPanel.test.tsx`: Student tab shows autocomplete when no student loaded

**Browser verification:**
- Faculty Panel → Student tab (no student) → search bar visible → type student name → autocomplete shows matches → select → student profile loads
- Faculty Panel → Student tab (student loaded) → compact search bar at top → can switch to different student

---

## Phase 9 — Interactivity Expansion (MODERATE risk)

Items: #8, #9, #10

### 9.0 Backend Prerequisites (must complete before frontend work)

**9.0a — Evidence by reflection category query:**

Needed for Growth cell interactivity (9.2).

- `src/server/types/schema.ts`: Add query:
  ```graphql
  categoryEvidence(input: CategoryEvidenceInput!): CategoryEvidenceResult!
  ```
  Input: `{ scope, studentId, assignmentId, category }`. Returns: list of comments with thread info.

- `src/server/resolvers/analytics.ts`: Add resolver that joins:
  `CommentReflectionClassification` (by category) → `Comment` (by studentId via thread) → `Thread` (by assignmentId)

- `src/server/services/analytics/`: New service function or extend existing evidence service.

**9.0b — Multi-tag intersection query:**

Needed for Co-occurrence interactivity (9.3).

- `src/server/types/schema.ts`: Add query:
  ```graphql
  multiTagEvidence(input: MultiTagEvidenceInput!): MultiTagEvidenceResult!
  ```
  Input: `{ scope, toriTagIds: [ID!]! }`. Returns: comments that have ALL specified tags.

- SQL pattern:
  ```sql
  SELECT "commentId" FROM "comment_tori_tag"
  WHERE "toriTagId" IN ($tagIds)
  GROUP BY "commentId"
  HAVING COUNT(DISTINCT "toriTagId") = $tagCount
  ```

- `src/server/resolvers/analytics.ts`: Add resolver.

**9.0c — Tag IDs in co-occurrence data:**

Currently `CoOccurrenceList` only has tag names (`tags: string[]`), not IDs. Need tag IDs to call the multi-tag query.

- `src/server/services/analytics/tori.ts`: Include `tagIds: string[]` alongside `tags: string[]` in co-occurrence results.
- `src/server/types/schema.ts`: Add `tagIds` field to co-occurrence type.

**Backend tests:**
- `categoryEvidence` returns only comments matching the specified student + assignment + category
- `categoryEvidence` returns empty for non-existent combinations
- `multiTagEvidence` returns only comments containing ALL specified tags (not ANY)
- `multiTagEvidence` with 2 tags returns correct intersection
- `multiTagEvidence` with 3 tags returns correct intersection
- Co-occurrence data includes `tagIds` alongside `tags`

---

### 9.1 Thread Viewer Tag Highlighting (Item #8)

**Current state:** `ThreadView.tsx` already has `activeToriFilters` prop and highlight/dim logic (lines 135-177). What's missing is the tag chip bar UI.

**Component extraction:** The `ToriFilters` component currently lives in `ChatExplorerPage`. Extract it into a shared component.

**Files to change:**
- New file: `src/components/explorer/ToriFilterBar.tsx`
  - Extract the tag chip bar from `ChatExplorerPage` into a reusable component
  - Props: `availableTags: string[]`, `activeTags: string[]`, `onToggle: (tag: string) => void`
  - Renders horizontal scrollable row of `Chip` components

- `src/components/explorer/ThreadView.tsx`
  - Add `ToriFilterBar` at the top of the thread view
  - Derive available tags from the thread's comments' TORI tags
  - Add `initialToriTag?: string` prop — pre-select this tag on mount
  - Manage local `activeFilters` state (or accept from parent)

- `src/pages/ChatExplorerPage.tsx`
  - Refactor to use the extracted `ToriFilterBar` component (no behavior change)

- When opening a thread from Student Engagement tag click:
  - `InsightsPage.tsx` → `StudentEngagementTable` → tag click → `panel.openThread(threadId, studentName, { initialTag: tagName })`
  - `FacultyPanelContext.tsx`: Add optional `initialToriTag` to thread state
  - `FacultyPanel.tsx`: Pass `initialToriTag` to `ThreadPanel` → `ThreadView`

**Unit tests:**
- `ToriFilterBar.test.tsx`: Renders chips for all available tags
- `ToriFilterBar.test.tsx`: Clicking a chip calls `onToggle`
- `ToriFilterBar.test.tsx`: Active chips have distinct styling
- `ThreadView.test.tsx`: Tag filter bar renders with tags from comments
- `ThreadView.test.tsx`: `initialToriTag` prop pre-selects that tag and highlights matching comments
- `ThreadView.test.tsx`: Toggling a tag filters/highlights comments correctly

**Browser verification:**
- Student Engagement → click tag chip on a student row → thread opens with that tag highlighted
- Thread viewer → tag bar visible → clicking tags toggles highlighting
- Highlighted comments are visually distinct; non-matching comments are dimmed

---

### 9.2 Student Growth Cell Interactivity (Item #9)

**Requires:** Backend 9.0a (category evidence query).

**Files to change:**
- `src/components/insights/GrowthVisualization.tsx`
  - **Matrix view** (lines 239-322): Add `onClick` to category cells
    - Click → open `EvidencePopover` with `studentId`, `assignmentId`, and category filter
    - Add `cursor: pointer` styling to cells with data
  - **Delta view** (lines 333-460): Add `onClick` to before/after category chips
    - Click → same evidence popover pattern
  - **Sparkline view** (lines 136-235): Add `onClick` to trajectory dots
    - Click → show evidence for that student at that assignment point
  - Add `onCellClick?: (studentId: string, assignmentId: string, category: string) => void` prop
  - Add popover state management (same pattern as HeatmapView)

- `src/lib/queries/analytics.ts`: Add `GET_CATEGORY_EVIDENCE` query matching the backend schema from 9.0a.

- `src/components/insights/EvidencePopover.tsx` or new `CategoryEvidencePopover.tsx`:
  - Accept category filter in addition to existing tag filter
  - Fetch and display evidence for the specific category

**Unit tests:**
- `GrowthVisualization.test.tsx`: Matrix cell click calls `onCellClick` with correct params
- `GrowthVisualization.test.tsx`: Delta chip click calls callback
- `GrowthVisualization.test.tsx`: Sparkline dot click calls callback
- `GrowthVisualization.test.tsx`: Cells with data show pointer cursor; empty cells don't

**Browser verification:**
- Growth → Matrix → click a cell with a category → popover shows matching conversations
- Growth → Delta → click before/after chip → popover shows evidence
- Growth → Sparkline → click a dot → popover shows evidence for that assignment

---

### 9.3 Co-Occurrence Pattern Interactivity (Item #10)

**Requires:** Backend 9.0b (multi-tag intersection query) and 9.0c (tag IDs in co-occurrence data).

**Files to change:**
- `src/components/insights/CoOccurrenceList.tsx`
  - Make each pair/triple row clickable: add `onClick` and `cursor: pointer`
  - On click → open `EvidencePopover` (or new popover) with multi-tag filter
  - Add `onItemClick?: (tagNames: string[], tagIds: string[]) => void` prop
  - Add popover state management

- `src/lib/queries/analytics.ts`: Add `GET_MULTI_TAG_EVIDENCE` query.

- `src/components/insights/EvidencePopover.tsx`: Support multi-tag filtering mode — pass array of tag IDs, show evidence containing all of them.

- `src/pages/InsightsPage.tsx`: Wire `onItemClick` callback to open evidence.

**Unit tests:**
- `CoOccurrenceList.test.tsx`: Row click calls `onItemClick` with correct tag names and IDs
- `CoOccurrenceList.test.tsx`: Rows have pointer cursor
- `EvidencePopover.test.tsx`: Multi-tag mode fetches and displays intersection results

**Browser verification:**
- Co-occurrence → click a pair → popover shows conversations containing both tags
- Click a triple → popover shows conversations containing all three tags
- Verify count in popover matches the co-occurrence count

---

## Phase 10 — TORI Network Redesign (HIGH risk)

Item: #7

**This phase requires a design decision before implementation.** The current hover-only approach is unusable. The redesign needs a visual spec.

### 10.0 Design Spec (do first)

Produce a concrete visual spec covering:
- **Node rendering:** Rounded rectangles with tag name inside. Font size: 11-14px scaled by frequency. Fill color by community (existing `COMMUNITY_COLORS`). Min width: text width + 16px padding. Height: 24-32px.
- **Edge rendering:** Lines between connected nodes. Thickness: 1-3px scaled by co-occurrence count. Color: light gray (`#ccc`).
- **Interaction model:**
  - Hover a node → highlight that node + ALL connected nodes + connecting edges. Dim everything else to opacity 0.15. Connected node labels remain fully visible.
  - Click a node → lock the highlight state. Click again or click background → unlock.
  - Click a node → also open evidence popover (existing behavior).
- **Dense graph handling:** If >30 nodes, collapse nodes with frequency < 5 into an "Other" group. Show top N nodes (N = viewport-dependent, ~25-35).
- **Layout:** Force-directed with rectangle-rectangle collision detection using AABB (axis-aligned bounding box) overlap.
- **Canvas size:** SVG fills container width. Height: max(400px, node count × 18px). If graph exceeds viewport, add CSS `overflow: auto` for scrolling (no zoom/pan — keep it simple for v1).

### 10.1 Layout Algorithm Rewrite

**Files to change:**
- `src/components/insights/ToriNetworkGraph.tsx` — major rewrite

**Key implementation details:**

1. **Text measurement:** Use off-screen `<canvas>` context with `measureText()` to compute label widths before layout. Store as `node.labelWidth`. Match font: `12px Inter, sans-serif` (or whatever the app uses).

2. **Rectangle collision detection:** Replace circle collision (lines 134-151) with AABB:
   ```typescript
   const overlapX = (node1.labelWidth/2 + node2.labelWidth/2 + padding) - Math.abs(dx);
   const overlapY = (nodeHeight/2 + nodeHeight/2 + padding) - Math.abs(dy);
   if (overlapX > 0 && overlapY > 0) { /* resolve collision */ }
   ```

3. **Repulsion radius:** Increase based on label width. Currently uses fixed radius; change to `node.labelWidth / 2 + padding`.

4. **Iterations:** Increase from 200 to 300 for stability with larger nodes.

5. **Rendering:** Replace circle SVG elements (lines 268-311) with `<g>` groups containing `<rect>` + `<text>`.

6. **Hover interaction:** On mouseenter → set `hoveredNodeId` state. In render: compute `connectedNodeIds` set from edges. Apply `opacity: 0.15` to all nodes/edges NOT in the connected set.

7. **Click interaction:** On click → toggle `lockedNodeId` state. Same highlight logic as hover but persistent.

8. **Memoization:** Memoize the force layout computation with `useMemo` keyed on input data. Don't recompute on hover/click.

**Unit tests:**
- `ToriNetworkGraph.test.ts`: Label-based layout produces no overlapping labels (check all node pairs for AABB overlap)
- `ToriNetworkGraph.test.ts`: All nodes within canvas bounds after layout
- `ToriNetworkGraph.test.ts`: `getConnectedNodes(nodeId, edges)` returns correct set
- `ToriNetworkGraph.test.ts`: Bounding box collision detection resolves overlaps correctly
- `ToriNetworkGraph.test.ts`: Nodes with frequency < threshold are filtered when node count > 30

**Browser verification:**
- Insights → TORI Network → all nodes have visible text labels
- Hover a node → that node + connected nodes highlighted, others dimmed
- Click a node → highlight locks; click again → unlocks
- Verify no label overlaps (visual inspection)
- Verify graph doesn't overflow or look broken with 49 nodes
- Remove legend below graph (labels are now on nodes — legend is redundant)

---

## Phase 11 — Chat Explorer & AI Chat Scope (HIGH risk)

Items: #12, #13, #14, #15

**Note:** Items #14 (scope matrix) and #15 (scope change bug) are merged — they're the same problem. The bug exists because the old scope model doesn't persist changes; the new model must handle this correctly from the start.

### 11.0 Backend Prerequisites

**11.0a — Fix `CROSS_COURSE` buildContext() (CRITICAL BUG):**

Currently `buildContext()` in `ai-chat.ts` returns **empty context** for `CROSS_COURSE` when no `courseId` is set (lines 136-146). This must be fixed before the scope matrix can work.

- `src/server/services/ai-chat.ts` lines 136-146:
  - When `CROSS_COURSE` and no `courseId`: fetch ALL courses for the user's institution → gather ALL comments across all courses.
  - Need: `courseRepo.find({ where: { institutionId } })` → then aggregate comments across all courses.
  - Respect `session.studentId` if set (for "this student — all courses" scope).

**11.0b — Add `updateChatSessionScope` mutation:**

- `src/server/types/schema.ts`: Add mutation:
  ```graphql
  updateChatSessionScope(id: ID!, scope: String!, studentId: ID, courseId: ID, assignmentId: ID): ChatSession!
  ```

- `src/server/resolvers/chat.ts`: Add resolver:
  - Verify ownership (`session.userId === user.id`)
  - Verify institutional access
  - Update scope, studentId, courseId, assignmentId fields on the session
  - Return updated session

**11.0c — Scope change messages (system messages):**

Store scope changes as persisted messages so they survive page refreshes and render in correct chronological order.

- `src/server/entities/ChatMessage.ts`: Add `SYSTEM` to `ChatMessageRole` enum.
- `src/server/resolvers/chat.ts`: In `updateChatSessionScope`, after updating scope fields, create a SYSTEM message:
  ```
  "Context changed to: [scope label]. AI context refreshed."
  ```
- Frontend: `ChatMessageBubble.tsx` — render SYSTEM messages as centered dividers (existing divider style), not as chat bubbles.

**11.0d — Student profiles without courseId:**

- Check if `GET_STUDENT_PROFILES` resolver supports querying by `institutionId` alone (no `courseId`). If not, add support.
- Deduplicate students that appear in multiple courses (group by `studentId`).

**Backend tests:**
- `ai-chat.test.ts`: `buildContext()` with `CROSS_COURSE` and no courseId returns comments from ALL courses in institution
- `ai-chat.test.ts`: `buildContext()` with `CROSS_COURSE` + `studentId` returns only that student's comments across all courses
- `ai-chat.test.ts`: `buildContext()` for all 6 scope permutations returns correct data
- `chat.test.ts`: `updateChatSessionScope` updates scope fields and creates SYSTEM message
- `chat.test.ts`: `updateChatSessionScope` rejects unauthorized access
- `chat.test.ts`: SYSTEM messages included in session message history
- Student profiles resolver: returns deduplicated students for institution when no courseId

---

### 11.1 Default Student Selection in Chat Explorer (Item #12)

**Files to change:**
- `src/pages/ChatExplorerPage.tsx`
  - Line 70: Remove `skip: !courseId` — query with `institutionId` from scope when no courseId
  - Handle potentially large result set: request first 50 students (add `limit` param to query if needed)
  - Deduplicate by `studentId` in case a student appears in multiple courses
  - Auto-select first student (line 76-81 logic already handles this)
  - Remove "Select a course to get started" message (line 195) — students now always appear

**Unit tests:**
- `ChatExplorerPage.test.tsx`: Students load when no course selected
- `ChatExplorerPage.test.tsx`: First student auto-selected from all-institution list
- `ChatExplorerPage.test.tsx`: Students are deduplicated (same studentId from multiple courses appears once)

**Browser verification:**
- Chat Explorer → no course selected → students appear in carousel → first one selected → their conversations shown

---

### 11.2 Panel Context Mismatch Fix (Item #13)

**Problem:** Selecting a student in Chat Explorer doesn't update Faculty Panel.

**Files to change:**
- `src/pages/ChatExplorerPage.tsx`
  - Add `useEffect` watching `selectedStudentIds`:
    ```typescript
    useEffect(() => {
      if (panel.isOpen && panel.activeTab === "student" && selectedStudentIds.length === 1) {
        const student = studentProfiles.find(s => s.studentId === selectedStudentIds[0]);
        if (student) panel.openStudentProfile(student.studentId, student.name);
      }
    }, [selectedStudentIds]);
    ```
  - Only auto-update Student tab (per confirmed behavior). Thread and Chat tabs are not auto-updated.

**Unit tests:**
- `ChatExplorerPage.test.tsx`: Selecting a student when panel is open on Student tab updates panel context
- `ChatExplorerPage.test.tsx`: Selecting a student when panel is on Thread tab does NOT update panel

**Browser verification:**
- Chat Explorer → open Faculty Panel → Student tab → click different student in carousel → panel updates to new student
- Chat Explorer → open Faculty Panel → Thread tab → click different student → panel stays on current thread

---

### 11.3 Full Scope Matrix + Scope Change Fix (Items #14 + #15 merged)

**Scope matrix (confirmed 2026-04-12):**

Within a single course, the 2x2 (student x assignment) matrix applies. When "All courses" is selected, the assignment axis disappears.

| Course | Student | Assignment | Label |
|--------|---------|------------|-------|
| This course | This student | This assignment | "Kalena — Assignment 3 — PSYC 101" |
| This course | This student | All assignments | "Kalena — PSYC 101" |
| This course | All students | This assignment | "All students — Assignment 3 — PSYC 101" |
| This course | All students | All assignments | "All students — PSYC 101" |
| All courses | This student | (n/a) | "Kalena — All courses" |
| All courses | All students | (n/a) | "All students — All courses" |

Only show rows where context is available. Hide the assignment toggle entirely when "All courses" is selected.

**Files to change:**

- `src/components/ai/AiChatPanel.tsx` — Major rework of scope UI:
  - Replace single `Chip` dropdown with a structured scope selector:
    - Course toggle: "This course" / "All courses" (only if course context available)
    - Student toggle: "This student" / "All students" (only if student context available)
    - Assignment toggle: "This assignment" / "All assignments" (only if assignment context AND course is "this course")
  - Could be implemented as 2-3 small toggle groups or a single dropdown with grouped options.
  - On scope change:
    1. Call `updateChatSessionScope` mutation to persist the new scope
    2. Wait for mutation to succeed
    3. Backend creates SYSTEM message (from 11.0c)
    4. Refetch session messages — SYSTEM message appears in correct chronological position
    5. Remove local `scopeDividers` state entirely (dividers are now persisted messages)

- `src/components/ai/AiChatPanel.tsx` — Remove `scopeOverride` and `scopeDividers` local state:
  - Scope is now always read from the session (persisted, not local override)
  - Dividers are SYSTEM messages (persisted, not local state)
  - This fixes the bug where dividers appear in wrong order

- `src/server/services/ai-chat.ts` — Ensure `buildContext()` handles all 6 scope permutations:
  - SELECTION + studentId + assignmentId + courseId → student in specific assignment
  - SELECTION + studentId + courseId (no assignmentId) → student across all assignments in course
  - COURSE + assignmentId + courseId → all students in specific assignment
  - COURSE + courseId (no assignmentId) → all students, all assignments in course
  - CROSS_COURSE + studentId → student across all courses (fixed in 11.0a)
  - CROSS_COURSE (no studentId) → all students, all courses (fixed in 11.0a)

**Unit tests:**
- `AiChatPanel.test.tsx`: Scope selector shows correct options based on available context (studentId, courseId, assignmentId)
- `AiChatPanel.test.tsx`: "All courses" hides assignment toggle
- `AiChatPanel.test.tsx`: Scope change calls `updateChatSessionScope` mutation
- `AiChatPanel.test.tsx`: After scope change, refetched messages include SYSTEM divider message
- `AiChatPanel.test.tsx`: No local `scopeDividers` state — dividers come from message history
- `ChatMessageBubble.test.tsx`: SYSTEM role messages render as centered dividers

**Browser verification:**
- AI Chat → scope selector shows correct options for current context
- Change scope → SYSTEM message appears in chat ("Context changed to: ...")
- Send message after scope change → AI response uses NEW context (not old)
- Refresh page → scope dividers still visible (persisted as SYSTEM messages)
- "All courses" selected → assignment toggle disappears

---

## Phase 12 — Context-Aware Panel (HIGH risk)

Items: #16, #17

### 12.1 Insights Page AI Chat Context (Item #16)

**Architecture decision:** Use a **summary registration pattern**. Each Insights section registers a brief text summary with a shared context. The AI Chat reads this context.

**Implementation:**

- New context: `src/components/insights/InsightsAnalyticsContext.tsx`
  ```typescript
  interface InsightsAnalyticsSummary {
    sectionSummaries: Map<string, string>; // section name → brief summary
    registerSummary: (section: string, summary: string) => void;
  }
  ```
  - Each section component calls `registerSummary` when its data loads, with a 1-2 sentence summary:
    - MetricsCards: "60 threads, 47 participants, 684 comments, mean 49 words"
    - Heatmap: "Top tags: Problem-Solving (56), Adaptive Learning (48). 15 students."
    - DepthBands: "11% Descriptive Writing, 66% Descriptive Reflection, 15% Dialogic, 8% Critical"
    - etc.
  - Total summary stays under ~500 tokens to avoid bloating AI context.

- `src/components/faculty-panel/FacultyPanel.tsx`:
  - Read `InsightsAnalyticsSummary` from context
  - Pass `analyticsContext` string (joined summaries) to `AiChatPanel` when on Insights page

- `src/components/ai/AiChatPanel.tsx`:
  - Accept `analyticsContext?: string` prop
  - Pass to backend as a new field on `createChatSession` or `sendChatMessage`

- `src/server/services/ai-chat.ts`:
  - In system prompt, prepend analytics summary before comment context:
    ```
    The user is viewing an analytics dashboard showing:
    {analyticsContext}

    Below is the detailed conversation data:
    {comment context}
    ```

**Backend tests:**
- `ai-chat.test.ts`: System prompt includes analytics context when provided
- `ai-chat.test.ts`: System prompt works correctly without analytics context (backward compatible)

**Unit tests:**
- `InsightsAnalyticsContext.test.tsx`: `registerSummary` stores and retrieves section summaries
- `InsightsAnalyticsContext.test.tsx`: Multiple sections can register summaries
- `AiChatPanel.test.tsx`: `analyticsContext` prop included when creating session or sending message

**Browser verification:**
- Insights → open AI Chat → ask "What patterns do you see?" → AI response references heatmap/engagement data (not just raw comments)
- Verify AI context doesn't exceed token limits (check response time)

---

### 12.2 Panel Persistence with Context Change (Item #17)

**Definitions:**
- **Context change triggers:** (1) Page navigation (Insights ↔ Chat Explorer), (2) Course change in scope selector, (3) Student selection change
- **Per-tab behavior (confirmed by user):**
  - Student tab: Always auto-update to match new context
  - Thread tab: Show banner — "Context changed. This thread is from [old context]." with "Update" / "Keep" buttons
  - AI Chat tab: Show banner — "Context changed to [new context]. Start new chat?" with "New Chat" / "Continue" buttons

**Files to change:**

- `src/components/faculty-panel/FacultyPanelContext.tsx`:
  - Add state:
    ```typescript
    pageContext: { page: string; scope: InsightsScope; studentId?: string } | null;
    prevPageContext: { ... } | null;
    contextChanged: boolean;
    ```
  - Add action: `SET_PAGE_CONTEXT` — compares new vs. old, sets `contextChanged` flag
  - Add action: `ACKNOWLEDGE_CONTEXT_CHANGE` — clears the flag

- `src/pages/InsightsPage.tsx`:
  - On mount and scope change: `panel.setPageContext({ page: "insights", scope })`

- `src/pages/ChatExplorerPage.tsx`:
  - On mount and scope/student change: `panel.setPageContext({ page: "chat-explorer", scope, studentId: selectedStudentIds[0] })`

- `src/components/faculty-panel/FacultyPanel.tsx`:
  - Student tab: When `contextChanged` is true, auto-update:
    - If new context has a student → `panel.openStudentProfile(newStudentId, name)`
    - If no student in new context → show `StudentSearchAutocomplete` (from Phase 8.3)
    - Clear `contextChanged` flag
  - Thread tab: When `contextChanged` is true, show banner:
    ```tsx
    <Alert severity="info" action={<>
      <Button onClick={handleUpdateThread}>Update</Button>
      <Button onClick={handleKeep}>Keep</Button>
    </>}>
      Context changed. This thread is from a different context.
    </Alert>
    ```
    - "Update" → close thread tab, navigate to Student tab with new context
    - "Keep" → dismiss banner, keep current thread
  - Chat tab: When `contextChanged` is true, show banner:
    ```tsx
    <Alert severity="info" action={<>
      <Button onClick={handleNewChat}>New Chat</Button>
      <Button onClick={handleContinue}>Continue</Button>
    </>}>
      Context changed to {newContextLabel}. Start a new chat?
    </Alert>
    ```
    - "New Chat" → create new session with new scope, clear old session from view
    - "Continue" → dismiss banner, keep current chat session

**Unit tests:**
- `FacultyPanelContext.test.tsx`: `setPageContext` with different page sets `contextChanged` to true
- `FacultyPanelContext.test.tsx`: `setPageContext` with same page/scope does NOT set `contextChanged`
- `FacultyPanelContext.test.tsx`: `acknowledgeContextChange` clears the flag
- `FacultyPanel.test.tsx`: Student tab auto-updates on context change
- `FacultyPanel.test.tsx`: Thread tab shows banner on context change
- `FacultyPanel.test.tsx`: Chat tab shows banner on context change
- `FacultyPanel.test.tsx`: "New Chat" button creates new session with new scope
- `FacultyPanel.test.tsx`: "Continue" button dismisses banner

**Browser verification:**
- Insights → open panel (Student tab) → change course in scope selector → Student tab updates (auto)
- Insights → open panel (Thread tab) → change course → banner appears → click "Keep" → thread stays
- Insights → open panel (Chat tab) → change course → banner appears → click "New Chat" → new session starts with new scope
- Navigate from Insights to Chat Explorer → panel stays open → context change detected → tabs respond per rules

---

## Phase Summary

| Phase | Items | Risk | Backend Work | New Files | Test Count |
|-------|-------|------|-------------|-----------|------------|
| **7** | #1, #2, #4, #11 | LOW | None | 1 test file | ~10 unit, 6 browser |
| **8** | #3, #5, #6 | MOD | Evidence query schema | 2 new files | ~14 unit, 6 browser |
| **9** | #8, #9, #10 | MOD | 3 new queries/resolvers | 2 new files | ~14 unit, 6 backend, 6 browser |
| **10** | #7 | HIGH | None | Design spec first | ~5 unit, 5 browser |
| **11** | #12, #13, #14, #15 | HIGH | 4 backend changes | 0 new files | ~14 unit, 7 backend, 6 browser |
| **12** | #16, #17 | HIGH | 1 backend change | 1 new file | ~10 unit, 2 backend, 4 browser |

## Dependencies

```
Phase 7 (no deps) ─────────────────────────┐
Phase 8 (no deps, but benefits from 7.3) ──┤
Phase 9 (depends on 8 for onStudentClick)  ├── All independently deployable
Phase 10 (fully independent) ──────────────┤
Phase 11 (no deps) ────────────────────────┤
Phase 12 (depends on 8.3 for student selector fallback, 11 for scope model) ──┘
```

Phase 10 (TORI Network) is fully independent and can be deferred without blocking anything.
Phase 12 should be last — it depends on both Phase 8 (student selector) and Phase 11 (scope model).
