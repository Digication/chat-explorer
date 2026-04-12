# Insights Panel Critique — 2025-04-12

Status: **Ready for implementation**
Date: 2025-04-12

Related documents:
- `insights-critique-2025-04-12-review.md` — Critique of this plan with all decisions resolved
- `insights-critique-2025-04-12-implementation.md` — Phase-by-phase implementation plan with exact file changes, test requirements, and risk analysis

## Overview

A comprehensive critique of the insights page and related areas before a larger rework phase. Covers removals, bug fixes, interactivity improvements, a unified faculty panel, student profile enhancements, chat explorer UX issues, and AI chat architecture rework. All decisions have been resolved — see the review document for the full decision log.

---

## A. Unified Faculty Panel (cross-cutting, prerequisite for many items)

### Vision

The right-hand panel becomes a **single, unified faculty tool** that works identically on both the Insights page and Chat Explorer page. It is not page-specific — it belongs to the faculty member and persists conceptually across the app.

### Three Tabs

The panel has three tabs/modes the faculty member can switch between:

1. **Student Profile** — View a specific student's info (summary, TORI tags, thread list, analytics). Triggered by clicking any student name anywhere in the app.
2. **Thread/Conversation** — View a specific conversation's comments. Triggered by clicking a thread link, evidence item, etc.
3. **AI Chat** — The faculty member's ongoing AI chats. Context-aware: knows what page you're on and what you're looking at.

### Navigation within the panel

- From Student Profile → click a thread in their thread list → switches to Thread tab
- From Thread → click the student name → switches to Student Profile tab
- From either → click the AI Chat tab → chat can reference what you were just viewing
- Back navigation should work (breadcrumb or back button within the panel)

### How the panel opens

