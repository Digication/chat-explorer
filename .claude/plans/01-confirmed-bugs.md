# Plan 1 — Confirmed Bugs

**Status:** Draft, awaiting approval
**Priority:** URGENT — blocks all other work
**Estimated scope:** ~1 day of focused work. Most bugs are small; #1 is the biggest and will cascade-fix several others.

## Why this plan exists

User reported several data-correctness and rendering bugs during Insights and Chat Explorer review. Most are small, but one — the heatmap scope filter — is a data correctness bug that silently shows wrong students and wrong numbers. Until this is fixed, no new features built on top of the analytics engine can be trusted.

Crucially, the scope filter bug CAUSES several other "No evidence found" symptoms (TORI Tag Frequency, Student Engagement) because the UI shows students/tags that don't actually exist in the scoped data, then correctly fails to find evidence for them. Fixing #1 cascades.

## The bugs

### 🔴 Bug 1 — Heatmap shows students not in the scoped course (ROOT CAUSE)

**Symptom:** User scopes Insights to Bucknell + ECE Fundamentals. Heatmap shows students like "Krista Matlack" who are only enrolled in a different course. Also causes flat sparklines because these wrongly-included students have no data in the scoped course.

**Root cause:** `src/server/services/analytics/heatmap.ts:50`
```typescript
const studentIds = resolved.consentedStudentIds;
```
`resolveScope()` returns `consentedStudentIds` which is the full institution roster filtered only by consent, NOT by whether the student has any comments in the scoped course.

**Fix:**
1. In `src/server/services/analytics/scope.ts`, after resolving comments for the scope, derive a `studentsWithCommentsInScope` list from `resolved.comments.map(c => c.studentId)`, deduped.
2. Return this alongside `consentedStudentIds` from the scope resolver (or compute it inside heatmap.ts).
3. In `heatmap.ts:50`, use the intersection: students who are both consented AND have at least one comment in the scope.

