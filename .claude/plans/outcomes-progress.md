# Outcomes, Evidence & Conceptual Trees — Progress Tracker

> Living document tracking what's been built, what deviated from the spec, and what's next.
> Branch: `feat/outcomes-evidence-trees` (rebased onto `main` as of 2026-04-15).
>
> Reference docs:
> - High-level plan: `.claude/plans/outcomes-implementation-plan.md`
> - Technical spec: `.claude/plans/outcomes-technical-spec.md`
> - Spec audit: `.claude/plans/outcomes-spec-critique.md`

---

## Phase 1: Student Auth — COMPLETE

**Commit:** `2fa0bbe feat(student-auth): add student role, auth, invites, and dashboard`

### What was built

| Area | Files | Summary |
|------|-------|---------|
| **User role** | `src/server/entities/User.ts` | Added `STUDENT = "student"` to `UserRole` enum |
| **Student entity** | `src/server/entities/Student.ts` | Added `userId` column (nullable FK to User) and `user` relation |
| **Migration** | `src/server/migrations/1775574900000-AddStudentRole.ts` | Adds `student` to role enum, adds `userId` column to `student` table with FK + unique index |
| **Invite service** | `src/server/services/student-invite.ts` | `inviteStudent()` and `bulkInviteStudents()` — creates User with student role, links to Student record, sends magic-link email via better-auth |
| **Resolvers** | `src/server/resolvers/student-auth.ts` | `myStudentProfile` (student self), `students` query (admin), `inviteStudent` / `bulkInviteStudents` mutations |
| **GraphQL schema** | `src/server/types/schema.ts` | Added `StudentProfile`, `StudentInviteResult`, `BulkInviteResult` types + queries/mutations |
| **Admin UI** | `src/components/admin/StudentInvitesTab.tsx`, `src/pages/AdminPage.tsx` | Student Invites tab in Admin page — institution picker, email input, bulk invite, status table |
| **Role-based redirect** | `src/components/layout/RoleBasedRedirect.tsx` | Redirects students to `/student`, faculty to `/insights` |
| **Student routing** | `src/App.tsx` | `/student/*` route group with `RoleProtectedRoute` wrapper |
| **Student sidebar** | `src/components/layout/Sidebar.tsx` | Conditional nav — students see Dashboard/Tree/Growth/Outcomes, faculty see existing nav |
| **Student pages** | `src/pages/student/Student{Dashboard,Tree,Growth,Outcomes}Page.tsx` | Placeholder pages with icons and "Coming soon" text |
| **Student context** | `src/lib/useStudentContext.ts`, `src/lib/queries/student.ts` | `useStudentContext()` hook + `MY_STUDENT_PROFILE` GraphQL query |
| **Tests** | `src/server/resolvers/student-auth.test.ts` (9 tests), `RoleBasedRedirect.test.tsx` (3 tests), `Sidebar.test.tsx` (updates) | Resolver tests cover auth guards, invite flow, bulk invite. Component tests cover redirect logic and sidebar rendering per role. |

### Deviations from spec

- **No changes needed.** Phase 1 followed the spec closely. The invite flow reuses better-auth's existing magic link infrastructure as planned.

### Browser verified

- Student Invites tab renders in Admin page
- RoleBasedRedirect works for student vs faculty roles
- Sidebar shows student-specific nav items

---

## Phase 2: Narrative Evidence — COMPLETE

**Commits:**
- `e8a1535 feat(evidence): add narrative evidence pipeline and outcomes framework`
- `01767be test(evidence): add unit tests for narrative generator and evidence pipeline`

### What was built

