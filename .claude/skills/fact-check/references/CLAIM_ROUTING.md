# Claim Routing — Sub-Agent Templates

How to spawn a fresh-context verification agent for each claim type.

## General Rules

- **Never pass conversation history** to the sub-agent — only the claim, its type, and relevant file paths or topics
- **Use `model: "sonnet"`** for all verification agents — accuracy matters more than speed
- **Cap at 4 parallel agents** — batch same-file claims into one agent
- **Read-only by default** — verification agents should never modify files

---

## Sub-Agent Prompt Template

All verification agents use this base template. Replace `{placeholders}` with actual values.

```
You are an independent fact-checker. Your job is to verify a single claim
using evidence from the codebase, documentation, or web sources.

IMPORTANT: You have NO conversation context. Do not assume anything beyond
what is stated below. Verify using evidence only.

## Claim to Verify
"{claim_text}"

## Claim Type
{claim_type}

## Where to Look
{search_hints}

## Instructions
{type_specific_instructions}

## Output Format (strict)
- **Verdict**: Supported | Contradicted | Unverifiable
- **Evidence**: [Specific source — file path:line number, URL, git commit hash]
- **What was found**: [Brief description of what the evidence shows]
- **Explanation**: [One sentence connecting the evidence to the verdict]
```

---

## Type-Specific Instructions

### Code Behavior
**Tools**: `Read, Glob, Grep`

```
1. Find the function/method/class mentioned in the claim
2. Read the actual implementation — do not rely on names or comments
3. Trace the logic path relevant to the claim
4. Check for edge cases the claim may have missed (null, empty, error paths)
5. If the claim says "X happens when Y", verify both the condition (Y) and the result (X)
```

**Search hints format**: Function name, file path if known, module or directory to search in.

---

### Code Existence
**Tools**: `Glob, Grep`

```
1. Search for the exact file path, symbol, or pattern mentioned in the claim
2. If not found at the exact location, search broadly (the file may have moved)
3. If found but different from claimed (renamed, different directory), note the discrepancy
4. Report the actual path/location if it differs from the claim
```

**Search hints format**: The file path, symbol name, or pattern to search for.

---

### API / Library Fact
**Tools**: `Read, Glob, Grep, WebSearch, WebFetch`

```
1. First, check if the library is in the project's dependencies (package.json, requirements.txt, etc.)
2. Check the installed version — the claim may be true for one version but not another
3. Search the web for the specific claim, preferring official documentation
4. If the claim is about behavior, look for changelog entries or migration guides
5. Note the version context — "true as of v3.2, changed in v4.0"
```

**Search hints format**: Library name, specific API or feature, version if mentioned.

---

### Project Structure
**Tools**: `Glob`

```
1. Search for the directory or file pattern mentioned
2. If the claim is about organization ("tests are in X", "configs live in Y"), glob broadly
3. Report what actually exists vs. what was claimed
4. If partially correct (some files there, some elsewhere), note the nuance
```

**Search hints format**: Directory path, file pattern, structural claim to verify.

---

### Git History
**Tools**: `Bash(git log:*), Bash(git diff:*)`

```
1. Search git log for the event mentioned (commit, change, author)
2. Use appropriate flags: --oneline for overview, --author for person, --since/--until for dates
3. If the claim is about what changed, use git diff to see actual changes
4. Report the actual commit hash and message as evidence
```

**Search hints format**: Time range, file affected, author, or commit message keywords.

---

### Standard / Spec
**Tools**: `Read, WebSearch, WebFetch`

```
1. Search for the specific standard, RFC, or specification mentioned
2. Prefer authoritative sources (MDN, RFCs, official specs, language docs)
3. Quote the relevant section if found
4. Note if the standard has versions — the claim may be true for one version but not another
```

**Search hints format**: Standard name, section, specific rule or definition claimed.

---

## Batching Same-File Claims

When multiple claims reference the same file, batch them into one agent:

```
You are an independent fact-checker verifying multiple claims about the same file.

## Claims to Verify
1. "{claim_1}"
2. "{claim_2}"
3. "{claim_3}"

## File to Examine
{file_path}

## Instructions
Read the file once, then verify each claim independently.
Provide a separate verdict for each claim.

## Output Format (per claim)
### Claim 1: "{claim_1}"
- **Verdict**: Supported | Contradicted | Unverifiable
- **Evidence**: [line number and relevant code]
- **Explanation**: [one sentence]

[repeat for each claim]
```

---

## Confidence Signals

When the original claim included hedging language, lower the threshold for "Unverifiable":

| Original language | Interpretation |
|---|---|
| "This function does X" (definitive) | Expect strong evidence either way |
| "I think this does X" (hedged) | Treat as a question — finding the answer is the goal |
| "Usually X happens" (qualified) | Check if there are exceptions — the qualifier may be the important part |
| "X should work" (uncertain) | Verify whether it actually does, not just whether it should |
