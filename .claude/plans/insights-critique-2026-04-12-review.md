# Critique of Implementation Plan — 2026-04-12

Thorough review of the Phase 7–12 implementation plan. Covers factual errors, missing details, dependency gaps, missing tests, and risks that would cause problems in a one-shot implementation.

---

## FACTUAL ERRORS

### 1. Item #1 (Decimal Precision) may not exist

The plan says heatmap values show excessive decimal places. **The codebase audit found no floats** — `HeatmapView.tsx` only renders raw integer counts (`{raw}`, `{count}`). The cell values come from TORI tag counts, which are always integers.

**Possible explanations:**
- The decimals might appear in **tooltip percentages** or **normalized scaling values**, not the cell values themselves.
- The decimals might come from the **Reflection Depth** section (which uses Hatton & Smith percentages) rather than the heatmap.
- The decimals might appear in **sparkline axis labels** or **summary row aggregations**.

**Action needed:** Before implementing, reproduce the exact decimal issue. Screenshot or identify the exact component and value that shows too many decimal places. The plan points at `HeatmapView.tsx` but the bug may be elsewhere — possibly `DepthBands.tsx`, `StudentEngagementTable.tsx`, or a tooltip in `ToriTagFrequencies.tsx` (which uses `.toFixed(1)` at line 178 — already fixed to 1 decimal).

**Risk if wrong:** Wasted time modifying code that doesn't need changing while the actual decimal issue remains unfixed.

---

### 2. The original scope matrix is 2x2, not 5-row

The plan (Phase 11.3) describes a 5-row scope matrix. But the **original plan** (`04-ux-polish.md`, Theme I) defined it as a **2x2 matrix**:

> `{this student / all students}` x `{this assignment / all assignments}`
> Implemented as two side-by-side toggles.

The 5th row ("All students — All courses") is a third axis (course), not part of the original 2x2. The plan inflates the matrix without acknowledging this is a scope expansion beyond what was agreed.

**Resolution needed:** Confirm with the user whether the scope model is:
- **2x2** (student × assignment) within the current course, plus a separate "cross-course" option = 5 total
- **2x2** only (4 options within current course context)
- Something else

The current plan's 5-row table is likely correct given the user's critique mentions "all courses" as an option, but this should be explicit.

---

### 3. `CROSS_COURSE` scope in `ai-chat.ts` does NOT query all courses

The plan assumes `CROSS_COURSE` fetches data across all courses. But the actual code (line 136-146 of `ai-chat.ts`) shows:

```typescript
case ChatScope.CROSS_COURSE:
  if (session.courseId) {
    // Recursively calls buildContext with COURSE scope — same as COURSE!
  } else {
    // Returns EMPTY context
  }
```

`CROSS_COURSE` with no `courseId` returns **empty context**. This is a bug or unfinished implementation. The scope matrix plan (Phase 11.3) assumes this works, but it doesn't.

**Impact:** "All students — All courses" scope option will produce empty AI context. Must fix `buildContext()` to actually query across courses for the institution.

---

## MISSING IMPLEMENTATION DETAILS

### 4. Phase 8.1 (Clickable Student Names) is underspecified

The plan says "add `onStudentClick` prop" to multiple components, but doesn't address:

**a) Student ID availability:** Many components display student names but don't have the `studentId` in their local data. For example:
- `EvidencePopover` receives `studentId` as a prop — but only when opened for a specific student. When opened for a tag drill-down (TORI tag frequencies), `studentId` is undefined.
- Evidence items (comments) have `studentId` on the comment object, but this needs verification in the GraphQL query — does the evidence query return `studentId` on each comment?

**b) Threading model for "click student in panel":**
- The user specifically said: when viewing a thread in the panel and clicking a student name, navigate to that student's profile *within the same panel*.
- This means `panel.openStudentProfile()` from within the Thread tab, which pushes onto the panel's history stack.
- But what if the user is viewing a thread about Student A and clicks Student B's name in a comment? The panel navigates to Student B's profile, losing the thread view. The back button should return to the thread. **Verify the history stack in `FacultyPanelContext` supports this navigation pattern.**

