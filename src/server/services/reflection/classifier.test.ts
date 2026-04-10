/**
 * Unit tests for the reflection classifier.
 *
 * The tests mock the LLM provider so they run offline. A separate
 * integration test (run only when GOOGLE_AI_API_KEY is set) hits the
 * real Gemini API against the golden examples — see
 * `classifier.golden.test.ts` (skipped in CI).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM provider module BEFORE importing the classifier so that
// `getLLMProvider("google")` returns our fake. We use a mutable object
// the tests can re-program per-case.
const mockSendChat = vi.fn();

vi.mock("../llm/provider.js", () => ({
  getLLMProvider: () => ({
    name: "google",
    sendChat: mockSendChat,
  }),
}));

import {
  classifyComment,
  ClassifierError,
  CLASSIFIER_VERSION,
} from "./classifier.js";
import { ReflectionCategory } from "../../entities/CommentReflectionClassification.js";

beforeEach(() => {
  mockSendChat.mockReset();
});

const SAMPLE_COMMENT =
  "I had to redesign the feedback network three times before the output was stable.";

describe("classifyComment — happy paths", () => {
  for (const category of Object.values(ReflectionCategory)) {
    it(`accepts ${category}`, async () => {
      mockSendChat.mockResolvedValueOnce(
        JSON.stringify({
          category,
          evidenceQuote: "redesign the feedback network three times",
          rationale: "Iteration to reach a goal.",
          confidence: 0.85,
        })
      );
      const result = await classifyComment(SAMPLE_COMMENT);
      expect(result.category).toBe(category);
      expect(result.evidenceQuote).toContain("redesign the feedback network");
      expect(result.confidence).toBeCloseTo(0.85, 5);
      expect(mockSendChat).toHaveBeenCalledTimes(1);
    });
  }
});

describe("classifyComment — output cleanup", () => {
  it("strips ```json fences", async () => {
    mockSendChat.mockResolvedValueOnce(
      '```json\n{"category":"DESCRIPTIVE_WRITING","evidenceQuote":null,"rationale":"r","confidence":0.5}\n```'
    );
    const result = await classifyComment(SAMPLE_COMMENT);
    expect(result.category).toBe(ReflectionCategory.DESCRIPTIVE_WRITING);
  });

  it("tolerates prose around the JSON", async () => {
    mockSendChat.mockResolvedValueOnce(
      'Sure! Here is the answer: {"category":"DIALOGIC_REFLECTION","evidenceQuote":null,"rationale":"r","confidence":0.6} hope that helps'
    );
    const result = await classifyComment(SAMPLE_COMMENT);
    expect(result.category).toBe(ReflectionCategory.DIALOGIC_REFLECTION);
  });

  it("clamps confidence to [0,1]", async () => {
    mockSendChat.mockResolvedValueOnce(
      JSON.stringify({
        category: "CRITICAL_REFLECTION",
        evidenceQuote: null,
        rationale: "r",
        confidence: 1.7,
      })
    );
    const result = await classifyComment(SAMPLE_COMMENT);
    expect(result.confidence).toBe(1);
  });

  it("truncates an oversized evidence quote to 200 chars", async () => {
    const longQuote = "x".repeat(500);
    const longComment = "before " + longQuote + " after";
    mockSendChat.mockResolvedValueOnce(
      JSON.stringify({
        category: "DESCRIPTIVE_WRITING",
        evidenceQuote: longQuote,
        rationale: "r",
        confidence: 0.5,
      })
    );
    const result = await classifyComment(longComment);
    expect(result.evidenceQuote).not.toBeNull();
    expect(result.evidenceQuote!.length).toBe(200);
  });
});

describe("classifyComment — anti-hallucination", () => {
  it("drops an evidence quote that does not appear in the comment", async () => {
    mockSendChat.mockResolvedValueOnce(
      JSON.stringify({
        category: "CRITICAL_REFLECTION",
        evidenceQuote: "this phrase is not in the comment at all",
        rationale: "r",
        confidence: 0.7,
      })
    );
    const result = await classifyComment(SAMPLE_COMMENT);
    // Label is kept; the bogus quote is dropped silently.
    expect(result.category).toBe(ReflectionCategory.CRITICAL_REFLECTION);
    expect(result.evidenceQuote).toBeNull();
  });

  it("accepts a quote that differs only by case / whitespace", async () => {
    mockSendChat.mockResolvedValueOnce(
      JSON.stringify({
        category: "DESCRIPTIVE_REFLECTION",
        evidenceQuote: "REDESIGN  the  FEEDBACK  network",
        rationale: "r",
        confidence: 0.7,
      })
    );
    const result = await classifyComment(SAMPLE_COMMENT);
    expect(result.evidenceQuote).toBe("REDESIGN  the  FEEDBACK  network");
  });
});

describe("classifyComment — retry on malformed output", () => {
  it("retries once when the first response is not JSON", async () => {
    mockSendChat
      .mockResolvedValueOnce("definitely not JSON")
      .mockResolvedValueOnce(
        JSON.stringify({
          category: "DESCRIPTIVE_WRITING",
          evidenceQuote: null,
          rationale: "r",
          confidence: 0.5,
        })
      );
    const result = await classifyComment(SAMPLE_COMMENT);
    expect(result.category).toBe(ReflectionCategory.DESCRIPTIVE_WRITING);
    expect(mockSendChat).toHaveBeenCalledTimes(2);
  });

  it("throws ClassifierError when both attempts fail", async () => {
    mockSendChat
      .mockResolvedValueOnce("nope")
      .mockResolvedValueOnce("still nope");
    await expect(classifyComment(SAMPLE_COMMENT)).rejects.toBeInstanceOf(
      ClassifierError
    );
    expect(mockSendChat).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown category value", async () => {
    mockSendChat.mockResolvedValueOnce(
      JSON.stringify({
        category: "GALAXY_BRAIN",
        evidenceQuote: null,
        rationale: "r",
        confidence: 0.9,
      })
    );
    // First parse fails → retry → still bogus → throws.
    mockSendChat.mockResolvedValueOnce(
      JSON.stringify({
        category: "ALSO_BOGUS",
        evidenceQuote: null,
        rationale: "r",
        confidence: 0.9,
      })
    );
    await expect(classifyComment(SAMPLE_COMMENT)).rejects.toBeInstanceOf(
      ClassifierError
    );
  });
});

describe("classifyComment — input guards", () => {
  it("throws on empty text without calling the model", async () => {
    await expect(classifyComment("")).rejects.toBeInstanceOf(ClassifierError);
    await expect(classifyComment("   ")).rejects.toBeInstanceOf(ClassifierError);
    expect(mockSendChat).not.toHaveBeenCalled();
  });
});

describe("CLASSIFIER_VERSION", () => {
  it("is a stable string we can persist with each row", () => {
    expect(CLASSIFIER_VERSION).toMatch(/^google\/gemini-/);
  });
});
