# Implementation Plan — 2025-04-12 Critique

Status: **Final review before implementation**

This document is the definitive, phase-by-phase implementation plan with exact file changes, test requirements, and risk analysis. Every item has been verified against the actual codebase.

---

## Phase 1 — Quick Wins (Removals, Reordering, Defaults, Bug Fix)

All items in this phase are independent of each other and can be done in parallel.

### 1.1 Remove SmartRecommendations

**Files to change:**
- `src/pages/InsightsPage.tsx` — Remove import (line 12) and `<SmartRecommendations />` render (line 92)

**Files to NOT delete (backend stays for potential future use):**
- `src/components/insights/SmartRecommendations.tsx` — Delete this file
- `src/server/services/analytics/recommendations.ts` — KEEP (backend service)
- `src/server/services/analytics/recommendations.test.ts` — KEEP
- `src/server/resolvers/analytics.ts` — KEEP resolver (lines 127-134)
- `src/lib/queries/analytics.ts` — KEEP `GET_RECOMMENDATIONS` query
- Schema types — KEEP

**Rationale for keeping backend:** We're removing the UI, not the capability. The backend service, resolver, and query can stay dormant. No schema migration needed. Less risk.

**Tests impacted:** None. No unit or E2E tests reference SmartRecommendations.

**New tests needed:** None — removing a component doesn't require a "prove it's gone" test.

**Risk: LOW** — Self-contained component, no callbacks, no shared state.

---

### 1.2 Remove TextSignals

**Files to change:**
- `src/pages/InsightsPage.tsx` — Remove import (line 18) and `<TextSignals />` render (line 99)

**Files to delete:**
- `src/components/insights/TextSignals.tsx` — Delete

**Files to keep:**
- Backend service, resolver, query, schema — all KEEP (same rationale as 1.1)

**Tests impacted:** None.

**New tests needed:** None.

**Risk: LOW** — Same as 1.1.

---

### 1.3 Remove Compare Courses Button

**Files to change:**
- `src/pages/InsightsPage.tsx` — Remove the Compare Courses button block (lines 78-89) and the `showCompareButton` logic (line 50) and `CompareArrowsIcon` import

**Decision needed: What to do with CrossCourseComparisonPage?**

**Option A (recommended): Hide the button, keep the page and route.**
- The page at `/insights/compare` still works if someone navigates directly
- No route deletion, no test deletion
- Least risk, easily reversible

**Option B: Delete everything.**
- Delete `src/pages/CrossCourseComparisonPage.tsx`
- Remove route from `src/App.tsx` (line 134)
- Delete `src/pages/__tests__/CrossCourseComparisonPage.test.tsx` (4 tests)
- Update `e2e/cross-course.spec.ts` — redirect test still works, but 2 skipped tests reference page content that no longer exists

**Recommendation:** Option A. Just remove the button. The page and backend stay intact. Zero test breakage.

**Tests impacted:**
- Option A: None
- Option B: `CrossCourseComparisonPage.test.tsx` (all 4 tests) and `e2e/cross-course.spec.ts` (2 skipped tests)

**Risk: LOW** (Option A)

---

### 1.4 Remove Show/Hide Toggle on Reflection Depth

**Files to change:**
- `src/pages/InsightsPage.tsx`:
  - Remove `DEPTH_HIDDEN_KEY` constant (line 45)
  - Remove `depthHidden` state (lines 55-57)
  - Remove `VisibilityIcon`/`VisibilityOffIcon` imports
  - Remove the toggle button block (lines 128-138)
  - Change conditional render `{!depthHidden && <DepthBands .../>}` (line 140) to unconditional `<DepthBands .../>`
  - Remove the wrapping `<Box>` with header that contains the toggle (lines 124-141), replace with just the Section-wrapped DepthBands

**Cleanup:** Users who previously hid this section will have a stale `chat-explorer:hideDepthSection` key in localStorage. This is harmless — it'll just sit there unused.

**Tests impacted:** None — no tests reference this toggle or localStorage key.

**Risk: LOW**

---

### 1.5 Remove Info Button from StudentEngagementTable

**DEPENDENCY: Must be done together with 3.4 (make comment count clickable). Do NOT ship this alone — it removes the only way to see evidence for a student.**

**Files to change:**
- `src/components/insights/StudentEngagementTable.tsx`:
  - Remove the info button `<TableCell>` (lines 220-235)
  - Remove the empty header `<TableCell />` for the info column (line 168)
  - Keep the `EvidencePopover` import and rendering — it will be triggered by comment count click instead (Phase 3)

**Tests impacted:** None — no tests for this component.

**Risk: MODERATE** — Only because of the dependency on 3.4. If shipped alone, users lose access to evidence. Must be bundled.

---

### 1.6 Move Reflection Depth Above Student Engagement

**Files to change:**
- `src/pages/InsightsPage.tsx` — Reorder the JSX: Move the DepthBands section (currently after StudentEngagementTable at line ~140) to render before StudentEngagementTable (currently at line ~119)

**Current order (lines 92-150):**
1. SmartRecommendations (being removed)
2. MetricsCards
3. TextSignals (being removed)
4. HeatmapView
5. ToriTagFrequencies
6. ToriNetworkGraph
7. **StudentEngagementTable** ← currently here
8. **DepthBands** ← currently here
9. GrowthVisualization
10. CoOccurrenceList

**New order after all Phase 1 changes:**
1. MetricsCards
2. HeatmapView
3. ToriTagFrequencies
4. ToriNetworkGraph
5. **DepthBands** ← moved up
6. **StudentEngagementTable** ← moved down
7. GrowthVisualization
8. CoOccurrenceList

