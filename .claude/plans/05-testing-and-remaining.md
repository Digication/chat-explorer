# Plan 5 — Testing & Remaining Work

**Status:** In progress (items 4 + 7 done; items 1-2 partially done; items 3, 5, 6 not started)
**Priority:** Last — execution order is Plan 1 -> 3 -> 4 -> 2 -> **5**
**Depends on:** All other plans

## Why this plan exists

Important infrastructure and coverage gaps that can wait until the product itself is in a better conceptual place. These items are individually significant but don't block the demo or deployment the way Plans 1-4 do.

## Features

### 1. E2E Tests — PARTIALLY DONE

11 Playwright specs exist (admin, login, student-profile, cross-course) covering auth redirects and basic page loads. Still missing full-stack flows: upload a CSV → verify it appears in explorer → check insights render → verify AI chat works.

### 2. Unit Test Coverage — PARTIALLY DONE

122 tests pass across 22 files. Coverage gained during Plans 1-4 + Plan 5.4:
- ✅ Admin resolvers (48 tests), admin components (29 tests)
- ✅ CSV parser (3 tests)
- ✅ Analytics utils — modalOf, emptyCategoryDistribution (7 tests)
- ✅ Student profile page (9 component tests)
- ✅ Cross-course comparison page (4 component tests)
- ✅ Network graph, tag frequencies, bottom bar, carousel, sidebar, auth, login, admin page

Still missing dedicated unit tests for:
- Analytics services (engagement, growth, heatmap, instructional-insights, recommendations, text-signals, TORI frequency)
- TORI extractor
- Consent service
- Deduplication logic
- LLM provider abstraction
- AI chat service
- Export/PDF service
- Student profile backend service
- Cross-course backend service

### 3. PDF Export

The export-pdf service exists but is not fully wired up to the UI. Need to:
- Connect the "Export" button to the PDF generation endpoint
- Verify the report includes all current analytics sections (including the new Hatton & Smith categories from Plan 3)
- Handle large reports gracefully

### 4. Student Profile & Cross-Course Comparison Reports — ✅ DONE

Shipped in commit `a25903c` (2026-04-11). See `.claude/plans/05-4-student-profile-cross-course.md` for full details.
- **Student Profile** (`/insights/student/:studentId`): summary cards, reflection sparkline, category donut, TORI tag bars, evidence highlights, thread panel
- **Cross-Course Comparison** (`/insights/compare`): course picker, side-by-side metrics table, stacked bar category distribution
- Navigation wired: student names in Engagement table + Growth visualization link to profiles; "Compare Courses" button on Insights page (institution-level)

### 5. LLM Model Picker

Currently a stub in the UI. Should allow admins to:
- Select which LLM model to use for the AI chat
- Select which model to use for the reflection classifier
- View model costs/capabilities

### 6. Settings Page

Mostly empty. Needs to surface:
- PII toggle (already exists but may need better placement)
- Model selection (from #5)
- Export preferences
- Notification settings (if applicable)

### 7. Custom Domain — ✅ DONE

`chat-explorer.digication.com` is live on Railway. Configured in commit `4536114` (2026-04-10).

## Implementation approach

Items 4 and 7 are done. Remaining items in suggested order:
1. **PDF export (#3)** — backend mostly exists, needs UI wiring. Quick win.
2. **LLM model picker (#5) + Settings page (#6)** — go together, makes app configurable.
3. **Test coverage (#1 + #2)** — systematic audit, builds confidence for production.

Each of items 3, 5, and 6 needs a detailed plan written before implementation.
