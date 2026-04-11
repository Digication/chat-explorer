# Phase 7 — Browser Usability Tests (Chrome MCP)

**Context:** All unit, integration, and E2E tests are written. This phase exercises the LIVE running app via Chrome MCP to catch runtime issues that other tests miss: broken imports, GraphQL query errors, missing data states, CSS rendering, and real user interaction flows.

## Why This Phase Exists

Unit tests mock everything — they test logic but not whether the app actually works. E2E tests are mostly skipped (no auth). Browser usability tests fill the gap: navigate real pages as a logged-in user, read the DOM, check for errors, and interact with UI elements.

These tests are NOT written to a file — they're executed interactively via Chrome MCP tools during this phase. The output is a verification report.

## Prerequisites

- App running: `docker compose up -d --build`
- Caddy running: app accessible at `https://chat-explorer.localhost`
- Chrome MCP extension connected
- User logged in (navigate to app, ensure auth session exists)

## Verification Checklist (~20 checks)

### Page Load & Console Errors (8 checks)

For each page, navigate via Chrome MCP, then:
- `read_page` to verify key elements rendered
- `read_console_messages` to check for errors

1. **Insights page** (`/insights`) — verify heading, course selector, analytics cards or empty state. No console errors.
2. **Chat Explorer** (`/explorer`) — verify bottom bar renders, student carousel present. No console errors.
3. **Reports page** (`/reports`) — verify 3 report cards, Generate buttons. No console errors.
4. **Upload page** (`/upload`) — verify upload area renders. No console errors.
5. **Settings page** (`/settings`) — verify settings content. No console errors.
6. **Admin page** (`/admin`) — verify admin tabs (Users, Course Access, Institutions). No console errors.
7. **Student Profile** (`/insights/student/<id>`) — navigate to a real student profile (find a student link on insights page). Verify name, sparkline, category donut. No console errors.
8. **Cross-Course Comparison** (`/insights/compare`) — verify course picker. No console errors.

### Interactive Flows (7 checks)

9. **Sidebar navigation works** — click each sidebar icon, verify the page changes. No broken routes.
10. **Export dialog opens and closes** — click Generate on Reports page → dialog opens with format picker + course selector → click Cancel → dialog closes.
11. **PDF export flow** — select a course, click Generate with PDF format → verify "Export ready!" appears (no errors).
12. **CSV export flow** — switch to CSV format, Generate → verify "Export ready!" appears.
13. **Course selector on Insights** — if course dropdown exists, open it, verify courses load.
14. **Student name links to profile** — if engagement table has student names, click one → navigates to student profile page.
15. **AI Chat panel** — if chat panel toggle exists in explorer, click it → verify chat panel opens.

### Data Integrity (5 checks)

16. **Insights page shows non-zero data** — if courses with data exist, verify metrics cards show actual numbers (not all zeros).
17. **Reports preview loads** — in export dialog with course selected, verify the preview section shows student count, comment count.
18. **Admin users table loads** — navigate to admin → Users tab → verify at least 1 user row appears.
19. **No GraphQL errors in network** — after exercising all pages, check `read_network_requests` for any failed GraphQL calls (4xx/5xx responses).
20. **No unhandled promise rejections** — check console for "Unhandled" or "rejection" messages across all pages.

## Execution

This phase is executed interactively, not via a test runner. The implementing agent should:

1. Navigate to each page using `navigate` tool
2. Read the page using `read_page` with `filter: "all"`
3. Check console using `read_console_messages` with `onlyErrors: true`
4. Interact using `javascript_tool` for clicking buttons, opening dropdowns
5. Document each check as PASS/FAIL with a brief note

## Output Format

Produce a verification report:

```
## Browser Usability Report

### Page Loads
| # | Page | Elements Found | Console Errors | Status |
|---|------|---------------|----------------|--------|
| 1 | Insights | heading, cards | none | PASS |
| 2 | Explorer | bottom bar, carousel | none | PASS |
...

### Interactive Flows
| # | Flow | Result | Status |
|---|------|--------|--------|
| 9 | Sidebar nav | all 6 pages accessible | PASS |
...

### Data Integrity
| # | Check | Result | Status |
|---|-------|--------|--------|
| 16 | Non-zero insights | 120 comments shown | PASS |
...

### Summary
- Checks: X/20 passed
- Issues found: [list any]
```

## When done

Report the browser usability results. If any issues are found, note them but do NOT fix them in this phase — this is a testing phase only. File bugs or follow-up tasks for any issues discovered.
