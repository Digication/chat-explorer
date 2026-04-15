# Design Decision: Body of Evidence over Modal Category

**Date:** 2026-04-15
**Status:** SHIPPED (PR #5, deployed to production)
**Context:** Conversation about how to represent reflection depth for outcomes/evidence features

## The Problem

The student panel showed a single "modal category" per student — whichever Hatton & Smith reflection level appeared most often. In practice, this made nearly every student display as "Descriptive Writing" because:

1. **Most conversation is naturally descriptive.** When two people go back and forth 10 times, 8 of those exchanges are scaffolding — setting context, asking questions, responding to prompts. Only 2 might be genuinely insightful.
2. **The mode drowns the signal.** A student with 8 descriptive comments and 2 critical reflections was labeled "Descriptive." The 2 critical reflections — the actual evidence of depth — were invisible.
3. **Absence ≠ regression.** If a student demonstrates critical thinking on Monday but works on collaboration on Tuesday, their critical thinking score shouldn't decay. Once you learn to ride a bike, you don't forget.

## The Design Principle

**Use an achievement/portfolio model, not a scoring model.**

| Scoring Model (old) | Achievement Model (new) |
|---|---|
| "What's your current number?" | "What have you demonstrated? Here's the evidence." |
| Every new reflection updates the score | Evidence accumulates; new work on different topics doesn't diminish prior evidence |
| Not demonstrating something = score decays | Absence of evidence is not evidence of absence |
| Penalizes students for working on other things | Each outcome/skill has its own independent evidence log |

This is the **body of evidence** principle: a single "best example" is a highlight reel; a body of evidence tells a story. The system's job is to **collect and organize**, not to **score and rank**. Faculty see the evidence and make their own judgment.

## The Bicycle Analogy

Think about learning to ride a bicycle. You fall 50 times before you never fall again. If you average all 50 attempts, the score at attempt #50 looks terrible — even though you've mastered the skill. Reflective depth works the same way: it's a durable capability, not a perishable one. Once a student demonstrates genuine critical reflection, that evidence stands.

## What We Shipped

**Before:** Each student showed one chip — e.g., "Descriptive Writing"
**After:** Each student shows chips for every level they've demonstrated — e.g., "Dialogic (7), Desc. Reflection (2), Descriptive (11)"

### Files Changed
- `src/server/types/schema.ts` — Added `categoryDistribution` to `StudentProfile` type
- `src/server/services/analytics/instructional-insights.ts` — Pass through distribution from engagement service
- `src/lib/queries/explorer.ts` — Fetch `categoryDistribution` in student profiles query
- `src/lib/queries/analytics.ts` — Fetch `categoryDistribution` in student engagement query
- `src/components/explorer/StudentListPanel.tsx` — Show distribution chips instead of modal chip

### Key Detail
The distribution data was **already being computed** in the engagement service (`engagement.ts:128-133`). It was right there the whole time — the UI just threw it away and showed only the modal. This was a UI change, not a data pipeline change.

## Implications for Future Work

This principle should guide all upcoming features:

1. **Outcomes Hub** — Each outcome should show its own evidence log, not a score
2. **Evidence Trees / Conceptual Trees** — Evidence accumulates across artifacts and time
3. **Student-Facing Views** — Students see "here's what you've demonstrated" not "here's your score"
4. **Guided Reflection** — When a student reflects on an outcome, that reflection becomes evidence in the log
5. **Other views still using modal** — `StudentEngagementTable`, `DepthBands`, and `GrowthVisualization` should be updated similarly

## Branch Strategy Note

This fix was developed on `feat/outcomes-evidence-trees` but needed to ship independently. We:
1. Stashed all work on the feature branch
2. Created `fix/student-depth-distribution` from `main` with only these 5 files
3. Merged via PR #5
4. Restored the feature branch — will merge cleanly later since changes are in different file sections
