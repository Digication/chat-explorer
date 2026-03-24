# Test Plan — All Skills

> Self-contained test plan. Execute in a fresh Claude Code session with no prior context.
> Covers `/onboard`, `/task`, `/commit`, `/implement`, `/retrospective`, and `/skill-dev` skills.

## How to Execute This Plan

### Output

Save all test results to `.claude/tests/TEST_RESULTS.md` in the **original repo** (not the temp clone). This file will be reviewed in a separate session.

The results file should contain:
1. **Per-scenario results** — inputs, decision trace, generated output, issues, verdict
2. **Cross-scenario analysis** — decision coverage, consistency, uncovered paths
3. **Issues summary** — severity, description, which scenario
4. **Overall verdict** — PASS / FAIL / PARTIAL
5. **Raw agent outputs** — include the full output from each test agent (not summarized), so the reviewer can trace any issue back to the source

Use the report format from `.claude/skills/skill-dev/references/REPORT_FORMAT.md`.

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

## Part 3 — commit Tests (Integration)

> Temp Clone required. Each scenario initializes its own git repo state inside `$TEMP_DIR`.

### Scenario 14: `happy-path-single-fix`

**Description:** A single modified file is unstaged; the skill stages it, infers `fix` type, and creates a well-formed commit.

**Pre-conditions:**
- One tracked file modified but not staged
- At least one prior commit exists

**Setup commands:**
```bash
cd "$TEMP_DIR"
git init test-commit && cd test-commit
git config user.email "test@example.com"
git config user.name "Test User"
echo "export function add(a, b) { return a - b; }" > math.js
git add math.js && git commit -m "feat: add math utility"
echo "export function add(a, b) { return a + b; }" > math.js
```

**Simulated inputs:**
- Approval to stage `math.js`: yes
- Proposed message: `fix: correct addition operator in math utility` → yes

**Expected outcomes:**
- `math.js` committed, working tree clean
- Commit message matches `fix:` prefix, imperative mood, under 72 chars
- No new branches created

**Verify:**
```bash
git status --porcelain                      # empty
git log --oneline -1 | grep -E '^[a-f0-9]+ fix:'  # matches
test "$(git rev-list --count HEAD)" -eq 2   # exactly 2 commits
```

---

### Scenario 15: `multi-file-scope-inference`

**Description:** Changes span multiple directories with no explicit scope; skill infers or omits scope and produces a valid message.

**Pre-conditions:**
- Three files modified across two directories, all unstaged

**Setup commands:**
```bash
cd "$TEMP_DIR"
git init test-commit-multi && cd test-commit-multi
git config user.email "test@example.com"
git config user.name "Test User"
mkdir -p src/api src/ui
echo "// v1" > src/api/routes.js
echo "// v1" > src/ui/App.js
echo "// v1" > src/ui/Header.js
git add . && git commit -m "feat: scaffold project"
echo "// v2" > src/api/routes.js
echo "// v2" > src/ui/App.js
echo "// v2" > src/ui/Header.js
```

**Simulated inputs:**
- Approval to stage all 3 files: yes
- Proposed message: yes

**Expected outcomes:**
- All 3 files in a single commit
- Scope is either omitted or a single token (never multi-path)
- Description under 72 chars, imperative mood

**Verify:**
```bash
git status --porcelain   # empty
git log --oneline -1 | grep -E '^[a-f0-9]+ (feat|fix|refactor|chore)(\([a-z-]+\))?: .{1,72}$'
git show --name-only --format="" HEAD | wc -l  # 3 files
```

---

### Scenario 16: `branch-creation`

**Description:** User explicitly requests a new branch before committing.

**Pre-conditions:**
- One unstaged change, on `main` branch

**Setup commands:**
```bash
cd "$TEMP_DIR"
git init test-commit-branch && cd test-commit-branch
git config user.email "test@example.com"
git config user.name "Test User"
echo "# App" > README.md
git add README.md && git commit -m "chore: initial commit"
echo "export const VERSION = '1.1.0';" > version.js
```

