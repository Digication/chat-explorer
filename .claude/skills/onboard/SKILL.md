---
name: onboard
description: Interactive onboarding wizard that sets up a personalized Claude Code environment. Use when a user wants to introduce themselves, configure communication preferences, set up safety guardrails, or run first-time setup. Guides non-technical users through selectable options.
metadata:
  allowed-tools: Read, Write, Edit, Glob
---

# Onboard — Personalized Claude Code Setup

Interactive wizard that configures Claude Code based on who you are and how you work. Generates `~/.claude/CLAUDE.md` with personalized instructions, `.claude/user-context.md` with per-project preferences (gitignored), and sets the appropriate output style so every future conversation is tailored to you.

## Arguments

- (no args): Run the full onboarding wizard (or re-onboard if profile exists)
- `level-up`: Skip straight to re-picking your comfort level (same as choosing "Level up" in Step 0)
- `reset`: Overwrite onboard sections in `~/.claude/CLAUDE.md` with fresh answers
- `clear`: Remove all onboard sections and reset output style to Default — return to vanilla Claude Code
- `show`: Display current profile without changes

## Workflow

### Step 0 — Check Existing Profile

1. Check if `~/.claude/CLAUDE.md` exists
2. If it exists and has an `## About Me` section:
   - Parse the current profile: detect the tier from the `<!-- onboard:about-me -->` section content (match against the About Me templates in PROFILES.md)
   - Show the current profile summary including the detected tier
   - If `show` argument was passed, display and stop
   - Use **AskUserQuestion** to ask: "You're currently set to: [detected tier]. What would you like to do?"
     - Header: "Profile"
     - Options:
       | Option | Description |
       |---|---|
       | Level up | Change your comfort level — just re-pick how Claude works with you (keeps purpose and style) |
       | Update everything | Re-run the full wizard to change all settings |
       | Start fresh | Clear onboard sections and set up from scratch |
       | Remove profile | Go back to default Claude Code — remove all personalization |
       | Keep it | No changes — exit onboarding |
   - **If "Level up"**: Jump to Step 1a (Quick Re-tier)
   - **If "Update everything"**: Proceed to Step 1
   - **If "Start fresh"**: Clear onboard sections, proceed to Step 1
   - **If "Remove profile"**: Jump to Clear Profile (below)
3. If `reset` argument was passed, skip the question and proceed to Step 1
4. If `clear` argument was passed, jump to Clear Profile (below)

### Clear Profile

Remove all onboard-generated sections from `~/.claude/CLAUDE.md` (everything between `<!-- onboard:* -->` markers). Preserve any user-added sections. If no user-added sections remain, delete the file.

Also clean up:
- Delete `.claude/user-context.md` (project-level purpose file)
- Delete the installed output style file from `~/.claude/output-styles/` (whichever one was installed: `beginner.md`, `supported.md`, `standard.md`, or `expert.md`)
- Remove `"outputStyle"` from `~/.claude/settings.json` (or set to `""`)
- Tell the user: "Profile removed. Claude Code is back to default. Run `/onboard` anytime to set up again."

### Step 1a — Quick Re-tier (Level Up)

Show only Q1 with the current selection highlighted:

**"How would you like Claude to work with you now?"**
Header: "Coding Comfort"

| Option | Maps to Tier | Description |
|---|---|---|
| Guide me step by step | **Guided** | Walk me through everything |
| Help me grow | **Supported** | Explain the important stuff, help me learn |
| Work alongside me | **Standard** | Just flag what's non-obvious or risky |
| Stay out of my way | **Expert** | Be fast and concise |

After the user picks:
1. Re-derive safety posture using the new tier + existing purpose (from `.claude/user-context.md`) + existing style (from current `~/.claude/CLAUDE.md`)
2. Re-derive output style from the new tier
3. Regenerate all onboard sections using new tier but **preserve existing Step 2/3 values** (purpose from project file, style from global CLAUDE.md)
4. Jump to Step 5 (Preview and confirm)

### Step 1 — Coding Comfort

