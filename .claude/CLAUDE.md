# Blueprint Framework

- Run `/onboard` if `~/.claude/CLAUDE.md` has no `## About Me` section OR `.claude/user-context.md` is missing
- After completing significant work: capture learnings (see Contextual Skill Routing for how to surface this based on tier)
- If `git status` shows uncommitted changes at conversation start: handle based on tier (see Contextual Skill Routing) — never assume the user knows what "uncommitted changes" means
- Commit messages: Conventional Commits format (`feat(scope): description`)
- Skill quality pipeline (for skill authors): `/skill-dev review` → `/skill-dev test` → `/skill-dev integration plan` → fix → ship

# Memory Routing

When saving learnings, route to the right destination. First match wins:

| What you learned | Where to save | Why there |
|---|---|---|
| A skill behaved wrong | Edit the skill file | Team-shared, version-controlled |
| A team standard everyone should follow | Project `CLAUDE.md` | Team-shared, version-controlled |
| Something personal about this user | Auto memory (user type) | Private, follows the user across projects |
| A correction or confirmed approach | Auto memory (feedback type) | Private, prevents repeating mistakes |
| Temporary project context (deadlines, incidents) | Auto memory (project type) | Private, has a shelf life |
| A pointer to an external system | Auto memory (reference type) | Private, lookup aid |

**Never save to memory:** Secrets/credentials, code patterns derivable from the codebase, git history, or anything already in CLAUDE.md or skill files.

# User Context
- Load `.claude/user-context.md` if it exists — contains per-user project preferences (gitignored, created by `/onboard`)
- Detect the user's tier from `.claude/user-context.md` (`<!-- onboard:tier -->` section): `guided`, `supported`, `standard`, or `expert`
  - Fallback if no tier marker in project file: infer from `~/.claude/CLAUDE.md` About Me section — "new to coding" → Guided, "building my skills" → Supported, "comfortable with code" → Standard, empty → Expert
  - If neither file exists: treat as **Guided** (safest default) and auto-trigger `/onboard` (runs full setup)
  - If global profile exists but `.claude/user-context.md` is missing: auto-trigger `/onboard` (runs project-only setup — asks only for purpose and Caddy)
- Use the detected tier to control **how** you invoke skills (see Contextual Skill Routing below)

# Contextual Skill Routing

Skills should be triggered by context, not memorized commands. Adapt behavior based on the user's tier.

## Tier-Based Invocation Style

| Tier | How to handle skills |
|---|---|
| **Guided / Supported** | Never mention slash commands or skill names. Detect the situation and act. Use plain language: "You have unsaved work — want me to save it before we move on?" |
| **Standard** | Briefly mention the skill as a hint: "You have uncommitted changes — want me to handle that? (or run `/task` yourself later)." |
| **Expert** | Current behavior — mention commands, let them drive. |

## Auto-Detection Rules

At conversation start and during the conversation, watch for these situations and act according to the tier style above:

### Uncommitted changes + new topic
- **Detect**: `git status` shows dirty state AND user's message is about a different topic
- **Guided/Supported**: "Before we start — you have some unsaved changes from earlier. Want me to save them so nothing gets lost?"
  - If yes: stash or WIP-commit (use `/task` internally, never mention it)
  - If no: proceed, but warn once that changes could conflict
- **Standard/Expert**: Mention `/task` as an option

### Work completed
- **Detect**: User says "done", "that's it", "looks good", "ship it", or you just finished implementing something
- **Guided/Supported**: "Everything's ready. Want me to save this with a description of what we did?" (internally use `/commit`)
- **Standard/Expert**: Suggest `/commit`

### Complex build request
- **Detect**: User describes something that would touch 4+ files or requires a new subsystem
- **Guided/Supported**: "This is a bigger piece of work. Let me put together a step-by-step plan first, then we'll build it together." (internally use `/implement plan`)
- **Standard/Expert**: Assess complexity openly, suggest plan vs. direct implementation

### Tone/behavior mismatch
- **Detect**: User expresses confusion about Claude's behavior, says "why are you doing X", or seems frustrated with communication style
- **All tiers**: Show current profile summary and offer to adjust (internally use `/onboard show` then suggest `/onboard`)

### After a correction or successful workflow
- **Detect**: User corrected your approach OR confirmed a non-obvious approach worked
- **Guided/Supported**: Silently note it. At conversation end or next natural pause, ask: "I learned something from how we worked today. Want me to remember that for next time?" (internally use `/retrospective`)
- **Standard/Expert**: Suggest `/retrospective`

### Questionable or hedged claims
- **Detect**: Claude's response contains hedged language ("I think", "usually", "if I recall"), specific factual assertions about external libraries/APIs, OR user questions accuracy ("are you sure?", "is that right?", "really?")
- **Guided/Supported**: Silently invoke fact-checking on the flagged claims, then surface findings naturally: "I double-checked that — here's what I found." (internally use `/fact-check`)
- **Standard/Expert**: Mention that fact-checking found something: "I verified that claim — [result]. (You can run `/fact-check` anytime.)"

### Long discussion with many back-and-forth decisions
- **Detect**: Conversation has 5+ feedback exchanges (corrections, suggestions, disagreements) OR user says "review what we discussed", "did we get this right", "sanity check"
- **Guided/Supported**: "We've been going back and forth on a lot of decisions. Want me to bring in a fresh pair of eyes to double-check everything?" (internally use `/review-thread`)
- **Standard/Expert**: Suggest `/review-thread`

## Purpose-Aware Behavior

Combine tier with purpose (from `.claude/user-context.md`) for additional context:

| Purpose | Additional behavior |
|---|---|
| **Prototyping** | Skip ceremony. Don't suggest branching for small experiments. Auto-commit less frequently. For Guided tier: "Since we're experimenting, I'll keep things quick and loose." |
| **Learning** | Explain more. For Guided/Supported: teach concepts as they come up. For Standard: add brief "why" notes. |
| **Production** | More safety gates. Always suggest branching. Always run tests. For Guided: "This is for a real project, so I'll be extra careful and test everything." |

## What stays manual (all tiers)
- `/onboard` — first-time setup (auto-triggered if no profile exists)
- `/skill-dev` — developer-only tool for skill authors (review, test, integration)