**Tests impacted:** None.

**Risk: LOW**

---

### 1.7 Heatmap Default Scaling: Raw → Row

**Files to change:**
- `src/components/insights/HeatmapView.tsx` — Change line 243:
  - FROM: `const [scaling, setScaling] = useState<"RAW" | "ROW" | "GLOBAL">("RAW");`
  - TO: `const [scaling, setScaling] = useState<"RAW" | "ROW" | "GLOBAL">("ROW");`

**Tests impacted:** None — no tests for HeatmapView.

**Risk: LOW**

---

### 1.8 Student Growth Default View: Sparklines → Matrix

**Files to change:**
- `src/components/insights/GrowthVisualization.tsx` — Change line 41:
  - FROM: `const [viewMode, setViewMode] = useState<ViewMode>("sparklines");`
  - TO: `const [viewMode, setViewMode] = useState<ViewMode>("matrix");`

**Tests impacted:** None — no tests for GrowthVisualization.

**Risk: LOW**

---

### 1.9 Bug Fix: Student Names Show as "Student" in Growth Visualization

**Root cause analysis (from code review):**
- `GrowthVisualization.tsx` DOES call `getDisplayName(s.name)` at lines 188, 289
- The data comes from `GET_GROWTH` query which returns `name` field
- The growth service (`src/server/services/analytics/growth.ts` lines 97-108) fetches student names via raw SQL query joining `student` table
- Line 139: `name: studentNameMap.get(studentId) ?? "Student"` — falls back to "Student" if name is empty
- Lines 102-107: Name is constructed as `[firstName, lastName].filter(Boolean).join(" ") || "Student"`

**Diagnosis step (MUST DO FIRST):** Before changing code, check the actual data:
1. Open browser dev tools on the Growth visualization
2. Check the GraphQL response for `growth` query
3. Look at the `name` field for each student
4. If names are all `"Student"` in the response → **backend bug** (firstName/lastName are null in DB)
5. If names are real but display as "Student" → **frontend bug** (getDisplayName issue)

**Most likely cause:** The `student` table may have null `firstName`/`lastName` for imported students (CSV import may not populate these fields). The service correctly falls back to "Student" when names are missing.

**Fix depends on diagnosis:**
- If backend: Check CSV import service to ensure it populates student names
- If data: May need a data migration or import fix
- If frontend: Check `getDisplayName` function behavior with the actual name values

**Tests needed:**
- Unit test for growth service: Verify name resolution with null firstName/lastName
- Check existing test in `growth.ts` (if any) — NONE found, so a new test is needed

**Risk: MODERATE** — Root cause unclear until diagnosed. Do not blindly change code.

---

### Phase 1 Testing Summary

| Item | Tests Break | New Tests Needed | Browser Verify |
|------|------------|-----------------|----------------|
| 1.1 Remove SmartRecommendations | None | None | Verify section gone from Insights page |
| 1.2 Remove TextSignals | None | None | Verify section gone from Insights page |
| 1.3 Remove Compare Courses button | None (Option A) | None | Verify button gone when in All Courses |
| 1.4 Remove depth toggle | None | None | Verify Reflection Depth always visible |
| 1.5 Remove info button | None | None | **DO NOT verify alone** — bundle with 3.4 |
| 1.6 Reorder sections | None | None | Verify DepthBands appears before StudentEngagement |
| 1.7 Heatmap default | None | None | Verify heatmap loads in ROW scaling |
| 1.8 Growth default | None | None | Verify growth loads in Matrix view |
| 1.9 Student name bug | None | 1 new test | Diagnose first, then verify names display correctly |

**Browser verification checklist for Phase 1:**
1. Navigate to Insights page → SmartRecommendations and TextSignals sections are gone
2. In All Courses context → Compare Courses button is gone
3. Reflection Depth section → always visible, no toggle button
4. Section order → DepthBands before StudentEngagementTable
5. Heatmap → loads with ROW scaling selected by default
6. Student Growth → loads with Matrix view selected by default
7. Student Growth → check if student names display correctly (diagnosis for 1.9)

---

## Phase 2 — Unified Faculty Panel Foundation

This is the most architecturally significant phase. Everything in Phases 3-5 depends on it.

### 2.1 Create FacultyPanelContext

**New file:** `src/components/faculty-panel/FacultyPanelContext.tsx`

**State shape:**
```typescript
interface FacultyPanelState {
  isOpen: boolean;
  activeTab: "student" | "thread" | "chat";
  
  // Student Profile tab state
  studentId: string | null;
  studentName: string | null;
  
  // Thread tab state
  threadId: string | null;
  threadStudentName: string | null;
  
  // Chat tab state
  activeChatSessionId: string | null;
  
  // Navigation history (for back button)
  history: Array<{ tab: string; studentId?: string; threadId?: string }>;
}

interface FacultyPanelActions {
  openStudentProfile: (studentId: string, studentName: string) => void;
  openThread: (threadId: string, studentName: string) => void;
  openChat: () => void;
  goBack: () => void;
  close: () => void;
  setActiveChatSession: (sessionId: string | null) => void;
}
```

**Where to place the provider:** In `src/App.tsx`, wrapping the AppShell:
```
<UserSettingsProvider>
  <InsightsScopeProvider>
    <FacultyPanelProvider>      ← NEW
      <AppShell />
    </FacultyPanelProvider>
  </InsightsScopeProvider>
</UserSettingsProvider>
```

**CRITICAL CONSTRAINT:** The provider must be INSIDE `InsightsScopeProvider` (needs scope for AI chat) and INSIDE `UserSettingsProvider` (needs display name settings).

