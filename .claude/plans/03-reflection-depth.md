# Plan 3 — Reflection Depth (Hatton & Smith 1995)

**Status:** DONE — merged to main
**Priority:** HIGH — replaces a load-bearing analytics primitive (`DepthBand`) used across Insights
**Depends on:** Plan 1 (merged)

## Why this plan exists

The current "depth" signal is a hand-rolled composite of TORI tag count, lexical diversity, evidence-phrase count, logical connectors, and question marks (`engagement.ts:9-15`). It min-max normalizes within the current scope and bins into `SURFACE / DEVELOPING / DEEP`. This has three serious problems:

1. **Not grounded in the literature.** Weights are arbitrary; the bands don't correspond to anything an instructor has heard of.
2. **Scope-relative.** Because we min-max within the scope, the same comment can land in different bands depending on which course you filter to. A student's "DEEP" reflection becomes "DEVELOPING" if you add another course.
3. **Doesn't measure what we care about.** Counting "because" and "therefore" isn't reflection — it's grammar. We want to know whether a student is *describing*, *explaining*, *talking to themselves*, or *connecting their experience to broader contexts*.

The user wants the project to use **Hatton & Smith (1995)** — an established 4-category framework for reflective writing. The framework, the operational definitions, and the strict "no numerical scores in the UI" constraint are recorded in memory at `project_reflection_framework.md` and are authoritative for this plan.

## The 4 categories (from memory, restated for plan reviewers)

| Code | Label | What it means |
|---|---|---|
| `DESCRIPTIVE_WRITING` | Descriptive Writing | Reports events / literature. Not reflective. |
| `DESCRIPTIVE_REFLECTION` | Descriptive Reflection | Explains rationale; mentions challenge from environment/nature of work; iterating/extra effort to reach a goal. |
| `DIALOGIC_REFLECTION` | Dialogic Reflection | Discourse with self: personal history/interests/emotion, recognizing a personal lack of skill, desire for expertise, metacognition. |
| `CRITICAL_REFLECTION` | Critical Reflection | Connects topic to broader contexts: course → job, across engineering disciplines, to non-engineering, to societal/historical/political. |

**Hard constraint:** the UI must never show a numerical score. Categories only.

## Architecture overview

Classification is **per-comment**, **persistent**, and **scope-independent** — the opposite of the current approach. We classify each USER comment exactly once, store the result in the database, and read from that table everywhere depth is shown.

```
┌──────────────────────────┐    ┌──────────────────────────────────┐
│  CSV upload / ingest     │───▶│  classifyReflection(commentId)   │
│  (existing pipeline)     │    │  Gemini-backed LLM classifier     │
└──────────────────────────┘    └────────────┬─────────────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────┐
                              │ comment_reflection_classification │
                              │  (1 row per comment)         │
                              └────────────┬─────────────────┘
                                           │
       ┌───────────────────────────────────┼─────────────────────────────┐
       ▼                                   ▼                             ▼
  Engagement table              Growth visualization           DepthBands / Metrics
  (per-student modal value)     (timeline of categories)       (scope-wide distribution)
```

The classifier itself runs on:
1. **New comments** during CSV ingest (synchronous in the ingest pipeline so the upload page reflects the result).
2. **Backfill** for the existing ~684 comments (one-time script, idempotent).

## Database changes

### New table: `comment_reflection_classification`

| Column | Type | Notes |
|---|---|---|
| `commentId` | uuid, PK, FK → `comment.id` ON DELETE CASCADE | One row per comment. |
| `category` | enum: `DESCRIPTIVE_WRITING / DESCRIPTIVE_REFLECTION / DIALOGIC_REFLECTION / CRITICAL_REFLECTION` | The label. |
| `evidenceQuote` | text, nullable | Short verbatim quote (≤200 chars) from the comment that justifies the label. Shown in drill-downs. |
| `rationale` | text, nullable | One-sentence explanation. Shown in drill-downs only, not in tables. |
| `classifierVersion` | varchar | e.g. `"gemini-2.0-flash@2026-04-08"`. Lets us re-classify selectively when we tune the prompt. |
| `confidence` | float, nullable | Model self-reported, 0–1. Stored for diagnostics but never shown in UI. |
| `classifiedAt` | timestamptz | |

**Index:** `(category)` for fast distribution queries; `(commentId)` is the PK.

### Migration

- Add `src/server/migrations/<timestamp>-AddReflectionClassification.ts` creating the table + enum type.
- `synchronize: false` in prod, so this MUST be a hand-written migration. Migrations run automatically on Railway boot (`docs/deployment.md`).
- Migration is **additive only** in Plan 3. The old `DepthBand` enum/columns/code paths are removed in a separate cleanup phase at the end of this plan, after the new path is verified working in prod.

## LLM classifier service

### File: `src/server/services/reflection/classifier.ts` (new)

