# Skill Specification Quick Reference

## Directory Structure

```
skill-name/
├── SKILL.md          # Required: Main instructions
├── scripts/          # Optional: Executable code
├── references/       # Optional: Additional documentation
└── assets/           # Optional: Static resources
```

## YAML Frontmatter

| Field | Required | Max Length | Notes |
|-------|----------|------------|-------|
| `name` | Yes | 64 chars | Lowercase, hyphens, numbers only |
| `description` | Yes | 1024 chars | Third person, includes triggers |
| `allowed-tools` | No | - | Comma-separated tool list |

## name Rules

- Only `a-z`, `0-9`, `-`
- No leading/trailing/consecutive hyphens
- Must match parent directory name

## description Rules

- Third person ("Extracts...", not "I can...")
- Include what it does and when to use it

## Body Content

- Keep under 500 lines
- Split longer content into reference files
- Use relative paths with forward slashes
- Keep references one level deep
