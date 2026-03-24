---
name: review-thread
description: Independent third-party review of conversation feedback. Use when the user wants a fresh, unbiased evaluation of feedback exchanged during the current conversation — corrections, suggestions, decisions, or disagreements between the user and Claude. Acts as an impartial reviewer who challenges assumptions before accepting changes.
metadata:
  allowed-tools: Read, Glob, Grep, Edit, Write, Agent, TodoWrite
---

# Independent Thread Review

Acts as an impartial third-party reviewer of the current conversation. The user and Claude are the two parties who have been discussing and making decisions. This skill brings in a fresh pair of eyes to independently evaluate the feedback exchanged between them.

## Arguments

- `(no args)`: Review all feedback items from the current conversation
- `<topic>`: Focus the review on feedback related to a specific topic

## Core Principle

> **Assume all feedback items are false positives by default.**
> For each item, attempt to justify why the current state is correct and no change is needed.
> Only recommend a change when a false-positive justification cannot be reasonably made.

This is not about being contrarian — it is about ensuring every recommended change has earned its place through evidence, not momentum or agreement bias.

## What Counts as a Feedback Item

Scan the conversation for:

| Type | Example |
|---|---|
| **Correction** | User says "that's wrong" or "no, do it this way" |
| **Suggestion** | Either party proposes an alternative approach |
| **Decision** | A choice was made between options |
| **Disagreement** | One party pushed back on the other's approach |
| **Assumption** | Something was accepted without evidence or verification |
| **Unresolved question** | Something was raised but never answered |

## Review Protocol

### Step 1 — Extract Feedback Items

Scan the full conversation and list every feedback item. For each, record:
- **What was said** (brief quote or paraphrase)
- **Who raised it** (user or Claude)
- **What action was taken** (changed, dismissed, deferred, or unresolved)

### Step 2 — Independent Evaluation

For each feedback item, follow this sequence strictly:

1. **Understand the context** — read the surrounding conversation and any referenced code
2. **Attempt to justify the current state** — argue why the existing code or decision is already correct. Consider:
   - Does the current implementation actually handle the concern?
   - Is the feedback based on a misunderstanding of the code?
   - Would the suggested change introduce unnecessary complexity?
   - Is there a simpler explanation that makes the current approach valid?
3. **Rule on the item** — assign one of:

| Verdict | Meaning |
|---|---|
| **Confirmed — No Change Needed** | The current state is defensible. The feedback was a false positive. |
| **Valid — Change Recommended** | No reasonable justification can be made for the current state. A change is warranted. |
| **Inconclusive — Needs Discussion** | The reviewer cannot make a confident call either way. More information is needed. |

4. **Explain the reasoning** — for every verdict, state why. For "No Change Needed", explain what makes the current state correct. For "Valid", explain why no justification could hold up.

### Step 3 — Generate Report

Output a structured report:

```markdown
# Thread Review Report

## Summary
[1-2 sentence overview: how many items reviewed, how many require action]

## Review Items

### Item 1: [Brief title]
- **Raised by**: [user / Claude]
- **Context**: [What was being discussed]
- **Feedback**: [What was said or suggested]
- **Action taken**: [What happened in the conversation]
- **Attempted justification**: [Why the current state might be correct]
- **Verdict**: [Confirmed — No Change Needed / Valid — Change Recommended / Inconclusive — Needs Discussion]
- **Reasoning**: [Why this verdict]

[Repeat for each item]

## Recommendations
- **No action needed**: [count] items
- **Changes recommended**: [count] items — [brief list]
- **Needs discussion**: [count] items — [brief list]
```

### Step 4 — Act on Results

After presenting the report, ask the user how they want to proceed:

- **For "Valid — Change Recommended" items**: Offer to implement the changes
- **For "Inconclusive" items**: Ask clarifying questions to help resolve them
- **For "Confirmed — No Change Needed" items**: No action unless the user disagrees with the verdict

## Rules

- **Independence over agreement** — do not favor either party. The user is not automatically right. Claude is not automatically right. The code and evidence decide.
- **Skepticism is the default** — every change must earn its way in. Agreement between user and Claude is not sufficient evidence — they may both be wrong.
- **No rubber-stamping** — if every item comes back as "Valid", the reviewer is not being critical enough. Re-examine.
- **Evidence over opinion** — cite specific code, behavior, or documentation when justifying verdicts. Avoid "I think" or "it seems".
- **Scope discipline** — only review feedback from the current conversation. Do not invent new feedback items.
