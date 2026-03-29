# Phase 11 — Chat Explorer Page

Phases 01-10 built the backend (PostgreSQL, GraphQL API, TORI tagging, consent system), the frontend shell (Digication-style dark sidebar, MUI theme, Apollo Client, auth), and the Insights page with analytics visualizations. All GraphQL queries for students, threads, comments, and TORI tags are available and consent-filtered. This phase builds the Chat Explorer page where instructors read student conversations, browse by student, filter by TORI tags, and see consent status — using a layout modeled after Digication's review submission pattern with a bottom bar and slide-out panels.

## Goal

Create the Chat Explorer page with a full-width thread view, a fixed bottom bar containing a student carousel, and two slide-out panels (student list from the left, AI chat placeholder from the right). All student data respects consent filtering. TORI tag filters in the header let instructors narrow comments by reflection category.

## Implementation

### 1. Shared Components

These small components are used across both the Chat Explorer and Insights pages.

**`src/components/shared/ConsentBadge.tsx`**
- Displays a student's consent status as a small colored badge.
- Three variants: `Included` (green), `Excluded` (red), `Partial` (yellow — included in some courses but not others).
- Props: `status: 'included' | 'excluded' | 'partial'`.
- Use MUI `Chip` with `size="small"` and appropriate color.

**`src/components/shared/ToriChip.tsx`**
- Displays a TORI tag as a styled chip.
- Props: `tag: string`, `highlighted?: boolean`, `onClick?: () => void`.
- When `highlighted` is true, the chip uses a brighter background to indicate it matches an active filter.
- Color-coded by TORI category (each tag has an assigned color from a palette).

**`src/components/shared/UserAvatar.tsx`**
- Displays a student avatar with their initials.
- Props: `name: string`, `size?: 'small' | 'medium' | 'large'`, `selected?: boolean`.
- Generates a deterministic background color from the student's name (hash the name to pick from a palette).
- When `selected` is true, show a highlight ring around the avatar.
- Use MUI `Avatar`.

### 2. TORI Filters — `src/components/explorer/ToriFilters.tsx`

A filter bar in the header area for narrowing comments by TORI tag.

- Render as a row of searchable, multi-select chips.
- Fetch available TORI tags for the current scope with `useQuery(GET_TORI_TAGS, { variables: { courseId, assignmentId } })`.
- Each tag rendered as a `ToriChip` that toggles on click.
- Include a search input to filter the tag list when there are many tags.
- Active filters stored in a React context (`ExplorerFilterContext`) so the ThreadView can access them.
- "Clear all" button resets filters.
- Show count badge on each chip indicating how many comments have that tag in the current scope.

### 3. Thread View — `src/components/explorer/ThreadView.tsx`

The main content area showing the selected student's conversation thread(s). Takes full width of the page for maximum readability.

- Query: `useQuery(GET_STUDENT_THREADS, { variables: { studentId, courseId, assignmentId } })`.
- If the student has multiple threads in scope, display them in chronological order with a thread separator.
- Each thread shows a title bar with the thread name and date range.
- Comments rendered as `CommentCard` components in sequence.
- When TORI filters are active (from `ExplorerFilterContext`), comments that match are shown at full opacity and non-matching comments are dimmed (opacity 0.4) but still visible for context.
- Empty state: "Select a student from the bottom bar to view their conversations."

**`src/components/explorer/CommentCard.tsx`**
- Displays a single comment with role-based styling.
- Props: `comment: Comment`, `highlighted: boolean`.
- Role-based backgrounds:
  - `USER` (student): light blue background (`#e3f2fd`)
  - `ASSISTANT` (AI): light purple background (`#f3e5f5`)
  - `SYSTEM`: light green background (`#e8f5e9`)
- Show the commenter's name/role, timestamp, and comment text.
- TORI tags shown as `ToriChip` components below the comment text (only on USER comments).
- When `highlighted` is true (comment matches active TORI filters), show at full opacity with a subtle left border accent.
- When not highlighted and filters are active, reduce opacity.

