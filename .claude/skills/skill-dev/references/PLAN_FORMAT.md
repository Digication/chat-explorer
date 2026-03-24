# Test Plan Format

> Required structure for `.claude/tests/TEST_PLAN.md`. Must be fully self-contained.

## Template

```markdown
# Test Plan — {Skill Name(s)}

> Self-contained test plan. Execute in a fresh Claude Code session with no prior context.
> Skills under test: {list skill SKILL.md paths}

## Output

Save all results to `.claude/tests/TEST_RESULTS.md` in the **original repo** (not the temp clone).

The results file must contain:
1. Per-scenario: inputs, decision trace, generated output/git state, issues, verdict
2. Cross-scenario analysis: decision coverage, consistency, uncovered paths
3. Issues summary: severity (Bug / Ambiguity / Gap), description, scenario
4. Overall verdict: PASS / FAIL / PARTIAL
5. Raw agent outputs (unedited) for traceability

Use the report format from `.claude/skills/skill-dev/references/REPORT_FORMAT.md`.

Write the file at the END after all scenarios complete — not incrementally.

---

## Setup

{Only include what's needed. Remove sections that don't apply.}

### Temp Clone (if git integration tests)
```bash
TEMP_DIR=$(mktemp -d)/test-repo
git clone {original-repo-path} "$TEMP_DIR"
```

### Fake HOME (if skill writes to ~/.claude/)
```bash
FAKE_HOME=$(mktemp -d)
mkdir -p "$FAKE_HOME/.claude/output-styles"
```

---

## Part {N} — {Skill Name} Tests ({Dry-Run|Integration})

Each agent should:
1. Read {list of files to read}
2. {Simulate the workflow | Run the git commands} with the given inputs
3. At each decision point: show Input → Rule matched → Result
4. {Report exact file content that WOULD be written | Verify exact git state}
5. Flag any ambiguities, gaps, or bugs

### Scenario {N}: `{scenario-name}`

**Description:** {One sentence — what this tests and why it matters}

**Pre-conditions:**
- {State of files/git before this scenario runs}

**Setup commands:** (integration only)
```bash
{Exact bash commands to set up the required state}
```

**Simulated inputs:**
- {Question/argument}: "{answer}"

**Expected outcomes:**
- **{File or state}:** {exact content or git state}
- **Must contain:** {specific strings or markers}
- **Must NOT contain:** {strings that would indicate a bug}

**Verify:** (integration only)
```bash
{git commands to check actual state}
```

---

## Per-Scenario Cleanup (integration only)

After each integration test, reset state:
```bash
git checkout main 2>/dev/null || true
git stash clear
git branch --list 'task/*' | xargs -r git branch -D 2>/dev/null || true
git reset --hard HEAD
git clean -fd
```

## After-All Cleanup

```bash
{Remove temp clone and fake HOME}
rm -rf "$TEMP_DIR"   # if used
rm -rf "$FAKE_HOME"  # if used
```

---

## Cross-Scenario Checks

### Decision Table Coverage
| Rule # | Inputs | Expected | Covered by |
|---|---|---|---|
| {n} | {inputs} | {posture/tier/etc} | Scenario {n} / Not tested |

### {Other cross-cutting checks specific to this skill}
```

## Self-Containment Checklist

Before finalizing, verify:
- [ ] No references to "this conversation" or "as discussed"
- [ ] All file paths are absolute or relative to a defined variable (`$TEMP_DIR`, `$FAKE_HOME`)
- [ ] Every scenario specifies exact inputs — no "choose whatever"
- [ ] Setup commands produce a deterministic starting state
- [ ] Cleanup is specified for each integration test
- [ ] A fresh agent with no context could execute this plan end-to-end