```ts
export type ReflectionCategory =
  | "DESCRIPTIVE_WRITING"
  | "DESCRIPTIVE_REFLECTION"
  | "DIALOGIC_REFLECTION"
  | "CRITICAL_REFLECTION";

export interface ClassificationResult {
  category: ReflectionCategory;
  evidenceQuote: string | null;
  rationale: string | null;
  confidence: number | null;
}

export async function classifyComment(text: string): Promise<ClassificationResult>;
```

- **Backend:** Gemini (per `project_execution_decisions.md` — Gemini is the project default LLM).
- **Prompt:** A single-shot prompt containing:
  1. The 4 category definitions (verbatim from memory file).
  2. 2 worked examples per category (8 total) — anchored "golden" examples curated from the existing 684 comments.
  3. The student comment to classify.
  4. A strict JSON output schema: `{category, evidenceQuote, rationale, confidence}`.
- **Robustness:** wrap in `safeJsonParse`; if the model returns malformed JSON, retry once with a stricter "JSON only, no prose" instruction; if still malformed, throw a typed error and let the caller decide (ingest = log + skip; backfill = record failure).
- **Costs:** Gemini Flash-tier should cost <$1 to classify the entire 684-comment backlog. New uploads are typically 50–500 comments per CSV. No batching needed for v1.

### File: `src/server/services/reflection/classifier.test.ts` (new)

Vitest. Mocks the Gemini client and asserts:
- Each of the 4 categories is correctly handled when the model returns it.
- Malformed JSON triggers exactly one retry.
- The evidence quote is rejected if it's not a substring of the input (anti-hallucination guard).

### File: `src/server/services/reflection/golden-examples.ts` (new)

A small array of `{text, expectedCategory}` curated by hand from real comments. **Used by an integration-style test** that runs against the real Gemini API only when `GEMINI_API_KEY` is set (skipped in CI). This is our drift detector — if we tune the prompt and a golden example flips category, we know.

## Backfill

### File: `src/server/scripts/backfill-reflection-classifications.ts` (new)

- Selects all USER comments with `text != ''` that don't have a row in `comment_reflection_classification`.
- Classifies them serially with a small delay (avoid Gemini rate limits).
- Idempotent: re-running picks up where it left off.
- Logs progress every 25 comments.
- Run manually via `docker compose exec app pnpm tsx src/server/scripts/backfill-reflection-classifications.ts` after the migration ships and before the UI is switched over.

The order of operations on prod is critical:

1. Deploy migration (creates empty table).
2. Run backfill from the Railway shell.
3. Deploy the code that *reads* from the new table (UI + resolvers).
4. After a few days of soak, deploy the cleanup PR that deletes the old `engagement.ts` scoring + `DepthBand` type.

This avoids any window where the UI references categories that don't exist yet.

## GraphQL schema changes

In `src/server/types/schema.ts`:

```graphql
enum ReflectionCategory {
  DESCRIPTIVE_WRITING
  DESCRIPTIVE_REFLECTION
  DIALOGIC_REFLECTION
  CRITICAL_REFLECTION
}

type ReflectionClassification {
  commentId: ID!
  category: ReflectionCategory!
  evidenceQuote: String
  rationale: String
}

# Replaces depthBand on every existing type
type StudentEngagement {
  studentId: ID!
  name: String!
  commentCount: Int!
  modalCategory: ReflectionCategory!     # most-common category for this student
  categoryDistribution: ReflectionCategoryDistribution!
}

type ReflectionCategoryDistribution {
  descriptiveWriting: Int!
  descriptiveReflection: Int!
  dialogicReflection: Int!
  criticalReflection: Int!
}

type GrowthDataPoint {
  assignmentId: ID!
  assignmentName: String!
  date: String!
  category: ReflectionCategory!         # was: score + depthBand
}
```

`DepthBand` and every field of type `DepthBand` are removed in the final cleanup phase, not in the initial deploy.

## Files that change

Sixteen source files reference depth bands today (verified via grep). Each is touched in this plan:

| File | Change |
|---|---|
| `src/server/services/analytics/types.ts` | Add `ReflectionCategory` type. Mark `DepthBand` deprecated. |
| `src/server/services/analytics/engagement.ts` | Replace per-comment scoring with a join to `comment_reflection_classification`. Aggregate per student into `modalCategory` + distribution. Drop `extractSignals`, `normalize`, `WEIGHTS`, `assignDepthBand`. |
| `src/server/services/analytics/growth.ts` | Replace timeline of `(score, depthBand)` with timeline of `category`. |
| `src/server/services/analytics/instructional-insights.ts` | Replace any "% deep / surface" framing with "% critical / dialogic / etc." |
| `src/server/services/analytics/recommendations.ts` | Update the rules that recommend visualizations based on depth distribution. |
| `src/server/services/export-pdf.ts` | Update PDF export sections that render depth bands. |
| `src/server/types/schema.ts` | Schema changes above. |
| `src/lib/queries/analytics.ts` | Update GraphQL queries: replace `depthBand`, `score` fields with `modalCategory`, `categoryDistribution`. |
| `src/lib/queries/explorer.ts` | Same — Explorer queries that fetch per-comment depth. |
| `src/components/insights/DepthBands.tsx` | Rename to `ReflectionCategories.tsx`. Render 4 buckets, not 3. Use distinct colors per category (proposed: gray / blue / purple / amber). |
| `src/components/insights/MetricsCards.tsx` | "Depth distribution" card → "Reflection categories" card with 4 segments. |
| `src/components/insights/StudentEngagementTable.tsx` | "Depth band" column → "Most common reflection" column showing the modal category as a colored chip. Sort by category ordinality (descriptive → critical). |
| `src/components/insights/StudentDrillDown.tsx` | Per-comment list shows category chip + evidence quote pulled from the new table. |
| `src/components/insights/GrowthVisualization.tsx` | Y-axis becomes a 4-band ordinal axis (not a continuous score). Each data point lands in one of 4 lanes. Tooltip shows the category name + assignment. |
| `src/components/explorer/StudentListPanel.tsx` | Per-student depth chip → modal-category chip. |
| `src/pages/InsightsPage.tsx` | Update any depth-related copy / legend. |

