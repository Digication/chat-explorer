---
name: task
description: Manages task context switching safely — prevents losing uncommitted work when starting new tasks. Use when starting a new task, resuming previous work, or checking what's in progress.
metadata:
  allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
---

# Task — Safe Context Switching

Prevents lost work when switching between tasks across Claude Code sessions. Ensures uncommitted changes from a previous task are handled before starting something new.

## Arguments

- (no args) or `status`: Show current working state (branch, uncommitted changes, stashes)
- `start "description"`: Start a new task — safely handles any dirty state first
- `pause`: Save current work and return to a clean state
- `resume`: List paused/in-progress tasks and switch to one
- `list`: Show all task branches

## Workflow

### `status` (default)

1. Run `git status`, `git branch --show-current`, and `git stash list`
2. Present a clear summary:
   - Current branch
   - Uncommitted changes (count of modified/staged/untracked files)
   - Any stashed work (with descriptions)
3. If there are uncommitted changes, note: "You have uncommitted work. Use `/task pause` to save it, or `/task start` to switch to something new."

### `start "description"`

This is the core workflow — safe context switching.

**Step 1 — Check dirty state**

Run `git status --porcelain`.

- If working tree is clean (no modified/staged/untracked files): skip to Step 3
- If dirty (any changes): proceed to Step 2

> Note: Stash presence alone does NOT trigger Step 2 — only uncommitted working tree changes do.

**Step 2 — Handle uncommitted changes**

Use **AskUserQuestion**:

**"You have uncommitted changes. What should we do with them?"**
Header: "Uncommitted Work"

| Option | Description |
|---|---|
| Stash them | Save changes to git stash — you can resume later with `/task resume` |
| Commit as WIP | Create a work-in-progress commit on the current branch |
| They're related | Keep them — these changes are part of the new task |
| Discard them | Throw away uncommitted changes (cannot be undone) |

Actions:
- **Stash**: Run `git stash push -m "task: {current_branch} - {brief_description}"` (include untracked with `-u`)
- **Commit as WIP**: Stage all and commit with message `wip: {current_branch_context}` — do NOT push
- **Related**: Keep changes, skip to Step 3 (stay on current branch or carry changes to new branch)
- **Discard**: Confirm once more ("Are you sure? This cannot be undone."), then `git checkout -- . && git clean -fd`

**Step 3 — Create task branch**

1. Derive a branch name from the description: `task/{short-kebab-case}` (e.g., `task/add-login-page`)
2. Use **AskUserQuestion** to confirm:

**"Start task on a new branch?"**
Header: "New Task"

| Option | Description |
|---|---|
| Create branch `task/{name}` | Branch from current HEAD |
| Create branch from main | Start fresh from main branch |
| Stay on current branch | No branch — just start working here |

3. Create the branch if requested: `git checkout -b task/{name}` (or `git checkout -b task/{name} main`)
4. Confirm based on the choice:
   - If branch created: "Ready to go. You're on `task/{name}`. What are we building?"
   - If staying on current branch: "Ready to go. You're on `{current_branch}`. What are we building?"

### `pause`

Save current work and return to a clean state.

1. Check `git status --porcelain` — if clean, say "Nothing to pause — working tree is clean."
2. If dirty, use **AskUserQuestion**:

**"How should we save your current work?"**
Header: "Pause Task"

| Option | Description |
|---|---|
| Stash | Save to git stash — lightweight, easy to resume |
| Commit as WIP | Create a WIP commit on this branch |

3. Execute the chosen action:
   - **Stash**: `git stash push -u -m "task: {branch} - paused"`
   - **WIP commit**: Stage all, commit `wip: {brief_context_from_recent_changes}`
4. Optionally ask if they want to switch to main: "Switch back to main branch?"
5. Confirm: "Work saved. Use `/task resume` to pick up where you left off."

### `resume`

List available tasks and switch to one.

1. Gather task branches: `git branch --list 'task/*'`
2. Gather stashes: `git stash list`
3. If nothing found: "No paused tasks found. Use `/task start` to begin something new."
4. Present combined list with **AskUserQuestion**:

**"Which task do you want to resume?"**
Header: "Resume Task"

Options built from:
- Task branches (with last commit message as description)
- Stash entries (with stash message as description)

5. Resume the selected task:
   - **If user picked a branch**: `git checkout task/{name}`. If a stash exists with a matching `task: task/{name}` prefix, ask if they want to pop it too.
   - **If user picked a stash**: Parse the originating branch from the stash message (the `task: {branch}` prefix). Checkout that branch first (`git checkout {branch}`), THEN pop the stash (`git stash pop`). Both steps are required — never pop a stash without first being on the correct branch.
6. Run `git status` and show current state
7. Confirm: "Resumed `task/{name}`. Here's where you left off: [brief state summary]"

### `list`

1. Show all `task/*` branches with their last commit message and date
2. Show any stashes with `task:` prefix
3. Highlight current branch if it's a task branch
4. If no tasks: "No task branches found."

## Branch Naming

- Prefix: `task/`
- Format: kebab-case, derived from description
- Max length: 50 chars for the suffix
- Examples: `task/add-login-page`, `task/fix-nav-bug`, `task/refactor-auth`

## Rules

- **Never discard changes without explicit double-confirmation** — this is the skill's #1 safety guarantee
- **Always show what will be affected** before stashing, committing, or discarding
- **Stash messages must be descriptive** — include branch name and context so `/task resume` is useful
- **Don't force branch creation** — some tasks are fine on the current branch
- **WIP commits should never be pushed** — they're local-only placeholders
- **Use the user's tier language** — if their profile is Guided, explain git concepts; if Expert, be terse
