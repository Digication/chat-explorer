import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock data-source ──────────────────────────────────────────────
// The repo.find mock returns 3 TORI tags — these are used across all extractToriTags tests.
const mockFind = vi.fn().mockResolvedValue([
  { id: "t1", name: "Perspective Shifting", domain: "Cognitive-Analytical" },
  { id: "t2", name: "Emotional Differentiation", domain: "Emotional-Affective" },
  { id: "t3", name: "Pattern Recognition", domain: "Cognitive-Analytical" },
]);

vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({
      find: mockFind,
      findOne: vi.fn(),
      findOneBy: vi.fn(),
    })),
  },
}));

import {
  isDoneMessage,
  extractToriTags,
  extractToriForThread,
  resetToriCache,
} from "./tori-extractor.js";

beforeEach(() => {
  vi.clearAllMocks();
  resetToriCache(); // Must clear BEFORE mock find is invoked
  // Restore the find mock after clearAllMocks
  mockFind.mockResolvedValue([
    { id: "t1", name: "Perspective Shifting", domain: "Cognitive-Analytical" },
    { id: "t2", name: "Emotional Differentiation", domain: "Emotional-Affective" },
    { id: "t3", name: "Pattern Recognition", domain: "Cognitive-Analytical" },
  ]);
});

// ── isDoneMessage ─────────────────────────────────────────────────

describe("isDoneMessage", () => {
  it('"I\'m done" → true', () => {
    expect(isDoneMessage("I'm done")).toBe(true);
  });

  it('"im done" (no apostrophe) → true', () => {
    expect(isDoneMessage("im done")).toBe(true);
  });

  it('"That\'s all" → true', () => {
    expect(isDoneMessage("That's all")).toBe(true);
  });

  it('"Nothing else" → true', () => {
    expect(isDoneMessage("Nothing else")).toBe(true);
  });

  it('"Done for now" → true', () => {
    expect(isDoneMessage("Done for now")).toBe(true);
  });

  it('"Thank you, that\'s it" → true', () => {
    expect(isDoneMessage("Thank you, that's it")).toBe(true);
  });

  it("unrelated text → false", () => {
    expect(
      isDoneMessage(
        "Let me explain more about this topic and continue reflecting."
      )
    ).toBe(false);
  });
});

// ── extractToriTags ───────────────────────────────────────────────

describe("extractToriTags", () => {
  it("explicit format: (TORI: Perspective Shifting) → extracts tag t1", async () => {
    const result = await extractToriTags("(TORI: Perspective Shifting)");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ toriTagId: "t1", toriTagName: "Perspective Shifting" });
  });

  it("explicit format with multiple comma-separated: extracts 2 tags", async () => {
    const result = await extractToriTags(
      "(TORI: Perspective Shifting, Pattern Recognition)"
    );
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.toriTagId);
    expect(ids).toContain("t1");
    expect(ids).toContain("t3");
  });

  it("natural language mention extracts matching tag", async () => {
    const result = await extractToriTags(
      "This student shows strong perspective shifting in the response."
    );
    expect(result.some((r) => r.toriTagId === "t1")).toBe(true);
  });

  it("case insensitive: (TORI: PERSPECTIVE SHIFTING) → extracts tag", async () => {
    const result = await extractToriTags("(TORI: PERSPECTIVE SHIFTING)");
    expect(result.some((r) => r.toriTagId === "t1")).toBe(true);
  });

  it("no matches → empty array", async () => {
    const result = await extractToriTags(
      "This response does not mention any relevant framework categories."
    );
    expect(result).toEqual([]);
  });
});

// ── extractToriForThread ──────────────────────────────────────────

describe("extractToriForThread", () => {
  it("associates AI response tags with preceding student comment", async () => {
    const comments = [
      { id: "user-comment-1", externalId: "ext-u1", role: "USER", text: "Tell me about my reflection.", orderIndex: 0 },
      { id: "ai-comment-1", externalId: "ext-a1", role: "ASSISTANT", text: "(TORI: Perspective Shifting)", orderIndex: 1 },
    ];

    const associations = await extractToriForThread(comments);

    expect(associations).toHaveLength(1);
    expect(associations[0]).toMatchObject({
      studentCommentId: "user-comment-1",
      toriTagId: "t1",
      sourceCommentId: "ext-a1",
    });
  });

  it("skips non-ASSISTANT comments — no associations for USER-only thread", async () => {
    const comments = [
      { id: "u1", externalId: "ext-u1", role: "USER", text: "Hello.", orderIndex: 0 },
      { id: "u2", externalId: "ext-u2", role: "USER", text: "Another student comment.", orderIndex: 1 },
    ];

    const associations = await extractToriForThread(comments);
    expect(associations).toHaveLength(0);
  });

  it("skips extraction when student sent a done message", async () => {
    const comments = [
      { id: "u1", externalId: "ext-u1", role: "USER", text: "I'm done", orderIndex: 0 },
      { id: "a1", externalId: "ext-a1", role: "ASSISTANT", text: "(TORI: Perspective Shifting)", orderIndex: 1 },
    ];

    const associations = await extractToriForThread(comments);
    expect(associations).toHaveLength(0);
  });
});
