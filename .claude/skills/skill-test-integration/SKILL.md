---
name: skill-test-integration
description: Integration testing for Claude skills — creates a self-contained test plan with real file system and git operations, executed in a fresh session and evaluated on return. Use when skill-test (dry-run) is insufficient, skills write real files, or you need to verify multi-session behavior.
metadata:
  allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
---

# Skill Test Integration — Real-World Verification

Two-phase workflow for testing skills that touch the real file system, git, or global config:

1. **`plan`** (this session) — analyze skill(s) and write a self-contained `TEST_PLAN.md`
2. **`evaluate`** (after fresh session run) — read `TEST_RESULTS.md` and propose fixes

## Arguments

- `plan <skill-name> [skill-name...]`: Create or update test plan scenarios for the named skill(s)
- `evaluate`: Read the latest `TEST_RESULTS.md` and report issues with fix proposals

## Workflow

### `plan <skill-name>`

#### Step 1 — Read the Skills

For each skill named:
1. Read `.claude/skills/<skill-name>/SKILL.md` and all reference files
2. Identify all file writes, git operations, and external state changes
3. Identify all decision paths, arguments, and modes

#### Step 1b — Check for Existing Plan

Check if `.claude/tests/TEST_PLAN.md` already exists:

- **If it exists**: Read it. Identify which scenarios already cover the named skill(s).
  - For each existing scenario: compare it against the current skill spec. Flag scenarios that are stale (skill changed), correct (no update needed), or missing (new paths not yet covered).
  - Only revise or add scenarios — never remove scenarios for skills not named in this invocation.
- **If it doesn't exist**: Create from scratch using [PLAN_FORMAT.md](references/PLAN_FORMAT.md).

#### Step 2 — Design Scenarios

For each skill, design scenarios covering:

| Category | What to test |
|---|---|
| **Happy path** | Most common usage — correct input, expected output |
| **Decision boundaries** | Every row in every decision table |
| **Arguments/modes** | Each named argument (`clear`, `show`, `level-up`, etc.) |
| **Idempotency** | Re-running produces correct result (not duplicate content) |
| **Preservation** | Re-run keeps user-added content, changes only onboard sections |
| **Cross-session state** | Pause in one session, resume in another |
| **Edge cases** | Empty state, missing files, pre-existing partial state |

Determine for each scenario:
- **Test type**: `dry-run` (trace logic only) or `integration` (real git/file ops)
- **Isolation needed**: fake HOME, temp clone, or none
- **Dependencies**: which scenarios must run sequentially vs. in parallel

See [SCENARIO_DESIGN.md](references/SCENARIO_DESIGN.md) for guidance on choosing test type.

#### Step 3 — Write or Update the Test Plan

Write to `.claude/tests/TEST_PLAN.md`. The plan must be **fully self-contained** — a fresh session with no prior context must be able to execute it without asking questions.

See [PLAN_FORMAT.md](references/PLAN_FORMAT.md) for the required structure.

**If creating from scratch:** Write the full plan.

**If updating existing plan:**
- Replace stale scenarios in-place (preserve scenario numbering where possible)
- Append new scenarios at the end of the relevant Part section
- Remove scenarios only if the skill was explicitly removed (not just updated)
- Update the Cross-Scenario Checks table to reflect new decision table rows

After writing:
- Tell the user what changed: "Updated N scenarios, added M new ones for `<skill-name>`."
- Tell the user: "Open a fresh Claude Code session and say: 'Execute the test plan at `.claude/tests/TEST_PLAN.md` and save results to `.claude/tests/TEST_RESULTS.md`.'"
- Add `.claude/tests/TEST_RESULTS.md` to `.gitignore` if not already there

### `evaluate`

#### Step 1 — Read Results

Read `.claude/tests/TEST_RESULTS.md` in full.

#### Step 2 — Classify Issues

Group all issues by severity:

| Severity | Definition | Action |
|---|---|---|
| **Bug** | Wrong output — skill produces incorrect result | Fix immediately |
| **Ambiguity** | Agent had to guess — spec is underspecified | Clarify the spec |
| **Gap** | Input combination not covered by any rule | Add rule or document explicitly |

#### Step 3 — Propose Fixes

For each Bug-severity issue:
1. Identify the exact line(s) in the skill file that caused it
2. Propose the specific edit with old → new wording
3. Explain why this fix prevents the issue

For Ambiguities: propose clarifying language. For Gaps: decide if they need a new rule or are acceptable out-of-scope.

#### Step 4 — Apply Fixes

Ask for approval, then apply all fixes. After applying:
- Update `TEST_PLAN.md` to remove resolved issues from the known-issues section (if any)
- Suggest running the plan again in a fresh session to verify fixes

## Rules

- **TEST_PLAN.md is a living document** — update it when skills change, not just when creating from scratch. It should always reflect the current skill spec.
- **Never remove other skills' scenarios** — `plan task` only touches task scenarios; onboard scenarios are untouched
- **Test plans must be self-contained** — no references to "as we discussed" or current conversation
- **Dry-run for global state** — skills that write to `~/.claude/` should use a fake HOME, not real files
- **Integration for git ops** — skills with git commands should use a temp clone with real git operations
- **Cleanup is mandatory** — every integration test must specify per-scenario and after-all cleanup commands
- **Results go to the original repo** — write `TEST_RESULTS.md` to the real project, not the temp clone
- **Fresh session = honest test** — the test plan must work when executed by an agent with zero context
