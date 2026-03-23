---
name: retrospective
description: Captures learnings from the current conversation — skill corrections, user preferences, or new skill opportunities. Use when the user corrects your approach, says "remember this", asks to save a preference, reflects on what worked, or after completing significant work. Also auto-triggered by Contextual Skill Routing when corrections or successful non-obvious workflows are detected.
metadata:
  allowed-tools: Read, Glob, Grep, Edit, Write
---

## Skill Resources

- `references/SKILL_IMPROVEMENT.md` - Protocol for updating existing skills
- `references/GENERAL_IMPROVEMENT.md` - Protocol for saving cross-cutting preferences
- `references/SKILL_CREATION.md` - Protocol for creating new skills
- `references/MEMORY_CAPTURE.md` - Protocol for saving personal/temporary learnings to auto memory

Resolve paths relative to this skill's base path.

## Instructions

Review the current conversation for potential workflow improvements.

## Check For

1. **Skill corrections** - A skill was used but needed adjustment
   -> Follow [SKILL_IMPROVEMENT](references/SKILL_IMPROVEMENT.md)

2. **General preferences** - User expressed cross-cutting team standards
   -> Follow [GENERAL_IMPROVEMENT](references/GENERAL_IMPROVEMENT.md)

3. **Personal learnings** - User preferences, project context, or external references that don't belong in project files
   -> Follow [MEMORY_CAPTURE](references/MEMORY_CAPTURE.md)

4. **New skill opportunity** - No skill existed but approach worked well
   -> Follow [SKILL_CREATION](references/SKILL_CREATION.md)

## Examples

### After a Correction (Skill Improvement)

```
User: /commit
Agent: [creates commit with emoji in message]
User: No, I don't want emojis in commit messages
Agent: [fixes it]
User: /retrospective
Agent: I noticed a potential improvement to the `/commit` skill:
       **No emojis**: You prefer commits without emojis.
       Should I update the skill?
```

### After Expressing a Team Standard (General Improvement)

```
User: Install the new lodash-es package
Agent: [runs npm install lodash-es]
User: No, we use pnpm in this project, not npm
User: /retrospective
Agent: I noticed a general preference:
       **Package manager**: This project uses pnpm, not npm.
       I'll save this to CLAUDE.md.
```

### After a Personal Preference or Project Context (Memory Capture)

```
User: I'm a designer, not a developer — keep the explanations simple
User: /retrospective
Agent: I noticed something worth remembering for next time:
       **User background**: You're a designer who prefers simple explanations.
       This is personal to you, so I'll save it to memory (not project files). OK?
```

```
User: We're freezing all merges after Thursday for the mobile release
User: /retrospective
Agent: I noticed temporary project context worth remembering:
       **Merge freeze**: Begins 2026-03-27 for mobile release.
       This is temporary, so I'll save it to memory rather than CLAUDE.md. OK?
```

### After a Successful New Workflow (Skill Creation)

```
User: Check the status of PRs #421, #425, and #430
Agent: [launches parallel gh api calls]
Agent: PR #421: all passed ...
User: Perfect, that was fast
User: /retrospective
Agent: I didn't have a skill for batch PR status checks. The approach worked:
       1. Parse PR numbers from request
       2. Fetch check runs in parallel
       3. Aggregate and summarize results
       Save as a new skill?
```