**Simulated inputs:**
- User message: "create a new branch and commit this"
- Branch name suggestion: accept
- Stage `version.js`: yes
- Commit message: yes

**Expected outcomes:**
- New branch created following `type/short-description` pattern
- Commit exists on new branch, not on `main`
- Branch name lowercase with hyphens only
- Working tree clean

**Verify:**
```bash
current=$(git rev-parse --abbrev-ref HEAD)
test "$current" != "main"
echo "$current" | grep -E '^(feat|fix|refactor|chore)/[a-z0-9-]+$'
test "$(git rev-list --count main)" -eq 1   # main unchanged
test "$(git rev-list --count HEAD ^main)" -eq 1  # one new commit
```

---

### Scenario 17: `already-staged-partial`

**Description:** Some files staged, others not — skill confirms whether to commit only staged files.

**Pre-conditions:**
- One file staged, one file dirty but unstaged

**Setup commands:**
```bash
cd "$TEMP_DIR"
git init test-commit-staged && cd test-commit-staged
git config user.email "test@example.com"
git config user.name "Test User"
echo "// auth v1" > auth.js
echo "// logger v1" > logger.js
git add . && git commit -m "feat: add modules"
echo "// auth v2" > auth.js && git add auth.js
echo "// logger v2" > logger.js  # NOT staged
```

**Simulated inputs:**
- "Commit only staged": yes
- Commit message: yes

**Expected outcomes:**
- Only `auth.js` in the commit
- `logger.js` remains dirty/unstaged after commit
- Commit message reflects `fix` type scoped to `auth`

**Verify:**
```bash
git show --name-only --format="" HEAD | grep -x "auth.js"
git show --name-only --format="" HEAD | grep -x "logger.js" && exit 1 || true
git diff --name-only | grep -x "logger.js"   # still dirty
```

---

## Part 4 — implement Tests (Integration)

> Temp Clone required. Tests run git commands, write plan files, and verify mode routing.

### Scenario 18: `direct-mode-simple`

**Description:** A small single-file change routes to direct mode — no plan docs created.

**Pre-conditions:**
- Clean working tree, no `docs/implementation-plan/`

**Simulated input:**
```
/implement add a CONTRIBUTING.md file with: "See CLAUDE.md for contribution guidelines."
```

**Expected outcomes:**
- `CONTRIBUTING.md` created with specified content
- No `docs/implementation-plan/` directory created
- **Gap check:** Record whether a `git commit` is produced (direct mode has no commit instruction)

**Verify:**
```bash
cat "$TEMP_DIR/CONTRIBUTING.md"
ls "$TEMP_DIR/docs/implementation-plan/" 2>/dev/null && echo "FAIL" || echo "PASS"
```

---

### Scenario 19: `plan-mode-complex`

**Description:** A fullstack app request triggers plan mode with correct directory structure.

**Simulated input:**
```
/implement plan a fullstack todo app with React, GraphQL API, TypeORM, PostgreSQL
```

**Expected outcomes:**
- `docs/implementation-plan/todo-app/` created with `00-overview.md`, at least one phase file, `EXECUTION_GUIDE.md`
- Execution prompt shown: `/implement execute docs/implementation-plan/todo-app`
- Skill does NOT ask "Want me to start building?"
- No source code written

**Verify:**
```bash
ls "$TEMP_DIR/docs/implementation-plan/todo-app/"
ls "$TEMP_DIR/src/" 2>/dev/null && echo "FAIL" || echo "PASS"
```

---

### Scenario 20: `explicit-plan-override`

**Description:** Even a 1-file change enters plan mode when user says "plan".

**Simulated input:**
```
/implement plan add a .editorconfig file
```

**Expected outcomes:**
- Plan docs created despite trivial scope
- `.editorconfig` NOT created (plan only)

**Verify:**
```bash
ls "$TEMP_DIR/docs/implementation-plan/"
ls "$TEMP_DIR/.editorconfig" 2>/dev/null && echo "FAIL" || echo "PASS"
```