**Tests needed (new file: `FacultyPanelContext.test.tsx`):**
- Default state: panel closed, no active tab
- `openStudentProfile` sets studentId, switches to student tab, opens panel
- `openThread` sets threadId, switches to thread tab, opens panel
- `openChat` switches to chat tab, opens panel
- `close` closes panel, preserves tab state (so reopening returns to last tab)
- `goBack` pops history stack, restores previous tab + data
- History accumulates correctly across multiple navigations
- State persists when MemoryRouter changes routes (simulates page navigation)

**Risk: MODERATE** — New infrastructure. If the context API is wrong, everything built on top breaks.

---

### 2.2 Create FacultyPanel Component

**New file:** `src/components/faculty-panel/FacultyPanel.tsx`

**Structure:**
```
<Box> (panel container)
  <Tabs> (student | thread | chat)
  
  {activeTab === "student" && <StudentProfilePage studentId={...} embedded />}
  {activeTab === "thread" && <ThreadView threadId={...} />}
  {activeTab === "chat" && <AiChatPanel anchor="embedded" />}
</Box>
```

**Key design decisions:**

1. **StudentProfilePage reuse:** The existing `StudentProfilePage` component must work both as a full page (via route) AND embedded in the panel. It currently uses `useParams()` to get `studentId` from the URL. For embedded use, it needs to accept `studentId` as a prop instead.

   **Change to StudentProfilePage.tsx:**
   - Add optional `studentId` prop
   - Line ~80: `const { studentId: routeStudentId } = useParams(); const studentId = props.studentId ?? routeStudentId;`
   - Add optional `embedded` prop that hides breadcrumb and adjusts padding
   - **Test impact:** Existing `StudentProfilePage.test.tsx` passes `studentId` via MemoryRouter URL params. Need to add tests for prop-based studentId.

2. **ThreadPanel extraction:** Current `ThreadPanel.tsx` uses fixed positioning. For the panel, it needs to be a normal-flow component. Either:
   - Refactor ThreadPanel to accept a `mode` prop ("fixed" vs "embedded")
   - Or extract the content into a `ThreadContent` component used by both ThreadPanel and FacultyPanel

3. **AiChatPanel reuse:** Already has `anchor="embedded"` mode that renders as a plain flex container. This can be used directly in the panel.

**Responsive layout (following Campus Web pattern):**

Must NOT use fixed positioning. Use MUI Grid in AppShell:

**Change to AppShell.tsx:**
```typescript
// Current: <Outlet /> fills the main area
// New: <Outlet /> + <FacultyPanel /> in a Grid

<Box component="main" sx={{ flex: 1, overflow: "auto" }}>
  <Grid container>
    <Grid item xs={12} md={panelOpen ? 8 : 12}>
      <Outlet />
    </Grid>
    {panelOpen && (
      <Grid item xs={12} md={4}>
        <FacultyPanel />
      </Grid>
    )}
  </Grid>
</Box>
```

**PROBLEM:** MUI Grid has never been used in this project before. MUI version is 7.3.9 which uses Grid2 (the new API). Need to verify import: `import Grid from '@mui/material/Grid2'` (MUI v7) vs `import Grid from '@mui/material/Grid'` (MUI v5/v6).

**Alternative approach if Grid causes issues:** Use flexbox directly:
```typescript
<Box component="main" sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
  <Box sx={{ flex: 1, overflow: "auto", minWidth: 0 }}>
    <Outlet />
  </Box>
  {panelOpen && (
    <Box sx={{ 
      width: { xs: "100%", md: "33%" },
      borderLeft: 1, 
      borderColor: "divider",
      overflow: "auto" 
    }}>
      <FacultyPanel />
    </Box>
  )}
</Box>
```

**Tests needed (new file: `FacultyPanel.test.tsx`):**
- Renders Student Profile tab when activeTab is "student"
- Renders Thread tab when activeTab is "thread"
- Renders Chat tab when activeTab is "chat"
- Tab switching works
- Student name click within thread tab calls `openStudentProfile`
- Thread click within student tab calls `openThread`
- Close button calls `close`
- Back button calls `goBack`

**Risk: HIGH** — This is the most complex new component. Reusing StudentProfilePage inside a panel requires careful refactoring.

---

### 2.3 Refactor InsightsPage to Use FacultyPanelContext

**Files to change:**
- `src/pages/InsightsPage.tsx`:
  - Remove `openThread` state (lines 51-54)
  - Remove `handleViewThread` callback (lines 59-61)
  - Remove ThreadPanel rendering (lines 155-172)
  - Remove backdrop overlay
  - Import `useFacultyPanel` hook
  - Replace all `onViewThread={handleViewThread}` props with `onViewThread` from context
  - Replace `onViewThread` with two separate callbacks: one for threads, one for students

**PROBLEM:** Currently every child component receives a single `onViewThread(threadId, studentName)` callback. But now we need two actions:
- Click student name → `openStudentProfile(studentId, studentName)`
- Click evidence/thread → `openThread(threadId, studentName)`

This means the `onViewThread` prop name is misleading when used for student clicks. Each component needs to be updated to call the right action.

**Components that need callback updates:**
| Component | Currently passes | Needs to pass |
|-----------|-----------------|---------------|
| MetricsCards | `onViewThread(studentId, name)` — wrong, treats student as thread | `onOpenStudent(studentId, name)` |
| DepthBands | `onViewThread(studentId, name)` via StudentDrillDown | `onOpenStudent(studentId, name)` |
| HeatmapView | `onViewThread(threadId, name)` via EvidencePopover | `onOpenThread(threadId, name)` — correct |
| ToriTagFrequencies | `onViewThread(threadId, name)` via EvidencePopover | `onOpenThread(threadId, name)` — correct |
| ToriNetworkGraph | `onViewThread(threadId, name)` via EvidencePopover | `onOpenThread(threadId, name)` — correct |
| StudentEngagementTable | `onViewThread` not used for student click (uses navigate) | `onOpenStudent` for name click |
| GrowthVisualization | `onViewThread` prop is dead code — never used | Remove prop entirely |

