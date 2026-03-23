---
name: skill-test
description: Simulates skill execution with test scenarios using fresh-context agents. Use when you want to verify a skill produces correct output, test edge cases, or validate logic after changes. Complements skill-review (which checks form, not function).
metadata:
  allowed-tools: Read, Write, Edit, Glob, Grep, Agent
---

# Skill Test — Behavioral Verification

Spawns fresh-context agents to simulate skill execution with defined test scenarios. Each agent reads the skill from scratch (no prior conversation context) and traces through the logic, reporting derived values, generated output, and any issues found.

## Arguments

- `<skill-name>`: Test a specific skill (e.g., `onboard`, `commit`)
- `<skill-name> <scenario>`: Run a single named scenario
- (no args): Auto-detect — look for skills with test scenarios defined, or ask which skill to test

## Workflow

### Step 1 — Identify the Skill

1. If a skill name is provided, locate it at `.claude/skills/<skill-name>/SKILL.md`
2. Read the SKILL.md and all reference files to understand the skill's logic
3. If no skill name provided, list available skills and ask which to test

### Step 2 — Design Test Scenarios

Analyze the skill and generate test scenarios that cover:

| Category | What to test | Example |
|---|---|---|
| **Happy path** | Most common expected usage | Default options, typical user |
| **Boundary cases** | Edge of each decision branch | First/last option in every table |
| **Override logic** | User choice overriding a default | Communication style different from tier default |
| **Combination gaps** | Inputs that might fall through decision tables | Uncommon role+experience pairs |
| **Freeform input** | "Other" or custom text responses | Non-standard role description |
| **Idempotency** | Running the skill twice with same inputs | Does re-run preserve existing content? |

**Scenario count guidelines:**
- Simple skills (linear flow, few decisions): 2–3 scenarios
- Decision-heavy skills (matrices, overrides, tiers): 4–6 scenarios
- Complex skills (multiple modes, sub-agents): 6–8 scenarios

Present the scenario list to the user and ask for approval before running. Include which scenarios to run in parallel vs. sequentially.

### Step 3 — Run Test Agents

For each scenario, spawn an Agent with:

1. **Fresh context** — no conversation history, simulates a real invocation
2. **Read-only by tool restriction** — test agents MUST only have access to `Read, Glob, Grep` tools. Never grant `Write, Edit, Bash, or Agent` to test agents. This enforces read-only at the tool level, not just by instruction.
3. **Complete instructions** — tell the agent exactly which files to read and what inputs to simulate
4. **Structured output** — require a specific report format (see [REPORT_FORMAT.md](references/REPORT_FORMAT.md))

**Agent prompt template:**

See [TEST_PROTOCOL.md](references/TEST_PROTOCOL.md) for the full agent prompt template.

**Parallelism:** Run independent scenarios in parallel. Run scenarios that depend on prior state (e.g., "re-run after first run") sequentially.

### Step 4 — Collect and Analyze Results

After all agents complete:

1. **Parse each agent's report** for the structured fields
2. **Cross-check consistency** between scenarios:
   - Do overlapping inputs produce consistent tiers/postures?
   - Do override rules apply correctly when triggered vs. not?
   - Are all decision table rows covered by at least one scenario?
3. **Identify issues** at three severity levels:
   - **Bug**: Wrong output (e.g., wrong tier, missing section, broken template)
   - **Ambiguity**: Agent had to guess or make assumptions
   - **Gap**: Input combination not covered by any decision rule

### Step 5 — Generate Test Report

Present the consolidated report:

```markdown
# Skill Test Report: [skill-name]

## Scenarios Run
| # | Name | Inputs | Result |
|---|---|---|---|
| 1 | [name] | [key inputs] | PASS / FAIL / AMBIGUOUS |

## Detailed Results

### Scenario 1: [name]
- **Inputs**: [list]
- **Derived values**: [tier, posture, style, etc.]
- **Generated output**: [summary or full content]
- **Issues found**: [list or "None"]

[...repeat for each scenario]

## Cross-Scenario Analysis
- **Decision coverage**: [which table rows were exercised]
- **Consistency check**: [any contradictions between scenarios]
- **Uncovered paths**: [decision branches no scenario tested]

## Issues Summary
| # | Severity | Description | Scenario |
|---|---|---|---|
| 1 | Bug/Ambiguity/Gap | [description] | [which scenario] |

## Verdict
[PASS: all scenarios correct / FAIL: N issues found / PARTIAL: some ambiguities]
```

### Step 6 — Self-Critique

After generating the test report, turn the lens on yourself. Follow the [SELF_CRITIQUE.md](references/SELF_CRITIQUE.md) protocol:

1. Reflect on whether your scenario categories and test protocol were sufficient
2. Check if agents reported issues that suggest gaps in your protocol or report format
3. Cross-pollinate: if a test found an issue that `/skill-review` could catch statically, propose an update to skill-review's checklist
4. If a gap is found, propose a specific update to your own reference files
5. Ask for user approval before self-modifying

## Rules

- **Fresh context per agent** — each test agent starts with zero conversation history
- **Read-only testing** — agents must never write real files. Enforce via tool restrictions (Read, Glob, Grep only), not just instructions
- **Deterministic inputs** — each scenario specifies exact answers, never "let the agent choose"
- **Report all assumptions** — if the agent had to interpret ambiguous instructions, that's an issue
- **Cover decision tables exhaustively** — every row in every decision matrix should be hit by at least one scenario
- **Run /skill-review first** — skill-test assumes the skill passes structural validation. Run `/skill-review` before `/skill-test`