---

### Scenario 21: `execute-resume-detection`

**Description:** Phase 1 already committed — execute mode resumes from Phase 2. Tests zero-padding ambiguity.

**Setup commands:**
```bash
mkdir -p "$TEMP_DIR/docs/implementation-plan/test-feature"
cat > "$TEMP_DIR/docs/implementation-plan/test-feature/00-overview.md" <<'EOF'
# Test Feature — Two phases.
EOF
cat > "$TEMP_DIR/docs/implementation-plan/test-feature/01-setup.md" <<'EOF'
# Phase 1: Setup
Create setup.txt. Verification: ls setup.txt
EOF
cat > "$TEMP_DIR/docs/implementation-plan/test-feature/02-logic.md" <<'EOF'
# Phase 2: Logic
Create logic.txt. Verification: ls logic.txt
EOF
cat > "$TEMP_DIR/docs/implementation-plan/test-feature/EXECUTION_GUIDE.md" <<'EOF'
Phase order: 1 → 2 (sequential)
EOF
touch "$TEMP_DIR/setup.txt"
cd "$TEMP_DIR" && git add setup.txt && git commit -m "Phase 1: setup"
```

**Simulated input:**
```
/implement execute docs/implementation-plan/test-feature
```

**Expected outcomes:**
- Phase 1 detected as complete from git log
- Phase 2 executed: `logic.txt` created
- `setup.txt` NOT re-committed
- **Gap check:** Does skill match `Phase 1:` (no padding) against file `01-setup.md`?

**Verify:**
```bash
ls "$TEMP_DIR/logic.txt" && echo "PASS" || echo "FAIL"
git log --oneline | grep "Phase 1" | wc -l  # exactly 1
git log --oneline | grep "Phase 2"           # present
```

---

### Scenario 22: `tier-detection-local`

**Description:** "Prototype" keyword routes to Local tier with Docker Compose.

**Simulated input:**
```
/implement plan a prototype task tracker — just for me locally
```

**Expected outcomes:**
- Tier: Local, Docker Compose referenced
- No Railway or AWS references

**Verify:**
```bash
grep -ri "docker" "$TEMP_DIR/docs/implementation-plan/" && echo "PASS"
grep -ri "railway\|sst\|aws" "$TEMP_DIR/docs/implementation-plan/" && echo "FAIL" || echo "PASS"
```

---

### Scenario 23: `tier-detection-production`

**Description:** "Production" + "CI/CD" keywords route to Production tier with AWS + SST.

**Simulated input:**
```
/implement plan a production API — needs CI/CD with GitHub Actions
```

**Expected outcomes:**
- Tier: Production, AWS/SST referenced
- GitHub Actions referenced
- No Railway references

**Verify:**
```bash
grep -ri "aws\|sst" "$TEMP_DIR/docs/implementation-plan/" && echo "PASS"
grep -ri "github.actions\|github actions" "$TEMP_DIR/docs/implementation-plan/" && echo "PASS"
grep -ri "railway" "$TEMP_DIR/docs/implementation-plan/" && echo "FAIL" || echo "PASS"
```

---

## Part 5 — retrospective Tests (Integration)

> Combined isolation: Temp Clone for project files + Fake HOME for memory writes.
> `MEMORY_DIR="$FAKE_HOME/.claude/projects/test-repo/memory"`

### Scenario 24: `skill-correction-commit`

**Description:** Correction aimed at `/commit` skill routes to SKILL_IMPROVEMENT, edits commit SKILL.md, not CLAUDE.md or memory.

**Simulated conversation context:**
```
User: /commit
Agent: [creates "✨ feat(auth): add login flow"]
User: No emojis in commit messages
Agent: [fixes]
User: /retrospective
```

**Expected outcomes:**
- Routes to SKILL_IMPROVEMENT
- Edit proposed to `.claude/skills/commit/SKILL.md` (adds "no emojis" rule)
- `CLAUDE.md` NOT modified
- No memory file created
- Agent asks approval before editing