**c) Student names in AI Chat messages:**
- The user mentioned "if AI chat mentions a student, I should be able to click on that name."
- AI messages are plain text/markdown. Detecting student names in free-text AI responses and making them interactive is a **fundamentally different problem** than adding click handlers to structured data. This requires:
  - Name entity detection in AI responses
  - Matching detected names to student IDs
  - Custom markdown renderer that turns matched names into clickable links
- This is a significant feature that the plan handwaves as a "stretch goal." It should either be scoped properly or explicitly deferred.

---

### 5. Phase 8.2 (TORI Tag Drill-Down with Student Names) needs backend changes

The plan says "check if the tag evidence query returns `studentName`/`studentId`." This is underspecified:

**Current evidence query flow (from `EvidencePopover.tsx`):**
- Popover fetches comments filtered by `toriTagId` + scope.
- Comments have `studentId` but the GraphQL query may not return the student's name.
- Even if the query returns `studentId`, we need to join to the student/user table to get the display name.

**What's actually needed:**
- Verify the GraphQL schema for comment type includes `studentId` and a way to get the student name (either directly or via a nested `student { name }` field).
- If not present, add a `studentName` or `student` relation to the comment type in the schema + resolver.
- Group evidence by student in the popover UI.

**The plan doesn't specify any backend query/schema changes** for this item. If the comment type doesn't expose student info, this is blocked.

---

### 6. Phase 9.1 (Thread Tag Highlighting) has a component gap

The plan says "add a tag chip bar at the top of the Thread Viewer." But:

- `ThreadView.tsx` already accepts `activeToriFilters` and `onToriTagClick` props — the filtering logic is built in.
- What's missing is the **tag chip bar UI itself** — a `ToriFilters`-like component that shows available tags and lets the user toggle them.
- The existing `ToriFilters` component lives in `ChatExplorerPage`. It needs to be **extracted** into a reusable component or **duplicated** into ThreadView.
- The plan doesn't mention this extraction/reuse step.

**Also missing:** Where do the available tags come from? In Chat Explorer, they come from the thread's comments. In the panel's thread viewer, the same data source should work. But when opened from Student Engagement with a pre-selected tag, the component needs to know ALL available tags for that thread, not just the pre-selected one.

---

### 7. Phase 9.2 (Growth Cell Interactivity) needs a new backend query

The plan acknowledges this ("may need a query that fetches comments by student + assignment + reflection category") but doesn't specify it.

**What's needed:**
- A query like `getEvidenceByCategory(studentId, assignmentId, category)` that returns comments classified into a specific Hatton & Smith category.
- The `CommentReflectionClassification` entity exists (from Phase 4 migration) and has `commentId` + `category`.
- Need: resolver that joins `CommentReflectionClassification` → `Comment` → `Thread` and filters by student + assignment + category.
- GraphQL schema addition: new query or extend existing evidence query.
- This is a **backend-first task** that blocks the frontend work. The plan doesn't sequence it that way.

---

### 8. Phase 9.3 (Co-Occurrence Interactivity) has a data model gap

The plan notes the co-occurrence data only has `tags: string[]` (names, no IDs). But it goes deeper:

- Co-occurrence data is computed by the analytics service from TORI tag co-occurrence in comments.
- To drill down, we need: "show me all comments that have BOTH tag A AND tag B."
- This requires a **multi-tag intersection query** — find comments where the comment's TORI tags include ALL of the selected tags.
- Current `CommentToriTag` table supports this via: `SELECT commentId FROM comment_tori_tag WHERE toriTagId IN (tagA, tagB) GROUP BY commentId HAVING COUNT(DISTINCT toriTagId) = 2`.
- But there's no existing resolver or service method for this.
- The plan says "may be complex" but doesn't add the backend work to the implementation steps or test plan.

