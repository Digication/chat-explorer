# Implementation Critique — 2025-04-12 Plan

## Executive Summary

The plan has 29 items across 12 sections. Roughly 8 are safe quick wins, 10 are moderate interactivity changes, and 3 are large architectural features. The biggest risk is Section A (Unified Faculty Panel) — it's the most ambitious item and the most items depend on it, but it has several unresolved design questions and a significant architectural constraint that the plan doesn't address. The plan also underestimates the testing surface area and has some items that conflict with each other.

---

## CRITICAL ISSUES (must resolve before implementation)

### 1. The Unified Faculty Panel requires app-level state — but the plan doesn't design it

**Problem:** The plan says the panel should "persist across page navigation." Currently, the ThreadPanel state lives inside `InsightsPage` as local `useState`. When you navigate from `/insights` to `/chat`, React unmounts InsightsPage and destroys that state. The AiChatPanel state lives inside `ChatExplorerPage` — same problem.

**What's needed but missing:** A `FacultyPanelProvider` context at the `AppShell` level (above the `<Outlet />`), with:
- Panel open/close state
- Active tab (student / thread / chat)
- Current student ID + name (for Student Profile tab)
- Current thread ID + student name (for Thread tab)
- Active chat session ID (for AI Chat tab)
- Navigation history stack (for back button)

The panel component itself must render **outside** the `<Outlet />` in AppShell, alongside the Sidebar and GlobalHeader. This is a fundamental structural change to `AppShell.tsx`.

**Impact if not addressed:** You'll build the panel, it'll work on one page, and then discover it unmounts on navigation. Retrofitting global state is painful after the fact.

**Recommendation:** Design the `FacultyPanelContext` interface first. Write the provider. Then build the panel component. This is the true prerequisite — not the panel UI itself.

### 2. Section A conflicts with Section J item 25 (broken context switcher)

**Problem:** The plan says the new scope model "supersedes the old 3-toggle system" (Section A) but also says to "review the previous plan and identify what was missed" for the broken context switcher (item 25). These are the same problem. If you fix item 25 first using the old model, you'll throw that work away when building the new scope model in Section A.

**Recommendation:** Skip item 25 entirely. The new 3-axis scope model in Section A replaces it. Don't fix the old system.

### 3. Section F (TORI Analytics Rework) is a research project, not an implementation task

**Problem:** Item 18 lists 9 different visualization approaches (sparklines, radar charts, heatmaps, parallel coordinates, PCA/t-SNE/UMAP, top movers, delta heatmap, slope charts, volatility strips). The plan says "experimental visualizations to explore" — but this is an implementation plan, not a research agenda.

**Specific concerns:**
- PCA/t-SNE/UMAP require a math library (no current dependency) and meaningful multi-dimensional data. The current TORI tag data per student may not have enough variance for dimensionality reduction to be informative.
- Parallel coordinates and radar charts need time-series TORI data per student. The current `GET_STUDENT_PROFILE` query returns aggregate `toriTagDistribution` — not per-assignment TORI breakdown. A new query or schema extension is needed.
- The plan doesn't specify which visualizations to actually build vs. which are aspirational.

**Recommendation:** Pick 2-3 to build now. Based on the data currently available:
- **Delta Heatmap** — can be built with existing per-assignment data, most immediately useful
- **Small Multiples / Sparklines** — straightforward, good for spotting trends
- **Slope Chart** — simple to implement, answers "what changed?" directly
  
Defer radar charts, PCA/UMAP, and parallel coordinates until there's enough time-series TORI data to justify them.

### 4. Item 5 (remove info button) depends on item 14 (make comment count clickable) — but order isn't specified

**Problem:** The plan removes the info button (item 5, Section B "Quick Removals") before making the comment count clickable (item 14, Section E "Interactivity Improvements"). If you remove the info button first, there's a window where the user has NO way to see a student's comments in the engagement table.

**Recommendation:** Items 5 and 14 must be in the same commit. Either implement 14 first and 5 immediately after, or combine them.

---

## SIGNIFICANT GAPS

