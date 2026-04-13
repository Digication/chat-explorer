# Insights Critique Rework — Progress Report

**Branch:** `feat/insights-critique-rework`
**Started:** 2025-04-12
**Status:** All 12 phases complete. Ready for review and merge.

---

## Background

A systematic critique of the Chat Explorer's Insights page identified issues across 12 sections covering cluttered UI, limited interactivity, scattered architecture, shallow student analytics, and a confusing AI chat scope model. All design decisions were resolved upfront in planning documents before implementation began.

The rework was split into two rounds:
- **Round 1 (Phases 1–5):** Original critique — 30 items across 6 phases
- **Round 2 (Phases 7–12):** Follow-up critique — 17 additional items across 6 phases

**Planning documents** (in `.claude/plans/`):
- `insights-critique-2025-04-12-review.md` — Round 1 critique
- `insights-critique-2025-04-12.md` — Round 1 comprehensive plan
- `insights-critique-2025-04-12-implementation.md` — Round 1 execution plan
- `insights-critique-2026-04-12.md` — Round 2 comprehensive plan
- `insights-critique-2026-04-12-review.md` — Round 2 critique review
- `insights-critique-2026-04-12-implementation.md` — Round 2 execution plan (phases, files, tests)

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
- Panel persistence: context changes trigger banners on Thread/Chat tabs

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
- **Delta Heatmap** — Tags on Y-axis, assignments on X-axis, color = period-to-period change
- **Sparklines** — One mini-chart per tag showing count over time
- **Slope Chart** — Lines connecting first to last assignment values for top 10 tags
- All three in a tabbed interface

### UX Fixes
- Faculty Panel AI Chat input hidden behind Chat Explorer's fixed bottom bar — added `pb: 60px` to panel wrapper when on `/chat` route
- Faculty Panel tab content overflow set to `hidden` when AI Chat is active
- Vite config: added `watch.ignored: ["**/src/server/**"]` to prevent spurious full-page reloads

---

## Phase 5 — AI Chat Scope Rework

**Commit:** `8119ff3`

### Institutional Isolation
- Added `institutionId` column to `ChatSession` entity
- Database migration: `1775574400000-AddInstitutionIdToChatSession.ts` backfills existing sessions
- All chat resolvers filter by `institutionId` — users cannot access sessions from other institutions

### Scope Model Rework
- `AiChatPanel` now receives `institutionId`, `courseId`, `assignmentId` as props from parent context
- Scope auto-detects: SELECTION on Chat Explorer with student selected, COURSE when course is set, CROSS_COURSE at institution level
- Visible scope change dividers in chat UI
- `updateChatSessionScope` mutation persists scope changes with SYSTEM messages

### Chat UI Improvements
- SYSTEM messages rendered as centered dividers (horizontal lines with caption text)
- Chat history persists across tab switches
- New chat sessions inherit current scope automatically

---

## Phase 7 — Quick Fixes & Polish

**Commit:** `53c94fc`

| Item | What changed |
|------|-------------|
| Decimal precision | Heatmap cells in ROW/GLOBAL scaling show ≤2 decimal places via `fmt()` helper |
| Classic summary row | All-student aggregate row at top of Classic heatmap with distinct styling |
| "View Full Conversation" | ThreadPanel button now opens full thread in Faculty Panel Thread tab |

**New test file:** `src/components/insights/__tests__/HeatmapView.test.ts` (6 tests)

---

## Phase 8 — Clickable Student Names & Navigation

**Commit:** `a755056`

### Student Search Autocomplete
- New `StudentSearchAutocomplete` component in Faculty Panel Student tab
- Fetches all students for current scope, renders MUI Autocomplete
- Updates automatically when scope changes

### TORI Tag Evidence Drill-Down
- New `CategoryEvidencePopover` — clicks on DepthBands categories show students + evidence
- New `MultiTagEvidencePopover` — clicks on CoOccurrenceList items show thread-level evidence
- Both use evidence query from backend

