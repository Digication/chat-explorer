# Test Plan — Onboard & Task Skills

> Self-contained test plan. Execute in a fresh Claude Code session with no prior context.
> Covers the `/onboard` and `/task` skills with 13 scenarios.

## How to Execute This Plan

### Output

Save all test results to `.claude/tests/TEST_RESULTS.md` in the **original repo** (not the temp clone). This file will be reviewed in a separate session.

The results file should contain:
1. **Per-scenario results** — inputs, decision trace, generated output, issues, verdict
2. **Cross-scenario analysis** — decision coverage, consistency, uncovered paths
3. **Issues summary** — severity, description, which scenario
4. **Overall verdict** — PASS / FAIL / PARTIAL
5. **Raw agent outputs** — include the full output from each test agent (not summarized), so the reviewer can trace any issue back to the source

Use the report format from `.claude/skills/skill-test/references/REPORT_FORMAT.md`.

Write the file at the END after all scenarios complete — not incrementally.

### Setup

1. Clone the repo to a temp directory:
   ```bash
   TEMP_DIR=$(mktemp -d)/blueprint-test
   git clone /Volumes/Data/digication/claude-blueprint "$TEMP_DIR"
   cd "$TEMP_DIR"
   ```

2. Create a fake HOME to isolate global writes:
   ```bash
   export FAKE_HOME=$(mktemp -d)
   mkdir -p "$FAKE_HOME/.claude/output-styles"
   ```

3. Note: Onboard tests use `$FAKE_HOME` in place of `~` for all global file paths. Task tests use the cloned repo directly.

### Execution Strategy

- **Onboard tests (1–8):** Dry-run simulation — agents trace logic and report what WOULD be written. Use `$FAKE_HOME` paths for any file existence checks.
- **Task tests (9–13):** Integration tests — agents describe the exact git commands and expected git state. Run setup commands in the cloned repo before each test.
- Run independent scenarios in parallel (up to 4 at a time).
- Run state-dependent scenarios sequentially.

### Per-Scenario Cleanup (Task tests only)

After each task test, reset the cloned repo:
```bash
cd "$TEMP_DIR"
git checkout main 2>/dev/null
git stash clear
git branch -l 'task/*' | xargs -r git branch -D
git reset --hard HEAD
git clean -fd
```

### After-All Cleanup

```bash
rm -rf "$TEMP_DIR"
rm -rf "$FAKE_HOME"
```

---

## Part 1 — Onboard Skill Tests (Dry-Run)

Each agent should:
1. Read `.claude/skills/onboard/SKILL.md` and ALL files in `.claude/skills/onboard/references/`
2. Simulate the workflow with the given inputs
3. At each decision point: show Input → Rule matched → Result
4. Report the exact file content that WOULD be written to each file
5. Flag any ambiguities, gaps, or bugs

### Scenario 1: `fresh-guided-prototyping`

**Description:** Happy path — brand new user, maximum hand-holding.

**Pre-conditions:**
- `~/.claude/CLAUDE.md` does NOT exist
- `.claude/user-context.md` does NOT exist

**Simulated inputs:**
- Q1 (Coding Comfort): "Guide me step by step"
- Q2 (Purpose): "Prototyping"
- Q3 (Communication Style): "Explain everything"
- Step 5 confirmation: "Looks good — save it"

**Expected outcomes:**
- **Tier:** Guided
- **Safety posture:** Maximum safety (Rule 1: Guide me + Any → Maximum safety)
- **Output style:** Beginner-Friendly (installed to `~/.claude/output-styles/beginner.md`)
- **settings.json:** `"outputStyle": "Beginner-Friendly"`
- **`~/.claude/CLAUDE.md` must contain:**
  - `<!-- onboard:about-me -->` section with: "I am new to coding or this tool" and "clear, jargon-free explanations" — NO `{purpose}` text
  - `<!-- onboard:communication -->` section using **Guided** template (explain everything, plain language, use analogies)
  - `<!-- onboard:safety -->` section using **Maximum Safety** template + **Prototyping** purpose additions (prioritize speed, throwaway branches)
  - `<!-- onboard:profile-hint -->` section with `/onboard show` suggestion
- **`.claude/user-context.md` must contain:**
  - `<!-- onboard:purpose -->` markers
  - Prototyping purpose content from Purpose Additions
- **`~/.claude/CLAUDE.md` must NOT contain:** the word "prototyping" in the About Me section

**Verify:** Purpose lives in project file, not global CLAUDE.md About Me.

---

