# Profile Templates

> Templates for `~/.claude/CLAUDE.md` sections. All sections use `<!-- onboard:name -->` / `<!-- /onboard:name -->` markers.

## Tier Selection

Direct mapping from Q1 (Coding Comfort). No matrix needed — the user's choice IS the tier.

| Q1 Selection | Tier |
|---|---|
| Guide me step by step | **Guided** |
| Help me grow | **Supported** |
| Work alongside me | **Standard** |
| Stay out of my way | **Expert** |

## About Me Templates

**Guided:** `I am {comfort_label} · I mainly use Claude Code for {purpose} · Please treat me as a collaborator who needs clear, jargon-free explanations`

**Supported:** `I am {comfort_label} · I mainly use Claude Code for {purpose} · I can follow technical explanations but appreciate context for unfamiliar concepts`

**Standard:** `I mainly use Claude Code for {purpose} · I'm comfortable with code and technical concepts`

**Expert:** `I mainly use Claude Code for {purpose}`

Each bullet point above (separated by `·`) becomes a `- ` list item in the output.

## Communication Templates

**Guided** (default: "Explain everything"):
- Use plain, everyday language — avoid jargon unless you define it first
- Before running any command, explain: what it does, what it affects, whether it can be undone
- Use analogies when helpful
- When showing code, add brief comments explaining what each part does
- If I ask you to do something risky, tell me — don't just do it
- After completing work, summarize what changed and why

**Supported** (default: "Explain risky things"):
- Explain technical concepts when important for understanding the change
- Before destructive/risky commands, explain: what it does, what could go wrong, if reversible
- For safe routine operations, just do them
- Define jargon on first use, then use normally
- Push back if my request seems like a bad idea

**Standard** (default: "Explain risky things" or "Be concise"):
- Be direct and technical — I can read code and diffs
- Only explain when non-obvious or risky
- Push back if my request has a better alternative
- Flag destructive operations before executing

**Expert** (default: "Be concise"):
- Be concise — skip explanations unless I ask
- Just do the work; I'll review the diff
- Push back on bad ideas, but briefly

**Teaching** (override: "Teach as you go"):
- Explain reusable concepts — help me build a mental model
- When running commands, briefly explain what and why
- Point out patterns: "This is called X — you'll see it often"
- Mention alternatives briefly when multiple approaches exist
- Teach me to evaluate risks myself
- After work, highlight what to remember for next time

## Communication Style Override

User's explicit choice always overrides tier default:

| Selected | Use template |
|---|---|
| Explain everything | Guided |
| Teach as you go | Teaching |
| Explain risky things | Supported |
| Be concise | Expert |

## Safety Templates (by posture, not tier)

**Maximum Safety:**
- Before ANY command, explain in plain language: what it does, risk level (SAFE/MODERATE/DESTRUCTIVE), recommendation
- Warn if command could affect things outside this project
- Never use `--force`, `rm -rf` without explaining first
- If I ask something risky, say so — I'd rather be told
- When in doubt, choose the safer option
- Commit frequently

**Balanced:**
- Before destructive commands, explain the risk
- For routine safe commands, just run them
- Rate risky operations: SAFE/MODERATE/DESTRUCTIVE
- Warn before things that could go wrong
- Suggest committing before risky changes

**Speed Mode:**
- Flag destructive operations before executing
- Commit before risky refactors
- Push back if unintended side effects

**Minimal:**
- Don't over-explain risks
- Still flag genuinely dangerous operations (production data, force-push to main)
- Commit before large refactors

## Purpose Additions (append to safety section)

**Prototyping:** Prioritize speed · Don't block with safety confirmations for throwaway experiments · Suggest throwaway branches

**Learning:** Explain the "why" not just the "what" · Show thought process · Use simpler explanations · Point out reusable patterns

**Production:** Prioritize correctness · Always run tests · Suggest branching before significant changes · Flag security issues

**Mix:** Adjust based on context — "just try it" = fast, "production"/"deploy" = careful. When unclear, ask.

## Variable Mappings

**Q1 (Coding Comfort) → `{comfort_label}`**

| Q1 Selection | `{comfort_label}` |
|---|---|
| Guide me step by step | new to coding or this tool |
| Help me grow | building my skills |
| Work alongside me | comfortable with code |
| Stay out of my way | deeply experienced |

**Q2 (Purpose) → `{purpose}`**

| Q2 Selection | `{purpose}` |
|---|---|
| Prototyping | prototyping and experiments |
| Learning | learning and building skills |
| Production | production projects |
| Mix of both | a mix of prototyping and production |
