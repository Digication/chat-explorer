---
name: fact-check
description: Independent fact-checker that verifies claims made during the conversation. Use when the user questions a response ("are you sure?", "is that right?"), when Claude hedges ("I think", "usually"), or when a response contains specific factual assertions about code behavior, libraries, APIs, or project structure. Can also be invoked directly to audit the full conversation.
metadata:
  allowed-tools: Read, Glob, Grep, Agent, TodoWrite, Bash(git log:*), Bash(git diff:*), Bash(git status:*)
---

# Fact-Check — Independent Claim Verification

A two-stage fact-checker that watches for verifiable claims and spawns fresh-context sub-agents to verify them against real evidence. Designed to catch mistakes without slowing down routine work.

## Arguments

- `(no args)`: Audit the most recent exchange (last user message + last Claude response)
- `all`: Audit all claims across the full conversation
- `<quote or topic>`: Verify a specific claim or topic

## Core Principle

> **Assume all claims are correct by default.**
> For each claim, attempt to find supporting evidence first.
> Only flag a claim when evidence actively contradicts it or no supporting evidence can be found.

This prevents over-correction — the fact-checker should catch real mistakes, not nitpick correct statements.

---

## Stage 1 — Triage (Lightweight, Always Runs)

Scan the target messages and extract every **verifiable claim** — a statement that can be confirmed or denied by examining code, files, documentation, or external sources.

### What counts as a verifiable claim

| Type | Example | How to verify |
|---|---|---|
| **Code behavior** | "This function returns null when..." | Read the actual code |
| **Code existence** | "The config is defined in `src/config.ts`" | Search the filesystem |
| **API / library fact** | "React 19 changed how context works" | Web search |
| **Project structure** | "Tests are in the `__tests__` folder" | Glob the project |
| **Git history** | "This was changed in the last commit" | Check git log |
| **Standard / spec** | "HTTP 204 means no content" | Web search or documentation |

### What is NOT a verifiable claim (skip these)

| Type | Example | Why skip |
|---|---|---|
| **Opinion / recommendation** | "I'd suggest using approach A" | Subjective — no right answer |
| **Planning / next steps** | "Next, I'll update the tests" | Intent, not fact |
| **Code being written** | New function the agent is creating | Testable by running, not by fact-checking |
| **User statements** | Anything the user said | Not the fact-checker's job to correct the user |
| **Hedged uncertainty** | "I'm not sure, but maybe..." | Already flagged as uncertain |

### Triage output

For each verifiable claim found, record:

- **Claim**: The specific assertion (quote or close paraphrase)
- **Type**: Code behavior / Code existence / API-library / Project structure / Git history / Standard-spec
- **Source**: Who made it (user or Claude)
- **Confidence signal**: Did the source hedge, or state it definitively?

If **zero verifiable claims** are found, report "Nothing to verify" and stop.

---

## Stage 2 — Verification (Per-Claim, Fresh-Context Sub-Agents)

For each claim from Stage 1, spawn a **fresh-context sub-agent** to verify it independently.

### Why fresh context matters

The sub-agent must NOT see the original conversation. If it reads Claude's reasoning, it will be biased toward agreeing (the "echo chamber" effect). Give it only:
1. The **specific claim** to verify
2. The **claim type** (so it knows which tools to use)
3. The **file paths or topics** involved (so it knows where to look)

### Verification by claim type

Refer to [CLAIM_ROUTING.md](references/CLAIM_ROUTING.md) for the sub-agent prompt template and tool assignment per claim type.

**Summary of routing:**

| Claim type | Tools for sub-agent | Verification strategy |
|---|---|---|
| Code behavior | `Read, Glob, Grep` | Read the actual function, trace the logic |
| Code existence | `Glob, Grep` | Search for the file/symbol |
| API / library fact | `Read, Glob, Grep, WebSearch, WebFetch` | Check project dependencies, then search docs |
| Project structure | `Glob` | Pattern-match the filesystem |
| Git history | `Bash(git log:*), Bash(git diff:*)` | Check actual git history |
| Standard / spec | `Read, WebSearch, WebFetch` | Search authoritative sources |

### Sub-agent verdict (per claim)

Each sub-agent must return:

| Verdict | Meaning |
|---|---|
| **Supported** | Evidence confirms the claim |
| **Contradicted** | Evidence actively disproves the claim |
| **Unverifiable** | Cannot find evidence either way |

Along with:
- **Evidence**: What was found (file path + line, git commit, URL, etc.)
- **Explanation**: One sentence connecting the evidence to the verdict

### Parallelism

- Claims of **different types** can be verified in parallel (up to 4 concurrent sub-agents)
- Claims about the **same file** should be batched into one sub-agent to avoid redundant reads
- Use `model: "sonnet"` for sub-agents — verification needs accuracy, not creativity

---

## Stage 3 — Report

After all sub-agents return, compile the results:

```markdown
# Fact-Check Report

## Summary
[X claims checked. Y supported, Z contradicted, W unverifiable.]

## Findings

### ✓ Supported
| # | Claim | Evidence |
|---|---|---|
| 1 | [claim text] | [file:line or source] |

### ✗ Contradicted
| # | Claim | What's actually true | Evidence |
|---|---|---|---|
| 1 | [claim text] | [correct information] | [file:line or source] |

### ? Unverifiable
| # | Claim | Why |
|---|---|---|
| 1 | [claim text] | [what was searched, why nothing was found] |
```

### After the report

- **If contradictions found**: Highlight them clearly and offer to correct the original response or code
- **If all supported**: Confirm briefly — "All claims check out"
- **If unverifiable items**: Note what couldn't be checked and why — don't present absence of evidence as confirmation

---

## Rules

- **Evidence over opinion** — every verdict must cite a specific source (file, line number, URL, git commit). "I believe this is correct" is not verification.
- **Fresh context is mandatory** — sub-agents must not see the conversation that produced the claim. This is the primary defense against echo-chamber confirmation.
- **No user fact-checking** — do not verify or challenge claims made by the user. The user is the authority on their own intent and context.
- **No opinion-checking** — recommendations, suggestions, and preferences are not facts. Skip them.
- **Budget discipline** — if a conversation has 20+ claims, prioritize: contradicted signals first, hedged claims second, definitive assertions last. Cap at 10 claims per run unless `all` is specified.
- **Transparency** — always show what was checked and what wasn't. Never silently skip a claim.
- **Humility** — the fact-checker is also an LLM. Present findings as "evidence suggests" not "this is definitively wrong." The user makes the final call.