### 4. Bottom Bar — `src/components/explorer/BottomBar.tsx`

A 60px fixed bar at the bottom of the page with dark theme styling. Contains three zones.

- **Left zone**: A button that opens the StudentListPanel. Shows an icon (people icon) and label "Students". Badge shows total student count.
- **Center zone**: The `StudentCarousel` component.
- **Right zone**: A button that opens the AiChatPanel. Shows an icon (chat icon) and label "AI Chat". This panel is a placeholder in this phase — the actual AI chat is built in Phase 12.
- Use MUI `AppBar` positioned at bottom with `position="fixed"` and `sx={{ top: 'auto', bottom: 0, height: 60 }}`.
- Background matches the dark sidebar theme.
- Z-index above page content but below slide-out panels.

### 5. Student Carousel — `src/components/explorer/StudentCarousel.tsx` and `src/components/explorer/StudentCarouselItem.tsx`

A horizontal sliding window of student avatars in the center of the bottom bar.

- Query: `useQuery(GET_STUDENTS, { variables: { courseId, assignmentId, consentStatus: 'INCLUDED' } })`.
- Display approximately 5 students at a time with left/right arrow buttons for navigation.
- Each student rendered as a `StudentCarouselItem`.
- The selected student is highlighted (larger avatar, name visible below).
- Clicking a student avatar selects them and loads their threads in ThreadView.
- Arrow buttons scroll the window by 1 student at a time with a smooth CSS transition.
- On small screens, show 3 students instead of 5.

**`StudentCarouselItem`**:
- Shows `UserAvatar` with the student's initials.
- Below the avatar: thread count badge (small MUI `Badge`).
- When selected: avatar is slightly larger, name text appears below, highlight ring on avatar.

### 6. Student List Panel — `src/components/explorer/StudentListPanel.tsx`

A slide-out panel that enters from the bottom-left, anchored to the top of the bottom bar.

- Uses MUI `Drawer` with `anchor="left"` and a custom `Slide` transition (direction="right" — enters from the left side).
- Panel height: from top of bottom bar to top of viewport. Width: 360px on desktop, full width on mobile.
- Set `sx={{ bottom: 60 }}` to anchor above the bottom bar.

**Panel contents:**
- **Search bar** at the top: filters students by name.
- **Filter toggle**: "All" / "Included" / "Excluded" tabs or segmented control.
- **Student list**: scrollable list of student rows, each showing:
  - `UserAvatar` (small)
  - Student name
  - Comment count
  - Top 2-3 TORI tags as small `ToriChip` components
  - `ConsentBadge` showing their consent status
- **Expandable rows**: clicking the expand arrow on a row reveals course-level consent toggles (read-only display of which courses the student is included/excluded from).
- Clicking a student row selects them (closes the panel on mobile, keeps it open on desktop) and loads their threads.

**`src/components/explorer/ConsentToggle.tsx`**
- Read-only display of a student's consent status per course.
- Shows a list of courses with a green check or red X next to each.
- Used inside the expandable row of the StudentListPanel.

### 7. Panel Behavior and Responsive Design

- Both panels (StudentListPanel and AiChatPanel) use MUI `Portal` to render outside the main content tree.
- Panels anchor to `bottom: 60px` (above the bottom bar).
- **Wide screens (> 1200px)**: both panels can be open simultaneously. Main content area adjusts its margins: `marginLeft: studentPanelOpen ? 360 : 0`, `marginRight: aiPanelOpen ? 400 : 0`.
- **Narrow screens (< 1200px)**: opening one panel closes the other. Use a `useResponsiveTab` hook that tracks which panel (if any) is open and enforces the single-panel constraint.
- Panel open/close state managed in `ExplorerPanelContext`.
- Transition animations: 300ms ease-in-out.

### 8. Chat Explorer Page — `src/pages/ChatExplorerPage.tsx`

The page component that assembles all explorer components.