| Area | Files | Summary |
|------|-------|---------|
| **Entities** | `src/server/entities/OutcomeFramework.ts` | `FrameworkType` enum (TORI, GEN_ED, ABET, NURSING, CUSTOM). Fields: institutionId, name, description, type, isDefault, isActive, isSystem. Relations to Institution + OutcomeDefinition[]. |
| | `src/server/entities/OutcomeDefinition.ts` | Unique index on [frameworkId, code]. Self-referential parent/children for hierarchical outcomes. Fields: frameworkId, code, name, description, parentId, sortOrder. |
| | `src/server/entities/EvidenceMoment.ts` | `EvidenceType` enum (TORI, REFLECTION, OUTCOME, STRUCTURAL). Indexes on studentId, commentId, processedAt. Fields: studentId, commentId, narrative, sourceText, type, modelVersion, processedAt, isLatest. Relation to EvidenceOutcomeLink[]. |
| | `src/server/entities/EvidenceOutcomeLink.ts` | `StrengthLevel` enum (EMERGING, DEVELOPING, DEMONSTRATING, EXEMPLARY). Unique index on [evidenceMomentId, outcomeDefinitionId]. Fields: strengthLevel, rationale. |
| **Migration** | `src/server/migrations/1775575000000-AddEvidenceEntities.ts` | Creates 3 Postgres enum types + 4 tables (outcome_framework, outcome_definition, evidence_moment, evidence_outcome_link) with all FKs, indexes, unique constraints. Down method drops in reverse order. |
| **Entity registration** | `src/server/entities/index.ts`, `src/server/data-source.ts` | All 4 entities added to exports, entities array, and migrations array |
| **TORI seed** | `src/server/services/evidence/seed-tori-framework.ts` | `seedToriFrameworks()` — idempotent. For each institution, creates a TORI OutcomeFramework + one OutcomeDefinition per ToriTag. Called at server startup after `seedToriTags()`. |
| **Narrative generator** | `src/server/services/evidence/narrative-generator.ts` | `generateNarrativeBatch(input)` — sends up to 5 comments to Gemini 2.5 Flash with a strict-JSON prompt. Returns narratives + outcome alignments. Features: JSON fence stripping, prose tolerance, code→ID mapping, drops invalid alignments gracefully, retry with temperature 0.0 on malformed output. |
| **Evidence pipeline** | `src/server/services/evidence/evidence-pipeline.ts` | `generateEvidenceInBackground(commentIds, institutionId)` — fire-and-forget from upload route. Loads comments + TORI tags + reflection classifications + TORI framework. Batches through narrative generator. Saves EvidenceMoment + EvidenceOutcomeLink in transaction. Invalidates analytics cache. Idempotent (skips already-processed comments). |
| **Upload integration** | `src/server/index.ts` | Added `seedToriFrameworks()` call at startup. Added fire-and-forget `generateEvidenceInBackground()` in upload commit route alongside `classifyUserCommentsInBackground()`. |
| **Analytics service** | `src/server/services/analytics/evidence-outcomes.ts` | `getEvidenceSummary(scope)` — aggregated outcome alignment counts with strength distributions per outcome. Uses resolveScope + withCache. `getStudentEvidenceMoments(scope, studentId, limit, offset)` — paginated per-student evidence moments with outcome links. |
| **GraphQL** | `src/server/types/schema.ts`, `src/server/resolvers/analytics.ts`, `src/server/resolvers/index.ts` | Added types: StrengthLevel enum, StrengthDistribution, OutcomeSummaryItem, EvidenceSummary, EvidenceSummaryResult, OutcomeAlignmentItem, StudentEvidenceMomentItem, StudentEvidenceResult. Added queries: `evidenceSummary(scope)`, `studentEvidenceMoments(scope, studentId, limit, offset)`. |
| **Client queries** | `src/lib/queries/analytics.ts` | Added `GET_EVIDENCE_SUMMARY` and `GET_STUDENT_EVIDENCE_MOMENTS` GraphQL query definitions |
| **Faculty Panel** | `src/components/faculty-panel/FacultyPanelContext.tsx` | Added `"evidence"` to PanelTab type, `openEvidence` action + callback |
| | `src/components/faculty-panel/FacultyPanel.tsx` | Added Evidence to TAB_ORDER/TAB_LABELS, imports EvidenceTabPanel |
| **Evidence UI** | `src/components/insights/EvidenceTabPanel.tsx` | Outcome summary cards sorted by alignment count. Each card shows outcome code/name, alignment count, student count, and a color-coded StrengthBar (Emerging=blue, Developing=green, Demonstrating=orange, Exemplary=purple). Tooltip shows per-level counts and percentages. Empty state with ScienceIcon. Uses `useInsightsScope()` for scope. |
| **Tests** | `narrative-generator.test.ts` (20 tests), `evidence-pipeline.test.ts` (10 tests) | Generator tests: happy paths, all strength levels, JSON extraction (fences, prose), validation (unknown IDs, empty narratives, truncation, invalid codes/levels), error handling (batch limits, LLM failures, retry logic). Pipeline tests: early exits, idempotency, full flow, input enrichment, batch failure resilience, cache invalidation. |