### Backend: Evidence Query
- New `src/server/services/analytics/evidence.ts` — evidence service with thread lookups
- New GraphQL resolver, types, and queries for evidence data
- Supports filtering by TORI tag ID, reflection category, or multi-tag combination

### Student-Click Propagation
- `ToriTagFrequencies` — tag bar clicks open `EvidencePopover` with student/thread evidence
- `GrowthVisualization` — sparkline/matrix/slope clicks can open student profiles
- `CoOccurrenceList` — pattern clicks open `MultiTagEvidencePopover`
- `DepthBands` — category bar/row clicks open `CategoryEvidencePopover`

---

## Phase 9 — Interactivity Expansion

**Commit:** `0036c89`

### Evidence Popover Enhancements
- `EvidencePopover` now shows thread snippets with student name, comment preview, and TORI tags
- Click-through to open threads in Faculty Panel Thread tab
- Student name links in popovers open student profiles

### ThreadPanel Improvements
- Added `embedded` mode for Faculty Panel rendering
- Student name clickable → opens student profile in panel
- TORI tag chips on comments are clickable → navigates to evidence
- `initialToriTag` prop highlights specific tag when opening from evidence context
- Added student ID tracking for back-navigation

### Heatmap Drill-Down
- Category columns in heatmap are clickable → opens `CategoryEvidencePopover`
- Student row names are clickable → opens student profile in panel
- Cell clicks open evidence for that student + category combination

---

## Phase 10 — TORI Network Redesign

**Commit:** `8f56683`

Complete rewrite of `ToriNetworkGraph.tsx`:

### Visual Redesign
- **Rectangle nodes** with rounded corners containing text labels (replaced circles)
- Off-screen canvas `measureText()` computes label widths before layout
- Maximum 30 visible nodes (top by frequency)
- Removed separate legend below graph

### Layout Algorithm
- Force-directed simulation with link distance, charge repulsion, center gravity
- AABB (axis-aligned bounding box) collision detection for rectangle nodes
- Interleaved clamp + collision post-layout pass (up to 100 iterations)
- Dynamic canvas expansion when nodes can't fit without overlap
- Zero overlap guaranteed programmatically

### Interaction Model
- **Hover** highlights node + connected edges + neighbor nodes (dims unconnected)
- **Click** locks/unlocks highlight state
- **Locked click** opens evidence popover for that TORI tag
- Tooltip shows tag name + frequency count

---

## Phase 11 — Chat Explorer & AI Chat Scope Improvements

**Commit:** `97b63cc`

### Chat Explorer Scope Expansion
- Student profiles query now works at institution level (removed `!courseId` guard)
- `useEffect` syncs selected student with Faculty Panel's Student tab
- Removed "Select a course to get started" empty state

### AI Chat Scope Persistence
- `updateChatSessionScope` mutation: updates scope fields + creates SYSTEM role message
- SYSTEM messages rendered as centered dividers in `ChatMessageBubble`
- `AiChatPanel` scope changes call mutation instead of managing local state
- Removed `scopeOverride` and `scopeDividers` ephemeral state

### CROSS_COURSE Context Fix
- Fixed `buildContext()` for CROSS_COURSE scope: fetches ALL courses for institution
- Aggregates comments across courses, respects `studentId` filter
- Backend `sendChatMessage` accepts optional `analyticsContext` parameter

---

## Phase 12 — Context-Aware Panel

**Commit:** `524f351`

### 12.1 InsightsAnalyticsContext
- New `InsightsAnalyticsContext` provider collects dashboard summaries from visible panels
- 4 insight sections register summaries:
  - **MetricsCards**: thread count, participants, comments, mean word count
  - **DepthBands**: reflection category distribution with percentages
  - **ToriTagFrequencies**: top 5 TORI tags by frequency
  - **StudentEngagementTable**: student count, avg comments, modal category distribution
