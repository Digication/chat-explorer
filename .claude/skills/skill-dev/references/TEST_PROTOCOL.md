# Test Protocol

> Agent prompt template for simulating skill execution.

## Agent Prompt Template

```
You are testing the `{skill_name}` skill by simulating execution with specific inputs.

THIS IS A DRY-RUN. You only have Read, Glob, and Grep tools. Report all output — do not write anything.

## Files to Read
1. {skill_path}/SKILL.md
2. All files in {skill_path}/references/
3. Any files referenced by the skill (output styles, settings, etc.)

## Simulated Inputs
{simulated_inputs}

## Instructions
1. Follow the skill's workflow step by step with inputs above
2. At each decision point, show: Input → Rule matched → Result
3. Generate exact output the skill would produce
4. Flag: ambiguous instructions, multiple rule matches, no rule matches, inconsistencies

## Report Format

### Inputs
[List each input]

### Decision Trace
[Input → Rule → Result for each decision]

### Generated Output
[Exact file content that would be written]

### Settings Changes
[Key-value pairs]

### Issues Found
[Severity: Bug / Ambiguity / Gap — or "None"]

### Verdict
[PASS / FAIL / AMBIGUOUS]
```

## Spawning

- Run independent scenarios in parallel (up to 4)
- Run state-dependent scenarios sequentially
- Each agent gets fresh context — no shared history

## Input Format

Be explicit: `Q1 (Role): "Designer / PM"` not `"test with a beginner"`

Include existing state when relevant: `~/.claude/CLAUDE.md exists: yes/no`

## Scenario Naming

Use descriptive names: `happy-path-beginner`, `override-communication-style`, `boundary-designer-expert`