### Deviations from spec

- **`artifactSectionId` column exists but is nullable and unused.** The spec defined it for Phase 3 (artifacts). It's in the entity definition but not populated — ready for Phase 3 without a migration.
- **`parentMomentId` column exists but is unused.** For future reprocessing chains (spec called for `isLatest` pattern, which is implemented).
- **Evidence tab shows institution-wide summary, not per-student.** The spec was ambiguous on whether the Faculty Panel evidence tab would be scoped to the selected student or institution. Currently it shows institution-wide `evidenceSummary` data. The `studentEvidenceMoments` query exists for future per-student drill-down.

### Browser verified

- Insights page renders fully (heatmap, TORI tags, network, reflection depth, etc.)
- Faculty Panel opens with 4 tabs: Student, Thread, Evidence, AI Chat
- Evidence tab shows "No evidence data yet" empty state (correct — no data uploaded with evidence pipeline active)
- Zero console errors
- All other tabs still work after Evidence tab interaction

---

## Test Coverage

| Test file | Count | What it covers |
|-----------|-------|----------------|
| `student-auth.test.ts` | 9 | Resolver auth guards, invite flow, bulk invite, error cases |
| `RoleBasedRedirect.test.tsx` | 3 | Redirect logic per role |
| `Sidebar.test.tsx` | updates | Student vs faculty nav rendering |
| `narrative-generator.test.ts` | 20 | JSON extraction, validation, all strength levels, retry logic, error handling |
| `evidence-pipeline.test.ts` | 10 | Early exits, idempotency, batch processing, cache invalidation |
| **Total new tests** | **42+** | |

Full suite: **389 tests passing** (0 failures) as of 2026-04-15.

---

## Key Architecture Decisions

### 1. Evidence-First data model
EvidenceMoment is the new atomic unit. Every AI observation gets stored with a narrative, source reference, and outcome alignments. This was chosen over an "alignment-only" model because narratives provide richer context for faculty.

### 2. TORI-as-outcomes bridge
Rather than treating TORI tags and outcomes as separate systems, each institution gets a seeded TORI OutcomeFramework that maps tags to outcome definitions. This means existing TORI tag analysis automatically feeds into the outcomes system.

### 3. Fire-and-forget pipeline
Evidence generation runs outside the upload transaction (same pattern as reflection classification). Failures are logged but never block uploads. The pipeline is idempotent — re-uploading the same data won't duplicate evidence.

### 4. Graceful LLM degradation
The narrative generator drops invalid alignments rather than failing the whole batch. A narrative without alignments is still useful. One retry with stricter prompt on malformed JSON.

### 5. `isLatest` for reprocessing
When models improve and we re-generate evidence, old moments get `isLatest = false`. All analytics filter on `isLatest = true`. No destructive deletion needed.

---

## What's Next: Phase 3 — Artifacts & Section-Level Analysis

Per the implementation plan, Phase 3 adds:
- Document upload (PDF, DOCX) with section splitting
- Section-level evidence analysis
- New sidebar item: "Artifacts" with list/detail views
- FacultyPanel Thread tab evolves into "Artifact" tab

Key files from the spec to reference:
- `outcomes-technical-spec.md` Phase 3 section for entity definitions and service specs
- `outcomes-implementation-plan.md` "Phase 3" section for integration map

### Prerequisites satisfied by Phase 2
- OutcomeFramework and OutcomeDefinition entities exist
- EvidenceMoment already has `artifactSectionId` column (nullable, ready for Phase 3)
- Narrative generator can be reused for section-level analysis
- Evidence analytics service can be extended for artifact-scoped queries

---

## Git History

```
Branch: feat/outcomes-evidence-trees (rebased onto main 2026-04-15)

01767be test(evidence): add unit tests for narrative generator and evidence pipeline
e8a1535 feat(evidence): add narrative evidence pipeline and outcomes framework (Phase 2)
2fa0bbe feat(student-auth): add student role, auth, invites, and dashboard (Phase 1)
```

3 commits, 40 files changed, +3,751 lines / -17 lines.