**Verify:**
```bash
grep -i "emoji" "$TEMP_DIR/.claude/skills/commit/SKILL.md"  # rule added
# CLAUDE.md unchanged (compare checksum)
ls "$MEMORY_DIR/" 2>/dev/null  # empty
```

---

### Scenario 25: `general-preference-duplicate-check`

**Description:** Cross-cutting preference (pnpm) routes to GENERAL_IMPROVEMENT. Second run must NOT duplicate the entry.

**Simulated conversation context (run 1):**
```
Agent: [runs npm install lodash]
User: We use pnpm, not npm
User: /retrospective
```

**Expected outcomes (run 1):**
- Routes to GENERAL_IMPROVEMENT
- `CLAUDE.md` gains pnpm reference
- No skill files modified, no memory created

**Expected outcomes (run 2 — same retrospective):**
- Agent detects pnpm already in CLAUDE.md
- No duplicate entry added

**Verify:**
```bash
grep -c "pnpm" "$TEMP_DIR/CLAUDE.md"  # exactly expected count
```

---

### Scenario 26: `personal-learning-memory`

**Description:** User background info routes to MEMORY_CAPTURE with `type: user`.

**Simulated context:**
```
User: I'm a designer, not a developer — keep explanations simple
User: /retrospective
```

**Expected outcomes:**
- Routes to MEMORY_CAPTURE, type: user
- Memory file created at `$MEMORY_DIR/` with `type: user` frontmatter
- MEMORY.md index updated
- CLAUDE.md NOT modified

**Verify:**
```bash
grep "type: user" "$MEMORY_DIR/"*.md
cat "$MEMORY_DIR/MEMORY.md"
```

---

### Scenario 27: `project-context-date-resolution`

**Description:** Temporary project context (merge freeze "after Thursday") routes to MEMORY_CAPTURE with `type: project`. Relative date must be resolved to absolute (2026-03-26).

**Known bug to verify:** SKILL.md says 2026-03-27, MEMORY_CAPTURE.md says 2026-03-26. Correct answer: 2026-03-26 (Thursday from Tuesday 2026-03-24).

**Simulated context:**
```
User: We're freezing all merges after Thursday for the mobile release
User: /retrospective
```

**Expected outcomes:**
- Memory file contains `2026-03-26`, NOT "Thursday"
- Type: project
- CLAUDE.md NOT modified

**Verify:**
```bash
grep "2026-03-26" "$MEMORY_DIR/"*.md
grep -i "thursday" "$MEMORY_DIR/"*.md && echo "BUG" || echo "OK"
```

---

### Scenario 28: `new-skill-creation`

**Description:** Successful novel workflow triggers SKILL_CREATION — new skill directory with valid SKILL.md.

**Simulated context:**
```
User: Check PRs #421, #425, #430
Agent: [parallel gh api calls, summarizes results]
User: Perfect, that was fast
User: /retrospective
```

**Expected outcomes:**
- New skill directory created (e.g., `.claude/skills/check-prs/`)
- `SKILL.md` has valid frontmatter (name, description, allowed-tools)
- CLAUDE.md NOT modified, no memory created
- Agent proposes before creating

**Verify:**
```bash
find "$TEMP_DIR/.claude/skills" -name "SKILL.md" -newer /tmp/baseline
# New SKILL.md has valid frontmatter
grep "^name:" "$TEMP_DIR/.claude/skills/check-prs/SKILL.md"
```

---

## Part 6 — skill-dev Tests (Integration)

> Temp Clone required. Tests run the validation script and verify agent prompts.

### Scenario 29: `review-mode-validation`

**Description:** `review commit` runs the validation script and produces a structured feedback report.

**Simulated input:** `review commit`

**Expected outcomes:**
- Validation script executes without crash: `node .claude/skills/skill-dev/scripts/validate-skill.mjs .claude/skills/commit/`
- Report matches 5-section format: Summary, Critical Issues, Recommendations, Suggestions, Strengths
- Self-critique step executed
- No `skill-test` references in output