### Scenario 2: `fresh-expert-production-concise`

**Description:** Experienced user, minimal friction.

**Pre-conditions:**
- `~/.claude/CLAUDE.md` does NOT exist
- `.claude/user-context.md` does NOT exist

**Simulated inputs:**
- Q1: "Stay out of my way"
- Q2: "Production"
- Q3: "Be concise"
- Step 5: "Looks good — save it"

**Expected outcomes:**
- **Tier:** Expert
- **Safety posture:** Minimal (Rule 6: Stay out of my way + Concise + Any → Minimal)
- **Output style:** Expert (installed to `~/.claude/output-styles/expert.md`)
- **settings.json:** `"outputStyle": "Expert"`
- **`~/.claude/CLAUDE.md`:**
  - `<!-- onboard:about-me -->` — Expert template: no About Me content (or minimal)
  - `<!-- onboard:communication -->` — Expert template (be concise, skip explanations)
  - `<!-- onboard:safety -->` — Minimal template + Production additions (correctness, tests, branching, security)
  - `<!-- onboard:profile-hint -->` present
- **`.claude/user-context.md`:** Production purpose content

---

### Scenario 3: `fresh-supported-learning-teach-override`

**Description:** Tests communication style override — user picks "Teach as you go" which overrides the Supported tier's default.

**Pre-conditions:**
- `~/.claude/CLAUDE.md` does NOT exist

**Simulated inputs:**
- Q1: "Help me grow"
- Q2: "Learning"
- Q3: "Teach as you go"
- Step 5: "Looks good — save it"

**Expected outcomes:**
- **Tier:** Supported
- **Safety posture:** Maximum safety (Rule 2: Help me grow + Learning → Maximum safety)
- **Output style:** Supported (tier-based, not affected by Q3)
- **Communication section:** Must use **Teaching** template (NOT Supported default) — "explain reusable concepts", "point out patterns", "teach me to evaluate risks"
- **`.claude/user-context.md`:** Learning purpose content

**Verify:** Communication style override table is respected. Teaching template used instead of Supported default.

---

### Scenario 4: `fresh-standard-prototyping`

**Description:** Tests Speed Mode safety posture derivation.

**Pre-conditions:**
- `~/.claude/CLAUDE.md` does NOT exist

**Simulated inputs:**
- Q1: "Work alongside me"
- Q2: "Prototyping"
- Q3: "Explain risky things"
- Step 5: "Looks good — save it"

**Expected outcomes:**
- **Tier:** Standard
- **Safety posture:** Speed mode (Rule 4: Work alongside me + Prototyping → Speed mode)
- **Output style:** Standard
- **Communication:** Supported template (Q3 "Explain risky things" → Supported template via override table)
- **Safety section:** Speed Mode template + Prototyping additions
- **Safety recommendations should include:** `--enable-auto-mode` acceptable, throwaway branches

---

### Scenario 5: `level-up-guided-to-standard`

**Description:** Existing Guided user levels up to Standard. Purpose and style should be preserved from existing files.

**Pre-conditions:**
- `~/.claude/CLAUDE.md` EXISTS with Guided profile (About Me: "new to coding or this tool", Communication: Guided template, Safety: Maximum Safety)
- `.claude/user-context.md` EXISTS with: `<!-- onboard:purpose -->` Learning purpose content `<!-- /onboard:purpose -->`
- Argument: `level-up`

**Simulated inputs:**
- Step 1a picks: "Work alongside me"
- Step 5: "Looks good — save it"

**Expected outcomes:**
- **New tier:** Standard
- **Purpose:** PRESERVED from `.claude/user-context.md` — still Learning (NOT re-asked)
- **Communication style:** PRESERVED from existing CLAUDE.md — still Guided/Explain everything template (NOT re-asked)
- **Safety posture:** Re-derived → Rule 5: Work alongside me + Learning (non-Prototyping) → **Balanced**
- **Output style:** Standard (re-derived from new tier)
- **`.claude/user-context.md`:** Unchanged — still Learning content

**Verify:** Only the tier changed. Purpose and communication style were read from existing files, not re-asked.

---

### Scenario 6: `clear-profile`

**Description:** Remove all personalization, return to defaults.

**Pre-conditions:**
- `~/.claude/CLAUDE.md` EXISTS with Standard profile sections + one user-added section (`## My Custom Notes`)
- `.claude/user-context.md` EXISTS with purpose content
- `~/.claude/output-styles/standard.md` EXISTS
- `~/.claude/settings.json` has `"outputStyle": "Standard"`
- Argument: `clear`