- Wrap in context providers: `ExplorerFilterProvider`, `ExplorerPanelProvider`, `InsightsScopeProvider` (reused from Phase 10).
- Layout structure:
  ```
  <ExplorerFilterProvider>
    <ExplorerPanelProvider>
      <InsightsScopeProvider>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          {/* Header */}
          <ScopeSelector />
          <ToriFilters />

          {/* Main content — full width, scrollable */}
          <Box sx={{ flex: 1, overflow: 'auto', pb: '60px' }}>
            <ThreadView />
          </Box>

          {/* Bottom bar — fixed */}
          <BottomBar />

          {/* Slide-out panels — portaled */}
          <StudentListPanel />
          <AiChatPanel />  {/* placeholder for Phase 12 */}
        </Box>
      </InsightsScopeProvider>
    </ExplorerPanelProvider>
  </ExplorerFilterProvider>
  ```
- The main content area has `paddingBottom: 60px` to prevent content from being hidden behind the bottom bar.

### 9. GraphQL Query Documents — `src/lib/queries/explorer.ts`

```typescript
export const GET_STUDENTS = gql`...`;           // students in scope with consent status
export const GET_STUDENT_THREADS = gql`...`;     // threads and comments for a specific student
export const GET_TORI_TAGS = gql`...`;           // available TORI tags in scope with counts
```

Each query accepts `courseId` and `assignmentId` as optional variables for scope filtering.

## Files to Create

| File | Purpose |
|---|---|
| `src/pages/ChatExplorerPage.tsx` | Page component assembling the explorer layout |
| `src/components/explorer/BottomBar.tsx` | Fixed 60px dark bottom bar with three zones |
| `src/components/explorer/StudentCarousel.tsx` | Horizontal sliding student avatar strip |
| `src/components/explorer/StudentCarouselItem.tsx` | Individual student avatar in the carousel |
| `src/components/explorer/StudentListPanel.tsx` | Slide-out student list panel from left |
| `src/components/explorer/ThreadView.tsx` | Full-width thread/comment display area |
| `src/components/explorer/CommentCard.tsx` | Single comment with role-based styling and TORI chips |
| `src/components/explorer/ToriFilters.tsx` | Searchable multi-select TORI filter chips |
| `src/components/explorer/ConsentToggle.tsx` | Read-only per-course consent display |
| `src/components/shared/ConsentBadge.tsx` | Included/Excluded/Partial status badge |
| `src/components/shared/ToriChip.tsx` | Styled chip for a TORI tag |
| `src/components/shared/UserAvatar.tsx` | Initial-based avatar with deterministic color |
| `src/lib/queries/explorer.ts` | GraphQL queries for students, threads, and tags |

## Verification

- [ ] ScopeSelector (reused from Phase 10) works correctly on the Chat Explorer page
- [ ] ToriFilters render all available tags with counts and support multi-select
- [ ] Selecting a TORI filter dims non-matching comments in ThreadView
- [ ] ThreadView displays comments with correct role-based backgrounds (blue/purple/green)
- [ ] TORI chips appear on student comments and highlight when matching active filters
- [ ] BottomBar renders fixed at the bottom with 60px height and dark theme
- [ ] StudentCarousel shows ~5 students, arrow navigation works, selected student is highlighted
- [ ] Clicking a carousel avatar loads that student's threads in ThreadView
- [ ] StudentListPanel slides in from the left with search, filter tabs, and consent badges
- [ ] Expanding a student row in the list shows per-course consent toggles
- [ ] ConsentBadge correctly shows Included (green), Excluded (red), or Partial (yellow)
- [ ] On wide screens (> 1200px), both panels can be open simultaneously with content margins adjusting
- [ ] On narrow screens (< 1200px), opening one panel closes the other
- [ ] Panel animations are smooth (300ms Slide transitions)
- [ ] Excluded students never appear in the student list or carousel
- [ ] Empty state shown when no student is selected ("Select a student from the bottom bar")
- [ ] AI Chat button in the bottom bar opens a placeholder panel (ready for Phase 12)
- [ ] Page is responsive: carousel shows fewer items on mobile, panels go full-width