Plus:
- `src/server/services/reflection/classifier.ts` (new)
- `src/server/services/reflection/classifier.test.ts` (new)
- `src/server/services/reflection/golden-examples.ts` (new)
- `src/server/scripts/backfill-reflection-classifications.ts` (new)
- `src/server/migrations/<ts>-AddReflectionClassification.ts` (new)
- `src/server/services/csv-ingest.ts` (or wherever ingest lives) — call classifier after a comment row is inserted

## Tests

1. **Unit — classifier (`classifier.test.ts`):** mocked Gemini, assert parsing, retry, anti-hallucination guard. Runs in CI.
2. **Unit — engagement.ts:** stub the classification table, assert that modal category and distribution are computed correctly for a student with mixed categories.
3. **Unit — growth.ts:** assert timeline returns ordered category points per assignment.
4. **Integration — golden examples:** runs only with `GEMINI_API_KEY`; classifies the 8 hand-curated examples and asserts each lands in its expected category. Skipped in CI; run manually before a prompt change ships.
5. **Migration test:** add a smoke test that the new table is created and the FK cascade-deletes when a comment is deleted.
6. **No-numerical-score audit:** add a static check (`scripts/check-no-depth-scores.ts`) that greps the components/ directory for `score`, `depthBand`, `SURFACE`, `DEVELOPING`, `DEEP` and fails if any remain after the cleanup phase. This catches drift in future PRs.

## Browser verification (per the "always check every bug" rule)

After the new path is wired, verify in Chrome via the in-Chrome MCP:
- Insights page loads; the "Reflection categories" card shows 4 segments summing to the student count.
- Student Engagement table shows colored chips, not numeric scores.
- Click into a student → drill-down shows per-comment categories with evidence quotes.
- Growth visualization shows ordinal lanes, not a continuous line.
- Explorer student list panel chips match the Insights table for the same student.
- PDF export renders the new categories.
- Confirm via `console.log` that no GraphQL response contains a `score` or `depthBand` field.

## Rollout phases (deploy-safe order)

| Phase | What ships | Why this order |
|---|---|---|
| 3a | Migration + classifier + classifier tests + backfill script (no UI changes) | Lets us run backfill on prod without touching the UI. Old depth bands keep working. |
| 3b | Run backfill on Railway from the shell | Populates the table for all 684 existing comments. |
| 3c | Schema + resolvers + UI components switched to read from the new table. Old `engagement.ts` scoring kept as fallback if a comment is unclassified (returns `DESCRIPTIVE_WRITING`). | Whole UI flips at once; consistent. |
| 3d | After a few days of soak: cleanup PR that removes `DepthBand`, `extractSignals`, `WEIGHTS`, `assignDepthBand`, the fallback path, and adds the no-score audit script. | Only safe once we're confident nothing else depends on the old types. |

## Open questions for user before coding

1. **Which Gemini model?** Default to `gemini-2.0-flash` for cost; happy to use `gemini-2.5-pro` for the backfill if you want higher-quality labels on the seed corpus. Once classified, comments are not re-classified unless we bump `classifierVersion`.
2. **Color palette for the 4 categories.** Proposed: Descriptive Writing = neutral gray, Descriptive Reflection = blue, Dialogic Reflection = purple, Critical Reflection = amber. OK to lock that in?
3. **Modal vs. distribution in the Student Engagement table.** I propose showing the modal category as a chip + a small 4-bar mini-distribution next to it. Acceptable, or do you want only the modal?
4. **Backfill on dev first.** I'll run the backfill on the local Docker DB before we touch prod. Confirm that's OK (it will spend a few cents of Gemini quota on your key).

## Out of scope for Plan 3

- Re-classifying comments when the prompt changes (manual `classifierVersion` bump for now).
- Per-assignment category trends (Plan 4 — UX Polish).
- Showing classifier confidence in the UI (deliberately excluded — confidence is for diagnostics only).
- Rewriting the network graph color-coding (Plan 4).
