# Plan 5 — Testing & Remaining Work

**Status:** Not started
**Priority:** Last — execution order is Plan 1 -> 3 -> 4 -> 2 -> **5**
**Depends on:** All other plans

## Why this plan exists

Important infrastructure and coverage gaps that can wait until the product itself is in a better conceptual place. These items are individually significant but don't block the demo or deployment the way Plans 1-4 do.

## Features

### 1. E2E Tests

Currently none exist. Need end-to-end tests that exercise the full stack: upload a CSV, verify it appears in the explorer, check insights render correctly, verify AI chat works.

### 2. Unit Test Coverage

Missing unit tests for approximately 8 modules:
- Analytics modules (engagement, growth, heatmap, instructional-insights, recommendations, text-signals, co-occurrence, TORI frequency)
- TORI extractor
- Consent service
- Deduplication logic
- LLM provider abstraction
- AI chat service
- Export/PDF service

Some of these may have gained coverage during Plans 1-3, but a systematic audit is needed.

### 3. PDF Export

The export-pdf service exists but is not fully wired up to the UI. Need to:
- Connect the "Export" button to the PDF generation endpoint
- Verify the report includes all current analytics sections (including the new Hatton & Smith categories from Plan 3)
- Handle large reports gracefully

### 4. Student Profile & Cross-Course Comparison Reports

Never built. The concept is:
- **Student Profile:** A per-student report showing their reflection trajectory, TORI tag distribution, and growth across assignments
- **Cross-Course Comparison:** Compare analytics across multiple courses within an institution

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

### 7. Custom Domain

`chat-explorer.digication.com` was planned but not configured. Requires:
- DNS CNAME setup pointing to Railway
- SSL certificate provisioning
- Update Railway custom domain settings
- See `docs/deployment.md` for the rollout plan

## Implementation approach

Start with the unit test audit (#2) since it builds confidence for everything else. E2E tests (#1) next. Then wire up PDF export (#3) since the backend is mostly done. Student profiles (#4), model picker (#5), and settings (#6) are new features. Custom domain (#7) is an ops task that can happen anytime.