**Simulated inputs:**
- (none — `clear` argument skips all questions)

**Expected outcomes:**
- **`~/.claude/CLAUDE.md`:** All `<!-- onboard:* -->` sections REMOVED. `## My Custom Notes` section PRESERVED. File NOT deleted (user content remains).
- **`.claude/user-context.md`:** DELETED
- **`~/.claude/output-styles/standard.md`:** DELETED
- **`~/.claude/settings.json`:** `"outputStyle"` removed (other settings preserved)
- **Message:** "Profile removed. Claude Code is back to default. Run `/onboard` anytime to set up again."

**Verify:** User-added sections survive. Only onboard markers are removed.

---

### Scenario 7: `show-profile`

**Description:** View current profile without modifications.

**Pre-conditions:**
- `~/.claude/CLAUDE.md` EXISTS with Expert profile
- `.claude/user-context.md` EXISTS with Production purpose
- Argument: `show`

**Simulated inputs:**
- (none — `show` displays and exits)

**Expected outcomes:**
- Displays: detected tier (Expert), purpose (Production from project file), communication style, safety posture
- **No files written or modified**
- **No AskUserQuestion calls** (except possibly the initial display)
- Execution stops after display

---

### Scenario 8: `expert-production-purpose-isolation`

**Description:** Focused verification that purpose is ONLY in project file, never in global CLAUDE.md.

**Pre-conditions:**
- `~/.claude/CLAUDE.md` does NOT exist

**Simulated inputs:**
- Q1: "Stay out of my way"
- Q2: "Production"
- Q3: "Be concise"
- Step 5: "Looks good — save it"

**Expected outcomes:**
- **`~/.claude/CLAUDE.md` About Me section:** Must NOT contain "production", "prototyping", "learning", or any purpose-related text
- **`~/.claude/CLAUDE.md` Safety section:** May reference purpose indirectly through Purpose Additions template (Production: correctness, tests, etc.) — this is OK, these are behavior instructions
- **`.claude/user-context.md`:** Must contain `<!-- onboard:purpose -->` with Production purpose content
- **Grep test:** `grep -i "purpose\|prototyping\|production projects" ~/.claude/CLAUDE.md` on the About Me section should return empty

**Verify:** Clean separation between identity (global) and purpose (project).

---

## Part 2 — Task Skill Tests (Integration)

Each agent should:
1. Read `.claude/skills/task/SKILL.md`
2. Describe the exact git commands that would be run
3. Describe the expected git state after each step
4. Flag any ambiguities in the skill instructions

### Scenario 9: `status-clean-repo`

**Description:** Check status on a clean repo.

**Setup commands:**
```bash
cd "$TEMP_DIR"
# Repo is already clean after clone
```

**Simulated input:** `/task` (no args — defaults to `status`)

**Expected outcomes:**
- Shows: current branch `main`
- Shows: no uncommitted changes
- Shows: no stashes
- Does NOT suggest `/task pause` (nothing to pause)
- Does NOT show any `task/*` branches

---

### Scenario 10: `start-dirty-stash-new-branch`

**Description:** Core workflow — dirty state, user stashes, creates branch from main.

**Setup commands:**
```bash
cd "$TEMP_DIR"
echo "work in progress" > src/temp-feature.ts
echo "modified" >> CLAUDE.md
git add src/temp-feature.ts
# Now: 1 staged new file, 1 unstaged modified file
```

**Simulated input:** `/task start "add login page"`
- Step 2 (dirty state): "Stash them"
- Step 3 (branch): "Create branch from main"

**Expected outcomes:**
- **Step 1:** Detects dirty state (1 staged, 1 modified) → proceeds to Step 2
- **Step 2 — Stash:**
  - Command: `git stash push -u -m "task: main - add login page"` (or similar descriptive message)
  - After: working tree clean
- **Step 3 — Branch:**
  - Command: `git checkout -b task/add-login-page main`
  - After: on branch `task/add-login-page`, clean working tree
- **Confirmation message** includes branch name

**Verify:**
```bash
git branch --show-current  # → task/add-login-page
git status --porcelain      # → empty
git stash list              # → stash@{0}: On main: task: main - add login page
```

---

### Scenario 11: `start-dirty-related-no-branch`

**Description:** User says changes are related to the new task, stays on current branch.

**Setup commands:**
```bash
cd "$TEMP_DIR"
echo "related work" > src/feature.ts
git add src/feature.ts
```

