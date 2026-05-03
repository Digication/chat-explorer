# Phase 7 — Spec Critique & Plan to Get Ready for a One-Shot Build

**Date:** 2026-04-16
**Branch:** `feat/outcomes-evidence-trees`
**Author:** handoff doc written at end of session before context reset
**Next session goal:** Resolve the open questions in this doc, write a ready-for-build Phase 7 plan, then implement in one clean shot.

---

## 1. Where we are right now

### Shipped this session

- **Phase 3 (Artifacts & Section-Level Analysis) is complete.** Faculty + student UI, upload/download, background analyzer, wrap-thread-as-artifact, GraphQL layer, E2E smoke test.
- **Bug fix post-merge:** `e21b5b8` — UI queries asked for `Student.name` but the GraphQL type exposes `displayName`. Field validation failed silently, Apollo surfaced `data.artifacts = null`. Fixed by renaming on the client.
- **Browser verification complete (2026-04-16)** via Chrome MCP:
  - `/artifacts` list renders (empty + populated)
  - `/artifacts/:id` detail renders with sections and metadata
  - `/artifacts/<bad-id>` shows graceful "not found" alert
  - Upload dialog opens with all fields
  - "Save as artifact" in ThreadPanel creates CONVERSATION artifact with one COMMENT section per user message
  - No console errors
- **Known limitation (not a regression):** `digication_admin` can't upload artifacts because `artifact-service.ts` requires `user.institutionId`. Instructor or institution admin account is needed to test the full upload→PROCESSING→ANALYZED round-trip.
- **Git state:** clean working tree. 10 Phase 3 commits + 1 docs commit (`3f5d445`) on `feat/outcomes-evidence-trees`.

### What's next (by user's explicit choice)

**Phase 7 — Student Dashboard & Views** (skipping ahead of Phases 4, 5, 6).

The user wants this to be a **one-shot high-quality session**, which means the existing Phase 7 spec needs to be tightened before we start writing code.

---

## 2. What the existing Phase 7 spec says

### Source docs
- `.claude/plans/outcomes-implementation-plan.md` lines 85–234 (high-level)
- `.claude/plans/outcomes-technical-spec.md` lines 1974–2028 (detailed — about 50 lines)
- `.claude/plans/outcomes-spec-critique.md` (no Phase 7-specific items)

### Summary of what it asks for

**`src/pages/student/StudentDashboardPage.tsx`** (replaces placeholder at `/student`):
- Welcome header with student name
- Stats row: evidence moment count, artifact count, course count, reflection count
- Recent activity: latest evidence moments
- My Artifacts: card list with status
- Quick links to tree, growth, outcomes

**`src/pages/student/StudentGrowthPage.tsx`** (replaces placeholder at `/student/growth`):
- "Growth bar cards per outcome with plain-language descriptions" (one line only)

**GraphQL:**
```graphql
type StudentDashboardData {
  evidenceMomentCount: Int!
  artifactCount: Int!
  courseCount: Int!
  reflectionCount: Int!
  recentMoments: [EvidenceMoment!]!
  artifacts: [Artifact!]!
}
# Query: myDashboard: StudentDashboardData!
```

**Tests:** one line — "StudentDashboard component, StudentGrowthPage, E2E for student flow."

**Browser verification checklist:** 6 bullet checks.

---

## 3. Critique — where the spec will bite us

Overall grade: **6/10 for one-shot readiness.** The shape is right, no new tables needed, data exists. But there are enough under-specified forks that we'd hit them mid-coding and have to stop for decisions.

### Ordered by severity (high → low)

#### 🔴 Gap 1 — Spec assumes Phase 5 is built; it isn't
The dashboard has "quick links to tree, growth, outcomes." Phase 4 (tree) and Phase 5 (outcomes hub) don't exist yet. Links would go to empty placeholder pages.

