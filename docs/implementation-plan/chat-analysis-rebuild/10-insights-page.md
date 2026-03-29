# Phase 10 — Insights & Visualization Page

Phases 01-09 built the backend (PostgreSQL schema, GraphQL API, TORI tagging pipeline, consent system) and the frontend shell (Digication-style dark sidebar, MUI dark theme, Apollo Client, and authentication). All GraphQL resolvers for courses, assignments, students, threads, comments, and TORI tags are functional. The consent filtering middleware ensures that excluded students never surface in any query. This phase builds the primary analytics dashboard where instructors explore patterns in student reflections across courses and assignments.

## Goal

Create a scrollable Insights page with a course/assignment scope selector, a smart recommendations panel that surfaces the most informative visualizations based on the current data, and five analytics sections (metrics cards, heatmap, network graph, depth bands, co-occurrence list). All components are consent-aware and query GraphQL with the active scope.

## Implementation

### 1. Scope Selector — `src/components/insights/ScopeSelector.tsx`

A breadcrumb-style picker at the top of the page: **Institution > Course > Assignment**, or **"All Courses"** for aggregate views.

- Fetch available courses with `useQuery(GET_COURSES)`.
- When a course is selected, fetch its assignments with `useQuery(GET_ASSIGNMENTS, { variables: { courseId } })`.
- Store the current scope in a React context (`InsightsScopeContext`) so all child components can read `{ courseId, assignmentId }` without prop drilling.
- Breadcrumb segments are clickable — clicking "Institution" resets to the aggregate view, clicking a course name clears the assignment selection.
- Use MUI `Breadcrumbs` with `Menu` dropdowns for each segment.

### 2. Smart Recommendations — `src/components/insights/SmartRecommendations.tsx`

A card below the scope selector that highlights 2-3 of the most informative views based on the current data.

- Query the recommendations analytics endpoint: `useQuery(GET_RECOMMENDATIONS, { variables: { courseId, assignmentId } })`.
- The backend analyzes the data and returns recommendation objects: `{ type: string, title: string, reason: string, action: string }`.
- Example recommendations:
  - "Strong clustering pattern detected — try the Clustered Heatmap view"
  - "3 students show significant growth — check the Cross-Course Comparison"
  - "High co-occurrence between Evidence and Perspective-Taking — explore the Network Graph"
- Each recommendation card has a "View" button that scrolls to the relevant section and applies the suggested configuration (e.g., switches heatmap to CLUSTERED mode).
- Use MUI `Card` with `CardContent` and `CardActions`. Display in a horizontal row with `Stack direction="row"`.
- If no recommendations are available (too little data), show a helpful message: "Upload more data to unlock smart recommendations."

### 3. Metrics Cards — `src/components/insights/MetricsCards.tsx`

A row of summary statistic cards at the top of the dashboard sections.

- Query: `useQuery(GET_ANALYTICS_METRICS, { variables: { courseId, assignmentId } })`.
- Display 6 cards in a responsive `Grid`:
  - **Thread Count** — total threads in scope
  - **Participants** — unique students with at least one comment
  - **Comment Count** — total comments across all threads
  - **Word Count** — total words across all comments
  - **TORI Tag Count** — total tags applied
  - **Date Range** — earliest to latest comment date
- Each card: MUI `Card` with a large number, a label, and an optional trend indicator (up/down arrow if comparing to previous period).
- Cards are responsive: 6 across on desktop, 3 across on tablet, 2 across on mobile.

### 4. Heatmap View — `src/components/insights/HeatmapView.tsx` and `src/components/insights/HeatmapControls.tsx`

A Student x TORI Tag matrix visualization with 3 display modes and 3 scaling modes.

**Display modes** (controlled by `HeatmapControls`):
- **CLASSIC** — standard colored cells, color intensity represents count/frequency.
- **CLUSTERED** — rows and columns reordered by hierarchical clustering to reveal student groups with similar TORI profiles.
- **DOT** — each cell shows a dot whose size represents count, useful for sparse data.

**Scaling modes**:
- **RAW** — absolute counts in each cell.
- **ROW** — each row (student) normalized to 0-1 so you see relative distribution across tags.
- **GLOBAL** — all cells normalized against the global max so you see absolute magnitude.

**Implementation details:**
- Query: `useQuery(GET_HEATMAP_DATA, { variables: { courseId, assignmentId, mode, scaling } })`.
- Render with an HTML `<table>` or SVG for performance with large student sets (up to 200 students x 15 TORI tags).
- For CLUSTERED mode, the backend returns pre-computed cluster ordering and cluster group IDs so the frontend only needs to reorder rows.
- Color scale: use a sequential palette (light yellow to deep blue) via a utility function `getHeatmapColor(value, min, max)`.
- DOT mode: SVG circles within each cell, radius proportional to value.
- `HeatmapControls` is a toolbar above the heatmap with toggle button groups for mode and scaling.
- Tooltips on hover showing: student name (or initials if PII-restricted), TORI tag name, raw count, and scaled value.
- Consent-aware: excluded students are never returned by the backend, so no frontend filtering needed.

### 5. TORI Network Graph — `src/components/insights/ToriNetworkGraph.tsx`

An SVG circular layout showing relationships between TORI tags based on co-occurrence.