**AskUserQuestion: "How would you like Claude to work with you?"**
Header: "Coding Comfort"

| Option | Maps to Tier | Description |
|---|---|---|
| Guide me step by step | **Guided** | I'm new to coding or this tool — walk me through everything |
| Help me grow | **Supported** | I have some experience — explain the important stuff, help me learn |
| Work alongside me | **Standard** | I'm comfortable with code — just flag what's non-obvious or risky |
| Stay out of my way | **Expert** | I know what I'm doing — be fast and concise |

This is the **primary question** — it directly determines the profile tier, safety posture, and output style. Any user at any skill level can pick any option. A senior dev exploring a new tool might choose "Guide me." A designer who's been vibe-coding for months might choose "Stay out of my way." Respect their choice.

### Step 2 — Purpose (project-scoped)

**AskUserQuestion: "What will you mainly use Claude Code for in this project?"**
Header: "Purpose"

| Option | Description |
|---|---|
| Prototyping | Quick experiments and exploring ideas — speed over polish |
| Learning | Understanding code, following tutorials, building skills |
| Production | Real projects that need quality, testing, and reliability |

> **Storage:** Purpose is saved to `.claude/user-context.md` (project-level, gitignored) — not to the global `~/.claude/CLAUDE.md`. Different projects can have different purposes. The same user might prototype in one repo and do production work in another.

### Step 3 — Communication Style

**AskUserQuestion: "How should Claude communicate with you?"**
Header: "Style"

| Option | Description |
|---|---|
| Explain everything | Explain what you're doing, why, and what the risks are |
| Teach as you go | Explain concepts I can reuse — help me learn, not just get results |
| Explain risky things | Only explain when something could go wrong |
| Be concise | Short answers — I'll ask if I need more detail |

### Step 4 — Determine Safety Posture

Based on the answers from Steps 1–3, **auto-select** the safety posture. Do NOT ask a separate question — derive it from the profile.

**Evaluate top-to-bottom. First match wins.**

| # | Coding Comfort | Purpose | Safety Posture |
|---|---|---|---|
| 1 | Guide me step by step | Any | **Maximum safety** |
| 2 | Help me grow | Learning | **Maximum safety** |
| 3 | Help me grow | Any other | **Balanced** |
| 4 | Work alongside me | Prototyping | **Speed mode** |
| 5 | Work alongside me | Any other | **Balanced** |
| 6 | Stay out of my way + Concise style | Any | **Minimal** |
| 7 | Stay out of my way | Prototyping | **Speed mode** |
| 8 | Stay out of my way | Any other | **Balanced** |

See [SAFETY_DEFAULTS.md](references/SAFETY_DEFAULTS.md) for what each posture configures.

### Step 4b — Determine Output Style

Based on the profile tier (from [PROFILES.md](references/PROFILES.md)), auto-select the output style:

| Profile Tier | Output Style | Template Source | settings.json value |
|---|---|---|---|
| **Guided** | `Beginner-Friendly` | [OUTPUT_STYLE_BEGINNER.md](references/OUTPUT_STYLE_BEGINNER.md) | `"outputStyle": "Beginner-Friendly"` |
| **Supported** | `Supported` | [OUTPUT_STYLE_SUPPORTED.md](references/OUTPUT_STYLE_SUPPORTED.md) | `"outputStyle": "Supported"` |
| **Standard** | `Standard` | [OUTPUT_STYLE_STANDARD.md](references/OUTPUT_STYLE_STANDARD.md) | `"outputStyle": "Standard"` |
| **Expert** | `Expert` | [OUTPUT_STYLE_EXPERT.md](references/OUTPUT_STYLE_EXPERT.md) | `"outputStyle": "Expert"` |

The output style modifies Claude's **system prompt** — more effective than CLAUDE.md alone for changing communication behavior. Both work together: output style controls *how* Claude communicates, CLAUDE.md controls *what* Claude knows about you.

### Step 5 — Summary and Confirmation