**Cascading effects (these will auto-resolve once #1 is fixed):**
- Flat sparklines will disappear (no more ghost students)
- "No evidence found" in Student Engagement drill-down will stop happening
- TORI Tag Frequency counts will match the evidence query

**Verification:** Scope to Bucknell + ECE Fundamentals, count the students shown in the heatmap, compare against a direct SQL query for "distinct students with comments in ECE Fundamentals assignments". Should match exactly.

---

### 🔴 Bug 2 — TORI Tag Frequency: "No evidence found" on tags with dozens of mentions

**Symptom:** Clicking a tag row like "Adaptive learning — 42 mentions" says "No evidence found".

**Most likely cause:** Same root cause as #1. The tag frequency count uses `resolved.comments` (scoped) but the evidence query uses a separate path that filters differently. If the mismatch isn't the scope filter, it's a field-name mismatch between the count path and the evidence path.

**Fix:**
1. First verify whether the fix for #1 resolves this. If yes, done.
2. If not, find the TORI Tag Frequency evidence query (likely a new function in `tori.ts` or reused from heatmap evidence). Ensure it uses the same scope filter predicates as the count.
3. Add pagination: evidence query should return first 20 results + a `hasMore` flag, so the UI can show "Showing 20 of 42" with a "Load more" button.

**UI change:** Update the TORI Tag Frequency popover to show a scrollable/paginated list with a count header like "Showing 1–20 of 42".

---

### 🔴 Bug 3 — Student Engagement drill-down: "No evidence found"

**Symptom:** Clicking a student in Student Engagement table says "No evidence found" instead of showing their comments.

**Root cause:** Probably cascades from #1 — ghost students appear in the table, click shows no evidence. But also: the user expected clicking to **open the thread panel on the side**, not show a popover.

**Fix:**
1. Verify #1 fix resolves the "No evidence found" case.
2. Wire the row click to call `onViewThread` (or open the ThreadPanel directly) showing that student's most recent reflection thread in the current scope.
3. If the student has multiple threads in scope, show the latest first; surface a dropdown for switching threads if more than one.

---

### 🔴 Bug 4 — Student Growth Over Time: "cannot query field growth on type query"

**Symptom:** Growth module shows: "Failed to load growth data; cannot query field growth on type query."

**Investigation result:** The schema IS correct. `growth` is declared in `src/server/types/schema.ts:563` and has a resolver in `src/server/resolvers/analytics.ts:118`. The client query in `src/lib/queries/analytics.ts:290` matches.

**Most likely cause:** Stale build. Either:
- The Docker dev container hasn't been rebuilt since `growth` was added (unlikely given the git history, but possible)
- The Railway production build is stale
- Apollo client has a cached schema that predates the `growth` field

**Fix (in priority order):**
1. Rebuild Docker dev environment: `docker compose down && docker compose up -d --build`
2. If still broken locally, add a server-side log at startup confirming `growth` is in the schema string
3. If local works but Railway doesn't, check the Railway deploy commit vs. when `growth` was added in git (`git log --oneline -- src/server/services/analytics/growth.ts`)
4. If Apollo cache is the culprit, add `fetchPolicy: 'network-only'` to the growth query temporarily to confirm

**Verification:** Run the query in GraphQL Playground directly (bypassing the client) to confirm the server exposes it.

---

### 🟡 Bug 5 — Chat Explorer breadcrumb: extra arrow between Course and Assignment

**Symptom:** Breadcrumb renders as `School › Course › [empty] › Assignments` — one too many arrows.

**Root cause (confirmed):** `src/components/insights/ScopeSelector.tsx:246-273`. MUI `<Breadcrumbs>` inserts a separator between each direct child. The Course section renders `<Button>` and `<Menu>` as two separate direct children of `<Breadcrumbs>`, while the Institution section (line 213) and Assignment section (line 276) correctly wrap their Button+Menu in React Fragments `<>...</>`. The portal-rendered `<Menu>` has no visible DOM but MUI still counts it as a segment → extra separator.

**Fix:** One-line change. Wrap the Course section's `<Button>` and `<Menu>` in a React Fragment, matching the pattern used for Institution and Assignment:

```tsx
{/* Course selector */}
<>
  <Button ...>Course...</Button>
  <Menu ...>...</Menu>
</>
```

**Verification:** Breadcrumb should render exactly three segments: School › Course › Assignment, with only two separator arrows.

---

### 🟡 Bug 6 — Apostrophes rendering as black-diamond question-marks

**Symptom:** Curly apostrophes (and possibly other non-ASCII punctuation) render as `` (Unicode replacement character U+FFFD) in chat panels. Inconsistent — some apostrophes render fine, others don't.

**Root cause:** `src/server/services/csv-parser.ts:160-166`. The `parse()` call doesn't specify an encoding, defaults to UTF-8. If some CSV rows contain Windows-1252 or Mac Roman encoded bytes (curly apostrophe = byte `0x92` in Windows-1252), parsing them as UTF-8 produces U+FFFD. The inconsistency suggests some rows/files are UTF-8 (render fine) while others are Windows-1252 (garbled).

**Fix (two-layered):**
1. **Parser layer:** Detect BOM and non-UTF-8 encoding at parse time. If the buffer contains bytes in the 0x80–0x9F range that aren't valid UTF-8 continuation bytes, re-decode as Windows-1252 using `iconv-lite` (already a common Node dependency; verify it's installed or add it).
2. **Sanitization layer:** Add a `normalizeText()` step in `tori-extractor.ts` (or the upload pipeline) that replaces any remaining U+FFFD with a best-guess apostrophe, and normalizes curly quotes to curly Unicode (not replaced with ASCII — preserve typography).
3. **Existing data:** Write a one-time migration/cleanup script that scans existing `Comment.text` for U+FFFD and repairs rows where we can confidently guess the original character. This is a best-effort fix for already-imported data.

**Verification:** Re-upload a known-problematic CSV after the fix and confirm apostrophes render correctly. Check a sample of existing comments post-migration.

---

### 🟡 Bug 7 — PII toggle ignored in Student Roster panel