**This is a significant interface change.** Every component that accepts `onViewThread` needs its prop updated. The safest approach:
1. Add `onOpenStudent` and `onOpenThread` props alongside existing `onViewThread`
2. Have InsightsPage pass both from FacultyPanelContext
3. Each component calls the appropriate one
4. Eventually remove `onViewThread` once all components are migrated

**Tests impacted:** None directly (no tests for InsightsPage component), but the callback interface change affects all child components.

**Risk: HIGH** — Touches 7+ components' prop interfaces.

---

### 2.4 Refactor ChatExplorerPage to Use FacultyPanelContext

**Files to change:**
- `src/pages/ChatExplorerPage.tsx`:
  - Remove `aiPanelOpen` state (lines 42-43)
  - Remove `AI_PANEL_WIDTH` constant (line 17)
  - Remove `padding-right` transition (line 182-183)
  - Remove `<Slide>` wrapper and fixed-position AI panel (lines 256-313)
  - Remove `onToggleAnalyze` from BottomBar props (line 323)
  - The BottomBar "Analyze" button now calls `facultyPanel.openChat()` instead
  - Thread content stays in the left panel (this is the main content area)

**PROBLEM: Bottom bar positioning.** Currently the bottom bar is fixed at the bottom of ChatExplorerPage with width calculations that account for the AI panel:
```
width: aiPanelOpen ? `calc(100% - ${AI_PANEL_WIDTH})` : "100%"
```
With the unified panel managed by AppShell, the page no longer knows about panel width. The bottom bar needs to fill the left content area naturally.

**Solution:** The bottom bar should use `width: 100%` of its parent container (the Outlet area), and the AppShell Grid/flex layout handles the panel separately.

**Multi-select removal:**
- Remove `handleToggleStudent` callback (lines 74-78)
- Remove `onToggleStudent` from BottomBar props (line 322)
- Remove shift-click detection from StudentCarousel

**Tests impacted:**
- `StudentCarousel.test.tsx` test 3: "shift+click calls onToggle" — **DELETE this test**
- `StudentCarousel.test.tsx` test 4: "shows name only for selected students" — **UPDATE** for single-select behavior
- `BottomBar.test.tsx` test 3: "shows student count in badge" — **UPDATE** or remove badge logic

**Tests needed:**
- Update StudentCarousel tests to verify shift+click does NOT trigger toggle
- Update BottomBar tests to verify "Analyze" calls `facultyPanel.openChat()`
- Add test for bottom bar width behavior without panel width dependency

**Risk: HIGH** — Major refactor of a core page. Bottom bar positioning is tricky.

---

### 2.5 Modify AppShell for Panel Rendering

**Files to change:**
- `src/components/layout/AppShell.tsx` (currently 29 lines):
  - Import `useFacultyPanel` from FacultyPanelContext
  - Add FacultyPanel rendering alongside Outlet
  - Add responsive layout (Grid or flex)

**CRITICAL:** The AppShell must handle the responsive breakpoint:
- **Desktop (md+):** Side-by-side layout, panel takes ~33%
- **Mobile (<md):** Panel stacks below or shows as drawer

**Current AppShell layout:**
```
<GlobalHeader />
<Box display="flex">
  <Sidebar />
  <Box component="main" flex={1}>
    <Outlet />
  </Box>
</Box>
```

**New layout:**
```
<GlobalHeader />
<Box display="flex">
  <Sidebar />
  <Box component="main" display="flex" flex={1}>
    <Box flex={1} overflow="auto" minWidth={0}>
      <Outlet />
    </Box>
    {panelOpen && (
      <Box width={{ xs: "100%", md: "33%" }} borderLeft={1} overflow="auto">
        <FacultyPanel />
      </Box>
    )}
  </Box>
</Box>
```

**Tests needed:** AppShell currently has no tests. Add basic tests:
- Renders Outlet content
- Renders FacultyPanel when context says panel is open
- Does not render FacultyPanel when closed

**Risk: HIGH** — This changes the top-level layout of the entire app.

---

### Phase 2 Testing Summary

| Item | Tests Break | New Tests Needed | Browser Verify |
|------|------------|-----------------|----------------|
| 2.1 FacultyPanelContext | None | `FacultyPanelContext.test.tsx` (8+ tests) | N/A (infrastructure) |
| 2.2 FacultyPanel component | `StudentProfilePage.test.tsx` needs mock context | `FacultyPanel.test.tsx` (8+ tests) | Open panel, switch tabs, verify content |
| 2.3 InsightsPage refactor | None (no InsightsPage tests) | None (covered by 2.1/2.2 tests) | Click student names → panel opens. Click evidence → thread in panel. |
| 2.4 ChatExplorerPage refactor | `StudentCarousel.test.tsx` (2 tests), `BottomBar.test.tsx` (1 test) | Update 3 existing tests | Analyze button opens panel. Single-click selects student. Shift-click does nothing. |
| 2.5 AppShell modification | None | 3 new tests | Panel appears beside content on desktop. Panel stacks on mobile. |

