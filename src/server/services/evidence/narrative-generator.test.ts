/**
 * Unit tests for the narrative evidence generator.
 *
 * The LLM provider is mocked so tests run offline. Same pattern as
 * the reflection classifier tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM provider before importing the generator
const mockSendChat = vi.fn();

vi.mock("../llm/provider.js", () => ({
  getLLMProvider: () => ({
    name: "google",
    sendChat: mockSendChat,
  }),
}));

import {
  generateNarrativeBatch,
  NarrativeError,
  MAX_BATCH_SIZE,
  type NarrativeInput,
  type NarrativeOutput,
} from "./narrative-generator.js";
import { StrengthLevel } from "../../entities/EvidenceOutcomeLink.js";

beforeEach(() => {
  mockSendChat.mockReset();
});

// ── Helpers ────────────────────────────────────────────────────────

function makeInput(
  overrides?: Partial<NarrativeInput>
): NarrativeInput {
  return {
    comments: [
      {
        commentId: "c1",
        studentId: "s1",
        text: "I learned to debug by stepping through the code line by line.",
        threadName: "Week 3 Reflection",
        assignmentDescription: "Reflect on your debugging process",
        toriTags: ["Problem-Solving", "Adaptive Learning"],
        reflectionCategory: "DIALOGIC_REFLECTION",
      },
    ],
    outcomes: [
      {
        id: "out-1",
        code: "TORI-1-1",
        name: "Problem-Solving",
        description: "Ability to solve problems systematically",
      },
      {
        id: "out-2",
        code: "TORI-2-1",
        name: "Adaptive Learning",
        description: null,
      },
    ],
    ...overrides,
  };
}

function makeLlmResponse(items: Array<{
  commentId: string;
  narrative: string;
  outcomeAlignments?: Array<{
    outcomeCode: string;
    strengthLevel: string;
    rationale: string;
  }>;
}>): string {
  return JSON.stringify(items);
}

// ── Happy paths ────────────────────────────────────────────────────

describe("generateNarrativeBatch — happy paths", () => {
  it("parses a valid single-comment response", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "The student demonstrates a methodical approach to debugging.",
          outcomeAlignments: [
            {
              outcomeCode: "TORI-1-1",
              strengthLevel: "DEVELOPING",
              rationale: "Shows systematic approach to problem-solving.",
            },
          ],
        },
      ])
    );

    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(1);
    expect(results[0].commentId).toBe("c1");
    expect(results[0].narrative).toContain("methodical approach");
    expect(results[0].outcomeAlignments).toHaveLength(1);
    expect(results[0].outcomeAlignments[0].outcomeDefinitionId).toBe("out-1");
    expect(results[0].outcomeAlignments[0].strengthLevel).toBe(
      StrengthLevel.DEVELOPING
    );
    expect(mockSendChat).toHaveBeenCalledTimes(1);
  });

  it("handles multiple comments in a batch", async () => {
    const input = makeInput({
      comments: [
        {
          commentId: "c1",
          studentId: "s1",
          text: "Comment one",
          threadName: "T1",
          assignmentDescription: null,
          toriTags: [],
          reflectionCategory: null,
        },
        {
          commentId: "c2",
          studentId: "s2",
          text: "Comment two",
          threadName: "T2",
          assignmentDescription: null,
          toriTags: [],
          reflectionCategory: null,
        },
      ],
    });
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "First narrative.",
          outcomeAlignments: [],
        },
        {
          commentId: "c2",
          narrative: "Second narrative.",
          outcomeAlignments: [
            {
              outcomeCode: "TORI-2-1",
              strengthLevel: "EMERGING",
              rationale: "Early awareness.",
            },
          ],
        },
      ])
    );

    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(2);
    expect(results[0].commentId).toBe("c1");
    expect(results[0].outcomeAlignments).toHaveLength(0);
    expect(results[1].commentId).toBe("c2");
    expect(results[1].outcomeAlignments[0].outcomeDefinitionId).toBe("out-2");
  });

  it("returns empty array for empty comment list", async () => {
    const results = await generateNarrativeBatch({
      comments: [],
      outcomes: [{ id: "o1", code: "X", name: "X", description: null }],
    });
    expect(results).toEqual([]);
    expect(mockSendChat).not.toHaveBeenCalled();
  });

  it("accepts all strength levels", async () => {
    for (const level of Object.values(StrengthLevel)) {
      mockSendChat.mockResolvedValueOnce(
        makeLlmResponse([
          {
            commentId: "c1",
            narrative: `Narrative for ${level}.`,
            outcomeAlignments: [
              {
                outcomeCode: "TORI-1-1",
                strengthLevel: level,
                rationale: "Test.",
              },
            ],
          },
        ])
      );
      const input = makeInput();
      const results = await generateNarrativeBatch(input);
      expect(results[0].outcomeAlignments[0].strengthLevel).toBe(level);
    }
  });
});

// ── JSON extraction edge cases ─────────────────────────────────────

describe("generateNarrativeBatch — JSON extraction", () => {
  it("strips ```json fences", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      '```json\n[{"commentId":"c1","narrative":"Fenced narrative.","outcomeAlignments":[]}]\n```'
    );
    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(1);
    expect(results[0].narrative).toBe("Fenced narrative.");
  });

  it("tolerates prose around JSON array", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      'Here is the analysis:\n[{"commentId":"c1","narrative":"Surrounded by prose.","outcomeAlignments":[]}]\nHope that helps!'
    );
    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(1);
    expect(results[0].narrative).toBe("Surrounded by prose.");
  });

  it("strips bare ``` fences (no json tag)", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      '```\n[{"commentId":"c1","narrative":"Bare fence.","outcomeAlignments":[]}]\n```'
    );
    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(1);
  });
});

// ── Validation / graceful degradation ──────────────────────────────

describe("generateNarrativeBatch — validation", () => {
  it("drops entries with unknown comment IDs", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "Valid entry.",
          outcomeAlignments: [],
        },
        {
          commentId: "HALLUCINATED",
          narrative: "Should be dropped.",
          outcomeAlignments: [],
        },
      ])
    );
    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(1);
    expect(results[0].commentId).toBe("c1");
  });

  it("drops entries with empty narrative", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        { commentId: "c1", narrative: "", outcomeAlignments: [] },
      ])
    );
    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(0);
  });

  it("truncates narrative over 500 chars", async () => {
    const input = makeInput();
    const longNarrative = "A".repeat(600);
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: longNarrative,
          outcomeAlignments: [],
        },
      ])
    );
    const results = await generateNarrativeBatch(input);
    expect(results[0].narrative).toHaveLength(500);
  });

  it("drops alignments with unknown outcome codes", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "Valid narrative.",
          outcomeAlignments: [
            {
              outcomeCode: "UNKNOWN-CODE",
              strengthLevel: "EMERGING",
              rationale: "Bad code.",
            },
            {
              outcomeCode: "TORI-1-1",
              strengthLevel: "DEVELOPING",
              rationale: "Good code.",
            },
          ],
        },
      ])
    );
    const results = await generateNarrativeBatch(input);
    expect(results[0].outcomeAlignments).toHaveLength(1);
    expect(results[0].outcomeAlignments[0].outcomeDefinitionId).toBe("out-1");
  });

  it("drops alignments with invalid strength levels", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "Valid narrative.",
          outcomeAlignments: [
            {
              outcomeCode: "TORI-1-1",
              strengthLevel: "SUPER_STRONG",
              rationale: "Invalid level.",
            },
          ],
        },
      ])
    );
    const results = await generateNarrativeBatch(input);
    expect(results[0].outcomeAlignments).toHaveLength(0);
  });

  it("keeps narrative even if all alignments are invalid", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "Narrative without alignments is still useful.",
          outcomeAlignments: [
            {
              outcomeCode: "FAKE",
              strengthLevel: "EMERGING",
              rationale: "Dropped.",
            },
          ],
        },
      ])
    );
    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(1);
    expect(results[0].narrative).toContain("still useful");
    expect(results[0].outcomeAlignments).toHaveLength(0);
  });

  it("truncates rationale over 500 chars", async () => {
    const input = makeInput();
    const longRationale = "R".repeat(600);
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "Valid.",
          outcomeAlignments: [
            {
              outcomeCode: "TORI-1-1",
              strengthLevel: "DEVELOPING",
              rationale: longRationale,
            },
          ],
        },
      ])
    );
    const results = await generateNarrativeBatch(input);
    expect(results[0].outcomeAlignments[0].rationale).toHaveLength(500);
  });
});

// ── Error handling ─────────────────────────────────────────────────

describe("generateNarrativeBatch — error handling", () => {
  it("throws NarrativeError if batch exceeds MAX_BATCH_SIZE", async () => {
    const comments = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => ({
      commentId: `c${i}`,
      studentId: "s1",
      text: "Text",
      threadName: "T",
      assignmentDescription: null,
      toriTags: [],
      reflectionCategory: null,
    }));
    await expect(
      generateNarrativeBatch({
        comments,
        outcomes: [{ id: "o1", code: "X", name: "X", description: null }],
      })
    ).rejects.toThrow(NarrativeError);
  });

  it("throws NarrativeError if outcomes are empty", async () => {
    await expect(
      generateNarrativeBatch({
        comments: [
          {
            commentId: "c1",
            studentId: "s1",
            text: "Text",
            threadName: "T",
            assignmentDescription: null,
            toriTags: [],
            reflectionCategory: null,
          },
        ],
        outcomes: [],
      })
    ).rejects.toThrow(NarrativeError);
  });

  it("throws NarrativeError if LLM call fails", async () => {
    mockSendChat.mockRejectedValueOnce(new Error("API rate limit"));
    await expect(generateNarrativeBatch(makeInput())).rejects.toThrow(
      "LLM call failed"
    );
  });

  it("retries once on malformed JSON, then succeeds", async () => {
    const input = makeInput();
    // First attempt: invalid JSON
    mockSendChat.mockResolvedValueOnce("This is not JSON at all");
    // Retry: valid JSON
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "Retry succeeded.",
          outcomeAlignments: [],
        },
      ])
    );

    const results = await generateNarrativeBatch(input);
    expect(results).toHaveLength(1);
    expect(results[0].narrative).toBe("Retry succeeded.");
    // 2 calls: original + retry
    expect(mockSendChat).toHaveBeenCalledTimes(2);
  });

  it("throws after retry also fails", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce("Not JSON");
    mockSendChat.mockResolvedValueOnce("Still not JSON");

    await expect(generateNarrativeBatch(input)).rejects.toThrow(NarrativeError);
    expect(mockSendChat).toHaveBeenCalledTimes(2);
  });

  it("retry uses temperature 0.0 and includes strictness reminder", async () => {
    const input = makeInput();
    mockSendChat.mockResolvedValueOnce("Bad output");
    mockSendChat.mockResolvedValueOnce(
      makeLlmResponse([
        {
          commentId: "c1",
          narrative: "Retry worked.",
          outcomeAlignments: [],
        },
      ])
    );

    await generateNarrativeBatch(input);
    // Check retry call options
    const retryCall = mockSendChat.mock.calls[1];
    const retryMessages = retryCall[0];
    const retryOptions = retryCall[1];
    // Should have 3 messages: original user, assistant (bad output), user (reminder)
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[2].content).toContain("not valid JSON");
    expect(retryOptions.temperature).toBe(0.0);
  });
});
