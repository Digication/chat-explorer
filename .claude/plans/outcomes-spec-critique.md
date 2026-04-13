# Critique: Technical Spec Audit (2026-04-13)

## Summary

The spec is a strong starting point but **not yet one-shot ready**. There are 9 factual errors, 8 ambiguities that would block a developer, 10 missing pieces, 6 architecture concerns, 6 test gaps, and 6 ordering issues. The most critical are listed below grouped by severity.

---

## Critical (would cause implementation failure)

### 1. Phase 5 depends on Phase 6's auth
Phase 5 (Guided Reflection) has student-facing pages and E2E tests with "student user" scenarios, but student auth isn't built until Phase 6. Either Phase 5 must be faculty-only, student auth must be pulled forward, or the phases reordered.

### 2. Evidence pipeline can't sequence after reflection classification
Phase 1 says evidence generation runs "after TORI extraction and reflection classification complete." But reflection classification is fire-and-forget async — there's no callback, no event, no job queue. Evidence generation needs both TORI tags and reflection category as input, but has no way to know when classification finishes. This creates a data race.

**Fix options:**
- (a) Chain them: reflection classification returns a Promise, evidence generation awaits it
- (b) Job queue with dependencies (overkill for Phase 1)
- (c) Evidence pipeline independently re-reads classification status (poll-or-retry)

### 3. No `src/server/routes/` directory exists
The spec puts artifact upload at `src/server/routes/artifact-upload.ts`, but all existing routes are inline in `src/server/index.ts`. Need to either match the existing pattern or explicitly plan the extraction.

### 4. `resolveScope()` returns comments, not evidence moments
The evidence analytics service assumes it can reuse `resolveScope()`, but that function returns comment arrays. Evidence queries need consented student IDs (which `resolveScope` can provide) but not the comments themselves. The service needs its own query pattern.

### 5. LLM outcome code → ID mapping not specified
The narrative generator tells the LLM to return `outcomeCode` (e.g., "CT-1"), but `EvidenceOutcomeLink` needs `outcomeDefinitionId` (UUID). The lookup step between LLM response and database write is missing from the spec.

---

## High (would cause confusion or rework)

### 6. `seedToriFramework` bootstrapping unclear
Takes `institutionId` but called "during server startup." Which institutions? All of them? Query all institutions and loop? Called lazily on first access? Not specified.

### 7. `RoleProtectedRoute` pattern mismatch
Spec uses it as a layout route (`<Route element={<RoleProtectedRoute>}>`), but actual component renders `{children}`, not `<Outlet />`. Would need a code change or different routing approach.

### 8. No file storage strategy for artifact uploads
PDFs up to 50MB stored where? Existing CSV upload uses local filesystem. No S3, no cleanup policy, no serving strategy specified.

### 9. No progress/polling for artifact processing
Spec mentions "status bar: processing progress" but no WebSocket, subscription, or polling mechanism is defined. Frontend has no way to know when background processing completes.

### 10. No job queue for background processing
Evidence generation, tree generation, artifact parsing, and cross-linking are all fire-and-forget. No retry, no dead-letter queue, no monitoring. At the scale described (500 comments × 1-3s each = 10-25 min), this is fragile.

### 11. Cache invalidation missing for evidence generation
When evidence is generated asynchronously (after upload response), no `cacheInvalidate()` is called. Stale analytics data could be served.

### 12. N+1 LLM calls per upload
500 comments × (250ms delay + 1-3s LLM latency) = 10-25 minutes per upload. No batching strategy. Modern LLMs can process multiple comments in a single call.

---

## Medium (gaps in completeness)

### 13. `EvidenceSummaryData` missing `byType` field
Service interface includes `byType: Record<EvidenceType, number>` but GraphQL type omits it. Client can never query it.

### 14. No consent filtering on evidence moments
`StudentConsent` exclusions filter comments in analytics, but spec doesn't show evidence moments being filtered when a student is excluded. Privacy-critical gap.

### 15. Evidence moments are append-only with no pruning
Reprocessing creates lineage chains. No materialized view, no cleanup, no "latest in lineage" query pattern specified. Queries slow down over time.

### 16. No delete/archive operations for any new entity
No `deleteArtifact`, no `deleteOutcomeFramework` (with protection for system frameworks), no `deleteEvidenceMoment` mutation. Basic CRUD gap.

### 17. No error states in UI for partial evidence generation failure
Evidence generation is "best-effort" — some comments may fail. UI shows incomplete data with no indication. No retry mechanism for faculty.

### 18. GraphQL type naming inconsistency
`EvidenceMomentType`, `ConceptNodeType`, `ConceptLinkType` use a `Type` suffix that doesn't match existing pattern (`Comment`, `Thread`, `Student`).

### 19. Token counting unspecified
`ArtifactSection.tokenCount` — which tokenizer? What's it used for? If for LLM context management, the tokenizer choice matters.

### 20. No protection for auto-seeded TORI framework
Phase 4's admin UI could allow deletion of the TORI framework, breaking all existing evidence moments linked to its outcomes.

---

## Test Coverage Gaps

### 21. No end-to-end integration test for the evidence pipeline
Individual units tested but no test that verifies: upload → TORI extracted → classified → evidence generated → queryable via GraphQL.

### 22. No concurrency test for evidence pipeline
Two simultaneous uploads could race on the idempotency check (LEFT JOIN ... IS NULL).

### 23. No consent × evidence test
No test verifies that excluded students' evidence moments are filtered from analytics.

### 24. No reprocessing lineage test
Reprocessing strategy described but zero test cases. No test for `parentMomentId`, "latest in lineage" queries, or analytics ignoring superseded moments.

### 25. No performance test
System will make hundreds of LLM calls and store millions of evidence moments. No benchmarks, no load tests.

### 26. D3 visualization testing gap
E2E only checks "SVG renders with nodes." No accessibility tests, no layout quality checks.

---

## Factual Errors (lower severity, easy to fix)

- `OutcomeDefinition` has `level` in the implementation plan diagram but not in the entity spec
- multer variable is called `upload` not `multerUpload` in existing code
- `categoryNumber` is `string | null` — `parseInt` could produce NaN if non-numeric
- User entity uses `@PrimaryColumn()` not `@PrimaryGeneratedColumn("uuid")` — student invite service needs to account for better-auth creating the User record, not TypeORM
- `OutcomeFramework` GraphQL type missing `institutionId` field
