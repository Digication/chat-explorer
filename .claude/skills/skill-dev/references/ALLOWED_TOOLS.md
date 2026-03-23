# allowed-tools Field Reference

## Safety-First Principle

Skills should default to read-only tools unless write operations are essential.

### Tool Safety Classification

**Safe (Read-Only) - Always Allowed:**

| Tool | Purpose |
|------|---------|
| `Read` | Read file contents |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |

**Interactive - Generally Allowed:**

| Tool | Purpose |
|------|---------|
| `TodoWrite` | Track task progress |

**Restricted Read-Only (Git) - Allowed with Restrictions:**

| Tool Pattern | Purpose |
|--------------|---------|
| `Bash(git status:*)` | View git status |
| `Bash(git diff:*)` | View changes |
| `Bash(git log:*)` | View history |

**Write Operations - Require Justification:**

| Tool | Purpose |
|------|---------|
| `Edit` | Modify existing files |
| `Write` | Create/overwrite files |

Only include if the skill's core purpose is to modify files.

## Format

Place `allowed-tools` under the `metadata` frontmatter field:

```yaml
metadata:
  allowed-tools: Read, Glob, Grep, Bash(git diff:*), Bash(git status:*)
```

## Common Mistakes

- Bare `Bash` (too permissive) -> use `Bash(command:*)`
- Including `Edit` for read-only skills -> remove it
- `Bash(git:*)` (too broad) -> use specific git subcommands
- `allowed-tools` as a top-level frontmatter field -> move under `metadata`