Two ways:
1. **Dedicated button** — A persistent button (like the "Analyze" button in Chat Explorer's bottom bar) opens the panel to the AI Chat tab. Needs to exist on both Insights and Chat Explorer pages for consistency.
2. **Contextual clicks** — Clicking student names, evidence links, thread links on the left side opens the panel to the relevant tab (Student Profile or Thread).

### Persistence across pages

The panel **stays open when navigating between pages**. If you're chatting with the AI on the Insights page and navigate to Chat Explorer, the chat is still there. This enables workflows like: viewing Insights → opening a student profile → clicking one of their threads → asking the AI about it — all without losing context.

### AI Chat context awareness

The AI chat tab is the same chat system already built, but with enhanced context:
- **On Insights page:** Can help explain analytics ("what does row scaling mean?"), summarize patterns, answer questions about the data shown
- **On Chat Explorer:** Can analyze the conversation(s) currently being viewed
- **On Student Profile tab:** Can answer questions about that specific student
- Faculty can create new chats, switch between existing ones — chats are theirs, not tied to a page

### AI Chat scope model

The AI needs to know what data to look at. Supersedes the old 3-toggle system (student/course/all) and the planned 2×2 matrix from Theme I in `04-ux-polish.md`.

The scope is now a **3-axis model: Course × Student × Assignment**:

| Scope level | Description |
|---|---|
| All courses | Everything the faculty member has access to |
| This course | All students, all assignments within the selected course |
| This assignment, all students | One assignment across every student in the course |
| This assignment, this student | One specific student's work on one assignment |

The user should have **explicit control** (a selector/toggle in the AI Chat tab to choose scope) AND the AI should **auto-detect** based on what's on the left side of the screen. Auto-detection sets the default; the user can override.

Scope changes should be **recorded in the chat log** (visual dividers showing "Context changed to: This course") so you can see what context each question was asked with.

**Context clearing on scope change:** When the user changes scope, the AI's context window is **cleared**. The chat thread continues (so the user sees the history), but the AI rebuilds its context from the new scope only. This prevents confusion from mixing old student data with new scope data. If you want continuity, don't change scope. The scope divider in the transcript makes this clear.

### Layout behavior

**Desktop (md and above, ~960px+):**
- Two-panel side-by-side layout using MUI Grid: left content area + right Faculty Panel
- Left panel: `Grid item xs={12} md={8}` (stacks full-width on mobile, 66% on desktop)
- Right panel: `Grid item xs={12} md={4}` (stacks full-width on mobile, 33% on desktop)
- No `position: fixed` — both panels flow naturally in the grid
- No backdrop overlay — content is always visible and interactive

**Mobile (below md breakpoint):**
- Panels stack vertically — Faculty Panel appears below main content
- Or: Faculty Panel renders as a full-width overlay/drawer that slides up from bottom
- Follow Campus Web pattern: `useMediaQuery(theme.breakpoints.down('md'))` to detect

**Reference:** Campus Web uses `Grid container` with `xs={12} md={8}` / `xs={12} md={4}` split for its ResourceDetailLayout. No custom CSS, no padding transitions — pure MUI responsive Grid.

All student names across the entire Insights page should be clickable and open this panel to the Student Profile tab.

### Student Profile — same page, two contexts

The Student Profile shown in the right panel is **exactly the same page** as `/insights/student/:studentId`. Not a compact version — the same page. On the right panel it will naturally render narrower (like a mobile view), which is fine.

**When it loads on the left** (full page): User navigated directly to `/insights/student/:studentId`, or wants to deeply analyze a student with the AI Chat panel on the right for questions.

**When it loads on the right** (Faculty Panel, Student Profile tab): User clicked a student name from Insights, heatmap, etc. Quick access without leaving their current view.

Both use the same `StudentProfilePage` component — no duplication.

### Architectural note

This unifies three currently separate components:
- `ThreadPanel` (insights side panel for conversations)
- `StudentProfilePage` (currently full-page only, now also in panel)
- `AiChatPanel` (the AI chat drawer/embedded component)

Into one `FacultyPanel` component with tabbed navigation.

Affects items: 10, 12, 13, 16, 20, 23-28, and more

---

## B. Quick Removals

### 1. Remove SmartRecommendations (Depth/Band/Distribution boxes)
- **File:** `src/pages/InsightsPage.tsx` line 92
- **Why:** Qualifiers (high/medium/etc.) are hard to understand, not actionable
- **Action:** Remove `<SmartRecommendations />` from the page

### 2. Remove TextSignals
- **File:** `src/pages/InsightsPage.tsx` line 99
- **Why:** Not useful at the moment
- **Action:** Remove `<TextSignals />` from the page

### 3. Remove Compare Courses button
- **Location:** Visible in All Courses context, in ScopeSelector or InsightsPage
- **Why:** Not useful at the moment
- **Action:** Hide/remove the button

### 4. Remove show/hide toggle on Reflection Depth
- **File:** `src/pages/InsightsPage.tsx` lines 128-138
- **Why:** Inconsistent — no other section has this toggle
- **Action:** Remove the visibility toggle, always show the section

### 5. Remove info button from Student Engagement rows
- **File:** `src/components/insights/StudentEngagementTable.tsx` lines 220-234
- **Why:** Redundant once comment count becomes clickable
- **Action:** Remove the info IconButton column

---

## C. Reordering & Defaults

### 6. Move Reflection Depth above Student Engagement
- **File:** `src/pages/InsightsPage.tsx`
- **Action:** Swap `<DepthBands />` to render before `<StudentEngagementTable />`

### 7. Heatmap: Change default scaling from Raw to Row
- **File:** `src/components/insights/HeatmapView.tsx` line ~243
- **Action:** Change initial scaling state to `"ROW"`

### 8. Student Growth: Make Matrix the default view
- **File:** `src/components/insights/GrowthVisualization.tsx` line ~41
- **Action:** Change initial view mode state to matrix

---

## D. Bug Fixes

### 9. Student Growth: All students show as "Student"
- **File:** `src/components/insights/GrowthVisualization.tsx`
- **Why:** Privacy settings are configured to show real names — this is a bug
- **Action:** Use `getDisplayName()` from UserSettingsContext (like other components do)

---

## E. Interactivity Improvements (Insights Page)

### 10. Participant drill-down → open student side panel
- **File:** `src/components/insights/MetricsCards.tsx` lines 110-128
- **Currently:** Opens ThreadPanel which says "no thread found"
- **Action:** Open the new multi-purpose side panel with student info

### 11. Reflection Depth: Make table rows clickable
- **File:** `src/components/insights/DepthBands.tsx` lines 166-209
- **Currently:** Only the bar segments and count cells are clickable
- **Action:** Add hover state on entire row, make row click trigger same drill-down as bar segment

### 12. Reflection Depth: Student drill-down → show comments in side panel
- **File:** `src/components/insights/DepthBands.tsx` + StudentDrillDown
- **Currently:** Clicking a student after bar click doesn't show their comments
- **Action:** Open student info in the side panel showing their actual comments

### 13. Student Engagement: Student name click → side panel (not navigation)
- **File:** `src/components/insights/StudentEngagementTable.tsx` lines 177-185
- **Currently:** Navigates to `/insights/student/{id}`
- **Action:** Open student side panel on the right instead

### 14. Student Engagement: Comment count click → show comments
- **File:** `src/components/insights/StudentEngagementTable.tsx` line 202
- **Currently:** Plain text, not interactive
- **Action:** Make clickable, trigger EvidencePopover (same as current info button)

### 15. Student Engagement: Tag chip click → show evidence
- **File:** `src/components/insights/StudentEngagementTable.tsx` lines 205-216
- **Currently:** Display-only chips
- **Action:** Clicking a tag shows evidence/comments for that student + tag combo

### 16. Student Growth: Make cells/students interactive → side panel
- **File:** `src/components/insights/GrowthVisualization.tsx`
- **Action:** Clicking students or cells opens conversations/student info in side panel

### 17. Co-occurrence: Make pairs/triples interactive
- **File:** `src/components/insights/CoOccurrenceList.tsx`
- **Currently:** Display-only
- **Action:** Clicking numbers/rows shows contributing conversations

---

## F. Student Profile Page — TORI Tag Analytics Rework

The current TORI Tag Profile on the student profile page (`StudentProfilePage.tsx` lines 599-682) is a simple horizontal bar chart. Jeffrey finds it interesting but underworked. Need much deeper multi-attribute growth-over-time analytics.

### 18. Experimental visualizations to explore:

**Standard views:**
- **Small Multiples / Sparklines** — One mini-chart per TORI attribute, stacked vertically. Good for spotting trends across many attributes without clutter.
- **Radar/Spider Charts** (animated or faceted) — Each snapshot gets a polygon where each spoke is a TORI attribute. Comparing over time shows how the "shape" evolves. Works well up to ~15 attributes.
- **Heatmaps** — TORI attributes on one axis, time on the other, color = value. Scales to ~100 attributes, makes patterns/anomalies obvious.
- **Parallel Coordinates** — Each attribute is a vertical axis; the student's profile is a line threading through all axes. Layer time as color gradient to show drift. Best for ~10-30 attributes.
- **Dimensionality Reduction (PCA / t-SNE / UMAP)** — Collapse all attributes into 2D, animate points over time. Lose individual attribute detail but gain holistic view of movement through "attribute space."

**Change-first views (readable without clicking):**
- **Top Movers** — Ranks every attribute by magnitude of change, split into gains vs drops. "What moved most?" at a glance.
- **Delta Heatmap** — Period-to-period deltas instead of raw values. Green = up, red = down, intensity = magnitude. Scan like a diff.
- **Slope Chart** — Connects start value to end value for biggest movers. Angle = speed and direction.
- **Volatility Strips** — Filters out stable attributes; shows only things that moved, with a bar per period so you see *when* the change happened.

### 19. Student profile panel should list all threads
- The student side panel (and full student profile page) should provide a list of all threads/conversations for that student, clickable to view.

---

## G. Side Panel Layout Change

### 20. Change from overlay to push layout
- **Currently:** ThreadPanel uses `position: fixed` with a backdrop overlay (modal-like)
- **Target:** Match Chat Explorer approach:
  - Add `padding-right` to root container (e.g., `pr: panelOpen ? PANEL_WIDTH : 0`)
  - Add `transition: "padding-right 0.3s ease"` for smooth animation
  - Remove the backdrop overlay
  - Keep the panel's fixed positioning
- **Reference:** ChatExplorerPage.tsx lines 176-184

---

## H. TORI Network Rethink

### 21. TORI Network: Hover-only labels + sidebar legend (DECIDED)
- **File:** `src/components/insights/ToriNetworkGraph.tsx`
- **Why:** Node collision works but labels still overlap — fundamentally unreadable
- **Approach:**
  - Remove all default text labels from the graph — show only colored dots (colored by community)
  - **On hover:** Show the tag label as a tooltip above the dot, highlight connected edges, brighten neighbors, dim others (partially already implemented via hoveredNode state)
  - **Sidebar legend:** Below or beside the graph, list all TORI tags grouped by community color. Each row: colored dot + tag name + frequency count. Clicking a legend row highlights that node + its connections in the graph.
  - Force layout stays the same — no algorithm changes needed
  - This approach scales to any number of nodes without overlap

---

## I. Summary Sparkline Heatmap

### 22. Aggregated sparkline for all/grouped students
- **What:** A combined sparkline showing all students (or a filtered group) aggregated under TORI tags
- **Why:** To get a sense of how the class as a whole is doing across TORI dimensions
- **Action:** New component or mode within HeatmapView

---

## J. Chat Explorer Page Issues

### 23. Show students even without course selected
- **Currently:** Student list is empty when in "All Courses" context
- **Expected:** All students should appear; first student should be auto-selected and shown

### 24. Conversation rendering — visual issues
- **a) Color differentiation:** Light blue vs gray for AI/student is not working well
- **b) Line width:** Comments are way too wide. Previous agreement: max 12-15 words per line on large screens (from plan `04-ux-polish.md` Theme H)
- **Action:** Constrain max-width of comment bubbles; revisit color scheme

