/**
 * Tests for getInsights() (instructional insights).
 *
 * All external dependencies are mocked. No DB required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("./scope.js", () => ({ resolveScope: vi.fn() }));
vi.mock("./cache.js", () => ({
  withCache: vi.fn(async (_k: unknown, _s: unknown, compute: () => unknown) => ({
    data: await compute(),
    cached: false,
  })),
}));

const mockGetEngagement = vi.fn();
vi.mock("./engagement.js", () => ({
  getEngagement: (...a: unknown[]) => mockGetEngagement(...a),
}));

// Mock AppDataSource.getRepository to dispatch to per-entity mocks
const mockCttQb = {
  select: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  getMany: vi.fn().mockResolvedValue([]),
};

const mockCttRepo = {
  createQueryBuilder: vi.fn(() => mockCttQb),
};

const mockTagRepo = {
  find: vi.fn().mockResolvedValue([]),
};

const mockStudentRepo = {
  find: vi.fn().mockResolvedValue([]),
};

vi.mock("../../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn((entity: { name?: string } | string) => {
      const name = typeof entity === "string" ? entity : entity?.name;
      if (name === "CommentToriTag") return mockCttRepo;
      if (name === "ToriTag") return mockTagRepo;
      if (name === "Student") return mockStudentRepo;
      return { find: vi.fn().mockResolvedValue([]) };
    }),
  },
}));

import { getInsights } from "./instructional-insights.js";
import { resolveScope } from "./scope.js";

// ── Helpers ──────────────────────────────────────────────────────

const INST = "00000000-0000-0000-0000-000000000001";
const SCOPE = { institutionId: INST };

function makeComment(
  id: string,
  studentId: string | null,
  role: "USER" | "ASSISTANT",
  text: string,
  threadId = "t1",
  orderIndex = 0
) {
  return {
    id,
    externalId: id,
    threadId,
    studentId,
    role,
    text,
    orderIndex,
    timestamp: null,
    totalComments: null,
    grade: null,
  };
}

function makeResolvedScope(comments: ReturnType<typeof makeComment>[]) {
  return {
    comments,
    consentedStudentIds: [
      ...new Set(comments.map((c) => c.studentId).filter(Boolean)),
    ] as string[],
    excludedCount: 0,
    threads: [],
  };
}

function wrapData<T>(data: T) {
  return {
    data,
    meta: {
      scope: SCOPE,
      consentedStudentCount: 0,
      excludedStudentCount: 0,
      computedAt: new Date(),
      cached: false,
    },
  };
}

function emptyEngagement() {
  return wrapData({
    perComment: [],
    perStudent: [],
    categoryDistribution: {
      DESCRIPTIVE_WRITING: 0,
      DESCRIPTIVE_REFLECTION: 0,
      DIALOGIC_REFLECTION: 0,
      CRITICAL_REFLECTION: 0,
    },
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe("getInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: empty state
    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope([])
    );
    mockGetEngagement.mockResolvedValue(emptyEngagement());
    mockCttQb.getMany.mockResolvedValue([]);
    mockTagRepo.find.mockResolvedValue([]);
    mockStudentRepo.find.mockResolvedValue([]);
  });

  // ── 1. Empty scope ─────────────────────────────────────────────

  it("empty scope → empty studentProfiles, tagExemplars, promptPatterns", async () => {
    const result = await getInsights(SCOPE);

    expect(result.data.studentProfiles).toEqual([]);
    expect(result.data.tagExemplars).toEqual([]);
    expect(result.data.promptPatterns).toEqual([]);
  });

  // ── 2. Student profile: top 3 tags ────────────────────────────

  it("student profile: returns top 3 tags sorted by count desc", async () => {
    const comment1 = makeComment("c1", "s1", "USER", "hello");
    const comment2 = makeComment("c2", "s1", "USER", "world");
    const comment3 = makeComment("c3", "s1", "USER", "foo");

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope([comment1, comment2, comment3])
    );

    // 5 tags: tag1=3 times, tag2=2 times, tag3=2 times, tag4=1 time, tag5=1 time
    mockCttQb.getMany.mockResolvedValue([
      { commentId: "c1", toriTagId: "tag1" },
      { commentId: "c2", toriTagId: "tag1" },
      { commentId: "c3", toriTagId: "tag1" },
      { commentId: "c1", toriTagId: "tag2" },
      { commentId: "c2", toriTagId: "tag2" },
      { commentId: "c1", toriTagId: "tag3" },
      { commentId: "c2", toriTagId: "tag3" },
      { commentId: "c1", toriTagId: "tag4" },
      { commentId: "c1", toriTagId: "tag5" },
    ]);

    mockTagRepo.find.mockResolvedValue([
      { id: "tag1", name: "Tag One", domain: "d" },
      { id: "tag2", name: "Tag Two", domain: "d" },
      { id: "tag3", name: "Tag Three", domain: "d" },
      { id: "tag4", name: "Tag Four", domain: "d" },
      { id: "tag5", name: "Tag Five", domain: "d" },
    ]);

    mockStudentRepo.find.mockResolvedValue([
      { id: "s1", firstName: "Alice", lastName: "Smith", systemId: "A1" },
    ]);

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DESCRIPTIVE_WRITING",
            categoryDistribution: { DESCRIPTIVE_WRITING: 3, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
            commentCount: 3,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
      })
    );

    const result = await getInsights(SCOPE);

    expect(result.data.studentProfiles).toHaveLength(1);
    const profile = result.data.studentProfiles[0];
    expect(profile.topToriTags).toHaveLength(3);
    // Top tag should be "Tag One" (count=3)
    expect(profile.topToriTags[0]).toBe("Tag One");
  });

  // ── 3. Student profile: modalCategory from engagement ─────────

  it("student profile: modalCategory comes from engagement data", async () => {
    const comment1 = makeComment("c1", "s1", "USER", "hello");

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope([comment1])
    );

    mockStudentRepo.find.mockResolvedValue([
      { id: "s1", firstName: "Bob", lastName: "Jones", systemId: "B1" },
    ]);

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [
          { commentId: "c1", studentId: "s1", category: "DIALOGIC_REFLECTION", evidenceQuote: null, rationale: null },
        ],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DIALOGIC_REFLECTION",
            categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 0 },
            commentCount: 1,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 0 },
      })
    );

    const result = await getInsights(SCOPE);

    expect(result.data.studentProfiles[0].modalCategory).toBe("DIALOGIC_REFLECTION");
  });

  // ── 4. Student profile: avgWordCount ──────────────────────────

  it("student profile: avgWordCount calculated correctly", async () => {
    // 10 words and 20 words → avg = 15
    const tenWords = "one two three four five six seven eight nine ten";
    const twentyWords = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty";

    const c1 = makeComment("c1", "s1", "USER", tenWords);
    const c2 = makeComment("c2", "s1", "USER", twentyWords);

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope([c1, c2])
    );

    mockStudentRepo.find.mockResolvedValue([
      { id: "s1", firstName: "Carol", lastName: "King", systemId: "C1" },
    ]);

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DESCRIPTIVE_WRITING",
            categoryDistribution: { DESCRIPTIVE_WRITING: 2, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
            commentCount: 2,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
      })
    );

    const result = await getInsights(SCOPE);

    expect(result.data.studentProfiles[0].avgWordCount).toBe(15);
  });

  // ── 5. Tag exemplars: sorted by reflection depth ──────────────

  it("tag exemplars: sorted by reflection depth descending (CRITICAL first)", async () => {
    // 4 comments tagged with "tag1", each at a different depth
    const c1 = makeComment("c1", "s1", "USER", "descriptive writing text");
    const c2 = makeComment("c2", "s1", "USER", "descriptive reflection text");
    const c3 = makeComment("c3", "s1", "USER", "dialogic reflection text");
    const c4 = makeComment("c4", "s1", "USER", "critical reflection text");

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope([c1, c2, c3, c4])
    );

    mockCttQb.getMany.mockResolvedValue([
      { commentId: "c1", toriTagId: "tag1" },
      { commentId: "c2", toriTagId: "tag1" },
      { commentId: "c3", toriTagId: "tag1" },
      { commentId: "c4", toriTagId: "tag1" },
    ]);

    mockTagRepo.find.mockResolvedValue([
      { id: "tag1", name: "Reflection Tag", domain: "d" },
    ]);

    mockStudentRepo.find.mockResolvedValue([
      { id: "s1", firstName: "Dave", lastName: "Lee", systemId: "D1" },
    ]);

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [
          { commentId: "c1", studentId: "s1", category: "DESCRIPTIVE_WRITING", evidenceQuote: null, rationale: null },
          { commentId: "c2", studentId: "s1", category: "DESCRIPTIVE_REFLECTION", evidenceQuote: null, rationale: null },
          { commentId: "c3", studentId: "s1", category: "DIALOGIC_REFLECTION", evidenceQuote: null, rationale: null },
          { commentId: "c4", studentId: "s1", category: "CRITICAL_REFLECTION", evidenceQuote: null, rationale: null },
        ],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "CRITICAL_REFLECTION",
            categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 1, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 1 },
            commentCount: 4,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 1 },
      })
    );

    const result = await getInsights(SCOPE);

    const exemplar = result.data.tagExemplars.find((e) => e.tagName === "Reflection Tag");
    expect(exemplar).toBeDefined();
    // First exemplar should be CRITICAL (c4), second DIALOGIC (c3), third DESCRIPTIVE_REFLECTION (c2)
    expect(exemplar!.exemplars[0].commentId).toBe("c4");
    expect(exemplar!.exemplars[1].commentId).toBe("c3");
    expect(exemplar!.exemplars[2].commentId).toBe("c2");
  });

  // ── 6. Tag exemplars: capped at 3 ────────────────────────────

  it("tag exemplars: capped at 3 per tag even when more exist", async () => {
    // 5 comments all tagged with tag1
    const comments = Array.from({ length: 5 }, (_, i) =>
      makeComment(`c${i}`, "s1", "USER", `text ${i}`)
    );

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope(comments)
    );

    mockCttQb.getMany.mockResolvedValue(
      comments.map((c) => ({ commentId: c.id, toriTagId: "tag1" }))
    );

    mockTagRepo.find.mockResolvedValue([
      { id: "tag1", name: "Tag One", domain: "d" },
    ]);

    mockStudentRepo.find.mockResolvedValue([
      { id: "s1", firstName: "Eve", lastName: "Brown", systemId: "E1" },
    ]);

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: comments.map((c) => ({
          commentId: c.id,
          studentId: "s1",
          category: "DESCRIPTIVE_WRITING" as const,
          evidenceQuote: null,
          rationale: null,
        })),
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DESCRIPTIVE_WRITING",
            categoryDistribution: { DESCRIPTIVE_WRITING: 5, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
            commentCount: 5,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
      })
    );

    const result = await getInsights(SCOPE);

    const exemplar = result.data.tagExemplars.find((e) => e.tagName === "Tag One");
    expect(exemplar).toBeDefined();
    expect(exemplar!.exemplars).toHaveLength(3);
  });

  // ── 7. Tag exemplars: text excerpt truncated to 200 chars ─────

  it("tag exemplars: text excerpt truncated to 200 chars", async () => {
    const longText = "x".repeat(300);
    const comment = makeComment("c1", "s1", "USER", longText);

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope([comment])
    );

    mockCttQb.getMany.mockResolvedValue([
      { commentId: "c1", toriTagId: "tag1" },
    ]);

    mockTagRepo.find.mockResolvedValue([
      { id: "tag1", name: "Tag One", domain: "d" },
    ]);

    mockStudentRepo.find.mockResolvedValue([
      { id: "s1", firstName: "Frank", lastName: "White", systemId: "F1" },
    ]);

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [
          { commentId: "c1", studentId: "s1", category: "DESCRIPTIVE_WRITING" as const, evidenceQuote: null, rationale: null },
        ],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DESCRIPTIVE_WRITING",
            categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
            commentCount: 1,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
      })
    );

    const result = await getInsights(SCOPE);

    const exemplar = result.data.tagExemplars[0];
    expect(exemplar.exemplars[0].textExcerpt).toHaveLength(200);
  });

  // ── 8. Prompt patterns: only prompts in ≥2 threads ────────────

  it("prompt patterns: only includes prompts appearing in ≥2 threads", async () => {
    const promptA = "What have you learned today?"; // appears in 3 threads
    const promptB = "Describe your experience.";    // appears in 1 thread

    const comments = [
      makeComment("c1", "s1", "USER", "user reply 1", "t1", 1),
      makeComment("a1", null, "ASSISTANT", promptA, "t1", 0),
      makeComment("c2", "s1", "USER", "user reply 2", "t2", 1),
      makeComment("a2", null, "ASSISTANT", promptA, "t2", 0),
      makeComment("c3", "s1", "USER", "user reply 3", "t3", 1),
      makeComment("a3", null, "ASSISTANT", promptA, "t3", 0),
      makeComment("c4", "s1", "USER", "user reply 4", "t4", 1),
      makeComment("a4", null, "ASSISTANT", promptB, "t4", 0),
    ];

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope(comments)
    );

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DESCRIPTIVE_WRITING",
            categoryDistribution: { DESCRIPTIVE_WRITING: 4, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
            commentCount: 4,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
      })
    );

    mockStudentRepo.find.mockResolvedValue([
      { id: "s1", firstName: "Grace", lastName: "Hall", systemId: "G1" },
    ]);

    const result = await getInsights(SCOPE);

    expect(result.data.promptPatterns).toHaveLength(1);
    expect(result.data.promptPatterns[0].promptExcerpt).toBe(promptA);
    expect(result.data.promptPatterns[0].threadCount).toBe(3);
  });

  // ── 9. Prompt patterns: sorted by threadCount descending ──────

  it("prompt patterns: sorted by threadCount descending", async () => {
    const promptA = "Prompt A — appears 5 times";
    const promptB = "Prompt B — appears 3 times";

    const buildThread = (threadId: string, prompt: string, startIdx: number) => [
      makeComment(`u-${threadId}`, "s1", "USER", "reply", threadId, 1),
      makeComment(`a-${threadId}`, null, "ASSISTANT", prompt, threadId, 0),
    ];

    const comments = [
      ...buildThread("t1", promptA, 0),
      ...buildThread("t2", promptA, 2),
      ...buildThread("t3", promptA, 4),
      ...buildThread("t4", promptA, 6),
      ...buildThread("t5", promptA, 8),
      ...buildThread("t6", promptB, 10),
      ...buildThread("t7", promptB, 12),
      ...buildThread("t8", promptB, 14),
    ];

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope(comments)
    );

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DESCRIPTIVE_WRITING",
            categoryDistribution: { DESCRIPTIVE_WRITING: 8, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
            commentCount: 8,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
      })
    );

    mockStudentRepo.find.mockResolvedValue([
      { id: "s1", firstName: "Henry", lastName: "Fox", systemId: "H1" },
    ]);

    const result = await getInsights(SCOPE);

    expect(result.data.promptPatterns.length).toBeGreaterThanOrEqual(2);
    expect(result.data.promptPatterns[0].threadCount).toBeGreaterThanOrEqual(
      result.data.promptPatterns[1].threadCount
    );
    expect(result.data.promptPatterns[0].promptExcerpt).toBe(promptA);
  });

  // ── 10. Category distribution: percentages ────────────────────

  it("category distribution: computes percentages correctly", async () => {
    // 10 students: 4 DW, 3 DLG, 2 CR, 1 DR
    const studentIds = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const modalCategories = [
      "DESCRIPTIVE_WRITING",
      "DESCRIPTIVE_WRITING",
      "DESCRIPTIVE_WRITING",
      "DESCRIPTIVE_WRITING",
      "DIALOGIC_REFLECTION",
      "DIALOGIC_REFLECTION",
      "DIALOGIC_REFLECTION",
      "CRITICAL_REFLECTION",
      "CRITICAL_REFLECTION",
      "DESCRIPTIVE_REFLECTION",
    ] as const;

    // Give each student a comment
    const comments = studentIds.map((sId, i) =>
      makeComment(`c${i}`, sId, "USER", "text", "t1", i)
    );

    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResolvedScope(comments)
    );

    mockStudentRepo.find.mockResolvedValue(
      studentIds.map((id, i) => ({
        id,
        firstName: `F${i}`,
        lastName: `L${i}`,
        systemId: `SYS${i}`,
      }))
    );

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent: studentIds.map((id, i) => ({
          studentId: id,
          modalCategory: modalCategories[i],
          categoryDistribution: {
            DESCRIPTIVE_WRITING: modalCategories[i] === "DESCRIPTIVE_WRITING" ? 1 : 0,
            DESCRIPTIVE_REFLECTION: modalCategories[i] === "DESCRIPTIVE_REFLECTION" ? 1 : 0,
            DIALOGIC_REFLECTION: modalCategories[i] === "DIALOGIC_REFLECTION" ? 1 : 0,
            CRITICAL_REFLECTION: modalCategories[i] === "CRITICAL_REFLECTION" ? 1 : 0,
          },
          commentCount: 1,
        })),
        categoryDistribution: {
          DESCRIPTIVE_WRITING: 4,
          DESCRIPTIVE_REFLECTION: 1,
          DIALOGIC_REFLECTION: 3,
          CRITICAL_REFLECTION: 2,
        },
      })
    );

    const result = await getInsights(SCOPE);

    const dist = result.data.categoryDistribution;
    expect(dist.DESCRIPTIVE_WRITING.count).toBe(4);
    expect(dist.DESCRIPTIVE_WRITING.percent).toBe(40);
    expect(dist.DIALOGIC_REFLECTION.count).toBe(3);
    expect(dist.DIALOGIC_REFLECTION.percent).toBe(30);
    expect(dist.CRITICAL_REFLECTION.count).toBe(2);
    expect(dist.CRITICAL_REFLECTION.percent).toBe(20);
    expect(dist.DESCRIPTIVE_REFLECTION.count).toBe(1);
    expect(dist.DESCRIPTIVE_REFLECTION.percent).toBe(10);
  });
});