**Browser verification checklist for Phase 2:**
1. Insights page → click any student name → Faculty Panel opens to Student Profile tab
2. Insights page → click evidence "View conversation" → Panel opens to Thread tab
3. Switch between Student/Thread/Chat tabs in panel
4. Navigate from Insights to Chat Explorer → Panel stays open
5. Chat Explorer → "Analyze" button → Panel opens to Chat tab
6. Chat Explorer → click student in carousel → student selected, conversations shown
7. Chat Explorer → shift+click student → nothing happens (multi-select removed)
8. Resize browser to narrow width → panel stacks below or becomes drawer
9. Panel back button works after navigating Student → Thread

---

## Phase 3 — Interactivity Improvements

All items in this phase depend on Phase 2 (FacultyPanelContext).

### 3.1 Participant Drill-Down → Student Panel

**Files to change:**
- `src/components/insights/MetricsCards.tsx`:
  - `handleSelectStudent` (line 131) currently calls `onViewThread(studentId, name)`
  - Change to call `onOpenStudent(studentId, name)` from FacultyPanelContext
  - Prop change: Accept `onOpenStudent` instead of (or in addition to) `onViewThread`

**Tests needed:** New unit test for MetricsCards verifying student click calls `onOpenStudent`.

**Risk: LOW** — Simple callback swap.

---

### 3.2 Reflection Depth: Table Rows Clickable

**Files to change:**
- `src/components/insights/DepthBands.tsx`:
  - Line 177: Add `onClick` and hover styles to `<TableRow>`:
    ```tsx
    <TableRow 
      key={c.key} 
      onClick={(e) => handleCategoryClick(e, c.key)}
      sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
    >
    ```
  - This makes the entire row (Category, Count, Percentage) clickable
  - Count cell (line 196) already has its own click handler — this is now redundant but harmless (event will bubble to row)

**Tests needed:** New unit test for DepthBands:
- Row click triggers StudentDrillDown with correct category
- Row has pointer cursor

**Risk: LOW** — Adding a click handler to an existing element.

---

### 3.3 Reflection Depth: Student Drill-Down → Comments in Panel

**Files to change:**
- `src/components/insights/DepthBands.tsx`:
  - `handleSelectStudent` (line 110) currently calls `onViewThread(studentId, name)`
  - Change to call `onOpenStudent(studentId, name)` — opens Student Profile in Faculty Panel
  - The student profile will show their comments, TORI tags, etc.

**Tests needed:** Unit test verifying student selection from drill-down calls `onOpenStudent`.

**Risk: LOW** — Callback swap.

---

### 3.4 Student Engagement: Comment Count Clickable

**MUST be bundled with 1.5 (info button removal).**

**Files to change:**
- `src/components/insights/StudentEngagementTable.tsx`:
  - Line 202: Wrap comment count in a clickable element:
    ```tsx
    <TableCell 
      align="right" 
      onClick={(e) => setPopover({
        anchorEl: e.currentTarget,
        studentId: student.studentId,
        studentName: student.name,
        commentCount: student.commentCount,
      })}
      sx={{ cursor: "pointer", "&:hover": { color: "primary.main" } }}
    >
      {student.commentCount}
    </TableCell>
    ```
  - This reuses the exact same popover state that the info button currently sets

**Tests needed:** New unit test:
- Comment count cell click opens EvidencePopover with correct studentId

**Risk: LOW** — Reusing existing popover pattern.

---

### 3.5 Student Engagement: Student Name → Panel (Not Navigation)

**Files to change:**
- `src/components/insights/StudentEngagementTable.tsx`:
  - Lines 178-182: Replace `navigate(/insights/student/${student.studentId})` with `onOpenStudent(student.studentId, student.name)`
  - Add `onOpenStudent` prop to component interface
  - InsightsPage passes this from FacultyPanelContext

**Tests needed:** Unit test verifying name click calls `onOpenStudent` instead of `navigate`.

**Risk: LOW** — Callback swap.

---

### 3.6 Student Engagement: Tag Chip Click → Evidence

**Files to change:**
- `src/components/insights/StudentEngagementTable.tsx`:
  - Lines 207-214: Add `onClick` to tag Chips
  - **PROBLEM:** `topToriTags` is an array of tag name strings — no tag IDs. The EvidencePopover needs `toriTagId` to query evidence.
  - **Solution options:**
    A. Change `GET_STUDENT_ENGAGEMENT` query to return tag IDs alongside names
    B. Look up tag ID from name using the heatmap data (fragile, coupling)
    C. Modify EvidencePopover to accept tag name and resolve ID internally
    D. Skip this feature for now

  **Recommendation:** Option A — Change the query. This requires:
  - Update `src/server/services/analytics/engagement.ts` to return tag IDs
  - Update GraphQL schema to include `tagId` in student profile response
  - Update `src/lib/queries/analytics.ts` `GET_STUDENT_ENGAGEMENT` to fetch tagId
  - Then the chip click can open EvidencePopover with `studentId` + `toriTagId`

**Tests needed:**
- Backend: Update engagement service test to verify tag IDs returned
- Frontend: Unit test for tag chip click opening EvidencePopover

**Risk: MODERATE** — Requires schema/query change, not just frontend.

---

### 3.7 Student Growth: Interactive Cells/Students → Panel

**Files to change:**
- `src/components/insights/GrowthVisualization.tsx`:
  - Remove dead `onViewThread` prop (line 34, 37)
  - Add `onOpenStudent` prop
  - Sparkline view (line 184-189): Change `onNavigate` call to `onOpenStudent`
  - Matrix view (lines 285-289): Same change
  - Delta view (line 408): Add `onClick` to student names
  - Matrix cells (lines 291-315): Add `onClick` that calls `onOpenStudent` for the student in that row
  - InsightsPage: Pass `onOpenStudent` from FacultyPanelContext