---

### 9. Phase 10 (TORI Network Redesign) is severely underscoped

The plan lists 4 bullet points for what is essentially a **complete rewrite** of the network visualization. Issues:

**a) Layout algorithm change is non-trivial:**
- Switching from circle nodes to labeled rectangles fundamentally changes the force layout.
- Rectangle-rectangle collision detection is more complex than circle-circle.
- The current layout uses 200 iterations with `O(n²)` all-pairs repulsion. With ~49 nodes (from the browser verification), this is fine for circles but labeled rectangles need much larger repulsion radii, potentially pushing nodes off-canvas.
- The plan mentions "increase canvas size" but doesn't address: what if the graph doesn't fit in any reasonable viewport? Need an approach for zooming/panning.

**b) Text measurement is tricky in SVG:**
- `getComputedTextLength()` only works after the text is rendered in the DOM.
- Need a two-pass approach: render invisible text elements → measure → compute layout → render final positions.
- Or use canvas `measureText()` off-screen, but then font metrics must match the SVG render.

**c) No fallback for dense graphs:**
- With 49 nodes all labeled, the graph will be crowded regardless of layout algorithm.
- Need: a threshold where labels switch to abbreviations, or nodes below a frequency threshold are collapsed into an "other" group.
- The plan doesn't address information density management.

**d) Performance:**
- The plan mentions "test with n > 50" but the current data has 49 nodes. With labels, 49 nodes could already be slow if the collision detection iterates over labeled bounding boxes.
- Consider: is the force layout computed on every render? If so, memoize it.

**e) No design spec:**
- "Mind-map style" is vague. What exactly should this look like? Line thickness by co-occurrence count? Node size by frequency? Color by community? Label font size by frequency?
- Without a visual spec, the implementer will make arbitrary design decisions that may not match the user's expectations.

---

### 10. Phase 11.1 (Default Student Selection) has unresolved questions from the original review

The original critique review (`insights-critique-2025-04-12-review.md`, item 8) raised these questions that were "resolved" with "big list is OK":

- If a student appears in multiple courses, do they show up once or multiple times?
- How does the student carousel handle 50+ students?
- Should students be grouped by course?

The plan says "show all students, paginated at 50, auto-select first" but doesn't address:
- **Backend query:** `GET_STUDENT_PROFILES` currently requires `courseId`. Removing this filter means querying by `institutionId` only. Does this resolver exist? The plan says "may need backend changes" but doesn't spec them.
- **Pagination UI:** The current student list is a carousel. How does pagination work in a carousel? Is it infinite scroll? Page buttons? The plan doesn't specify.
- **Deduplication:** A student in 3 courses could appear 3 times. Need to deduplicate by `studentId`.

---

### 11. Phase 11.4 (Scope Change Bug) root cause analysis is incomplete

The plan identifies two symptoms:
1. AI uses old context after scope change.
2. Divider gets pushed below the new response.

But the root cause analysis misses the real issue:

**The scope change doesn't update the session's scope on the backend.** When `scopeOverride` changes in the UI:
- `chatScope` updates (line 153 of AiChatPanel).
- But the existing session's `scope`, `studentId`, `courseId`, `assignmentId` fields in the database are **never updated**.
- The next `sendMessage` call uses the session ID, and `buildContext()` reads the session's stored scope — which is the OLD scope.

**The fix requires:**
1. A new mutation: `updateChatSessionScope(sessionId, scope, studentId, courseId, assignmentId)` — **the plan mentions this correctly**.
2. But it also needs to handle the case where the user hasn't sent a message yet after changing scope. The divider should appear immediately, not only after the next message.
3. The plan says "inject dividers into the message display based on timestamps" — but scope changes don't have timestamps stored anywhere. Need to either:
   a. Store scope changes as special messages (role: "SYSTEM") in the database, or
   b. Store them as local state with timestamps and merge with messages for display.

