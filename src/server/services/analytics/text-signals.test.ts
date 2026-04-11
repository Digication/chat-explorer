/**
 * Tests for getTextSignals — text analysis signal computation.
 *
 * resolveScope and withCache are mocked so no database is required.
 * Run with: docker compose exec app pnpm test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks must be declared BEFORE importing the module under test ---

const mockResolveScope = vi.fn();

vi.mock("./scope.js", () => ({
  resolveScope: (...args: unknown[]) => mockResolveScope(...args),
}));

vi.mock("./cache.js", () => ({
  withCache: vi.fn(
    async (_key: string, _scope: unknown, compute: () => Promise<unknown>) => ({
      data: await compute(),
      cached: false,
    })
  ),
}));

import { getTextSignals } from "./text-signals.js";

// --- Helpers ---

function makeComment(
  id: string,
  text: string,
  role = "USER",
  studentId: string | null = "s1"
) {
  return {
    id,
    externalId: id,
    threadId: "t1",
    studentId,
    role,
    text,
    orderIndex: 0,
    timestamp: null,
    totalComments: null,
    grade: null,
  };
}

function makeResolvedScope(
  comments: ReturnType<typeof makeComment>[],
  {
    consentedStudentIds = ["s1"],
    excludedCount = 0,
  }: { consentedStudentIds?: string[]; excludedCount?: number } = {}
) {
  return {
    consentedStudentIds,
    excludedCount,
    comments,
    threads: [],
  };
}

const SCOPE = { institutionId: "inst-1" };

describe("getTextSignals", () => {
  beforeEach(() => {
    mockResolveScope.mockReset();
  });

  it("filters to USER role only", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([
        makeComment("c1", "Hello world.", "USER"),
        makeComment("c2", "Assistant reply.", "ASSISTANT"),
      ])
    );

    const result = await getTextSignals(SCOPE);
    // Only the USER comment should produce a perComment entry
    expect(result.data.perComment).toHaveLength(1);
    expect(result.data.perComment[0].commentId).toBe("c1");
  });

  it("counts question marks correctly", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([
        makeComment("c1", "What happened? Why? I'm not sure."),
      ])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.perComment[0].questionCount).toBe(2);
  });

  it("computes average sentence length", async () => {
    // "Hello world." → 2 words, "Goodbye." → 1 word → avg = (2+1)/2 = 1.5
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([makeComment("c1", "Hello world. Goodbye.")])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.perComment[0].avgSentenceLength).toBeCloseTo(1.5);
  });

  it("computes lexical diversity (type-token ratio)", async () => {
    // "the the the cat" → 2 unique / 4 total = 0.5
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([makeComment("c1", "the the the cat")])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.perComment[0].lexicalDiversity).toBeCloseTo(0.5);
  });

  it("counts hedging phrases (case insensitive)", async () => {
    // "I think" (1), "maybe" (2), "perhaps" (3)
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([
        makeComment("c1", "I think maybe we should. Perhaps not."),
      ])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.perComment[0].hedgingCount).toBe(3);
  });

  it("counts evidence phrases", async () => {
    // "for example" (1), "research shows" (2), "data suggests" (3)
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([
        makeComment(
          "c1",
          "For example, research shows that data suggests improvement."
        ),
      ])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.perComment[0].evidenceCount).toBe(3);
  });

  it("counts logical connectors", async () => {
    // "because" (1), "therefore" (2), "however" (3)
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([
        makeComment(
          "c1",
          "Because of this, therefore we act. However, it failed."
        ),
      ])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.perComment[0].logicalConnectorCount).toBe(3);
  });

  it("counts specificity (numbers + quoted strings)", async () => {
    // 42 (1), 3.5 (2), "excellent results" (3)
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([
        makeComment(
          "c1",
          'There were 42 students and "excellent results" in 3.5 years.'
        ),
      ])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.perComment[0].specificityCount).toBe(3);
  });

  it("handles empty text without errors", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([makeComment("c1", "")])
    );

    const result = await getTextSignals(SCOPE);
    const sig = result.data.perComment[0];
    expect(sig.questionCount).toBe(0);
    expect(sig.avgSentenceLength).toBe(0);
    expect(sig.lexicalDiversity).toBe(0);
    expect(sig.hedgingCount).toBe(0);
    expect(sig.evidenceCount).toBe(0);
    expect(sig.logicalConnectorCount).toBe(0);
    expect(sig.specificityCount).toBe(0);
  });

  it("computes aggregate stats: mean and median", async () => {
    // Two comments: questionCount 0 and 3
    // mean = (0+3)/2 = 1.5, median (even) = (0+3)/2 = 1.5
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([
        makeComment("c1", "", "USER", "s1"),
        makeComment("c2", "Why? How? What?", "USER", "s2"),
      ])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.aggregates.questionCount.mean).toBeCloseTo(1.5);
    expect(result.data.aggregates.questionCount.median).toBeCloseTo(1.5);
  });

  it("computes aggregate stats: stddev", async () => {
    // Two comments with specificityCount values [0, 4]
    // mean = 2, variance = ((0-2)^2 + (4-2)^2)/2 = (4+4)/2 = 4, stddev = 2
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([
        makeComment("c1", "", "USER", "s1"),          // specificityCount = 0
        makeComment("c2", '1 2 3 "quoted text"', "USER", "s2"), // specificityCount = 4
      ])
    );

    const result = await getTextSignals(SCOPE);
    expect(result.data.aggregates.specificityCount.stddev).toBeCloseTo(2);
  });

  it("meta includes scope and consent counts", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolvedScope([makeComment("c1", "hello")], {
        consentedStudentIds: ["s1", "s2"],
        excludedCount: 1,
      })
    );

    const result = await getTextSignals(SCOPE);
    expect(result.meta.scope).toEqual(SCOPE);
    expect(result.meta.consentedStudentCount).toBe(2);
    expect(result.meta.excludedStudentCount).toBe(1);
  });
});