**Symptom:** With "hide student names" enabled in settings, the Student Roster panel (slide-out from Chat Explorer) still shows full names.

**Root cause (confirmed):** `src/components/explorer/StudentListPanel.tsx:122` renders `{s.name}` directly. Other components like `HeatmapView.tsx` and `StudentEngagementTable.tsx` use the `useUserSettings()` hook and call `getDisplayName(name)` which handles the PII toggle. StudentListPanel doesn't use this hook.

**Fix:** Two-line change.
1. Import: `import { useUserSettings } from "@/lib/UserSettingsContext";`
2. Call hook: `const { getDisplayName } = useUserSettings();`
3. Replace `{s.name}` with `{getDisplayName(s.name)}`

**Check:** Grep for all places that render a student name in the Chat Explorer / Insights flow. Make sure every one uses `getDisplayName()`. The roster panel is probably not the only offender.

**Verification:** Toggle "hide names" in settings, navigate to Chat Explorer, open the roster panel. All names should show as initials.

---

## Execution plan

### Step 1 — Branch & baseline
Start from `main` on a feature branch called `fix/confirmed-bugs-plan-1`. This is risky-enough scope that we want isolation in case anything goes wrong.

### Step 2 — Fix order (within the branch)
1. **Bug 5** (breadcrumb) — one-line fix, verify in browser, commit
2. **Bug 7** (PII toggle roster) — two-line fix, grep for other offenders, commit
3. **Bug 4** (growth query) — rebuild docker, verify, commit any fix
4. **Bug 1** (heatmap scope filter) — biggest change, landing in the middle so we can verify cascade effects on bugs 2 and 3
5. **Bugs 2 & 3** (evidence popovers) — verify the cascade worked; if additional fixes needed, do them here
6. **Bug 6** (apostrophe encoding) — parser fix + sanitization + one-time cleanup script

### Step 3 — Verification
- Run unit tests: `docker compose exec chat-explorer pnpm test`
- Manual browser walk-through of the Insights page scoped to Bucknell + ECE Fundamentals:
  - Heatmap shows only students actually in that course
  - Click a heatmap cell → evidence appears
  - Click a TORI tag frequency row → evidence appears
  - Click a student in engagement → thread panel opens
  - Student Growth Over Time loads without error
  - Breadcrumb shows three segments, not four
  - With "hide names" on, roster panel shows initials
  - Apostrophes in comments render correctly
- Smoke test the Chat Explorer page too (breadcrumb + roster panel)

### Step 4 — Ship
- Commit each fix as a separate Conventional Commits message (`fix(insights): ...`)
- Push to `main`
- Confirm Railway deploy picks up the changes
- Re-verify on production

## Risks & mitigations

- **Risk:** Bug 1 fix might have unexpected effects on other analytics modules that also use `resolved.consentedStudentIds`.
  **Mitigation:** Grep for every use of `consentedStudentIds`. The fix should add a new field `studentsWithCommentsInScope` rather than replacing the existing one — keeps other modules unaffected until they opt in.

- **Risk:** Bug 6 apostrophe cleanup script could mangle text further if the guess is wrong.
  **Mitigation:** Run it in "dry-run" mode first, output before/after for a sample, review before committing to the real DB.

- **Risk:** Rebuilding Docker to test Bug 4 might take a while and block other work.
  **Mitigation:** Kick off the rebuild in the background while investigating other bugs.

## What this plan does NOT cover

- Any new features (those are in Plans 3–5)
- Any UX polish beyond "the bug stops happening" (those are in Plan 4)
- The reflection depth rewrite (Plan 3)
- The admin console (Plan 2)
- Pagination for TORI Tag Frequency is included as part of Bug 2 fix, but any broader pagination work is in Plan 4

## Success criteria

When this plan is done:
- All 7 bugs are fixed and verified in the browser
- A passing `pnpm test` run
- A deploy on Railway that shows the fixes in production
- No regressions in other Insights modules
- User can walk through Insights scoped to Bucknell + ECE Fundamentals without hitting any of the reported issues
