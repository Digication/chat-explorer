# Test Report Format

> Template for the consolidated test report generated after all scenarios complete.

## Full Report Template

```markdown
# Skill Test Report: {skill_name}

## Test Summary

| Metric | Value |
|---|---|
| Scenarios run | {count} |
| Passed | {pass_count} |
| Failed | {fail_count} |
| Ambiguous | {ambiguous_count} |

## Scenarios

| # | Name | Key Inputs | Tier/Mode | Result |
|---|---|---|---|---|
| 1 | {name} | {inputs_summary} | {derived_mode} | PASS / FAIL / AMBIGUOUS |
| 2 | ... | ... | ... | ... |

## Detailed Results

### Scenario 1: {scenario_name}

**Inputs:**
- {input_1}: {value}
- {input_2}: {value}

**Decision trace:**
1. {decision_point} → Rule {N} matched → {result}
2. {decision_point} → Rule {N} matched → {result}

**Generated output:**
[Full content or summary, depending on length]

**Settings changes:**
- `{key}`: `{value}`

**Issues:** {list or "None"}

**Verdict:** PASS / FAIL / AMBIGUOUS

---

[...repeat for each scenario]

## Cross-Scenario Analysis

### Decision Coverage

| Decision Table | Total Rows | Rows Tested | Coverage |
|---|---|---|---|
| {table_name} | {total} | {tested} | {percentage}% |

### Uncovered Paths
- {description of untested decision branch}

### Consistency Check
- {any contradictions between scenario results, or "All consistent"}

## Issues Summary

| # | Severity | Description | Scenario(s) |
|---|---|---|---|
| 1 | Bug | {description} | {scenario_name} |
| 2 | Ambiguity | {description} | {scenario_name} |
| 3 | Gap | {description} | {scenario_name} |

## Verdict

**{PASS / FAIL / PARTIAL}**

{One-sentence summary: "All N scenarios passed with no issues" or "N issues found across M scenarios"}
```

## Severity Definitions

| Severity | Meaning | Action |
|---|---|---|
| **Bug** | Wrong output — the skill produces incorrect results for valid inputs | Must fix before shipping |
| **Ambiguity** | The agent had to interpret or guess — instructions unclear | Should fix to prevent inconsistent behavior |
| **Gap** | A valid input combination has no matching rule | Should fix to ensure complete coverage |

## Report Length Guidelines

- **Short skills** (commit, simple workflows): Brief report, summarize generated output
- **Decision-heavy skills** (onboard, implement): Full report with complete generated output for each scenario
- **Focus on diffs**: If multiple scenarios produce similar output, show the first in full and highlight only differences for subsequent ones

## Verdict Criteria

| Verdict | When to use |
|---|---|
| **PASS** | All scenarios produced correct output, no issues at any severity |
| **FAIL** | At least one Bug-severity issue found |
| **PARTIAL** | No bugs, but Ambiguity or Gap issues exist |