### 5. No test plan for the Unified Faculty Panel

The panel is the biggest new component in this plan. It needs tests for:

**Unit tests (new file: `FacultyPanel.test.tsx`):**
- Tab switching (Student → Thread → Chat)
- Panel opens to correct tab based on trigger (student click → Student tab, evidence click → Thread tab)
- Back navigation within panel
- Panel renders student profile data correctly
- Panel renders thread data correctly
- Panel passes correct scope to AI Chat
- `getDisplayName()` integration for student names

**Unit tests (new file: `FacultyPanelContext.test.tsx`):**
- Context provides correct default state
- `openStudentProfile(id, name)` sets active tab + student data
- `openThread(id, name)` sets active tab + thread data
- `openChat()` sets active tab
- State persists when page component unmounts (simulated with `MemoryRouter` initial entry changes)

**Integration tests (update existing):**
- `InsightsPage.test.tsx` — mock FacultyPanelContext, verify student name clicks call `openStudentProfile`
- `ChatExplorerPage.test.tsx` — verify panel integration

**E2E tests (update `insights.spec.ts` and `chat.spec.ts`):**
- Click student name on insights → panel opens with student profile
- Click evidence → panel opens with thread
- Navigate from insights to chat → panel stays open
- Switch between tabs

### 6. No test plan for removals

Removing SmartRecommendations and TextSignals is safe (self-contained, no callbacks), but tests need updating:

- **Server tests exist** for `recommendations.ts` and `text-signals.ts` — these test the backend services, not the components. The services should NOT be deleted (they may be useful later). Only the frontend components are being removed from the page.
- **E2E test `insights.spec.ts`** — if it checks for the presence of these components (text content, headings), those assertions need to be removed or they'll fail.
- **No existing unit test** for SmartRecommendations or TextSignals components, so nothing to delete there.

### 7. No test plan for interactivity changes (Section E)

Each of items 11-17 adds click handlers to previously non-interactive elements. Each needs:
- Unit test: click event fires correct callback
- Unit test: hover state renders correctly (CSS class or style change)
- For items that open popovers: test that popover appears with correct data

**Specific testing needs:**
- Item 11 (DepthBands table rows): Add test to verify row click triggers `handleCategoryClick` with correct category
- Item 14 (comment count click): Add test to StudentEngagementTable verifying click opens EvidencePopover
- Item 15 (tag chip click): Add test verifying tag click opens EvidencePopover with studentId + toriTagId filter
- Item 17 (co-occurrence): This requires a NEW GraphQL query or schema extension — there's no existing way to get "conversations that contain this pair of TORI tags." The plan doesn't mention this.

### 8. The "show students without course selected" (item 23) has a data problem

**Problem:** Currently, the student list comes from the scope-filtered analytics queries. Without a `courseId`, the query returns all students across all courses. This could be hundreds of students across many courses. The Chat Explorer page isn't designed for that volume.

**Questions:**
- Does the student carousel scroll? What's the max it can handle before it becomes unusable?
- Should we show students grouped by course?
- If a student appears in multiple courses, do they show up once or multiple times?

**Recommendation:** This needs a design decision, not just "make it work." Consider showing a "Select a course first" message instead, or limiting to the first N students with a "select a course to see all students."

### 9. Item 21 (TORI Network rethink) has no chosen direction

The plan lists 5 possible approaches but doesn't pick one. For a "one-shot implementation," this needs a decision now.

**My recommendation:** Go with **hover-only labels + sidebar legend**:
- All nodes show as colored dots (no labels by default)
- Hovering a node shows its label + highlights connected edges (already partially implemented)
- A small legend panel to the right or below lists all tags with their community colors
- Clicking a legend item highlights the corresponding node

This is the least disruptive to the existing force layout, avoids the label collision problem entirely, and gives two ways to identify nodes.

### 10. Chat Explorer page and Insights page will both need layout refactoring for the unified panel

**Problem:** Currently, ChatExplorerPage manages its own AI panel with `padding-right` and fixed positioning. InsightsPage manages ThreadPanel with backdrop overlay. If the unified panel lives in AppShell (above both pages), both pages need their layout refactored:

- **ChatExplorerPage** must stop managing the AI panel directly — the bottom bar's "Analyze" button must talk to the global FacultyPanelContext instead
- **InsightsPage** must stop managing ThreadPanel state — all `onViewThread` callbacks must talk to the global context instead
- **AppShell** must apply the `padding-right` transition, not individual pages

This is a significant refactor of two core pages, not just "add a new component."

---

## MINOR ISSUES

### 11. Item 9 (students show as "Student") — may not be a frontend bug

The plan says "use `getDisplayName()` from UserSettingsContext." But GrowthVisualization already calls `getDisplayName(s.name)` (line 188). The bug might be:
- The `GET_GROWTH` query returns `name: null` from the backend
- The `growth` resolver doesn't join the student name properly
- The consent system is stripping names

**Recommendation:** Before implementing, check the actual GraphQL response in the browser dev tools. The fix might be backend, not frontend.

### 12. Item 26 (chat history as modal) conflicts with unified panel design

If the AI Chat becomes a tab in the unified panel, the chat history UI needs to fit within that tab — not be a separate modal. A modal would float over the panel, which is confusing. Consider an inline list within the chat tab instead (expandable section or sidebar within the tab).

### 13. The plan doesn't address what happens to the standalone StudentProfilePage

Currently `/insights/student/:studentId` renders a full-page student profile. With the unified panel, student profiles show in the right panel. Do we:
- Keep the full page AND the panel version (two implementations to maintain)?
- Remove the full page and only use the panel?
- Keep the full page but make student name clicks go to the panel?

**Recommendation:** Keep the full page for direct navigation / bookmarks, but extract shared components so the panel version and full page use the same underlying widgets. Don't duplicate the rendering logic.

### 14. No mention of responsive/mobile behavior

The push layout works on wide screens. On narrow screens (< 1024px), the panel + content won't fit side by side. The plan doesn't address:
- Should the panel be full-width on mobile?
- Should it overlay instead of push on narrow screens?
- What's the breakpoint?

### 15. Section K questions (items 27-28) should be resolved before implementation, not during

The plan lists "TBD — Jeffrey is thinking about this" for the chat relationship model. But the unified panel design (Section A) assumes chats are independent and faculty-owned. If Jeffrey decides chats should be tied to specific students, the panel architecture changes significantly.

**Recommendation:** Get a decision on item 27 before building the AI Chat tab.

---

## TESTING REQUIREMENTS SUMMARY

For a one-shot implementation, here's the complete test surface:

### New unit tests to write:
| Test file | What it covers |
|---|---|
| `FacultyPanel.test.tsx` | Tab switching, content rendering, navigation, open/close |
| `FacultyPanelContext.test.tsx` | State management, persistence across route changes |
| `StudentProfilePanel.test.tsx` | Student data rendering within panel (if extracted as sub-component) |
| `DepthBands.test.tsx` (new or extend) | Table row click handlers, hover states |
| `StudentEngagementTable.test.tsx` (new or extend) | Comment count click, tag chip click, student name → panel |
| `CoOccurrenceList.test.tsx` (new) | Click handlers for pairs/triples |
| `GrowthVisualization.test.tsx` (new or extend) | Matrix cell click, student name click → panel, display name resolution |

### Existing tests to update:
| Test file | What changes |
|---|---|
| `StudentProfilePage.test.tsx` | May need FacultyPanelContext mock |
| `ChatMessageBubble.test.tsx` | If color scheme changes (item 24a), update expected styles |
| `ToriNetworkGraph.test.ts` | If label approach changes (item 21), update layout assertions |
| `insights.spec.ts` (e2e) | Remove SmartRecommendations/TextSignals assertions, add panel interaction tests |
| `chat.spec.ts` (e2e) | Add unified panel tests, verify persistence across navigation |
| `student-profile.spec.ts` (e2e) | Update if panel replaces some full-page navigation |