**Tests needed:**
- Student name click in all three views calls `onOpenStudent`
- Matrix cell click calls `onOpenStudent` for correct student

**Risk: LOW-MODERATE** — Multiple views to update, but all are simple callback additions.

---

### 3.8 Co-occurrence: Interactive Pairs/Triples

**PROBLEM: Requires new backend query.**

Currently `CoOccurrenceList` only has tag names and counts. To show contributing conversations, we need:

1. **New GraphQL query:** `getCoOccurrenceEvidence(scope, tagNames: [String!]!, limit, offset)` that returns threads/comments where all specified tags co-occur
2. **New service function** in `src/server/services/analytics/tori.ts`
3. **New resolver** in `src/server/resolvers/analytics.ts`
4. **Schema update** for new query and return type

**Alternative (simpler):** Instead of a new query, clicking a co-occurrence pair opens the heatmap filtered to show only those tags. This avoids a new backend endpoint but provides a different (less direct) interaction.

**Recommendation:** Defer to Phase 4 or implement the simpler heatmap-filter approach. This is the highest-effort interactivity item and blocks on backend work.

**Risk: HIGH** if building new query. **LOW** if deferring.

---

### Phase 3 Testing Summary

| Item | Tests Break | New Tests Needed | Browser Verify |
|------|------------|-----------------|----------------|
| 3.1 Participant → panel | None | MetricsCards unit test | Click Participants → drill-down → click student → panel opens |
| 3.2 DepthBands rows | None | DepthBands unit test (2 tests) | Hover row → highlight. Click row → drill-down opens |
| 3.3 DepthBands student → panel | None | DepthBands unit test | Click student in drill-down → panel opens to profile |
| 3.4 Comment count clickable | None | StudentEngagement unit test | Click comment count → popover with evidence |
| 3.5 Student name → panel | None | StudentEngagement unit test | Click student name → panel opens (no navigation) |
| 3.6 Tag chip → evidence | None | Backend + frontend tests | Click tag → evidence for that student + tag |
| 3.7 Growth interactive | None | GrowthVisualization tests (4+) | Click student name/cell → panel opens |
| 3.8 Co-occurrence | None | Deferred or simple approach | Deferred |

**Browser verification checklist for Phase 3:**
1. Insights → Participants metric → click → drill-down → click student → panel shows profile
2. Reflection Depth → hover table row → highlight. Click row → drill-down opens.
3. Reflection Depth → bar click → student list → click student → panel shows profile
4. Student Engagement → click comment count → evidence popover appears
5. Student Engagement → click student name → panel opens to profile (no page navigation)
6. Student Engagement → click tag chip → evidence for that student + tag
7. Student Growth → click student name (all 3 views) → panel opens to profile
8. Student Growth → click matrix cell → panel opens to that student's profile

---

## Phase 4 — Larger Features

### 4.1 TORI Network: Hover-Only Labels + Sidebar Legend

**Files to change:**
- `src/components/insights/ToriNetworkGraph.tsx`:
  - **Remove default labels** (lines 289-301): Delete the `<text>` elements that render below nodes. Keep them only for the hovered node.
  - **Keep hover behavior** (lines 283-284): `onMouseEnter`/`onMouseLeave` already work
  - **Show label on hover only:** When `hoveredNode === node.id`, render a tooltip-style label:
    ```tsx
    {hoveredNode === node.id && (
      <text x={pos.x} y={pos.y - r - 6} textAnchor="middle" fontSize={11} fontWeight={600}>
        {node.name}
      </text>
    )}
    ```
  - **Add legend component** below the SVG (after line 306):
    ```tsx
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
      {nodes.map(node => (
        <Chip
          key={node.id}
          size="small"
          label={`${node.name} (${node.frequency})`}
          sx={{ 
            bgcolor: COMMUNITY_COLORS[node.communityId % 6],
            color: "#fff",
            cursor: "pointer",
            opacity: hoveredNode === node.id ? 1 : 0.7,
          }}
          onClick={() => { /* highlight node + connections */ }}
          onMouseEnter={() => setHoveredNode(node.id)}
          onMouseLeave={() => setHoveredNode(null)}
        />
      ))}
    </Box>
    ```
  - Legend click should: set `hoveredNode` to highlight the node, and trigger `EvidencePopover`

**Tests impacted:**
- `ToriNetworkGraph.test.ts` — Tests the layout algorithm only, not rendering. **No impact.**

**Tests needed:**
- Unit test: Legend renders all nodes with correct colors
- Unit test: Hovering legend chip sets hoveredNode
- Unit test: No default labels rendered (only on hover)

**Risk: MODERATE** — SVG manipulation and new component. Visual verification essential.

---

### 4.2 Summary Sparkline Heatmap

**Files to change:**
- `src/components/insights/HeatmapView.tsx`:
  - In Sparkline mode (lines 348-395), add a summary row at the top or bottom
  - Compute column-wise aggregates:
    ```typescript
    const colSums = colOrder.map(ci => 
      rowOrder.reduce((sum, ri) => sum + (matrix[ri]?.[ci] ?? 0), 0)
    );
    ```
  - Render an additional `Sparkline` component with `values={colSums}` and label "All Students"
  - Use a distinct visual style (thicker line, different color, or background shade) to differentiate from individual student rows

**Tests needed:**
- Unit test: Summary row renders with correct aggregated values
- Unit test: Summary sparkline has distinct styling

**Risk: LOW** — Additive feature, doesn't change existing behavior.

---

### 4.3 Conversation Rendering Fixes (Chat Explorer)

