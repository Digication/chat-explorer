# Skill Review Checklist

## Metadata Validation

- [ ] **name**: Max 64 chars, lowercase/numbers/hyphens only, matches directory name
- [ ] **description**: Non-empty, max 1024 chars, third person, includes "when to use" triggers
- [ ] **allowed-tools**: Follows safety guidelines (see [ALLOWED_TOOLS.md](ALLOWED_TOOLS.md))

## Structure

- [ ] SKILL.md under 500 lines
- [ ] References one level deep from SKILL.md
- [ ] Descriptive file names
- [ ] Forward slashes in paths

## Content Quality

- [ ] No over-explaining common concepts
- [ ] Every paragraph justifies its token cost
- [ ] Consistent terminology
- [ ] Clear defaults recommended
- [ ] Step-by-step workflows for complex tasks
- [ ] No time-sensitive information

## Decision Logic (if skill contains decision tables or matrices)

- [ ] Decision tables cover all valid input combinations (no gaps)
- [ ] Decision tables specify evaluation order (e.g., "first match wins")
- [ ] Variable/template references are authoritative mappings, not just examples
- [ ] Override logic is explicit (what overrides what, and when)
- [ ] Safety/posture/tier derived independently where appropriate (not coupled)
- [ ] "Other"/freeform input handling is specified

## Scripts (if present)

- [ ] Explicit error handling
- [ ] All constants documented
- [ ] Dependencies listed

## Effectiveness

- [ ] Description contains likely search terms
- [ ] Agent can follow instructions without ambiguity
- [ ] Error cases handled

## Scoring

**Pass**: All required metadata valid, no structural errors
**Fail**: Missing required fields, invalid format, or blocking errors