Option (a) is cleaner but requires a schema change to `ChatMessage` to support system messages. Option (b) is fragile across page refreshes. **The plan doesn't make this decision.**

---

### 12. Phase 12.1 (Insights AI Chat Context) is architecturally vague

The plan says "gather analytics summary" and "pass as `analyticsContext` prop." But:

**a) What data?**
- The Insights page shows 7+ sections (MetricsCards, HeatmapView, ToriTagFrequencies, ToriNetworkGraph, DepthBands, StudentEngagement, GrowthVisualization, CoOccurrenceList).
- Each fetches data independently via GraphQL.
- "Gathering" this data means either:
  - Re-fetching it in the panel (duplicate queries), or
  - Lifting all query results to a shared context/store (major refactor), or
  - Having each section register a summary with a central context (new pattern).

**b) Context window limits:**
- Dumping all analytics data into the AI context could exceed token limits.
- Need to summarize, not dump raw data.
- Who writes the summary? The frontend (a formatting function)? The backend (a new service)?

**c) The AI system prompt already builds context from comments.**
- Adding analytics summaries creates a second context source.
- These could conflict (e.g., the analytics say 47 students, but the comment context only includes 30 because of scope filtering).
- Need a clear hierarchy: analytics context as system prompt preamble, comment context as the detailed data.

**The plan doesn't address any of these architectural decisions.**

---

### 13. Phase 12.2 (Context Change Choice) has UX gaps

**a) What triggers a "context change"?**
- Navigating from Insights to Chat Explorer? (page change)
- Changing the course in the scope selector? (scope change)
- Clicking a different student in a table? (selection change)
- All three? Each has different implications for the panel.

The plan says "add `currentPageContext` state" and "call `setPageContext` on mount and scope change." But scope changes within the same page (e.g., switching courses on Insights) need to be distinguished from page navigations. **The plan doesn't define what constitutes a "context change."**

**b) Prompt fatigue:**
- If every scope change shows a banner asking "Update panel?", users will be annoyed.
- Need: auto-update for minor changes (same page, different course), prompt only for major changes (different page), or a setting to control this.
- The plan's per-tab behavior (auto for Student, prompt for Thread, prompt for Chat) is a good start but doesn't address frequency.

**c) What happens to the AI chat session on context change?**
- If the user clicks "New Chat" in response to the context change prompt, the old session is abandoned.
- But the old session still exists in the database.
- Should the panel show a list of recent sessions so the user can switch back?
- This connects to the chat history UI (Phase 5.3, which was deemed "already done" but may need revisiting).

---

## MISSING TESTS

The plan has **zero test specifications.** For a one-shot implementation, every phase needs:

### Phase 7 Tests

**Unit tests:**
- `HeatmapView.test.tsx`: Verify number formatting (once the decimal issue location is confirmed)
- `HeatmapView.test.tsx`: Verify Classic mode renders summary row with correct aggregated values
- `StudentProfilePage.test.tsx`: Verify "View full conversation" triggers `panel.openThread()` when embedded

**Browser tests:**
- Navigate to Insights → verify no excessive decimals in any heatmap mode
- Classic mode → verify summary row present with correct totals
- Student panel → Notable Reflections → "View full conversation" → verify thread opens

---

### Phase 8 Tests

**Unit tests:**
- `HeatmapView.test.tsx`: Verify student name click calls `onStudentClick` callback (Classic, Sparkline, Small Multiples modes)
- `EvidencePopover.test.tsx`: Verify student name rendered and clickable when `onStudentClick` provided
- `EvidencePopover.test.tsx`: Verify tag drill-down includes student name for each evidence item
- `FacultyPanel.test.tsx`: Verify `StudentSearchAutocomplete` renders when no student selected
- `FacultyPanel.test.tsx`: Verify selecting a student in the autocomplete calls `panel.openStudentProfile()`
- `FacultyPanelContext.test.tsx`: Verify history stack supports Student → Thread → Student navigation (clicking student name in thread view)

