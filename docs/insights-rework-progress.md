# Insights Critique Rework — Progress Report

**Branch:** `feat/insights-critique-rework`
**Started:** 2025-04-12
**Status:** Phases 1–4 complete. Phases 5–6 pending.

---

## Background

A systematic critique of the Chat Explorer's Insights page identified 30 items across 12 sections covering cluttered UI, limited interactivity, scattered architecture, shallow student analytics, and a confusing AI chat scope model. All design decisions were resolved upfront in three planning documents before implementation began.

**Planning documents** (in `.claude/plans/`):
- `insights-critique-2025-04-12-review.md` — The critique: 15 critical issues, gaps, open questions
- `insights-critique-2025-04-12.md` — The comprehensive plan: 30 items, vision, decisions
- `insights-critique-2025-04-12-implementation.md` — Execution plan: phases, files, tests, risk analysis

---

## Core Architectural Decision: Unified Faculty Panel

The biggest change is a single, tabbed right-hand panel that works on both Insights and Chat Explorer pages. It has three tabs:

1. **Student** — Click any student name to see their profile, TORI tags, and analytics
2. **Thread** — Click evidence or a thread link to see the conversation
3. **AI Chat** — Faculty member's ongoing AI chats (persists across page navigation)

Key properties:
- Managed by `FacultyPanelContext` (app-level state via `useReducer`)
- Rendered in `AppShell` alongside the page `Outlet` (not inside individual pages)
- Side-by-side on desktop (67/33 split), stacks on mobile
- Context-aware: AI scope auto-detects from the current page

---

## Phase 1 — Quick Wins

**Commit:** `bc6730a`

| Item | What changed |
|------|-------------|
| Remove SmartRecommendations | Deleted component from InsightsPage (backend service kept) |
| Remove TextSignals | Deleted component and file |
| Remove Compare Courses button | Hidden from UI |
| Remove show/hide toggle on Reflection Depth | Section is now always visible |
| Remove info button from Student Engagement | Bundled with comment count click |
| Heatmap default scaling | Changed from RAW to ROW |
| Growth default view | Changed from Sparklines to Matrix |
| Section reordering | Reflection Depth moved above Student Engagement |
| Bug fix: student names | Fixed names showing as "Student" in GrowthVisualization — root cause was `getRawMany()` column aliasing |

---

## Phase 2 — Unified Faculty Panel Foundation

**Commit:** `74485f6`

**New infrastructure:**
- `FacultyPanelContext` — Tracks open/close, active tab, student/thread/chat IDs, navigation history
- `FacultyPanel` — Three-tab component embedding StudentProfilePage, ThreadPanel, and AiChatPanel
- `StudentProfilePage` — Added `embedded` prop (hides breadcrumb, reduces padding)

**App-level integration:**
- Provider added to `App.tsx` inside the existing provider chain
- `AppShell.tsx` renders panel alongside Outlet in a flex layout

**Page refactors:**
- `InsightsPage` — Removed local ThreadPanel state; all navigation now goes through FacultyPanelContext
- `ChatExplorerPage` — Removed local AI panel state; "Analyze" button opens Faculty Panel Chat tab; removed shift-click multi-select

---

## Phase 3 — Interactivity Improvements

**Commit:** `7a81485`

Made 8+ components interactive — clicking student names, metrics, table rows, and growth cells now opens the Faculty Panel instead of navigating to a new page:

- MetricsCards participant count drill-down
- DepthBands table rows (hover state + click to drill down)
- StudentEngagementTable student names (opens profile in panel)
- StudentEngagementTable comment counts (opens EvidencePopover)
- GrowthVisualization student names and matrix cells (all 3 view modes)

---

## Phase 4 — Larger Features

**Commit:** `242cdaa`

### TORI Network Graph
- Removed all default text labels from nodes (only appear on hover via tooltip)
- Added legend below the graph: colored dots + tag names + frequency counts
- Legend hover highlights the corresponding node and connected edges
- Legend click opens EvidencePopover for that tag

