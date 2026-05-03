---
id: T-2026-05-03-outcomes-integration-fix-evidence-authz-fix-opaque
scope: outcomes-evidence-trees integration onto main
status: claimed
tier: R2
branch: T-2026-05-03-outcomes-integration-fix-evidence-authz-fix-opaque
commit_sha:
proposal: Land Phases 1-3 onto main with auth fix for studentEvidenceMoments scoping, opaque-handle fix for ArtifactSection-as-comment, and integration test proving end-to-end scoping
---

## Acceptance Criteria

1. **Auth fix:** `getStudentEvidenceMoments(scope, studentId)` returns `{ moments: [], totalCount: 0 }` when `studentId ∉ scope.consentedStudentIds`. Throws `FORBIDDEN` (or equivalent) when the caller lacks access to the requested studentId.
2. **Regression test:** A unit test asserts the auth fix — faculty A from institution X cannot fetch evidence for student S in institution Y; consent-excluded students return empty.
3. **Integration test (mocked LLM):** End-to-end test using a test DB + mocked Gemini call asserts that an upload commit produces `EvidenceMoment` rows with `studentId` only in the consented set for the institution.
4. **Opaque-handle fix:** `EvidenceMoment` rows generated from `ArtifactSection` populate the `artifactSectionId` column (already exists on the entity, currently unused). The `commentId` column is `null` for artifact-derived moments. Phase 3 conversation-wrapper artifacts (which keep using commentId) are unchanged.
5. **GraphQL `ArtifactSection.evidenceMoments` join updated** to use `artifactSectionId` for non-CONVERSATION sections, falling back to `commentId` for CONVERSATION sections (back-compat for Phase 3 conversation wrap).
6. **Branch merges cleanly into main via `feat/outcomes-integration`** (new branch off main, then `git merge --no-ff feat/outcomes-evidence-trees` + this task's commits on top). Conflict zone in `src/server/index.ts` (artifact upload + main's CSV streaming) is resolved without losing main's upload-pipeline rework.
7. **Existing test suite passes** (typecheck + unit + integration tests green) on the integration branch after all fixes.

## Non-Goals

- Phase 4 (conceptual trees), Phase 5 (institutional outcomes UI), Phase 6 (guided reflection), Phase 7 (student dashboard) — out of scope; deferred.
- Real PDF upload through production Gemini API — replaced by integration test with mocked LLM (see AC#3). Real e2e verification deferred.
- Refactoring the Phase 3 CONVERSATION-wrapper path (which legitimately uses commentId since sections map 1:1 to user comments). Only PDF/DOCX-derived sections are migrated to artifactSectionId.
- LLM cost analysis / budget guardrails (separate concern).
- `commentId`-as-primary-key migration on existing rows (the unused column will be cleared on regenerated evidence; no backfill since no real data exists yet).

## Pre-Done Checklist

| # | Check | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Tier justification | _pending_ | | |
| 2 | Build passes | _pending_ | | |
| 3 | Tests pass | _pending_ | | |
| 4 | Flow Hazard Analysis | _pending_ | | |
| 5 | Gate 4 runtime smoke | _pending_ | | |
| 6 | Verifier spot-check | _pending_ | | |
| 7 | Observability | _pending_ | | |
| 8 | Floor-signal scan | _pending_ | | |
| 9 | Retrospective decision | _pending_ | | |
