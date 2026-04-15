# Implementation Plan: Outcomes, Evidence & Conceptual Trees

> Brainstorm → Implementation synthesis for the Outcomes Hub, Conceptual Trees, Guided Reflection, and Narrative Evidence features discussed on 2026-04-12. Revised 2026-04-13 after audit.

## Current State (what exists today)

| Layer | What's there | Gap |
|-------|-------------|-----|
| **Data model** | 16 entities. Comment is the atomic unit. ToriTag is static (seeded taxonomy). CommentToriTag is a simple junction — no narrative. CommentReflectionClassification stores Hatton & Smith category + quote + rationale. | No artifacts, no outcomes, no evidence moments, no trees, no narratives per alignment |
| **Classification** | Gemini 2.5 Flash classifies reflection level per comment. TORI tags extracted via regex + lookup. | No AI-generated narratives. No section-level analysis. No outcome alignment. |
| **Analytics** | 12 services covering scope, engagement, text-signals, TORI, heatmap, network, growth, student-profile, cross-course, recommendations. | All operate on comments within threads. No artifact-level analytics. No outcome-level rollups. |
| **Frontend** | Faculty-facing only. FacultyPanel slide-out with tabs. ScopeSelector (Institution → Course → Assignment → Student). 10+ insight components. | No student-facing views. No outcome views. No conceptual tree visualization. |
| **Auth** | Three roles: `instructor`, `institution_admin`, `digication_admin`. Student is a separate entity — data record only, cannot sign in. Magic link + Google OAuth via better-auth. | No student role. No student login. |
| **Infrastructure** | Docker + Caddy. PostgreSQL. GraphQL (Apollo). Railway deploy. GitHub Actions CI. | No job queue. In-memory cache only. No file storage beyond local disk. |

---

## Data Model: Option A ("Evidence-First") — Selected

Build around **EvidenceMoment** as the new atomic unit — every observation the AI makes gets stored as a first-class entity with a narrative, source reference, and outcome alignments. Full entity diagrams in the technical spec.

---

## App Integration Map

### Current App Structure

