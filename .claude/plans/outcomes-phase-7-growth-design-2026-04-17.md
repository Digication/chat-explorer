# Phase 7 — Growth Page Design Exploration

**Date:** 2026-04-17
**Branch:** `feat/outcomes-evidence-trees`
**Status:** Design exploration in progress. **No code written.** Prototype exists but needs visual design work before locking the spec.
**User verdict:** "Concept seems good. Visuals aren't working yet. Taking a break for a couple of days to get fresh eyes."

---

## 1. Decisions locked so far

| # | Decision | Status |
|---|----------|--------|
| 1 | Dashboard "quick links" to unbuilt pages → **show "Coming soon" stubs** (not drop entirely) | ✅ Locked |
| 3 | `reflectionCount` stat → **drop from v1** (Phase 6 entity doesn't exist) | ✅ Locked |
| 2 | Growth page visualization → **NOT a stacked strength-level bar** (see §2 below for full reasoning) | ✅ Locked (what it's NOT) |
| 2 | Growth page visualization → **use three dimensions: envelope/reach, breadth of evidence, recency** | ✅ Locked (direction) |
| 2 | Growth page visualization → **specific visual form TBD** (prototype v1 rejected on visual grounds) | ⏳ Open |
| 4 | Outcome copy → **use `OutcomeDefinition.description` (faculty copy) as collapsible disclosure**, with personalized AI narrative as primary | ✅ Locked |
| — | Strength levels (EMERGING etc.) → **hide from student UI for v1**; keep in data model; rethink faculty bar later | ✅ Locked (lean — user said "I'm not sure yet" but leaned drop) |
| — | Faculty strength bar → **will need rethinking** (same critique applies) | ✅ Acknowledged, deferred |

---

## 2. The philosophical reframe (read this before designing anything)

### Why the stacked bar was rejected

The stacked strength-level bar (EMERGING / DEVELOPING / DEMONSTRATING / EXEMPLARY counts per outcome) was rejected because it commits a **category error**: it treats evidence moments as samples of a rate that should trend upward. But:

1. **TORI outcomes are durable skills.** Jeffrey's position: every TORI category is a durable skill (like riding a bike). Once internalized, they don't vanish. A student who demonstrated perspective-shifting last month and didn't demonstrate it this week hasn't *regressed* — this week's assignment/reflection simply didn't call for it.

2. **Three kinds of learning behave differently:**
   - **Durable skills** — once cemented, persistent (may get rusty but don't disappear)
   - **Content knowledge** — decays without use (but that's OK — we extract durable skills from content)
   - **Practice/recency** — orthogonal to capability. Not practicing doesn't mean not capable. But: durable skills need a **cementing period** of repeated practice before they become persistent. One-day beginner bike rider ≠ six-month daily rider, even though both "can ride."

3. **Aggregating strength levels across time produces misleading statistics.** A student with 3 "emerging" moments and 3 "demonstrating" moments looks like a 50/50 split — but those emerging moments might be from first-year work and the demonstrating moments from this semester. The bar erases the growth story.

4. **The strength-level labels themselves are problematic.** They're defined in the LLM prompt (`narrative-generator.ts` lines 80–84), not derived from any published rubric. Showing them to students implies a grade/judgment that opens questions of trust ("who decides? do we trust AI to judge?"). The user wants to **drop strength levels from student-facing UI** but keep reflection depth as the only endorsed "strength" signal for now.

### The three honest dimensions

Instead of strength-level aggregation, the growth page should show three facts per outcome:

| Dimension | What it measures | How to show it |
|---|---|---|
| **Envelope / peak reach** | Acquisition — the highest sophistication the student has demonstrated. Once earned, stays. | Show the actual "peak moment" quote + AI narrative. Let the evidence speak. |
| **Breadth of evidence** | Cementing — how many different contexts/artifacts have produced evidence. More contexts = more robust skill. | Count of distinct artifacts/contexts (e.g., "4 contexts" with dots). |
| **Recent activity** | Practice fitness — is the skill being exercised currently? Not a judgment, just a fact. | Time-since-last ("4 days ago" or "5 weeks ago"). Stated neutrally. |

### The personalization-at-scale insight

Jeffrey's key product insight: **"Perspective shifting for an engineer looks different from a nurse or a lawyer."** Pre-AI, educators couldn't personalize at scale. Post-AI, we can:

- Each student's outcome card should show a **personalized AI narrative** ("what this has looked like for YOU") drawn from their own evidence, language, and context.
- The faculty-written `OutcomeDefinition.description` becomes a collapsible secondary reference, not the headline.
- The outcomes hub (institutional view) provides **convergence** — finding commonality across students' personalized versions.
- This is the product's "secret sauce": divergence (every student is unique) + convergence (the institution can still report across students).

### Reflection-as-cementing (not a caveat)

The concern was raised that TORI measures *reflection about* a skill, not *deployment of* the skill itself. Jeffrey's reframe: reflection IS the mechanism that converts raw experience into durable skill. Experience alone doesn't guarantee learning — it's reflection that does the neurological cementing. So evidence moments aren't a surrogate for the skill; they ARE the skill-cementing events. No apologetic disclaimers needed on the student page.

---

## 3. Prototype built

**File:** `prototype-student-growth.html` (project root, alongside existing prototypes)
**Access:** `http://127.0.0.1:8765/prototype-student-growth.html` (if local server running) or open directly in browser

### What's in it

Three tabs:
1. **Your Territory** — 6 TORI domains as clusters. Each shows touched outcomes as pills with breadth (dots), recency (chip). Click any outcome → inline-expands a detail card with:
   - Personalized "what this looks like for you" AI narrative
   - Collapsible institutional definition
   - Three dimension boxes (reach/breadth/recency as prose)
   - PEAK moment + other evidence moments with quotes
2. **Recent Reflections** — last 5 moments as a timeline stream
3. **Then vs. Now** — 3 paired comparisons showing same-kind-of-challenge earlier vs. later (envelope view)

### Fictitious data

Engineering student "Maya Rodriguez," junior/senior at Capstone stage. ~15 evidence moments across Domains 1–5. Domain 6 untouched. Outcomes touched: Perspective Shifting (4 contexts), Problem-Solving (3), Integrative Thinking (2), Critical Thinking (2), Emotional Differentiation (2), Resilience (3), Feedback Processing (3), Conflict Management (2), Learning from Others (2), Mindset Development (2), Self-Efficacy (2), Goals & Motivation (1), Ethics (1).

### User feedback

> "At first look I'm not sure whether it's the lack of graphics and good graphic design that bothers me but this is definitely not working at the moment. I must say that I might be a little bit biased because the concept seems to be good."

**Translation:** The interaction model and content structure may be right, but the visual execution doesn't sell it. Needs real graphic design attention — possibly different spatial layout, better typography, visual hierarchy, or non-text visual elements (the prototype is currently all text/pills/cards with no graphical visualization component).

### Open design questions from the prototype

1. **Pill density** — should untouched outcomes show as faint pills alongside touched ones, so students see what's *available*?
2. **Dimension boxes** — currently prose-only. Should there be a glanceable glyph or shape per dimension?
3. **PEAK badge** — is ranking moments by "peak" re-introducing the scoreboard feeling?
4. **Recent Reflections** — 5 items enough? Filterable? Grouped by week?
5. **Then vs. Now** pair selection — how does the system auto-pick which pairs to show?

---

## 4. Existing prototypes with relevant tabs

Three earlier prototypes contain design ideas that informed this work. Key tabs to re-examine:

| Prototype | Relevant tab | Why it matters |
|---|---|---|
| `prototype-conceptual-tree.html` | **My Outcome Map** | Ranked evidence moments as primary unit, source badges — closest to what the growth detail card does |
| `prototype-conceptual-tree.html` | **Then vs. Now** | Side-by-side quote comparison showing envelope — directly adopted in the prototype |
| `prototype-conceptual-tree.html` | **My Growth** | Uses mini bar charts (now suspect) BUT has per-outcome prose narrative worth keeping |
| `prototype-outcomes-hub.html` | **Topological Profiles** | Radar with overlay shapes — personalized per-student "signature." Convergence metric. |
| `prototype-outcomes-hub.html` | **Growth Over Time** | Alluvial/river visualization — streams widening as evidence accumulates. Non-bar metaphor for growth. Skipped for v1 but worth revisiting. |
| `prototype-guided-reflection.html` | **Reflection Timing** | Three natural reflection moments (during creation, after completion, after feedback) — anchors the reflection-as-cementing thesis |

---

## 5. TORI domain structure (for reference)

6 domains, ~55 total categories (including sub-categories):

| # | Domain | Skills | Color token |
|---|--------|--------|-------------|
| 1 | Cognitive & Analytical Reflection | 15 | `--cognitive: #0288D1` |
| 2 | Emotional & Affective Reflection | 8 | `--emotional: #c62828` |
| 3 | Social & Interpersonal Reflection | 14 | `--social: #2e7d32` |
| 4 | Personal Growth & Self-Development | 13 | `--personal: #7b1fa2` |
| 5 | Cultural, Ethical & Contextual | 9+ | `--cultural: #e65100` |
| 6 | Life Transitions & Broader Development | varies | `--life: #00695c` |

Colors are from `prototype-outcomes-hub.html` CSS variables.

---

## 6. Strength level provenance

The 4-level scale (EMERGING / DEVELOPING / DEMONSTRATING / EXEMPLARY) is:
- **Defined in:** `src/server/entities/EvidenceOutcomeLink.ts` (enum)
- **Assigned by:** LLM prompt in `src/server/services/evidence/narrative-generator.ts` lines 80–84
- **Colors in faculty UI:** `src/components/insights/EvidenceTabPanel.tsx` — EMERGING=#90caf9 (blue), DEVELOPING=#66bb6a (green), DEMONSTRATING=#ffa726 (orange), EXEMPLARY=#ab47bc (purple)
- **Not derived from** any published rubric or learning-science framework
- **Decision:** hide from student UI, keep in data model, rethink faculty bar later

---

## 7. Other Phase 7 decisions still open

These were surfaced in the design conversation but NOT yet answered. Ask the user when resuming:

### Dashboard page (`/student`)
- Stats row: 3 cards (moments, artifacts, courses). Layout, icons, clickability?
- Recent evidence: 5 rows, sorted processedAt DESC, click → `/artifacts/:id`?
- My artifacts: grid of cards or list? How many shown?
- Empty-state: what does a brand-new student see?
- "Coming soon" stubs: inline cards on dashboard, or just leave existing placeholder pages accessible from sidebar?

### Growth page
- Visual form: the concept is right but the visual design needs work. Resume here.
- One page vs. progressive disclosure (domain map → outcome detail → evidence moments)?

### Navigation / routing
- Does student auto-redirect to `/student` after login?
- Breadcrumbs: none for v1?

### Permissions
- `requireStudent` helper — add it?
- FAILED artifacts visible to students?
- Cross-tenant isolation tests?

### Data/schema
- `myDashboard` vs `myGrowth` — split queries?
- Growth query: include outcomes with zero evidence?

### Faculty bar rethink
- Same critique applies but deferred. Track as a separate task.

---

## 8. Git state at handoff

- **Branch:** `feat/outcomes-evidence-trees`
- **Working tree:** clean (prototype-student-growth.html is untracked)
- **Last commit:** `a0b732c docs(outcomes): handoff doc with Phase 7 critique and fix plan`
- **Prototype file:** `prototype-student-growth.html` — not committed (throwaway design artifact)

---

## 9. How to resume

1. Read THIS doc first (`.claude/plans/outcomes-phase-7-growth-design-2026-04-17.md`)
2. Read the earlier critique: `.claude/plans/outcomes-phase-7-critique-2026-04-16.md` (for the 11 gaps and test plan — those are still valid)
3. Open `prototype-student-growth.html` in a browser
4. The user will likely want to iterate on the visual design before locking anything
5. Do NOT write production code until the visual form is decided and a locked spec (`.claude/plans/outcomes-phase-7-ready.md`) is written
6. The 41 detailed UI questions from the 2026-04-16 session (§B in the conversation) are partially answered — see §7 above for what's still open

---

*End of handoff doc.*
