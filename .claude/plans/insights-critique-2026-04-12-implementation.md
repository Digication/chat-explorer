# Insights Critique — 2026-04-12 — Implementation Plan

Phased implementation for the 17 items from the Round 2 critique. Phases are ordered by dependency and risk — quick wins first, then building blocks, then complex features.

---

## Phase 7 — Quick Fixes & Polish (LOW risk)

Items: #1, #2, #4, #11

### 7.1 Decimal Precision (Item #1)

**Problem:** Excessive decimal places in heatmap values.

**Files to change:**
- `src/components/insights/HeatmapView.tsx`
  - Classic mode cell rendering (line ~547): Values are raw integers from the data. If the backend returns floats (e.g., normalized values), format with `.toFixed(2)`.
  - Sparkline mode tooltip/values (line ~378): Same treatment.
  - Small Multiples count display (line ~202): Same treatment.
  - Apply to any tooltip that shows numeric values.

**Pattern:** Create a shared utility `formatValue(n: number): string` that returns integers as-is and floats capped at 2 decimal places. Use it everywhere a heatmap value is displayed.

**Risk: LOW** — Display-only change.

---

### 7.2 All-Student Summary Row for Classic (Item #2)

**Problem:** Sparkline mode has an "All Students" summary row but Classic mode does not.