- Query: `useQuery(GET_TORI_NETWORK, { variables: { courseId, assignmentId } })`.
- Returns: nodes (TORI tags with counts) and edges (tag pairs with co-occurrence weight).
- Layout: circular arrangement of nodes (one circle per TORI tag), positioned evenly around a circle.
- Node size proportional to total usage count.
- Edge thickness proportional to co-occurrence weight. Only show edges above a minimum threshold (configurable via slider).
- Community colors: if the backend detects tag communities (groups of tags that frequently co-occur), color the nodes accordingly.
- Interaction: hover a node to highlight its edges, click a node to filter the heatmap by that tag.
- Render as inline SVG within a fixed-height container (400px). Use `d3` only for layout math, not for DOM manipulation — keep React in control of rendering.

### 6. Depth Bands — `src/components/insights/DepthBands.tsx`

A horizontal stacked bar chart showing the distribution of reflection depth across students.

- Query: `useQuery(GET_DEPTH_DISTRIBUTION, { variables: { courseId, assignmentId } })`.
- Three bands: **Surface**, **Developing**, **Deep** — each with a distinct color.
- Display as a single stacked bar (percentage-based) with labels showing count and percentage.
- Below the bar, show a breakdown table: depth level, count, percentage, example TORI tags in that depth.
- Depth classification is determined by the backend based on TORI tag combinations.

### 7. Co-Occurrence List — `src/components/insights/CoOccurrenceList.tsx`

A ranked list of TORI tag pairs and triples that appear together most frequently.

- Query: `useQuery(GET_COOCCURRENCE, { variables: { courseId, assignmentId, minCount: 2 } })`.
- Returns: array of `{ tags: string[], count: number, percentage: number }`.
- Display as a list with:
  - Tag chips (using `ToriChip` shared component) for each tag in the combination.
  - Count badge.
  - A small bar showing relative frequency.
- Sort by count descending.
- Limit to top 20 by default with a "Show more" button.
- Clicking a co-occurrence pair filters the heatmap to highlight students who exhibit that combination.

### 8. Insights Page — `src/pages/InsightsPage.tsx`

The page component that assembles all the above sections.

- Wrap in `InsightsScopeProvider` to share scope state.
- Layout structure:
  ```
  <InsightsScopeProvider>
    <ScopeSelector />
    <SmartRecommendations />
    <MetricsCards />
    <HeatmapView />
    <ToriNetworkGraph />
    <DepthBands />
    <CoOccurrenceList />
  </InsightsScopeProvider>
  ```
- Each section wrapped in a MUI `Paper` with consistent padding and section titles.
- Add section IDs (`id="heatmap"`, `id="network"`, etc.) so the recommendations panel can scroll to them.
- Loading states: each section shows its own skeleton loader while its query is in flight.
- Error states: each section handles its own errors with a retry button.

### 9. GraphQL Query Documents — `src/lib/queries/analytics.ts`

All GraphQL queries used by the Insights components:

```typescript
// Scope queries
export const GET_COURSES = gql`...`;
export const GET_ASSIGNMENTS = gql`...`;

// Recommendations
export const GET_RECOMMENDATIONS = gql`...`;

// Metrics
export const GET_ANALYTICS_METRICS = gql`...`;

// Heatmap
export const GET_HEATMAP_DATA = gql`...`;

// Network
export const GET_TORI_NETWORK = gql`...`;

// Depth
export const GET_DEPTH_DISTRIBUTION = gql`...`;

// Co-occurrence
export const GET_COOCCURRENCE = gql`...`;
```

Each query accepts `courseId: ID` and `assignmentId: ID` as optional variables. When both are null, the query returns aggregate data across all courses.

## Files to Create

| File | Purpose |
|---|---|
| `src/pages/InsightsPage.tsx` | Page component assembling all insight sections |
| `src/components/insights/MetricsCards.tsx` | Summary statistic cards row |
| `src/components/insights/HeatmapView.tsx` | Student x TORI tag matrix with 3 display modes |
| `src/components/insights/HeatmapControls.tsx` | Mode and scaling toggle toolbar for the heatmap |
| `src/components/insights/ToriNetworkGraph.tsx` | SVG circular co-occurrence network graph |
| `src/components/insights/DepthBands.tsx` | Surface/Developing/Deep distribution bar |
| `src/components/insights/CoOccurrenceList.tsx` | Ranked tag pair/triple co-occurrence list |
| `src/components/insights/SmartRecommendations.tsx` | AI-driven recommendations panel |
| `src/components/insights/ScopeSelector.tsx` | Course/assignment breadcrumb scope picker |
| `src/lib/queries/analytics.ts` | GraphQL query documents for all analytics data |

## Verification

- [ ] ScopeSelector renders breadcrumbs and updates context when course/assignment is selected
- [ ] SmartRecommendations displays 2-3 recommendations and scrolls to the relevant section on click
- [ ] MetricsCards show correct counts for the selected scope with loading skeletons
- [ ] HeatmapView renders in all 3 modes (CLASSIC, CLUSTERED, DOT) and all 3 scaling modes (RAW, ROW, GLOBAL)
- [ ] HeatmapControls toggle between modes and scaling without full re-render
- [ ] ToriNetworkGraph displays circular node layout with weighted edges and hover highlighting
- [ ] DepthBands shows correct percentage distribution with stacked bar
- [ ] CoOccurrenceList ranks tag pairs by count and supports "Show more"
- [ ] All components display loading skeletons while queries are in flight
- [ ] All components handle GraphQL errors gracefully with retry buttons
- [ ] Excluded students never appear in any visualization (consent enforcement)
- [ ] Changing scope in ScopeSelector triggers refetch of all downstream queries
- [ ] Page is responsive: cards reflow on tablet/mobile, heatmap scrolls horizontally on small screens
- [ ] Recommendations "View" button scrolls to the correct section and applies suggested config