**Backend tests (if schema changes needed):**
- Evidence query returns `studentId` and `studentName` for each comment
- Tag evidence grouped by student

**Browser tests:**
- Insights → Heatmap → click student name → Faculty Panel opens to Student tab
- Insights → Heatmap → click cell → popover → click student name → Faculty Panel opens
- Insights → TORI Tag Frequencies → click tag → verify student names appear in drill-down
- Faculty Panel → Student tab → verify student selector dropdown appears
- Faculty Panel → Thread tab → click student name → navigates to Student tab (same panel)
- Faculty Panel → Student tab → back button → returns to previous view

---

### Phase 9 Tests

**Unit tests:**
- `ThreadView.test.tsx`: Verify tag chip bar renders with available tags
- `ThreadView.test.tsx`: Verify clicking a tag chip toggles highlighting on matching comments
- `ThreadView.test.tsx`: Verify `initialToriTag` prop pre-selects the tag
- `GrowthVisualization.test.tsx`: Verify Matrix cell click calls `onCellClick(studentId, assignmentId, category)`
- `GrowthVisualization.test.tsx`: Verify Delta chip click calls callback
- `CoOccurrenceList.test.tsx`: Verify item click calls `onItemClick(tags, tagIds)`

**Backend tests:**
- `getEvidenceByCategory` resolver: returns comments matching student + assignment + category
- Multi-tag intersection query: returns comments containing ALL specified tags

**Browser tests:**
- Student Engagement → click tag chip → thread opens with that tag pre-highlighted
- Growth Matrix → click cell → evidence popover opens with filtered conversations
- Co-occurrence → click pair → evidence popover opens with matching conversations

---

### Phase 10 Tests

**Unit tests:**
- `ToriNetworkGraph.test.ts`: Verify label-based layout produces no overlapping labels
- `ToriNetworkGraph.test.ts`: Verify hover highlights connected nodes and edges
- `ToriNetworkGraph.test.ts`: Verify click locks/unlocks highlight state
- `ToriNetworkGraph.test.ts`: Verify bounding box collision detection works for rectangles

**Browser tests:**
- Insights → TORI Network → verify all nodes have visible labels
- Hover node → connected nodes stay highlighted
- Click node → highlight locks, click again → unlocks
- Verify graph doesn't overflow viewport (or has zoom/pan controls)

---

### Phase 11 Tests

**Unit tests:**
- `ChatExplorerPage.test.tsx`: Verify students load when no course selected
- `ChatExplorerPage.test.tsx`: Verify first student auto-selected
- `ChatExplorerPage.test.tsx`: Verify selecting student updates Faculty Panel context
- `AiChatPanel.test.tsx`: Verify scope dropdown shows all valid permutations based on context
- `AiChatPanel.test.tsx`: Verify scope change calls `updateChatSessionScope` mutation
- `AiChatPanel.test.tsx`: Verify divider renders in correct chronological position

**Backend tests:**
- `chat.test.ts`: `updateChatSessionScope` mutation updates scope fields
- `chat.test.ts`: `chatSessions` query returns sessions without courseId (institution-wide)
- `ai-chat.test.ts`: `buildContext()` with `CROSS_COURSE` scope and no courseId returns institution-wide data (currently returns empty!)
- `ai-chat.test.ts`: `buildContext()` with all 5 scope permutations returns correct data
- Student profiles resolver: returns all students for institution when no courseId

**Browser tests:**
- Chat Explorer → no course selected → students appear → first auto-selected
- Chat Explorer → select student → Faculty Panel Student tab shows same student
- AI Chat → scope dropdown → shows all available options (student × assignment × course)
- AI Chat → change scope → send message → AI response uses new context
- AI Chat → change scope → divider appears above next message, not below

