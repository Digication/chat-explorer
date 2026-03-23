# Self-Critique Protocol

> After reviewing or testing a skill, review your own work. Run as the final step.

## For Reviews

1. **Coverage check:** Did I catch issues through checklist items, or through intuition? If intuition, the checklist has a gap.
2. **Blind spot check:** Compare what I reviewed against CHECKLIST.md, ALLOWED_TOOLS.md, SPECIFICATION.md. Any checks I performed that aren't listed? Any listed checks I skipped?
3. **Feedback quality:** For each issue reported — was it correct, actionable, and properly severity-rated?

## For Tests

1. **Scenario coverage:** Did agents find issues my scenario categories should have predicted? Any decision table rows uncovered? Scenarios too similar?
2. **Protocol effectiveness:** Did agents produce structured, comparable results? Did they need ad-hoc sections not in REPORT_FORMAT.md?
3. **Test quality:** For each scenario — was it specific enough? Independent? Did it test what it claimed?
4. **Cross-pollinate:** If a test found something review mode could catch statically, propose a checklist addition.

## Propose Updates (if gaps found)

```
Self-Critique: After [reviewing/testing] [skill], found gap in [reference].
Proposed update: [specific addition]. Apply?
```

## Rules

- Only propose updates that improve future runs, not just this one
- Wait for 2+ occurrences before adding new checks
- Never self-modify SKILL.md — only reference files
- Always ask user approval before changes