### Server tests — no changes needed for:
- `recommendations.test.ts` — backend service stays, only frontend removed
- `text-signals.test.ts` — same
- `ai-chat.test.ts` — scope changes are frontend-only (session creation already supports all scope levels)

### Server tests — changes needed if:
- Item 17 (co-occurrence interactivity) requires a new query for "get conversations containing these TORI tag pairs" — needs a new resolver + service + test
- Item 19 (student thread list) requires a query for "get all threads for student in scope" — may need new resolver if not already covered by `GET_STUDENT_PROFILE`

---

## RECOMMENDED IMPLEMENTATION ORDER

Given dependencies and risk:

**Phase 1 — Safe, independent quick wins (can parallelize):**
- Items 1-4 (removals): SmartRecommendations, TextSignals, Compare Courses button, show/hide toggle
- Items 6-8 (reordering/defaults): Move DepthBands, heatmap scaling, matrix default
- Item 9 (bug fix): Diagnose student name bug first (check backend), then fix

**Phase 2 — Foundation:**
- Design and build `FacultyPanelContext` + `FacultyPanel` component at AppShell level
- Refactor InsightsPage to remove ThreadPanel state, use global context
- Refactor ChatExplorerPage to remove AiChatPanel management, use global context
- Item 20 (push layout): Part of this refactor
- Write FacultyPanel unit tests

**Phase 3 — Interactivity (all depend on Phase 2):**
- Items 10, 12, 13 (student clicks → panel): Wire up all student name clicks
- Items 5, 14, 15 (engagement table rework): Remove info button + add click handlers
- Item 11 (DepthBands table rows clickable)
- Item 16 (Growth visualization interactive)

**Phase 4 — Larger features:**
- Item 21 (TORI network rethink) — pick an approach first
- Item 22 (summary sparkline)
- Item 24 (conversation rendering fixes)
- Section F items (pick 2-3 TORI visualizations)

**Phase 5 — AI Chat scope rework:**
- **CRITICAL: Institutional isolation first** — add `institutionId` to ChatSession, migration, query filtering
- New 3-axis scope model
- Auto-detection + manual override
- Scope dividers in chat log + context clearing behavior
- Item 26 (history UI redesign)
- Multi-select UX for students/courses/assignments

**Phase 6 — Testing & verification:**
- E2E tests for all new interactions
- Browser verification of every changed page
- Cross-page navigation testing
- **Institutional isolation test:** Verify admin user sees only institution-scoped chats

---

## OPEN DECISIONS — ALL RESOLVED

1. **Item 27:** RESOLVED — Chats belong to user. Can create/continue chats, change context anytime. Context changes clear AI context window and are recorded as dividers in transcript. Chats must be institution-scoped (new `institutionId` field on ChatSession).
2. **Item 21:** RESOLVED — Hover-only labels + sidebar legend. Remove default labels, show dots only, tooltip on hover, clickable legend below/beside graph.
3. **Item 23:** RESOLVED — Show all students (paginated, first 50), auto-select first one. Big list is OK.
4. **Section F:** RESOLVED — Build Delta Heatmap, Sparklines, and Slope Chart.
5. **Item 13:** RESOLVED — Keep both. Same `StudentProfilePage` component renders in either context (full page on left, or inside Faculty Panel on right). No compact/separate version — same page, just narrower in the panel (like a mobile view).
6. **Responsive behavior:** RESOLVED — Follow Campus Web pattern. Use MUI Grid with `xs={12} md={8}` / `xs={12} md={4}` split. On mobile (below `md` breakpoint), panels stack vertically. `useMediaQuery(theme.breakpoints.down('md'))` for detection. No custom CSS — pure MUI responsive Grid.
7. **Multi-select:** RESOLVED — Remove shift-click multi-select from Chat Explorer. Simplify to: click a student = view that student. Scope model handles all comparison use cases via AI chat.
8. **Item 25 (broken context switcher):** RESOLVED — Skip. Superseded by new 3-axis scope model.
9. **Item 12 (context clearing):** RESOLVED — Clear AI context window on scope change. Chat thread continues but AI rebuilds context from new scope only.