### 25. AI Chat panel — context switcher broken
- **Currently:** Student/Course/All Courses toggle buttons don't work as expected
- **Issue:** Clicking "This course" still shows "don't have access to rest of course"
- **Reference:** Previous implementation plan (`04-ux-polish.md` Theme I) described a 2x2 matrix scope model
- **Action:** Review the previous plan and identify what was missed

### 26. AI Chat — session history UI is confusing
- **Currently:** Small collapsible panel at top for history/new chat/delete
- **Desired:** Replace with a modal dialog for better clarity
- **Action:** Redesign chat history interaction as a modal

---

## K. Chat Architecture Decisions (RESOLVED)

### 27. AI Chat — ownership and context model
**Decision:** Chats belong to the user. Users can:
- Create new chats at any time
- Continue existing chats
- Change context whenever they want (based on what's on screen + manual overrides like "all courses", "this course", etc.)

**Context change behavior:**
- When context changes mid-chat, the change must be **recorded as a visible divider** in the chat transcript (e.g., "Context changed to: All courses") so the user understands the context when reviewing later
- **Open question:** Should context changes clear the AI's context window? Argument for: long conversations with many context switches become unwieldy and the AI loses focus. Argument against: sometimes you want continuity across context changes. **Leaning toward clearing** — if you want continuity, keep the same context; if you're switching, start fresh within the same chat thread.

### 28. Institutional isolation for chat sessions (CRITICAL — data isolation)
**Problem:** `ChatSession` currently has no `institutionId` field. The `chatSessions` query filters only by `courseId`/`assignmentId`. For `digication_admin` users who can access multiple institutions, ALL chats show up regardless of which institution is currently selected. This means a Bucknell University session could appear while viewing College Unbound data — unacceptable.

**Required changes:**
1. **Schema:** Add `institutionId: string` (non-nullable) to `ChatSession` entity
2. **Migration:** Backfill existing sessions — derive `institutionId` from `courseId` → `Course.institutionId` where possible; for sessions without `courseId`, use the user's home institution
3. **Query:** `chatSessions` resolver must ALWAYS filter by `institutionId` (passed from the client's current scope)
4. **Session creation:** Always save the current `institutionId` from scope when creating a session
5. **Validation:** Never return a session whose `institutionId` doesn't match the requested institution
6. **Cross-institutional chats are forbidden** — no chat session should ever span institutions

### 29. Remove multi-select — simplify to scope-based context
**Decision:** Remove the shift-click multi-student select feature from Chat Explorer. It's confusing — clicking a student should simply show that student's conversation, not silently add them to a selection.

**Rationale:** The 3-axis scope model (Course × Student × Assignment) already covers the use cases that multi-select was trying to solve:
- Want to compare two students? Set scope to "this course" and ask the AI "compare Student A with Student B"
- Want to see all students for an assignment? Set scope to "this assignment, all students"
- Want cross-course analysis? Set scope to "all courses"

The scope model is more powerful AND simpler to understand than manual multi-select. The AI can do the filtering/comparison work within a broader scope.

**Action:** Remove `onToggleStudent` (shift-click handler) from Chat Explorer. Single click = view that student. Period.

---

## L. Deferred

### 30. Make other top metrics clickable
- Participants is the only clickable metric card — inconsistent
- Need to decide what clicking each metric would do