**Verify:**
```bash
node "$TEMP_DIR/.claude/skills/skill-dev/scripts/validate-skill.mjs" "$TEMP_DIR/.claude/skills/commit/"
grep -r "skill-test" "$TEMP_DIR/.claude/" && echo "STALE-PATH" || echo "clean"
```

---

### Scenario 30: `test-mode-agent-format`

**Description:** `test commit` designs scenarios and spawns agents with correct TEST_PROTOCOL.md format.

**Simulated input:** `test commit`

**Expected outcomes:**
- 2-3 scenarios proposed (commit is "simple" skill)
- Each agent prompt contains: tool restriction line, Files to Read, Simulated Inputs, Instructions, Report Format
- Tools restricted to Read, Glob, Grep
- Consolidated report follows REPORT_FORMAT.md

---

### Scenario 31: `integration-plan-append`

**Description:** `integration plan task` appends to existing TEST_PLAN.md without overwriting Parts 1-2.

**Pre-conditions:**
- `.claude/tests/TEST_PLAN.md` exists with Parts 1-5

**Simulated input:** `integration plan task`

**Expected outcomes:**
- File grows (new content appended)
- Existing Part headers preserved
- New section references `skill-dev` path, NOT `skill-test`
- Self-containment checklist passes
- Outputs execution instruction message

**Verify:**
```bash
grep "## Part 1" "$TEMP_DIR/.claude/tests/TEST_PLAN.md"  # preserved
grep "## Part 2" "$TEMP_DIR/.claude/tests/TEST_PLAN.md"  # preserved
grep "skill-test" "$TEMP_DIR/.claude/tests/TEST_PLAN.md" && echo "STALE" || echo "clean"
```

---

### Scenario 32: `auto-detect-transition`

**Description:** Bare skill name (`commit`) runs review first, then offers test mode.

**Simulated input:** `commit`

**Expected outcomes:**
- Review executes first (full Mode 1)
- Transition offer includes: review-complete indication, explicit test offer, description of next action
- Test does NOT auto-start without user confirmation

---

## Cross-Scenario Checks (All Parts)

### Stale Path Audit

No output from any scenario should contain `.claude/skills/skill-test/`. The correct path is `.claude/skills/skill-dev/`.

### Memory File Safety

All memory files (Scenarios 26, 27) must:
- Have valid YAML frontmatter with `name`, `description`, `type`
- Be flat files (no subdirectory created from branch name slashes)
- Have corresponding MEMORY.md index entries

### Decision Table Coverage Summary

| Skill | Table | Total Rows | Covered | Gap |
|---|---|---|---|---|
| onboard | Safety Posture | 8 | 5 (Sc 1-5) | Rows 7,8 |
| onboard | Output Style | 4 | 4 (Sc 1-4) | None |
| task | Dirty State | 4 | 3 (Sc 10,11,4) | "Discard abort" |
| commit | Commit Type | 8 | 3 (fix, feat, mixed) | chore, docs, test, etc. |
| implement | Complexity | 5 | 3 (Sc 18-20) | Row 2, Row 5 |
| implement | Mode Detection | 5 | 4 (Sc 18-21) | "Resume from N" |
| implement | Deployment Tier | 4 | 2 (Sc 22-23) | Railway, Unclear |
| retrospective | Routing | 5 | 5 (Sc 24-28) | None |
| skill-dev | Mode | 6 | 4 (Sc 29-32) | `integration evaluate`, no-args |

---

## Report Format

Use the standard report format from `.claude/skills/skill-dev/references/REPORT_FORMAT.md`. Include:

1. Per-scenario: inputs, decision trace, generated output, issues, verdict
2. Cross-scenario: decision coverage table, consistency check, uncovered paths
3. Issues summary with severity (Bug / Ambiguity / Gap)
4. Overall verdict: PASS / FAIL / PARTIAL