- Summaries injected into AI Chat system prompt via `analyticsContext` parameter
- Full-stack support: GraphQL schema → resolver → service → system prompt

### 12.2 Panel Persistence with Context Change Banners
- `FacultyPanelContext` tracks `pageContext`, `contextChanged`, `contextChangeLabel`
- InsightsPage and ChatExplorerPage report their page context on mount/scope change
- Context change detection: triggers when scope key or page changes while panel is open
- Per-tab behavior:
  - **Student tab**: auto-acknowledges (always reflects current context)
  - **Thread tab**: shows "Context changed. This thread is from a different context." with Update/Keep buttons
  - **AI Chat tab**: shows "Context changed. Start a new chat?" with New Chat/Continue buttons
  - "Update" navigates to Student tab with new context
  - "Keep" / "Continue" dismisses the banner and preserves current content
  - "New Chat" clears the active session and starts fresh with new scope

---

## Files Changed (All Phases)

### New files (Phases 1–12)
| File | Phase | Purpose |
|------|-------|---------|
| `src/components/faculty-panel/FacultyPanelContext.tsx` | 2 | Panel state management |
| `src/components/faculty-panel/FacultyPanel.tsx` | 2 | Three-tab panel component |
| `src/components/faculty-panel/StudentSearchAutocomplete.tsx` | 8 | Student search in panel |
| `src/components/insights/CategoryEvidencePopover.tsx` | 8 | Category-based evidence drill-down |
| `src/components/insights/MultiTagEvidencePopover.tsx` | 8 | Multi-tag evidence drill-down |
| `src/components/insights/InsightsAnalyticsContext.tsx` | 12 | Dashboard summary collection for AI |
| `src/components/insights/__tests__/HeatmapView.test.ts` | 7 | Heatmap unit tests |
| `src/server/services/analytics/evidence.ts` | 8 | Evidence query service |
| `src/server/migrations/1775574400000-AddInstitutionIdToChatSession.ts` | 5 | Institution isolation migration |

### Deleted files
| File | Phase | Reason |
|------|-------|--------|
| `src/components/insights/SmartRecommendations.tsx` | 1 | Removed from UI (backend kept) |
| `src/components/insights/TextSignals.tsx` | 1 | Removed from UI |

### Heavily modified files
| File | Key changes |
|------|-------------|
| `src/components/insights/ToriNetworkGraph.tsx` | Complete rewrite: rectangle nodes, AABB collision, click-to-lock |
| `src/components/ai/AiChatPanel.tsx` | Scope props, scope persistence, analytics context injection |
| `src/pages/StudentProfilePage.tsx` | TORI Tag Trends section (delta heatmap, sparklines, slope chart) |
| `src/components/insights/HeatmapView.tsx` | Decimal formatting, Classic summary row, drill-down clicks |
| `src/components/insights/ThreadPanel.tsx` | Embedded mode, student links, TORI tag navigation |
| `src/server/resolvers/chat.ts` | Scope mutation, analytics context, institutional filtering |
| `src/server/services/ai-chat.ts` | CROSS_COURSE fix, analytics context in system prompt |
| `src/server/types/schema.ts` | Evidence queries, scope mutation, analytics context |
| `src/pages/ChatExplorerPage.tsx` | Institution-level queries, panel sync, context reporting |
| `src/pages/InsightsPage.tsx` | Context reporting, simplified panel integration |
| `src/components/layout/AppShell.tsx` | Faculty Panel rendering, responsive layout |

---

## Test Status

All **345 unit tests** pass across **46 test files**. No test regressions from any phase. All changes browser-verified via Chrome MCP automation.

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total commits | 14 (12 feature + 2 docs) |
| Files changed | 54 |
| Lines added | ~4,800 |
| Lines removed | ~860 |
| Net lines | ~3,940 |
| New files | 9 |
| Deleted files | 2 |
| Test files | 46 (345 tests) |
| Phases | 12 (all complete) |
