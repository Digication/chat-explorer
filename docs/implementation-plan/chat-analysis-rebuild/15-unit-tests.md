# Phase 15 — Unit Tests

You are writing unit tests for the **Chat Analysis** app.

**Context:** Phases 01–14 built the complete application: CSV parser, TORI extractor, consent management, analytics engine (overview, TORI, text signals, engagement, heatmap, clustering, network, instructional insights, recommendations), GraphQL API, React frontend with Insights and Chat Explorer pages, AI chat integration with unified LLM layer, and reports/export. All code is in `src/server/services/` for backend logic.

**Note:** Tests must NOT make real API calls to OpenAI, Anthropic, Google, or any external services. Mock all external dependencies.

## Goal

Set up Vitest and write comprehensive unit tests for all backend services. Every analytics module, the CSV parser, TORI extractor, consent logic, deduplication, and the LLM provider factory should have tests that verify correctness without hitting any external APIs.

## Overview

- Configure Vitest with TypeScript and path aliases
- Test the CSV parser service
- Test TORI extraction from AI response text
- Test consent filtering logic
- Test deduplication service
- Test all analytics modules (TORI, text signals, engagement, clustering, network, recommendations)
- Test the LLM provider factory

## Steps

### 1. Configure Vitest

**Files to create:** `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    setupFiles: ["src/server/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

**Files to create:** `src/server/test-setup.ts`

```typescript
import "reflect-metadata";
```

### 2. Test CSV parser

**Files to create:** `src/server/services/__tests__/csv-parser.test.ts`

Test the CSV parsing service with various inputs:

- Valid CSV with all expected columns parses correctly
- Missing optional columns (e.g. no `course` column) still parses
- Malformed CSV (wrong delimiter, missing headers) throws a descriptive error
- Empty rows are skipped
- Unicode characters in student names and comment text are preserved
- Very large text fields (10,000+ characters) are handled without truncation
- Whitespace-only comment text is treated as empty and skipped
- Column headers are case-insensitive (e.g. "Thread_ID" matches "thread_id")

### 3. Test TORI extractor

**Files to create:** `src/server/services/__tests__/tori-extractor.test.ts`

Test TORI tag extraction from AI assistant response text:

- **Explicit format**: Text containing `TORI: Comprehension, Application` extracts both tags
- **Natural language**: Text mentioning "demonstrates strong comprehension" extracts Comprehension
- **Multiple mentions**: Same tag mentioned multiple times counts only once per comment
- **"Done" summary skipping**: AI responses that are just "done" or a brief summary with no preceding student comment produce no tags
- **No preceding student comment**: If the assistant comment has no student comment before it in the thread, skip extraction
- **Unrecognized categories**: Text mentioning non-TORI terms (e.g. "creativity") does not produce tags
- **Case insensitivity**: "COMPREHENSION", "comprehension", "Comprehension" all match
- **Empty text**: Returns empty array
- **All TORI categories recognized**: Each of the standard TORI categories can be extracted individually

### 4. Test consent filtering

**Files to create:** `src/server/services/__tests__/consent.test.ts`

Test the consent service logic (mock the database):

- **Institution-wide exclusion**: A student with institution-level exclusion is blocked from all courses
- **Course-level exclusion**: A student excluded from Course A is blocked from Course A but included in Course B
- **No consent record**: A student with no consent record is treated as included (default)
- **Instructor scope**: An instructor can only manage consent for courses they have access to
- **Institution admin scope**: An institution admin can manage consent for any course in their institution
- **Audit trail**: Toggling consent creates an audit log entry with the actor and timestamp
- **Consent re-inclusion**: A previously excluded student can be re-included and their data reappears

### 5. Test deduplication

**Files to create:** `src/server/services/__tests__/dedup.test.ts`

Test the deduplication service:

- **Exact duplicate**: Same Thread ID + Comment ID is detected as duplicate
- **Different thread, same comment ID**: Not a duplicate (different thread context)
- **Merge behavior**: When a duplicate is found, the newer upload's metadata is kept (uploaded_by, uploaded_at)
- **New comments**: Comments with new Thread ID + Comment ID combinations are inserted
- **Mixed batch**: A batch with some duplicates and some new rows correctly inserts new and updates existing

### 6. Test TORI analytics

**Files to create:** `src/server/services/analytics/__tests__/tori.test.ts`

Test TORI combination generation and frequency counting:

- 2 tags produce 1 pair, 0 triples
- 3 tags produce 3 pairs, 1 triple
- 4 tags produce 6 pairs, 4 triples, 1 quadruple
- Duplicate tags in a comment are deduplicated before combination generation
- Tag frequency counts are accurate across multiple comments
- Percent share sums to 100% (within rounding tolerance)
- Student coverage correctly counts distinct students per tag

### 7. Test text signals

**Files to create:** `src/server/services/analytics/__tests__/text-signals.test.ts`

Test `computeTextSignals` with various inputs:

- Empty string returns zero for all metrics
- A sentence with questions ("What if...? How does...?") returns correct question count
- Text with hedging words ("perhaps", "maybe", "I think") detects hedging count
- Text with evidence phrases ("for example", "research shows") detects evidence count
- Lexical diversity is calculated correctly (unique tokens / total tokens)
- Stopwords are excluded from token count
- Very short text (< 5 words) still produces valid metrics

### 8. Test engagement scoring

**Files to create:** `src/server/services/analytics/__tests__/engagement.test.ts`

Test `computeEngagementQualityScore` and `classifyDepthBand`:

- Low-signal input (short text, no questions, no evidence) produces SURFACE band
- Medium-signal input produces DEVELOPING band
- High-signal input (long text, questions, hedging, evidence, high lexical diversity) produces DEEP band
- Score is always between 0 and 1
- Component weights sum correctly
- Edge case: all-zero signals produce score 0 and SURFACE band

### 9. Test clustering

**Files to create:** `src/server/services/analytics/__tests__/clustering.test.ts`

Test `getClusteredOrder`:

- Empty matrix returns empty array
- Single row returns `[0]`
- Two identical rows are placed adjacent
- Most dissimilar rows are placed furthest apart
- Result contains all indices exactly once (no duplicates, no missing)
- Ordering is deterministic for the same input

### 10. Test network computation

**Files to create:** `src/server/services/analytics/__tests__/network.test.ts`

Test `computeToriNetwork`:

- Empty pairs returns empty edges and empty nodes
- Single pair creates 2 nodes and 1 edge
- Weighted degree is calculated correctly (sum of connected edge weights)
- Community detection groups connected tags into the same community
- Edge weight matches the co-occurrence count from input data
- Isolated tags (no co-occurrences) still appear as nodes

### 11. Test recommendations

**Files to create:** `src/server/services/analytics/__tests__/recommendations.test.ts`

Test the smart recommendation service:

- A dataset with high TORI variance recommends the heatmap view
- A dataset with strong co-occurrence patterns recommends the network graph
- A dataset with a wide depth band spread recommends the depth band chart
- A small dataset (< 5 students) recommends student profile cards over the heatmap
- Recommendations are ordered by relevance score

### 12. Test LLM provider factory

**Files to create:** `src/server/services/llm/__tests__/provider.test.ts`

Test the provider factory and availability check:

- `getLLMProvider("openai")` returns an OpenAIProvider instance (mock the env var)
- `getLLMProvider("anthropic")` returns an AnthropicProvider instance
- `getLLMProvider("google")` returns a GoogleProvider instance
- `getLLMProvider("unknown")` throws an error with a descriptive message
- `getLLMProvider("openai")` throws if `OPENAI_API_KEY` is not set
- `getAvailableProviders()` returns only providers whose API keys are set
- `getAvailableProviders()` returns empty array when no keys are set
- `MODEL_CATALOG` has entries for all three providers

## Files to Create

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest configuration |
| `src/server/test-setup.ts` | Test setup (reflect-metadata import) |
| `src/server/services/__tests__/csv-parser.test.ts` | CSV parsing tests |
| `src/server/services/__tests__/tori-extractor.test.ts` | TORI extraction tests |
| `src/server/services/__tests__/consent.test.ts` | Consent filtering tests |
| `src/server/services/__tests__/dedup.test.ts` | Deduplication tests |
| `src/server/services/analytics/__tests__/tori.test.ts` | TORI analytics tests |
| `src/server/services/analytics/__tests__/text-signals.test.ts` | Text signal tests |
| `src/server/services/analytics/__tests__/engagement.test.ts` | Engagement scoring tests |
| `src/server/services/analytics/__tests__/clustering.test.ts` | Clustering tests |
| `src/server/services/analytics/__tests__/network.test.ts` | Network computation tests |
| `src/server/services/analytics/__tests__/recommendations.test.ts` | Recommendation engine tests |
| `src/server/services/llm/__tests__/provider.test.ts` | LLM provider factory tests |

## Verification

```bash
docker compose exec app pnpm test
```

Expected: All tests pass. No type errors. No real API calls are made.

## When done

Report: files created (with summary per file), verification results (test pass/fail counts), and any issues encountered.