**Simulated input:** `/task start "continue feature"`
- Step 2 (dirty state): "They're related"
- Step 3 (branch): "Stay on current branch"

**Expected outcomes:**
- **Step 2:** No stash, no commit. Changes preserved as-is.
- **Step 3:** No branch created. Stay on `main`.
- **After:**
  ```bash
  git status --porcelain  # → A  src/feature.ts (still staged)
  git branch --show-current  # → main
  ```

**Verify:** Changes are untouched. No git operations performed on the working tree.

---

### Scenario 12: `pause-stash-and-resume`

**Description:** Full pause→resume cycle. Tests stash message format and resume flow.

**Setup commands:**
```bash
cd "$TEMP_DIR"
git checkout -b task/fix-nav
echo "nav fix" > src/nav.ts
echo "nav styles" > src/nav.css
git add .
```

**Part A — Pause:**

**Simulated input:** `/task pause`
- Choose: "Stash"

**Expected outcomes:**
- Detects 2 staged files
- Command: `git stash push -u -m "task: task/fix-nav - paused"`
- Asks: "Switch back to main branch?"
- If yes: `git checkout main`

**Verify after pause:**
```bash
git stash list  # → stash@{0}: On task/fix-nav: task: task/fix-nav - paused
git status --porcelain  # → empty
```

**Part B — Resume:**

**Simulated input:** `/task resume`
- Choose the stashed task

**Expected outcomes:**
- Lists: `task/fix-nav` branch + stash entry with "task: task/fix-nav - paused" message
- User picks the stash
- Switches to `task/fix-nav` branch: `git checkout task/fix-nav`
- Pops stash: `git stash pop`
- Shows restored state: 2 staged files

**Verify after resume:**
```bash
git branch --show-current  # → task/fix-nav
git status --porcelain     # → A  src/nav.ts, A  src/nav.css
```

---

### Scenario 13: `start-clean-new-branch`

**Description:** Clean repo, no dirty state handling needed — should skip straight to branch creation.

**Setup commands:**
```bash
cd "$TEMP_DIR"
# Repo is clean
```

**Simulated input:** `/task start "new feature"`
- Step 3 (branch): "Create branch `task/new-feature`"

**Expected outcomes:**
- **Step 1:** Detects clean state → skips Step 2 entirely
- **Step 3:** `git checkout -b task/new-feature`
- **No AskUserQuestion for dirty state** — the "uncommitted changes" question must NOT appear

**Verify:**
```bash
git branch --show-current  # → task/new-feature
git status --porcelain      # → empty
```

---

## Cross-Scenario Checks

After all scenarios complete, verify these cross-cutting concerns:

### Onboard Decision Table Coverage

| Rule # | Comfort | Purpose | Safety | Covered by |
|---|---|---|---|---|
| 1 | Guide me | Any | Maximum safety | Scenario 1 |
| 2 | Help me grow | Learning | Maximum safety | Scenario 3 |
| 3 | Help me grow | Any other | Balanced | (not explicitly tested — would need Help me grow + Prototyping) |
| 4 | Work alongside me | Prototyping | Speed mode | Scenario 4 |
| 5 | Work alongside me | Any other | Balanced | Scenario 5 (level-up re-derives) |
| 6 | Stay out of my way + Concise | Any | Minimal | Scenario 2 |
| 7 | Stay out of my way | Prototyping | Speed mode | (not explicitly tested — would need Expert + Prototyping + non-Concise style) |
| 8 | Stay out of my way | Any other | Balanced | (not explicitly tested — would need Expert + Production + non-Concise style) |

**Gap:** Rules 3, 7, 8 have no dedicated scenario. Note in report but acceptable for v1 — they are straightforward first-match-wins lookups.

### Purpose Isolation Check

Across ALL onboard scenarios, verify:
- `.claude/user-context.md` contains purpose with `<!-- onboard:purpose -->` markers
- `~/.claude/CLAUDE.md` About Me section contains NO purpose text
- Purpose Additions (behavioral instructions) in safety section are acceptable

### Task Skill Branch Naming

Across scenarios 10, 12, 13, verify:
- All branches follow `task/{kebab-case}` format
- Names derived from description, not arbitrary

---

## Report Format

Use the standard report format from `.claude/skills/skill-test/references/REPORT_FORMAT.md`. Include:

1. Per-scenario: inputs, decision trace, generated output, issues, verdict
2. Cross-scenario: decision coverage table, consistency check, uncovered paths
3. Issues summary with severity (Bug / Ambiguity / Gap)
4. Overall verdict: PASS / FAIL / PARTIAL
