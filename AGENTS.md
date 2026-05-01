<!-- parity:bootstrap:start -->
## Parity methodology

Full bootstrap lives in the installed Parity plugin at `agents/bootstrap.md`. On this host, a convenience symlink resolves it: `.claude/parity/agents/bootstrap.md`. To locate the plugin installPath manually:

    claude plugin list --json | jq -r '.[] | select(.id=="parity@parity") | .installPath'

Minimum inline for agents that cannot follow imports:

- Prefix every response with `@<agent-id>:` (e.g. `@codex:`).
- Preserve another agent's original attribution when relaying findings.
- Roles are phase-bound: Driver (implements + leads), Challenger (design, R2+), Verifier (pre-commit, R1+).
- Before non-trivial planning: read `cookbook/INDEX.md` and `process/failure-patterns.md` (in the plugin) for capability-decision triggers and durable methodology failure patterns.
- Read `memory/failure-patterns.md`, `memory/constraints.md`, `memory/host-context.md` (in the host repo) on demand when a host-specific pattern is plausibly relevant.
- Before reopening a cross-task decision: grep `memory/decisions.log`.

| Tier | Triggers |
|---|---|
| `[R0]` | Doc-only / prose / comment / whitespace |
| `[R1]` | Default — feature / fix / refactor with local blast radius |
| `[R2]` | Auth / external API / migrations / cross-service / RRD changes |
| `[R3]` | Destructive migrations / PII / money / live incident |

When in doubt, classify higher.
<!-- parity:bootstrap:end -->