**Files to change:**
- `src/components/ai/ChatMessageBubble.tsx`:
  - **Color scheme** (line 63): Change from light blue (`#f0f7ff`) / white to a better differentiation. Options:
    - User: white with subtle left border. Assistant: light gray (#f5f5f5) with no border.
    - Or match Campus Web patterns (need to check)
  - **Line width** (line 54): Current max-width is `min(80%, 600px)`. For 12-15 words per line at standard font size (~8px per character average, ~65 characters = ~13 words), target ~520px max or narrower.
    - Change to: `maxWidth: "min(75%, 520px)"`

- `src/components/explorer/CommentCard.tsx` (the thread viewer comments, NOT AI chat):
  - Check if this component also needs width constraints
  - This is the component that renders student conversation comments in the thread viewer

**Tests impacted:**
- `ChatMessageBubble.test.tsx` test 4: "caps message width at min(80%, 600px)" — **UPDATE** to match new max-width

**Risk: LOW** — CSS changes only.

---

### 4.4 TORI Visualizations for Student Profile (Delta Heatmap, Sparklines, Slope Chart)

**PREREQUISITE:** The `GET_STUDENT_PROFILE` query currently returns `toriTagDistribution` as aggregate counts. For time-series visualizations, we need **per-assignment TORI tag data**.

**Backend changes needed:**
- `src/server/services/analytics/student-profile.ts`: Add per-assignment TORI tag breakdown to the response
- Schema: Add `perAssignmentToriTags` field to `StudentProfileReport` type
- Return structure: `{ assignmentId, assignmentName, date, tags: [{ tagId, tagName, count }] }`

**New components (in `src/pages/StudentProfilePage.tsx` or extracted):**

1. **Delta Heatmap:** TORI tags on Y-axis, assignments on X-axis, color = period-to-period change (green = increase, red = decrease)
2. **Sparklines:** One mini-chart per TORI tag, stacked vertically, showing count over time
3. **Slope Chart:** Lines connecting first assignment value to last assignment value for top-N tags

**Tests needed:**
- Backend: Unit test for per-assignment TORI tag aggregation
- Frontend: Unit tests for each new visualization component (rendering with mock data)
- `StudentProfilePage.test.tsx`: Update mock to include new data structure

**Risk: HIGH** — New backend query extension + 3 new visualization components.

---

### Phase 4 Testing Summary

| Item | Tests Break | New Tests Needed | Browser Verify |
|------|------------|-----------------|----------------|
| 4.1 TORI Network | None | 3 unit tests | Hover node → label appears. Legend shows all tags. Click legend → evidence. |
| 4.2 Summary sparkline | None | 2 unit tests | Sparkline mode shows "All Students" summary row at top/bottom |
| 4.3 Conversation rendering | `ChatMessageBubble.test.tsx` (1 test) | Update 1 test | Comments narrower. Colors distinct. 12-15 words per line. |
| 4.4 TORI visualizations | `StudentProfilePage.test.tsx` (mock update) | 3+ new tests + 1 backend test | Delta heatmap, sparklines, slope chart render on student profile |

---

## Phase 5 — AI Chat Scope Rework

### 5.1 Institutional Isolation (CRITICAL — do first)

**Database migration (new file: `src/server/migrations/{timestamp}-AddInstitutionIdToChatSession.ts`):**
```sql
-- Up
ALTER TABLE chat_session ADD COLUMN "institutionId" varchar;
UPDATE chat_session cs SET "institutionId" = (
  SELECT u."institutionId" FROM "user" u WHERE u.id = cs."userId"
);
ALTER TABLE chat_session ALTER COLUMN "institutionId" SET NOT NULL;

-- Down  
ALTER TABLE chat_session DROP COLUMN "institutionId";
```

**Entity change:**
- `src/server/entities/ChatSession.ts`: Add `institutionId` column (varchar, non-nullable)

**Resolver changes:**
- `src/server/resolvers/chat.ts`:
  - `chatSessions` query: Add `institutionId` filter from auth context
  - `createChatSession`: Set `institutionId` from the current scope's institutionId
  - All other mutations: Verify `session.institutionId` matches user's current institution

**Client changes:**
- `src/lib/queries/chat.ts`: Add `$institutionId` variable to `GET_CHAT_SESSIONS`
- `src/components/ai/AiChatPanel.tsx`: Pass `institutionId` from scope when querying sessions and creating sessions

**Tests needed:**
- Migration test: Verify column added, data backfilled
- Resolver test: `chatSessions` returns only sessions for matching institutionId
- Resolver test: `createChatSession` saves institutionId
- Resolver test: Cross-institution access denied
- Service test: `buildContext` respects institutional boundaries

**Tests impacted:**
- `chat.test.ts`: Mock auth context already includes `institutionId` (line 54). Need to add institutionId to mock sessions and verify filtering.

**Risk: HIGH** — Database migration in production. Must test migration rollback. Must verify existing sessions get correct institutionId.

---

### 5.2 New Scope Model (3-axis)

**Files to change:**
- `src/server/entities/ChatSession.ts`: Keep existing `scope` enum but reinterpret
  - SELECTION → specific student + assignment
  - COURSE → all students in course (optionally filtered to assignment)
  - CROSS_COURSE → all courses in institution

- `src/components/ai/AiChatPanel.tsx` (lines 280-304):
  - Replace 3-toggle with clearer UI showing current scope
  - Auto-detect from page context
  - Allow manual override

**Context clearing on scope change:**
- When scope changes, call a new mutation `clearChatContext(sessionId)` or simply create a new session
- Add visible divider in chat transcript: "Context changed to: This course — AI context cleared"
- Clear `scopeDividers` state and add the new one

**Tests needed:**
- Unit test: Scope auto-detection from page context
- Unit test: Scope change adds divider
- Service test: Context rebuilt from new scope after change

**Risk: MODERATE** — UI changes with backend implications.

---

### 5.3 Chat History UI Redesign

**Decision from critique review:** Since AI Chat is now a tab in the Faculty Panel, the chat history should be an inline section within that tab, not a modal.

**Files to change:**
- `src/components/ai/ChatHistory.tsx`: Refactor to work as an expandable section within the panel tab
- `src/components/ai/AiChatPanel.tsx`: Remove `showHistory` toggle in favor of always-visible compact list or expandable section

**Tests needed:**
- Unit test: Chat history renders inline within panel
- Unit test: Session selection works

**Risk: LOW** — UI restructuring.

---

### Phase 5 Testing Summary

| Item | Tests Break | New Tests Needed | Browser Verify |
|------|------------|-----------------|----------------|
| 5.1 Institutional isolation | `chat.test.ts` (updates needed) | 5+ new tests | Login as admin → switch institutions → verify chat list changes |
| 5.2 Scope model | None | 3+ new tests | Change scope → divider appears → AI uses new context |
| 5.3 Chat history redesign | None | 2 new tests | History visible inline in panel tab. Select session. |

---

## Phase 6 — Final Testing & Verification

### E2E Tests to Update

| Test File | Changes |
|-----------|---------|
| `e2e/insights.spec.ts` | Add: Click student name → panel opens. Click evidence → thread in panel. (requires auth — may need to remain skipped or add auth fixture) |
| `e2e/chat.spec.ts` | Add: Single-click student selection. Verify no multi-select. Panel integration. |
| `e2e/cross-course.spec.ts` | No changes needed (button hidden, page still accessible) |
| `e2e/student-profile.spec.ts` | Add: Panel shows same content as full page |

### New E2E Tests

| Test | What It Verifies |
|------|-----------------|
| Panel persistence across navigation | Open panel on Insights → navigate to Chat Explorer → panel still open |
| Panel tab switching | Open Student tab → click thread → Thread tab → click student name → Student tab |
| Institutional chat isolation | (Requires admin auth) Switch institution → chat list changes |

### Browser Verification Master Checklist

**Insights Page:**
- [ ] SmartRecommendations section gone
- [ ] TextSignals section gone
- [ ] Compare Courses button gone (All Courses context)
- [ ] Reflection Depth always visible (no toggle)
- [ ] Section order: DepthBands before StudentEngagement
- [ ] Heatmap defaults to ROW scaling
- [ ] Growth defaults to Matrix view
- [ ] Student names display correctly in Growth (not "Student")
- [ ] Click student name anywhere → panel opens to Student Profile
- [ ] Click evidence → panel opens to Thread
- [ ] DepthBands table rows have hover state and are clickable
- [ ] Comment count in Engagement table is clickable → shows evidence
- [ ] Tag chips in Engagement table are clickable → shows filtered evidence
- [ ] Info button removed from Engagement table
- [ ] TORI Network: no default labels, hover shows tooltip, legend below
- [ ] Summary sparkline row in heatmap sparkline mode

**Faculty Panel:**
- [ ] Three tabs: Student Profile, Thread, AI Chat
- [ ] Student Profile tab shows same content as full page
- [ ] Thread tab shows conversation comments
- [ ] Chat tab shows AI chat with session management
- [ ] Tab switching works
- [ ] Back button works
- [ ] Close button works
- [ ] Panel pushes content left on desktop
- [ ] Panel stacks below on mobile
- [ ] Panel persists across page navigation

**Chat Explorer:**
- [ ] Single-click selects student (no multi-select)
- [ ] Shift+click does nothing special
- [ ] "Analyze" opens Faculty Panel to Chat tab
- [ ] Comment bubbles: max 12-15 words per line
- [ ] Comment colors: distinct differentiation between AI and student
- [ ] Student list shows when "All Courses" selected (paginated, first 50)

**AI Chat:**
- [ ] Chats scoped to institution (admin: switching institution shows different chats)
- [ ] Scope selector shows current context
- [ ] Scope change adds visible divider in transcript
- [ ] Scope change clears AI context
- [ ] Chat history accessible inline within panel tab
- [ ] Create new chat works
- [ ] Switch between existing chats works
- [ ] Delete chat works

**Student Profile Page (full page):**
- [ ] Still accessible at `/insights/student/:studentId`
- [ ] Same content as panel version
- [ ] New TORI visualizations: Delta Heatmap, Sparklines, Slope Chart
- [ ] Thread list clickable → opens in Faculty Panel

---

## Risk Summary by Phase

| Phase | Risk Level | Reason |
|-------|-----------|--------|
| Phase 1 | LOW | Independent removals and default changes. No shared state. |
| Phase 2 | **HIGH** | New global state, AppShell layout change, 2 core page refactors, callback interface changes across 7+ components |
| Phase 3 | LOW-MODERATE | Click handler additions, one schema change (tag IDs) |
| Phase 4 | MODERATE-HIGH | New backend query extension, 3 new visualization components, SVG refactoring |
| Phase 5 | **HIGH** | Database migration, institutional isolation (data safety), scope model rework |
| Phase 6 | LOW | Testing and verification only |

---

## Estimated New/Modified Test Count

| Category | New Tests | Modified Tests |
|----------|----------|---------------|
| Unit tests (frontend) | ~25 | ~5 |
| Unit tests (backend) | ~8 | ~3 |
| E2E tests | ~5 | ~3 |
| **Total** | **~38** | **~11** |