### Heatmap Sparkline Summary
- Added "All Students" summary row at top of sparkline mode
- Computes column-wise aggregates across all students
- Distinct background color and border to differentiate from individual rows

### Conversation Rendering
- ChatMessageBubble width: `min(80%, 600px)` changed to `min(75%, 520px)` for 12–15 words per line
- Color differentiation improved: student = white + blue left border, assistant = light gray
- ThreadView (Chat Explorer): centered with `maxWidth: 560px` so cards render at ~520px text width

### Student Profile — TORI Tag Trends
Backend:
- Added `perAssignmentToriTags` field to `StudentProfileReport`
- New GraphQL types: `PerAssignmentToriTags`, `AssignmentTagCount`
- Reuses existing TORI tag query (no extra database call)

Frontend (new section on Student Profile, visible when student has 2+ assignments):
- **Delta Heatmap** — Tags on Y-axis, assignments on X-axis, color = period-to-period change (green = increase, red = decrease)
- **Sparklines** — One mini-chart per tag showing count over time
- **Slope Chart** — Lines connecting first to last assignment values for top 10 tags
- All three in a tabbed interface

### UX Fixes
- Faculty Panel AI Chat input was hidden behind Chat Explorer's fixed bottom bar — added `pb: 60px` to panel wrapper when on `/chat` route
- Faculty Panel tab content overflow set to `hidden` when AI Chat is active (chat manages its own scrolling)
- Vite config: added `watch.ignored: ["**/src/server/**"]` to prevent spurious full-page reloads from server file changes in Docker

---

## What's Next

### Phase 5 — AI Chat Scope Rework

| Item | Risk | Description |
|------|------|-------------|
| 5.1 Institutional isolation | HIGH | Add `institutionId` to `ChatSession` entity. Database migration to backfill existing sessions. Resolver filtering to prevent cross-institution access. |
| 5.2 New scope model (3-axis) | MODERATE | Reinterpret SELECTION/COURSE/CROSS_COURSE scope. Auto-detect from page context. Visible dividers on scope change. |
| 5.3 Chat history UI redesign | LOW | Refactor from toggle/modal to inline expandable section within the Faculty Panel tab. |

### Phase 6 — Testing and Verification

- E2E test updates for all interaction changes
- Browser verification checklist (50+ checkpoints)
- Institutional isolation tests
- Panel persistence tests

---

## Files Changed (Phases 1–4)

### New files
- `src/components/faculty-panel/FacultyPanelContext.tsx`
- `src/components/faculty-panel/FacultyPanel.tsx`

### Deleted files
- `src/components/insights/SmartRecommendations.tsx`
- `src/components/insights/TextSignals.tsx`

### Modified files (Phase 4 specifically)
| File | Change |
|------|--------|
| `src/components/ai/ChatMessageBubble.tsx` | Width + color styling |
| `src/components/explorer/ThreadView.tsx` | Centered, narrower layout |
| `src/components/faculty-panel/FacultyPanel.tsx` | Overflow fix for AI Chat tab |
| `src/components/insights/HeatmapView.tsx` | Summary sparkline row |
| `src/components/insights/ToriNetworkGraph.tsx` | Hover-only labels + legend |
| `src/components/layout/AppShell.tsx` | Bottom bar padding for Faculty Panel |
| `src/lib/queries/analytics.ts` | `perAssignmentToriTags` query field |
| `src/pages/StudentProfilePage.tsx` | TORI Tag Trends section (3 visualizations) |
| `src/server/services/analytics/student-profile.ts` | Per-assignment TORI tag aggregation |
| `src/server/types/schema.ts` | New GraphQL types |
| `vite.config.ts` | Server file watcher exclusion |

---

## Test Status

All 333 unit tests pass across all 45 test files. No test regressions from any phase. One test description updated to match new width value (`ChatMessageBubble.test.tsx`).
