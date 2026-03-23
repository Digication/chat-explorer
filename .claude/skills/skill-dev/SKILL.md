---
name: skill-dev
description: Review, test, and validate Claude skills. Use when asked to review a skill, test a skill, audit skill quality, validate SKILL.md files, run integration tests on skills, or improve existing skills. Combines static review, behavioral dry-run testing, and real-world integration testing.
metadata:
  allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
---

# Skill Development — Review, Test, Validate

Unified skill for the skill quality pipeline. Three modes, run in order:

```
/skill-dev review <skill> → /skill-dev test <skill> → /skill-dev integration <skill>
```

## Arguments

- `review <skill-name>`: Static quality review against checklist
- `test <skill-name> [scenario]`: Behavioral dry-run with fresh-context agents
- `integration plan <skill-name>`: Create real-world integration test plan
- `integration evaluate`: Read test results and propose fixes
- `<skill-name>`: Auto-detect — review first, then offer to test
- (no args): List available skills and ask which to work on

---

## Mode 1: Review

Static quality review of a skill's structure, metadata, and content.

### Workflow

1. **Run automated validation**:
   ```bash
   node <skill-base-dir>/scripts/validate-skill.mjs /path/to/skill/
   ```
   Replace `<skill-base-dir>` with this skill's base directory.

2. **Metadata review** — validate YAML frontmatter:
   - **name**: Lowercase, hyphens, numbers only; must match directory name
   - **description**: Third person, includes "when to use" triggers
   - **allowed-tools**: See [ALLOWED_TOOLS.md](references/ALLOWED_TOOLS.md) for safety guidelines

3. **Structure assessment**:
   - SKILL.md under 500 lines, uses progressive disclosure
   - References one level deep, focused on single topics

4. **Content quality** — see [CHECKLIST.md](references/CHECKLIST.md):
   - Every paragraph justifies its token cost
   - Single terminology throughout
   - Clear defaults, no vague options
   - Step-by-step workflows for complex tasks

5. **Generate feedback report**:
   ```markdown
   # Skill Review: [skill-name]
   ## Summary — [1-2 sentence assessment]
   ## Critical Issues (must fix)
   ## Recommendations (should fix)
   ## Suggestions (nice to have)
   ## Strengths
   ```

6. **Self-critique** — follow [SELF_CRITIQUE.md](references/SELF_CRITIQUE.md): check if your checklist caught everything or if you relied on intuition.

---

## Mode 2: Test (Dry-Run)

Spawn fresh-context agents to simulate skill execution with defined test scenarios. Each agent reads the skill from scratch and traces through the logic.

### Workflow

1. **Identify the skill** — locate `.claude/skills/<skill-name>/SKILL.md`, read it and all references

2. **Design test scenarios** covering:

   | Category | What to test |
   |---|---|
   | Happy path | Most common expected usage |
   | Boundary cases | Edge of each decision branch |
   | Override logic | User choice overriding a default |
   | Combination gaps | Inputs that might fall through decision tables |
   | Freeform input | "Other" or custom text responses |
   | Idempotency | Running the skill twice with same inputs |

   Scenario count: simple skills 2–3, decision-heavy 4–6, complex 6–8. Present and get approval before running.

3. **Run test agents** — for each scenario, spawn an Agent with:
   - **Fresh context** — no conversation history
   - **Read-only tools only** — `Read, Glob, Grep` (enforced via tool restriction, not just instruction)
   - **Structured output** — require the format from [REPORT_FORMAT.md](references/REPORT_FORMAT.md)
   - See [TEST_PROTOCOL.md](references/TEST_PROTOCOL.md) for the agent prompt template

4. **Collect and analyze** — parse reports, cross-check consistency, identify issues:
   - **Bug**: Wrong output
   - **Ambiguity**: Agent had to guess
   - **Gap**: Input combination not covered

5. **Generate test report** — consolidated report with scenarios, detailed results, cross-scenario analysis, issues summary, verdict (PASS/FAIL/PARTIAL)

6. **Self-critique** — follow [SELF_CRITIQUE.md](references/SELF_CRITIQUE.md): check scenario coverage and protocol effectiveness

---

## Mode 3: Integration Testing

Two-phase workflow for skills that touch the real file system, git, or global config.

### `integration plan <skill-name>`

1. **Read the skill** — identify all file writes, git operations, and external state changes

2. **Check for existing plan** — if `.claude/tests/TEST_PLAN.md` exists, update it (don't overwrite other skills' scenarios)

3. **Design scenarios** covering:

   | Category | What to test |
   |---|---|
   | Happy path | Correct input, expected output |
   | Decision boundaries | Every row in every decision table |
   | Arguments/modes | Each named argument |
   | Idempotency | Re-run produces correct result |
   | Preservation | Re-run keeps user-added content |
   | Cross-session state | Pause in one session, resume in another |
   | Edge cases | Empty state, missing files, partial state |

   See [SCENARIO_DESIGN.md](references/SCENARIO_DESIGN.md) for test type and isolation strategy guidance.

4. **Write the test plan** to `.claude/tests/TEST_PLAN.md` — must be fully self-contained (a fresh session can execute it). See [PLAN_FORMAT.md](references/PLAN_FORMAT.md).

5. Tell the user: "Open a fresh Claude Code session and say: 'Execute the test plan at `.claude/tests/TEST_PLAN.md` and save results to `.claude/tests/TEST_RESULTS.md`.'"

### `integration evaluate`

1. Read `.claude/tests/TEST_RESULTS.md`
2. Classify issues: Bug (fix immediately), Ambiguity (clarify spec), Gap (add rule or document)
3. For each Bug: identify exact line(s), propose specific edit, explain why
4. Ask for approval, then apply fixes
5. Suggest re-running the plan in a fresh session to verify

---

## Rules

- **Review before testing** — test mode assumes the skill passes structural validation
- **Fresh context per test agent** — each agent starts with zero conversation history
- **Read-only dry-run testing** — enforce via tool restrictions (`Read, Glob, Grep` only), not just instructions
- **Deterministic inputs** — each scenario specifies exact answers, never "let the agent choose"
- **Cover decision tables exhaustively** — every row should be hit by at least one scenario
- **Never remove other skills' scenarios** — `integration plan task` only touches task scenarios
- **Test plans must be self-contained** — no references to "as we discussed" or current conversation
- **Dry-run for global state** — skills writing to `~/.claude/` should use a fake HOME
- **Integration for git ops** — skills with git commands should use a temp clone
- **Cleanup is mandatory** — every integration test must specify cleanup commands