---

### Phase 12 Tests

**Unit tests:**
- `FacultyPanelContext.test.tsx`: `setPageContext()` detects context changes
- `FacultyPanel.test.tsx`: Student tab auto-updates on context change
- `FacultyPanel.test.tsx`: Thread tab shows banner on context change
- `FacultyPanel.test.tsx`: Chat tab shows banner with "New Chat" / "Continue" options
- `AiChatPanel.test.tsx`: Analytics context included in system prompt when provided

**Backend tests:**
- `ai-chat.test.ts`: `buildContext()` with `analyticsContext` parameter includes it in system prompt

**Browser tests:**
- Insights → open panel → switch course in scope selector → Student tab updates
- Insights → open panel to Thread tab → switch course → banner appears
- Insights → open panel to Chat tab → switch course → prompt appears
- Navigate Insights → Chat Explorer → panel stays open, context change detected

---

## DEPENDENCY AND SEQUENCING ISSUES

### 14. Phase 8 depends on backend work not called out

Phase 8.2 (TORI tag drill-down with student names) likely needs a backend schema/resolver change. This should be sequenced as a backend-first task within Phase 8, not discovered during frontend implementation.

### 15. Phase 9.2 and 9.3 are blocked on backend work

Both Growth cell interactivity (9.2) and Co-occurrence interactivity (9.3) need new backend queries. These should be grouped as a "backend interactivity queries" sub-phase that runs first, then the frontend work.

### 16. Phase 11.3 and 11.4 should be one item, not two

The scope matrix rework (11.3) and scope change bug fix (11.4) are the same problem. You can't fix the bug on the current model and then rework the model — the bug fix would be thrown away. Implement the new scope model with the bug fix built in.

### 17. Phase 10 (TORI Network) is independent

The TORI Network redesign has no dependencies on other phases and nothing depends on it. It could be done in parallel or deferred to a later sprint if time is tight.

---

## RISK ASSESSMENT GAPS

### 18. No rollback plan

For a one-shot implementation touching 20+ files across 6 phases, there's no mention of:
- Feature flags for risky changes
- Ability to revert individual phases
- Database migration rollback testing (Phase 11 may add new queries/indexes)

### 19. No performance testing plan

Several items could impact performance:
- Phase 10: TORI Network with 49 labeled nodes
- Phase 11.1: Loading all students institution-wide (could be hundreds)
- Phase 12.1: Adding analytics data to AI context (token limits)

### 20. No mobile/responsive consideration

The plan doesn't mention how any of these changes behave on mobile:
- Student selector autocomplete in a narrow panel
- TORI Network with labels on a small screen
- Context change banners in the panel on mobile (panel stacks below content)

---

## RECOMMENDATIONS

1. **Reproduce the decimal issue first** (Item #1) before writing any code for it.
2. **Merge Phase 11.3 and 11.4** into a single scope model implementation.
3. **Add a "backend queries" sub-phase** at the start of Phase 9 for Growth and Co-occurrence data access.
4. **Defer "AI chat student name linking"** (clicking names in AI responses) — it's a fundamentally different problem from structured data click handlers. Call it out as a future enhancement.
5. **Add a design spec for TORI Network** before implementing Phase 10. Even a rough sketch of what "mind-map style" means.
6. **Fix `CROSS_COURSE` buildContext()** as part of Phase 11, not as an afterthought. This is currently broken.
7. **Decide on scope change persistence** (database system messages vs. local state) before Phase 11.4.
8. **Add all test specifications** from this review into the implementation plan.
9. **Consider deferring Phase 12.1** (Insights AI context) — it's architecturally complex and the value is less clear than the interactivity improvements in Phases 8-9.
10. **Each phase must be independently deployable** — if Phase 10 takes longer than expected, Phases 7-9 and 11 should still be shippable.