**Files to change:**
- `src/components/insights/HeatmapView.tsx`
  - Classic mode (lines 453-557): Add a summary row at the top or bottom of the table.
  - Reuse the aggregation logic from Sparkline mode (lines 354-356): Sum each column across all rows.
  - Style the summary row distinctly (match Sparkline's #f5f7fa background, #1565c0 text from line 371).

**Risk: LOW** — Additive, no existing behavior changes.

---

### 7.3 Fix "View Full Conversation" in Student Panel (Item #4)

**Problem:** Clicking "View full conversation" in Notable Reflections does nothing.

**Files to check:**
- `src/pages/StudentProfilePage.tsx` (lines 354-357): `handleViewThread(ev.threadId, profile.name)` is called.
  - Line 377-381: Sets `openThread = { threadId, studentName }` state.
  - Verify the ThreadPanel modal actually renders with this state.
  - **When rendered inside the Faculty Panel (embedded):** The component may use `useParams()` for studentId but receive it as a prop. Check if the thread opening mechanism works differently when embedded vs. standalone.
  - **Fix path:** When inside the Faculty Panel, use `panel.openThread(threadId, studentName)` instead of local modal state.

**Risk: LOW** — Bug fix with clear cause.

---

### 7.4 Verify Student Panel Growth Diagrams (Item #11)

**Action:** Audit `StudentProfilePage.tsx` against the Phase 4 plan:
- ReflectionTrajectory (sparkline across assignments) — **exists** (lines 391-525)
- CategoryDonut (depth category breakdown) — **exists** (lines 528-627)
- ToriTagBars (tag distribution) — **exists** (lines 630-700+)
- ToriTagTrends (per-assignment TORI trends) — **exists conditionally** (lines 308-311)
- **Delta Heatmap** — planned in Phase 4, verify presence
- **Slope Chart** — planned in Phase 4, verify presence

If any are missing, add them in this phase.

**Risk: LOW** — Audit + possible additions.

---

## Phase 8 — Clickable Student Names & Navigation (MODERATE risk)

Items: #3, #5, #6

### 8.1 Clickable Student Names Everywhere (Item #3)

**Core pattern:** Every student name → `panel.openStudentProfile(studentId, studentName)`.

**Files to change (by location):**

1. **Reflection Heatmap row labels** — `HeatmapView.tsx`
   - Classic mode (line ~500): Student name in sticky left column → wrap in clickable `<Typography>` with `onClick` → `onStudentClick(studentId, name)`
   - Sparkline mode (line ~365): Same pattern for row labels
   - Small Multiples mode (line ~435): Card headers with student name → clickable
   - **Prop needed:** Add `onStudentClick?: (studentId: string, name: string) => void` prop to `HeatmapView`

2. **Cell-click modal/popover** — `EvidencePopover.tsx`
   - When showing evidence for a cell, include the student name at the top
   - Make the student name clickable → opens student panel
   - **Prop needed:** Add `onStudentClick` callback

3. **Thread viewer header** — `ThreadView.tsx`
   - Student name at top of thread → clickable
   - When inside Faculty Panel, clicking navigates to Student tab within the same panel

4. **Within Faculty Panel** — `FacultyPanel.tsx`
   - Thread tab: student name clickable → `panel.openStudentProfile()`
   - AI Chat tab: if student names appear in messages, make them interactive (stretch goal)

**Wiring:** `InsightsPage.tsx` passes `onStudentClick` that calls `panel.openStudentProfile()`.

**Risk: MODERATE** — Many touchpoints, but same pattern everywhere.

---

### 8.2 TORI Tag Drill-Down with Student Names (Item #5)

**Problem:** Tag drill-down shows mentions but not which student said them.

**Files to change:**
- `src/components/insights/ToriTagFrequencies.tsx` (lines 131-137, 250-262)
  - The `EvidencePopover` receives evidence (comments) but doesn't show student names.
  - **Backend query:** Check if `GET_STUDENT_ENGAGEMENT` or the tag evidence query returns `studentName` / `studentId`. If not, add it.
  - **Frontend:** Group evidence by student in the popover, showing student name as a header for each group.
  - Make student names clickable → `onStudentClick`.

- `src/components/insights/EvidencePopover.tsx`
  - Add student name display for each evidence item.
  - Add `onStudentClick` callback prop.

**Risk: MODERATE** — May need backend query changes.

---

### 8.3 Student Selector in Panel (Item #6)

**Problem:** No way to switch students from within the panel. Panel is empty if no student selected.

**Files to change:**
- `src/components/faculty-panel/FacultyPanel.tsx`
  - Student tab: Add a search-as-you-type `Autocomplete` at the top.
  - Data source: Use `GET_STUDENT_PROFILES` query (same as Chat Explorer).
  - On select: Call `panel.openStudentProfile(selectedStudent.id, selectedStudent.name)`.
  - Show the selector prominently when no student is loaded.

- `src/components/faculty-panel/FacultyPanelContext.tsx`
  - No changes needed — `openStudentProfile` already accepts `studentId` + `studentName`.

**Component:** New `StudentSearchAutocomplete` component — MUI `Autocomplete` with `freeSolo`, debounced input, filtered against the student list.

**Risk: MODERATE** — New component, but well-defined scope.

---

## Phase 9 — Interactivity Expansion (MODERATE risk)

Items: #8, #9, #10

### 9.1 Thread Viewer Tag Highlighting (Item #8)

**Problem:** Thread viewer doesn't support tag filtering like Chat Explorer does.

**Current state:** `ThreadView.tsx` already has:
- `onToriTagClick` callback prop (line 24)
- Highlight/dim logic for active TORI filters (lines 136-141, 168-177)

**Files to change:**
- `src/components/explorer/ThreadView.tsx`
  - Add a tag chip bar at the top (same pattern as Chat Explorer's `ToriTagFilter`).
  - Pre-select the tag that was clicked to open this thread (pass as prop).
  - When a tag chip is toggled, filter/highlight matching comments.

- `src/components/insights/StudentEngagementTable.tsx` (or wherever tag clicks originate)
  - When clicking a tag in the engagement table → open thread with that tag pre-selected.
  - Pass `initialToriTag` to the thread viewer.

**Risk: MODERATE** — Building on existing highlight infrastructure.

---

### 9.2 Student Growth Cell Interactivity (Item #9)

**Problem:** Growth cells (Matrix, Delta views) are not clickable.

**Files to change:**
- `src/components/insights/GrowthVisualization.tsx`
  - **Matrix view** (lines 239-322): Add `onClick` to category chip cells.
    - Click → open evidence popover showing conversations for that student + assignment + category.
    - Need: `onCellClick(studentId, assignmentId, category)` callback.
  - **Delta/Before-After view** (lines 333-460): Add `onClick` to before/after chips.
    - Click → show conversations matching that category for the student in the before or after period.
  - **Sparkline view** (lines 136-235): Add `onClick` to sparkline dots.
    - Click → show evidence for that student at that assignment point.

**Backend consideration:** May need a query that fetches comments by student + assignment + reflection category.

**Risk: MODERATE** — Pattern exists in heatmap, extend it here.

---

### 9.3 Co-Occurrence Pattern Interactivity (Item #10)

**Problem:** Co-occurrence pairs/triples are static, no drill-down.

**Files to change:**
- `src/components/insights/CoOccurrenceList.tsx` (lines 107-133)
  - Make each pair/triple row clickable.
  - Click → open `EvidencePopover` showing conversations that contain BOTH/ALL tags together.
  - Need: Backend query or client-side filter for comments matching multiple tags simultaneously.

**Backend consideration:** The co-occurrence data likely comes from analyzing tag co-occurrences in comments. Need to be able to fetch the actual comments where those tags co-occur.

**Risk: MODERATE** — Query may be complex (multi-tag intersection).

---

## Phase 10 — TORI Network Redesign (HIGH risk)

Item: #7

### 10.1 Mind-Map Style Network with Visible Labels

**Problem:** Current hover-only approach is unusable. No persistent labels, no connection context.

**Current implementation:** `ToriNetworkGraph.tsx` — force-directed layout, circles only, hover for name, click for evidence.

**Redesign approach:**

1. **Label-first layout:**
   - Replace circle-only nodes with rounded rectangles containing the tag name.
   - Bounding box size based on text width (measure with canvas `measureText` or SVG `getComputedTextLength`).
   - Font size proportional to frequency (min 10px, max 16px).

2. **Collision detection on bounding boxes:**
   - Replace circle-radius collision (lines 134-151) with rectangle-rectangle collision.
   - Use separating axis theorem or simple AABB overlap.
   - Increase repulsion force to account for larger node footprints.

3. **Connection highlighting:**
   - On hover: highlight the hovered node + ALL connected nodes + connecting edges.
   - Connected nodes remain highlighted with their labels visible.
   - Dim everything else (opacity 0.15).
   - On click: lock the highlight (toggle behavior).

4. **Layout adjustments:**
   - Increase canvas size to accommodate labels.
   - Stronger centering force to prevent spread.
   - More simulation iterations (300+) for stability with larger nodes.

**Files to change:**
- `src/components/insights/ToriNetworkGraph.tsx` — major rewrite of rendering and layout.

**Risk: HIGH** — Significant visual redesign, layout algorithm changes, potential performance concerns with many labeled nodes.

---

## Phase 11 — Chat Explorer & AI Chat Fixes (HIGH risk)

Items: #12, #13, #14, #15

### 11.1 Default Student Selection in Chat Explorer (Item #12)

**Problem:** No students shown when no course is selected.

**Files to change:**
- `src/pages/ChatExplorerPage.tsx`
  - Line 70: Remove `skip: !courseId` condition — always fetch students.
  - When no courseId: fetch all students for the institution (paginated, first 50).
  - Backend query may need `institutionId`-based filtering when `courseId` is null.
  - Auto-select first student (line 76-81 logic already handles this).

- Backend: Check if `GET_STUDENT_PROFILES` resolver supports institution-wide queries without courseId. If not, add that capability.

**Risk: MODERATE** — May need backend changes for institution-wide student listing.

---

### 11.2 Panel Context Mismatch Fix (Item #13)

**Problem:** Clicking a student in Chat Explorer doesn't update the Faculty Panel's student context.

**Files to change:**
- `src/pages/ChatExplorerPage.tsx`
  - When `selectedStudentIds` changes, call `panel.openStudentProfile(newStudentId, name)` if the panel is open on the Student tab.
  - Add a `useEffect` that watches `selectedStudentIds` and syncs panel state.

- Consider debouncing to avoid rapid updates when clicking through students.

**Risk: LOW** — Straightforward state sync.

---

### 11.3 Full Scope Matrix (Item #14)

**Problem:** Scope toggle only shows "this course" vs "all courses." Plan called for a full matrix.

**Scope matrix:**

| Student Axis | Assignment Axis | Course Axis | Label |
|---|---|---|---|
| This student | This assignment | This course | "Kalena — Assignment 3 — PSYC 101" |
| This student | All assignments | This course | "Kalena — All assignments — PSYC 101" |
| All students | This assignment | This course | "All students — Assignment 3 — PSYC 101" |
| All students | All assignments | This course | "All students — PSYC 101" |
| All students | All assignments | All courses | "All students — All courses" |

Only show options where context is available (e.g., no "this student" if no student selected).

**Files to change:**
- `src/components/ai/AiChatPanel.tsx`
  - Replace the 3-value scope model with the full matrix.
  - `getScopeLabel()` and `handleScopeChange()` need to handle the 5+ options.
  - The `Chip` + `Menu` dropdown needs to render available options dynamically.
  - When scope changes, update the session's scope context.

- `src/server/entities/ChatSession.ts`
  - Current enum: `SELECTION | COURSE | CROSS_COURSE`
  - Need finer granularity. Options:
    a. Expand the enum (breaking change for existing sessions), OR
    b. Keep the enum but add `studentId`, `assignmentId`, `courseId` fields on the session to define the exact scope (these fields already exist).
  - **Recommended:** Keep the existing enum mapping but use the combination of `scope` + `studentId` + `assignmentId` + `courseId` to define the full matrix. The frontend controls which fields are set.

- `src/server/services/ai-chat.ts` (buildContext)
  - Already reads `session.scope`, `session.studentId`, `session.courseId`, `session.assignmentId` (lines 42-102).
  - Verify all 5 matrix combinations are handled correctly.
  - May need to adjust the filtering logic for "this student + all assignments" vs "this student + this assignment."

**Risk: HIGH** — Core AI context model change, must preserve existing sessions.

---

### 11.4 Scope Change Bug Fix (Item #15)

**Problem:** Scope change divider appears but AI uses old context. Divider gets pushed below new response.

**Root cause analysis:**
1. Scope dividers are UI-only state (`scopeDividers` array) — not tied to message chronology.
2. When scope changes, `scopeOverride` updates but the backend session's scope fields aren't updated.
3. Next `sendMessage` call uses the session's stored scope, not the UI override.

**Fix:**
- `src/components/ai/AiChatPanel.tsx`
  - On scope change: call a new mutation `updateChatSessionScope(sessionId, scope, studentId, courseId, assignmentId)` to persist the new scope to the session.
  - Wait for the mutation to complete before allowing the next message.
  - Divider ordering: Instead of a separate `scopeDividers` array, inject dividers into the message display based on timestamps. Store scope changes as pseudo-messages or annotate messages with "scope changed before this message."

- Backend:
  - Add `updateChatSessionScope` mutation to `chat.ts` resolver.
  - GraphQL schema: Add the mutation.

**Risk: HIGH** — Touches the core message ordering and scope persistence.

---

## Phase 12 — Context-Aware Panel & AI Chat (HIGH risk)

Items: #16, #17

### 12.1 Insights Page AI Chat Context (Item #16)

**Problem:** AI Chat on the Insights page doesn't know about the analytics data visible on the page.

**Approach:**
- When AI Chat is opened from the Insights page, build a context summary of the visible analytics:
  - Reflection Heatmap summary (top students, distribution)
  - TORI tag frequencies (top tags, counts)
  - Engagement metrics (summary stats)
  - Growth trends (notable changes)
- Pass this as a system prompt addition or context payload.

**Files to change:**
- `src/components/faculty-panel/FacultyPanel.tsx`
  - When on Insights page and Chat tab is active, gather analytics summary.
  - Pass as `analyticsContext` prop to `AiChatPanel`.

- `src/components/ai/AiChatPanel.tsx`
  - Accept `analyticsContext?: string` prop.
  - Include in the context sent to the backend.

- `src/server/services/ai-chat.ts`
  - Accept optional analytics context and include in the system prompt.

**Risk: HIGH** — Defining what analytics context to include and how to format it for the AI.

---

### 12.2 Panel Persistence with Context Change Choice (Item #17)

**Problem:** Panel doesn't respond when the page context changes.

**Behavior per tab (confirmed by user):**
- **Student tab:** Always auto-update to match new context.
- **Thread tab:** Prompt or auto-update (thread may not relate to new context).
- **AI Chat tab:** Prompt with choice ("Context changed to [X]. Start a new chat?").

**Implementation:**

1. **Detect context changes:**
   - `src/components/faculty-panel/FacultyPanelContext.tsx`
     - Add `currentPageContext` state (page name + scope).
     - Expose `setPageContext(context)` action.
     - When `setPageContext` is called with a different value, trigger update logic per tab.

2. **Page-level context reporting:**
   - `src/pages/InsightsPage.tsx`, `src/pages/ChatExplorerPage.tsx`, etc.
     - Call `panel.setPageContext({ page: "insights", scope })` on mount and scope change.

3. **Tab-specific update behavior:**
   - Student tab: Auto-call `panel.openStudentProfile()` with new context's student (if available). If no student in new context, show the student selector (from Phase 8).
   - Thread tab: Show a snackbar/banner: "You navigated to [new context]. This thread is from [old context]." with "Update" / "Keep" buttons.
   - AI Chat tab: Show inline banner: "Context changed to [new context]. Start a new chat with this context?" with "New Chat" / "Continue" buttons.

**Files to change:**
- `src/components/faculty-panel/FacultyPanelContext.tsx` — Context change detection + dispatch
- `src/components/faculty-panel/FacultyPanel.tsx` — Per-tab update UI (banners, auto-update)
- `src/pages/InsightsPage.tsx` — Report context
- `src/pages/ChatExplorerPage.tsx` — Report context

**Risk: HIGH** — Cross-cutting concern touching many components.

---

## Phase Summary

| Phase | Items | Risk | Estimated Scope |
|-------|-------|------|----------------|
| **7** — Quick Fixes | #1, #2, #4, #11 | LOW | 4 files, display fixes + bug fix |
| **8** — Clickable Names | #3, #5, #6 | MOD | 8+ files, new component, consistent pattern |
| **9** — Interactivity | #8, #9, #10 | MOD | 4 files, extend existing drill-down patterns |
| **10** — TORI Network | #7 | HIGH | 1 file, major redesign |
| **11** — Chat Explorer & Scope | #12, #13, #14, #15 | HIGH | 6+ files, backend changes, scope model rework |
| **12** — Context-Aware Panel | #16, #17 | HIGH | 5+ files, cross-cutting UX pattern |

## Dependencies

- Phase 8 (clickable names) should come before Phase 9 (interactivity) — both use `onStudentClick` pattern.
- Phase 11.3 (scope matrix) should come before Phase 11.4 (scope bug fix) — fixing the bug on the old model then rewriting it would be wasted work.
- Phase 12 depends on Phase 8.3 (student selector) for the "no student in new context" fallback.
- Phase 7 has no dependencies — start here.