1. Build the `~/.claude/CLAUDE.md` content using [PROFILES.md](references/PROFILES.md) templates
2. Build sandbox/safety recommendations using [SAFETY_DEFAULTS.md](references/SAFETY_DEFAULTS.md)
3. Present a **human-readable summary** (not the raw CLAUDE.md content) that reflects back what you understood:

```
Here's how I'll work with you:

  Comfort level: [their Q1 choice]
  Purpose:       [their Q2 choice]
  Communication: [their Q3 choice]

What this means:
- [1-2 sentence plain-language description of how Claude will behave]
- [Safety posture in plain language, e.g., "I'll explain every command before running it"]
- [Output style in plain language, e.g., "Using Beginner-Friendly mode for extra-clear explanations"]

Safety recommendations:
- [List from SAFETY_DEFAULTS.md, adapted to tier language]
```

4. Use **AskUserQuestion** to confirm:

**"Does this look right?"**
Header: "Your Profile"

| Option | Description |
|---|---|
| Looks good — save it | Save this profile and apply settings |
| Adjust something | Go back and change one of my answers |
| Start over | Re-do the whole wizard from scratch |

- **If "Looks good"**: Proceed to Step 6
- **If "Adjust something"**: Ask which question to redo (Q1, Q2, or Q3), re-ask only that question, re-derive everything, and return to Step 5
- **If "Start over"**: Jump back to Step 1

### Step 6 — Write and Confirm

1. If `~/.claude/CLAUDE.md` exists:
   - Read existing content
   - **Preserve** any sections NOT generated by onboarding (sections without the `<!-- onboard -->` marker)
   - Replace only the onboard-generated sections
2. If it doesn't exist, create it
3. All onboard-generated sections must start with `<!-- onboard:section-name -->` HTML comment so future runs can identify and replace them
4. **Write project-level purpose**: Save the user's purpose choice to `.claude/user-context.md` (project root, gitignored):
   ```markdown
   <!-- onboard:purpose -->
   # Purpose
   - {purpose description from PROFILES.md Purpose Additions}
   <!-- /onboard:purpose -->
   ```
5. **Install output style**: Copy the template from the matching `OUTPUT_STYLE_*.md` reference to `~/.claude/output-styles/` (create directory if needed)
6. **Set the output style** in `~/.claude/settings.json`:
   - Read existing settings (if any) and merge — don't overwrite other settings
   - Set `"outputStyle"` to the value from Step 4b
   - Tell the user: "Output style set to [name]. This takes effect in your next session."
7. Display a summary of what was written and configured
8. If safety posture recommends sandbox, show the user how to enable it:
   - "To enable sandbox mode, run `/sandbox` in Claude Code"
   - Show recommended `settings.json` additions if applicable

## Section Markers

Every section generated by this skill must be wrapped with markers:

```markdown
<!-- onboard:about-me -->
## About Me
...
<!-- /onboard:about-me -->

<!-- onboard:communication -->
## How to Communicate With Me
...
<!-- /onboard:communication -->

<!-- onboard:safety -->
## Safety & Risk Communication
...
<!-- /onboard:safety -->
```

This allows future `/onboard` runs to update only these sections while preserving user-added content.

## Handling "Other" (Freeform) Answers

AskUserQuestion always provides an "Other" option for custom text. When a user types a freeform answer:

1. **For Q1 (Coding Comfort):** Map to the closest predefined option based on the level of support they're describing. If unclear, ask: "To tailor your setup, which of these is closest?" and re-present the options.
2. **For Q2/Q3:** Map to the closest predefined option based on semantic meaning.

## Rules

- **Never overwrite user-added sections** in `~/.claude/CLAUDE.md` — only replace onboard-marked sections
- **Always preview before writing** — show the exact content and get confirmation
- **Derive safety posture automatically** — don't make non-technical users choose security settings they can't evaluate
- **One question per AskUserQuestion call** (3 questions total) — keep it clear, no tabs
- **Use plain language in all options** — no jargon in option labels or descriptions
- **Include the "Other" escape hatch** — AskUserQuestion always provides this automatically
