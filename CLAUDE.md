# Environment
- Package manager: pnpm (not npm or yarn)
- Language: TypeScript (strict mode)
- Run `/onboard` if `~/.claude/CLAUDE.md` has no `## About Me` section

# Token Saving
- Use `!` prefix to run commands directly without token cost: `! git status`, `! npm test`

# Workflow
- Commit messages: Conventional Commits format (`feat(scope): description`)
- Skill quality pipeline: `/skill-review` first, then `/skill-test`, fix issues before shipping
- After completing significant work: run `/retrospective` to capture learnings

# User Context
- Load `.claude/user-context.md` if it exists — contains per-user project preferences (gitignored, created by `/onboard`)

# Code Style
- Prefer named exports over default exports
- Use absolute imports with path aliases when configured
