# Memory Capture Protocol

> Save learnings to Claude Code auto memory when they don't belong in project files.

## When This Applies

- Feedback is **personal to this user** (not a team standard)
- Context is **temporary** (deadlines, incidents, who's working on what)
- Information points to an **external system** (Linear, Grafana, Slack channels)
- A preference would help across **multiple projects**, not just this one

For team standards that everyone should follow -> See [GENERAL_IMPROVEMENT](GENERAL_IMPROVEMENT.md)
For skill-specific updates -> See [SKILL_IMPROVEMENT](SKILL_IMPROVEMENT.md)

## Decision Guide

Ask these questions in order. First match wins:

| Question | If Yes | Destination |
|---|---|---|
| Is it about how a specific skill behaved? | [SKILL_IMPROVEMENT](SKILL_IMPROVEMENT.md) | Skill file |
| Is it a team standard everyone should follow? | [GENERAL_IMPROVEMENT](GENERAL_IMPROVEMENT.md) | CLAUDE.md |
| Is it personal to this user? | **This protocol** | Auto memory |
| Is it temporary project context? | **This protocol** | Auto memory |
| Is it a pointer to an external system? | **This protocol** | Auto memory |

## Memory Types

### User Memory
Information about the user's role, expertise, or personal preferences.

**Triggers:**
- User shares their background: "I'm a designer", "I've been writing Go for 10 years"
- User reveals expertise gaps: "This is my first time with React"
- User states a personal preference that spans projects: "I always want verbose error messages"

**Example:**
```markdown
---
name: user_background
description: User is a data scientist with deep Typescript expertise, new to frontend/React
type: user
---

User is a data scientist. Deep expertise in Typescript and data pipelines. New to React and frontend development — frame frontend explanations using backend analogues they already know.
```

### Feedback Memory
Corrections or confirmed approaches — what to avoid and what to repeat.

**Triggers:**
- User corrects your approach: "No, don't do it that way"
- User confirms a non-obvious approach worked: "Yes, exactly right"
- User states a recurring preference: "Stop summarizing at the end"

**Example:**
```markdown
---
name: feedback_no_mocks
description: Integration tests must hit a real database, never use mocks — prior incident with divergence
type: feedback
---

Integration tests must hit a real database, not mocks.

**Why:** Prior incident where mock/prod divergence masked a broken migration.
**How to apply:** When writing or suggesting test code, always use a real (local) database connection. Only mock external third-party APIs, never internal data stores.
```

### Project Memory
Temporary context about ongoing work, deadlines, or team dynamics.

**Triggers:**
- User mentions a deadline: "We freeze merges after Thursday"
- User explains motivation: "We're rewriting auth for compliance"
- User describes team context: "Sarah is handling the API, I'm on frontend"

**Important:** Convert relative dates to absolute dates (e.g., "Thursday" → "2026-03-26").

**Example:**
```markdown
---
name: project_merge_freeze
description: Merge freeze begins 2026-03-26 for mobile release — flag non-critical PRs
type: project
---

Merge freeze begins 2026-03-26 for mobile release cut.

**Why:** Mobile team is cutting a release branch and needs a stable base.
**How to apply:** Flag any non-critical PR work scheduled after that date. Prioritize getting in-progress work merged before the freeze.
```

### Reference Memory
Pointers to where information lives in external systems.

**Triggers:**
- User mentions an external tool: "Bugs are tracked in Linear project INGEST"
- User shares a dashboard or URL: "The oncall dashboard is at grafana.internal/d/api-latency"
- User points to documentation: "The API spec is in Notion under Engineering/API"

**Example:**
```markdown
---
name: reference_bug_tracker
description: Pipeline bugs tracked in Linear project INGEST — check there for ticket context
type: reference
---

Pipeline bugs are tracked in Linear project "INGEST". Check there when the user references ticket numbers or asks about pipeline issues.
```

## Evaluate Before Saving

| Question | If No |
|---|---|
| Will this help in a **future** conversation? | Skip — it's only useful right now |
| Is it **non-obvious** from the code or git history? | Skip — can be derived |
| Is it different from what's already in memory? | Skip — avoid duplicates |
| Is it something the user would want remembered? | Skip — don't save judgments |

## How to Propose

```markdown
I noticed something worth remembering for next time:

**[Title]**: [Description]

This is [personal to you / temporary project context / a reference to an external system],
so I'll save it to memory rather than editing project files. OK?
```

## Save Process

1. Check existing memory files to avoid duplicates
2. If a similar memory exists, update it instead of creating a new one
3. Write the memory file with proper frontmatter (name, description, type)
4. Update MEMORY.md index with a pointer to the new file
5. Confirm what was saved and where

## Quality Filter

**Capture:** Personal preferences, project deadlines, team context, external system pointers, confirmed workflow approaches
**Skip:** One-off requests, information derivable from code/git, anything already in CLAUDE.md or skill files, sensitive information (credentials, tokens)

**Test**: "Will this help me work better with this user in a future conversation?"