**User roles:** `instructor`, `institution_admin`, `digication_admin`
**Student:** Separate entity — not a User. Imported from LMS data. Cannot sign in.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ GlobalHeader — ScopeSelector breadcrumb, user avatar    │
├──────────┬──────────────────────────┬───────────────────┤
│ Sidebar  │  Main Content            │  FacultyPanel     │
│ (left)   │  (center)               │  (right slide-out)│
│          │                          │                   │
│ Insights │  <Outlet /> page content │  Student tab      │
│ Chat     │                          │  Thread tab       │
│ Upload   │                          │  Chat tab         │
│ Reports  │                          │                   │
│ Settings │                          │                   │
│ Admin    │                          │                   │
└──────────┴──────────────────────────┴───────────────────┘
```

**Routes:** `/insights`, `/insights/compare`, `/insights/student/:studentId`, `/chat`, `/upload`, `/reports`, `/settings`, `/admin`, `/login`

### Where Each Phase Lives

#### Phase 1: Student Auth — Role + routing only, no new pages

- Add `student` to `UserRole` enum. Add `userId` FK on Student entity.
- Student invite service (reuses existing magic link flow).
- Add student route group (`/student/*`) with `RoleProtectedRoute` wrapper.
- Conditional sidebar: student nav vs faculty nav based on role.
- Student dashboard placeholder page at `/student`.
- Default redirect: students → `/student`, faculty → `/insights`.

#### Phase 2: Narrative Evidence — No new pages

Lives inside existing UI:
- **FacultyPanel → new "Evidence" tab** alongside existing Student, Thread, Chat tabs.
- **Insights page enrichment** — existing components can show narrative summaries.
- No new sidebar items, no new routes.

#### Phase 3: Artifacts — One new page, one evolved panel

- **New sidebar item: "Artifacts"** → `/artifacts` — list view of uploaded documents.
- **`/artifacts/:id`** — full-page artifact detail showing sections with evidence.
- **FacultyPanel: Thread tab evolves into "Artifact" tab** — handles both conversations and documents.

#### Phase 4: Conceptual Trees — One new route, accessible from multiple places

- **New route: `/insights/student/:studentId/tree`** — full conceptual tree visualization.
- **Student route: `/student/tree`** — same visualization, student-appropriate framing.
- **FacultyPanel link** — "View Learning Map" link from Student tab.
- **Tree summary widget on Insights page.**

#### Phase 5: Institutional Outcomes — One admin page, one insights view

- **New route: `/admin/outcomes`** — framework CRUD for admins.
- **Insights page gets tabs** — "Analytics" (current) and "Outcomes" (new).
- **Student route: `/student/outcomes`** — student's own outcome map.
- **Evidence Reports** at `/insights/outcomes` or `/reports`.

#### Phase 6: Guided Reflection — One new page

- **New route: `/reflect/:artifactId`** — split-view reflection. Accessible to students (auth exists from Phase 1) and faculty.
- **Faculty configuration** — toggle on Assignment: "Require reflection."
- **Faculty side: no new page** — reflection evidence appears in existing views.

#### Phase 7: Student Dashboard & Views — Fills out student pages

- `/student` dashboard with stats, activity, artifacts
- `/student/growth` — growth over time
- `/student/tree` already exists from Phase 4
- `/student/outcomes` already exists from Phase 5

### Updated App Map (all phases complete)

```
Sidebar (Faculty/Admin)            Sidebar (Student)
───────────────────────            ─────────────────
Insights                           My Dashboard
  ├─ Analytics (existing)          My Learning Map
  └─ Outcomes (Phase 5)            My Growth
Artifacts (Phase 3)                My Outcomes
Chat Explorer (existing)           Reflect
Upload (existing)
Reports (existing)
Settings (existing)
Admin (existing)
  └─ Outcomes config (Phase 5)

FacultyPanel (right slide-out, faculty only)
─────────────────────────────────────────────
Student tab (existing)
  └─ "View Learning Map" link (Phase 4)
Artifact tab (Phase 3, extends Thread tab)
Evidence tab (Phase 2)
Chat tab (existing)

Routes added per phase:
  Phase 1: /student (placeholder), /student/* route group
  Phase 2: (none — existing UI only)
  Phase 3: /artifacts, /artifacts/:id
  Phase 4: /insights/student/:studentId/tree, /student/tree
  Phase 5: /admin/outcomes, /insights/outcomes, /student/outcomes
  Phase 6: /reflect/:artifactId
  Phase 7: /student/growth (fills out dashboard)
```

### Student Auth Model (Phase 1)

Add `UserRole.STUDENT = "student"`. Same auth flow as faculty/admin:
1. Admin invites student via magic link (existing better-auth invite flow)
2. System creates a User record with `student` role, linked to existing Student record via `Student.userId`
3. Student clicks magic link, signs in
4. `student` role gets its own route protection — can only access `/student/*` and `/reflect/*`
5. Existing `requireRole` middleware already supports this — just add `"student"` to allowed roles

---

## Implementation Phases

### Phase 1: Student Auth — COMPLETE (2026-04-15)
**Add `student` role and routing. Same flow as faculty/admin.**

~1 week. See `outcomes-progress.md` for full details.

### Phase 2: Narrative Evidence on Existing Comments — COMPLETE (2026-04-15)
**Add AI-generated narrative evidence to existing comment analysis.**

~2-3 weeks. See `outcomes-progress.md` for full details.

### Phase 3: Artifacts & Section-Level Analysis
**Upload documents, split into sections, analyze each section.**

~3-4 weeks.

### Phase 4: Conceptual Trees
**Map the structure of student thinking across artifacts and time.**

~4-5 weeks.

### Phase 5: Institutional Outcomes & Outcome Mapping
**Custom outcome frameworks, radar profiles, evidence reports.**

~4-5 weeks.

### Phase 6: Guided Reflection
**Tori reads alongside student work and asks contextual questions. Students can now log in (Phase 1).**

~5-6 weeks.

### Phase 7: Student Dashboard & Views
**Fill out student pages with growth, activity, and stats.**

~2-3 weeks.

---

## Proposed Build Order

```
Phase 1: Student Auth ───────────── Week 1
   │  (role + routing + invite)
   │
Phase 2: Narrative Evidence ──────── Weeks 2-4
   │  (narratives on existing comments)
   │
Phase 3: Artifacts ───────────────── Weeks 5-8
   │  (upload documents, section analysis)
   │
Phase 4: Conceptual Trees ───────── Weeks 9-13
   │  (thinking structure maps)
   │
Phase 5: Institutional Outcomes ── Weeks 14-18
   │  (custom frameworks, reports)
   │
Phase 6: Guided Reflection ──────── Weeks 19-24
   │  (Tori asks contextual questions)
   │
Phase 7: Student Dashboard ──────── Weeks 25-27
   (growth, activity, stats)
```

**Total: ~27 weeks.** Each phase delivers independent value.

### Alternative Build Orders

**"Outcomes First":** Move Phase 5 before Phases 3-4. If accreditation reporting is most urgent, build outcome frameworks using existing comment data first.

**"Trees + Reflection Together":** Combine Phases 4 and 6. If conceptual trees only make sense with reflection (paired nodes), build them together.

---

## Cross-Cutting Concerns

### Pipeline Sequencing
Evidence generation needs TORI tags and reflection classification as input. The existing reflection classifier is fire-and-forget. **Fix:** Chain them — classification returns a Promise, evidence generation awaits it. The upload endpoint still returns immediately; the whole chain runs in the background.

### Scope Resolution for Evidence
`resolveScope()` returns comments and consented student IDs. Evidence analytics uses `resolveScope()` only for the consented student ID list, then queries evidence moments separately with those IDs.

### Cache Invalidation
After evidence is generated (async, after upload), call `cacheInvalidate()` for evidence-related cache keys. Same pattern as existing upload cache invalidation.

### File Storage
Phase 3 artifact uploads stored on local disk initially (`data/artifacts/`). Spec notes the path to S3 when needed, but doesn't build it.

### Consent Filtering
Evidence moments are filtered by the same consent system as comments. `getConsentedStudentIds(scope)` extracted as a reusable helper from `resolveScope()` internals. Evidence queries filter `WHERE studentId IN (consented IDs)`.

### Reprocessing
Every EvidenceMoment stores `modelVersion`. For "latest in lineage" queries: evidence moments that have been superseded get `isLatest = false`. Analytics always filter `WHERE isLatest = true`. Simple boolean, no recursive CTE needed.

### LLM Cost Management
Narrative generation batches up to 5 comments per LLM call (modern models handle this well). Reduces API calls by ~80% vs. one-per-comment. Cross-link detection sends new node labels + existing node summaries in a single call per artifact (not per node).

---

## Open Questions for Jeffrey

1. **Backfill:** Should narrative evidence run on all historical comments? Estimated cost: ~$0.01-0.03 per comment batch.

2. **Outcome framework priority:** Gen-ed, ABET, nursing (ACEN), or custom first?

3. **File storage:** Local disk is fine for dev. When do we need S3?

4. **Student invite flow:** Admin invites students individually, or bulk invite from student roster?