#### 🔴 Gap 2 — "Growth" math is undefined
`StudentGrowthPage.tsx` is described in one line: *"growth bar cards per outcome with plain-language descriptions."* That could mean any of:
- Count of evidence moments per outcome
- Average strength level per outcome (numerical encoding)
- **Distribution of strength levels per outcome (body-of-evidence pattern)**
- Time-series trend (needs historical snapshots we don't have)
- Latest strength only

Without a decision, we'd pick one mid-session.

#### 🔴 Gap 3 — `reflectionCount` depends on Phase 6 which isn't built
`GuidedReflection` entity doesn't exist yet. What counts as a reflection for Phase 7?

#### 🟡 Gap 4 — "Recent activity" is vague
- How many moments?
- Sorted by what field? (`processedAt`? moment creation?)
- Grouped by artifact, or flat list?
- Click target — we don't have a per-moment detail page

#### 🟡 Gap 5 — No wireframe / visual layout
Bullets aren't enough for MUI layouts. A 5-minute layout sketch prevents redo.

#### 🟡 Gap 6 — Test plan is one sentence
Phase 3 shipped without E2E for the upload flow (Chrome verification caught the `displayName` bug, not a test). For one-shot quality we need: fixtures, assertions, named E2E user journey.

#### 🟡 Gap 7 — GraphQL error contract unspecified
Zero-moment, zero-artifact student — return zeros + empty arrays, or throw? The frontend needs to know. Also: `myDashboard` permissions — student only? What error for unauthenticated?

#### 🟡 Gap 8 — No "done" checklist
The 6-bullet browser checklist is there but thin. No typecheck/test/E2E gates explicitly locked.

#### 🟡 Gap 9 — Permissions aren't spelled out
The existing `artifacts` resolver scopes by role. `myDashboard` needs its own auth — `requireStudent` on the resolver, student-scoped queries only.

#### 🟡 Gap 10 — Existing placeholders — overwrite or add?
4 student pages exist as empty "Welcome!" cards in `src/pages/student/`. We'd overwrite `StudentDashboardPage.tsx` and `StudentGrowthPage.tsx`. Confirm this rather than additive.

#### 🟡 Gap 11 — Copy for "plain-language descriptions"
Does the page show the raw `OutcomeDefinition.description` (written for faculty), or new student-friendly copy? We don't have student-voice content.

---

## 4. Proposed decisions to close each gap

These are my recommendations. User needs to review before we lock them.

| Gap | Proposed decision |
|---|---|
| 1 — Phase 5 not built | **Scope Phase 7 to only what's supported by Phases 1–3.** Drop tree/outcomes links from the dashboard for now. Keep only: artifact detail links + (optionally) a "coming soon" stub for growth/tree. |
| 2 — Growth math | **Distribution of strength levels per outcome.** Stacked horizontal bar: count of EXEMPLARY / DEMONSTRATING / DEVELOPING / EMERGING moments per `OutcomeDefinition`. Matches the body-of-evidence principle from PR #5. |
| 3 — `reflectionCount` | **Drop it from v1.** Re-add in Phase 6 when GuidedReflection ships. |
| 4 — Recent activity | Latest **5 evidence moments**, sorted by `processedAt DESC`, flat list. Each row: narrative + artifact title + date. Click → `/artifacts/:id` (anchored to the section if easy, else top). |
| 5 — Wireframe | Add an ASCII/prose layout block to the ready-for-build doc before coding. |
| 6 — Test plan | See §6 below — full layered plan. |
| 7 — GraphQL contract | Empty states return zeros + empty arrays (never throw). Errors use standard GraphQL `extensions.code` (`UNAUTHENTICATED`, `FORBIDDEN`). |
| 8 — Done checklist | Lock: typecheck clean + unit tests + component tests + E2E + Chrome MCP browser verification on both pages. |
| 9 — Permissions | `myDashboard` resolver wrapped in `requireStudent(ctx)` (add this helper if missing — Phase 1 introduced `requireAuth`, this would narrow it). Queries scoped to the caller's `studentId`. |
| 10 — Overwrite placeholders | **Yes, overwrite.** Placeholders are 30-line "coming soon" cards — no real content to preserve. |
| 11 — Copy | **v1: use `OutcomeDefinition.description` directly** (faculty-written text). Flag "student-voice copy" as a later polish pass. Acceptable because the description is already part of the data model. |

---

## 5. Proposed page layouts (ASCII sketches)

### StudentDashboardPage (`/student`)

```
┌───────────────────────────────────────────────────────┐
│ Welcome back, {firstName}!                            │
│ Your learning at a glance.                            │
├───────────────────────────────────────────────────────┤
│ ┌────────┐  ┌────────┐  ┌────────┐                    │
│ │ 12     │  │ 3      │  │ 2      │                    │
│ │ moments│  │artifacts│ │courses │   (stats row)     │
│ └────────┘  └────────┘  └────────┘                    │
├───────────────────────────────────────────────────────┤
│ Recent evidence                                       │
│ ─────────────────────────────────────────────────     │
│ • {narrative preview…}  ·  {artifact title}  · 2d ago │
│ • {narrative preview…}  ·  {artifact title}  · 4d ago │
│   (up to 5 items)                                     │
├───────────────────────────────────────────────────────┤
│ My artifacts                                          │
│ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐   │
│ │ Title         │ │ Title         │ │ Title       │   │
│ │ status chip   │ │ status chip   │ │ status chip │   │
│ │ 3 sections    │ │ 1 section     │ │ processing  │   │
│ └───────────────┘ └───────────────┘ └─────────────┘   │
└───────────────────────────────────────────────────────┘
```

### StudentGrowthPage (`/student/growth`)

```
┌───────────────────────────────────────────────────────┐
│ My growth                                             │
│ How your evidence stacks up across outcomes.          │
├───────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐   │
│ │ CRITICAL THINKING                               │   │
│ │ {description copy from OutcomeDefinition}       │   │
│ │ ██████░░░░░░░░░░  ← stacked: exemplary / demo  │   │
│ │                    / developing / emerging     │   │
│ │ Based on 7 evidence moments                     │   │
│ └─────────────────────────────────────────────────┘   │
│ (one card per outcome the student has ANY evidence on)│
└───────────────────────────────────────────────────────┘
```

---

## 6. Test plan (concrete, layered)

### Unit (resolver)

File: `src/server/resolvers/__tests__/student-dashboard.test.ts`

Cases:
1. Empty student — returns all counts = 0, empty arrays
2. Populated student — counts match fixtures; recent moments sorted `processedAt DESC`; capped at 5
3. Non-student role — throws `FORBIDDEN`
4. Unauthenticated — throws `UNAUTHENTICATED`
5. Student from institution A doesn't see moments from institution B (cross-tenant isolation)

### Component (React + MockedProvider)

Files:
- `src/pages/student/__tests__/StudentDashboardPage.test.tsx`
- `src/pages/student/__tests__/StudentGrowthPage.test.tsx`

Cases per page: loading, error, empty, populated.

### E2E (Playwright)

File: `e2e/student-dashboard.spec.ts`

Journey:
1. Login as student
2. Land on `/student`
3. Assert stats row rendered
4. Assert at least one recent-moment item (from seed)
5. Click an artifact card → land on `/artifacts/:id`
6. Navigate back to `/student/growth`
7. Assert at least one outcome growth card

### Browser verification (Chrome MCP) — mandatory

Checklist:
- [ ] `/student` renders for a seeded student
- [ ] Stats numbers match DB
- [ ] Recent moments clickable to artifact
- [ ] `/student/growth` renders distribution bars
- [ ] No console errors
- [ ] Faculty-only pages blocked for students (sanity check Phase 1 routing still holds)

---

## 7. Action plan for the new session

Execute in this order:

1. **Read this doc first.** It has all the context. Also skim `.claude/plans/outcomes-progress.md` for Phase 3 state.
2. **Ask the user** to confirm or adjust decisions in §4. The ones most worth flagging:
   - Drop tree/outcomes links from dashboard in v1? (Gap 1)
   - Growth = distribution stacked bar? (Gap 2)
   - Drop `reflectionCount`? (Gap 3)
   - Use `OutcomeDefinition.description` as-is for v1 copy? (Gap 11)
3. **Write** `.claude/plans/outcomes-phase-7-ready.md` — the locked implementation spec incorporating decisions. Include:
   - Final GraphQL schema (`StudentDashboardData` + any growth type)
   - File list with paths
   - Both ASCII wireframes from §5
   - The layered test plan from §6
   - Explicit done checklist
4. **Get user sign-off** on the ready doc.
5. **Implement** in one shot. Suggested order:
   - Entity registration / migrations: NONE needed
   - GraphQL types in `schema.ts`
   - `student-dashboard.ts` resolver + register in resolver index
   - Add `requireStudent` helper if it doesn't exist
   - Query files in `src/lib/queries/student-dashboard.ts`
   - `StudentDashboardPage.tsx` (overwrite placeholder)
   - `StudentGrowthPage.tsx` (overwrite placeholder)
   - Unit + component tests
   - E2E spec
6. **Run the gates:** typecheck, all tests, Chrome MCP browser verification.
7. **Commit in logical chunks** using Conventional Commits (`feat(student-dashboard): ...`).
8. **Update `outcomes-progress.md`** to mark Phase 7 complete with verification notes.

---

## 8. Open questions requiring user input before coding

Copy/paste this block into the new session to get unblocked fast:

> Before we start Phase 7, four quick decisions:
> 1. Dashboard "quick links" — drop tree/outcomes links since those pages don't exist yet? (or stub "coming soon" placeholders?)
> 2. Growth page math — stacked strength-level distribution per outcome (body-of-evidence style)? (vs. count, average, or trend)
> 3. `reflectionCount` stat — drop from v1 (re-add in Phase 6)?
> 4. For v1 outcome copy, use `OutcomeDefinition.description` verbatim (faculty-written) — OK for now?

---

## 9. Git state at handoff

- **Branch:** `feat/outcomes-evidence-trees`
- **Working tree:** clean
- **Last commit:** `3f5d445 docs(outcomes): record Phase 3 browser verification results`
- **Git identity (just fixed this session):** `Jeffrey Yan <jyan@digication.com>`
- **Note:** Commit `3f5d445` itself was made before the git identity was fixed, so it carries the old auto-generated email. Harmless (local-only), but can be amended before merging to `main` if desired.

---

## 10. Reference files to read in the new session

- This file (you're reading it)
- `.claude/plans/outcomes-progress.md` — Phase-by-phase progress tracker
- `.claude/plans/outcomes-technical-spec.md` lines 1970–2030 — the existing Phase 7 spec (thin)
- `src/pages/student/StudentDashboardPage.tsx` — placeholder to overwrite
- `src/pages/student/StudentGrowthPage.tsx` — placeholder to overwrite
- `src/lib/queries/student.ts` — existing student queries (for pattern matching)
- `src/lib/useStudentContext.ts` — hook exposing the logged-in student's profile
- `src/server/resolvers/artifact.ts` — reference implementation for role-scoped resolver with field resolvers
- `src/server/resolvers/middleware/auth.ts` — has `requireAuth`; check if `requireStudent` exists, add if not

---

*End of handoff doc. New session: read §1–§3 for context, then §7 step 2 to unblock.*
