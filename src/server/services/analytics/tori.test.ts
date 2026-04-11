/**
 * Unit tests for getToriAnalysis().
 *
 * All external dependencies (DB, scope, cache) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getToriAnalysis } from "./tori.js";
import type { AnalyticsScope } from "./types.js";

// ── Mocks ─────────────────────────────────────────────────────────────

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

const mockGetRepository = vi.fn();
vi.mock("../../data-source.js", () => ({
  AppDataSource: {
    getRepository: (...args: unknown[]) => mockGetRepository(...args),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeResolved(
  comments: Array<{
    id: string;
    studentId: string | null;
    role: string;
    text: string;
  }>,
  extra?: { consentedStudentIds?: string[]; excludedCount?: number }
) {
  const studentIds = [
    ...new Set(
      comments.filter((c) => c.studentId).map((c) => c.studentId!)
    ),
  ];
  return {
    comments: comments.map((c, i) => ({
      ...c,
      externalId: c.id,
      threadId: "t1",
      orderIndex: i,
      timestamp: null,
      totalComments: null,
      grade: null,
    })),
    consentedStudentIds: extra?.consentedStudentIds ?? studentIds,
    excludedCount: extra?.excludedCount ?? 0,
    threads: [],
  };
}

/** Builds a mock tag association (CommentToriTag row). */
function makeAssoc(commentId: string, toriTagId: string) {
  return { commentId, toriTagId };
}

/** Builds a mock ToriTag row. */
function makeTag(id: string, name: string, domain = "test-domain") {
  return { id, name, domain };
}

/**
 * Sets up both repositories:
 *   1st call → CommentToriTag repo (createQueryBuilder chain)
 *   2nd call → ToriTag repo (find)
 */
function mockRepos(
  associations: Array<{ commentId: string; toriTagId: string }>,
  tags: Array<{ id: string; name: string; domain: string }>
) {
  const getManyMock = vi.fn().mockResolvedValue(associations);
  const whereMock = vi.fn().mockReturnValue({ getMany: getManyMock });
  const innerJoinAndSelectMock = vi.fn().mockReturnValue({ where: whereMock });
  const cttCreateQbMock = vi.fn().mockReturnValue({
    innerJoinAndSelect: innerJoinAndSelectMock,
  });

  const findMock = vi.fn().mockResolvedValue(tags);

  // First getRepository call → CommentToriTag repo
  // Second getRepository call → ToriTag repo
  mockGetRepository
    .mockReturnValueOnce({ createQueryBuilder: cttCreateQbMock })
    .mockReturnValueOnce({ find: findMock });
}

const scope: AnalyticsScope = { institutionId: "inst-1" };

// ── Tests ──────────────────────────────────────────────────────────────

describe("getToriAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("empty comments → empty everything", async () => {
    mockResolveScope.mockResolvedValue(makeResolved([]));

    const result = await getToriAnalysis(scope);

    expect(result.data.tagFrequencies).toEqual([]);
    expect(result.data.tagCoverage).toEqual([]);
    expect(result.data.coOccurrencePairs).toEqual([]);
    expect(result.data.coOccurrenceTriples).toEqual([]);
    expect(result.data.coOccurrenceQuadruples).toEqual([]);
  });

  it("single tag on one comment → frequency 100%", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      [makeAssoc("c1", "tag-a")],
      [makeTag("tag-a", "TagA")]
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.tagFrequencies).toHaveLength(1);
    expect(result.data.tagFrequencies[0].tagId).toBe("tag-a");
    expect(result.data.tagFrequencies[0].percent).toBe(100);
  });

  it("two tags → correct frequency percentages", async () => {
    // tag-a appears 3 times, tag-b appears 1 time → 75% and 25%
    mockResolveScope.mockResolvedValue(
      makeResolved([
        { id: "c1", studentId: "s1", role: "USER", text: "A" },
        { id: "c2", studentId: "s1", role: "USER", text: "B" },
        { id: "c3", studentId: "s1", role: "USER", text: "C" },
        { id: "c4", studentId: "s1", role: "USER", text: "D" },
      ])
    );
    mockRepos(
      [
        makeAssoc("c1", "tag-a"),
        makeAssoc("c2", "tag-a"),
        makeAssoc("c3", "tag-a"),
        makeAssoc("c4", "tag-b"),
      ],
      [makeTag("tag-a", "TagA"), makeTag("tag-b", "TagB")]
    );

    const result = await getToriAnalysis(scope);

    const freqA = result.data.tagFrequencies.find((f) => f.tagId === "tag-a")!;
    const freqB = result.data.tagFrequencies.find((f) => f.tagId === "tag-b")!;
    expect(freqA.percent).toBeCloseTo(75);
    expect(freqB.percent).toBeCloseTo(25);
  });

  it("tag frequencies sorted descending by count", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolved([
        { id: "c1", studentId: "s1", role: "USER", text: "A" },
        { id: "c2", studentId: "s1", role: "USER", text: "B" },
        { id: "c3", studentId: "s1", role: "USER", text: "C" },
        { id: "c4", studentId: "s1", role: "USER", text: "D" },
      ])
    );
    // tag-b has count=3, tag-a has count=1 → output order [B, A]
    mockRepos(
      [
        makeAssoc("c1", "tag-b"),
        makeAssoc("c2", "tag-b"),
        makeAssoc("c3", "tag-b"),
        makeAssoc("c4", "tag-a"),
      ],
      [makeTag("tag-a", "TagA"), makeTag("tag-b", "TagB")]
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.tagFrequencies[0].tagId).toBe("tag-b");
    expect(result.data.tagFrequencies[1].tagId).toBe("tag-a");
  });

  it("tag coverage: student deduplication", async () => {
    // Student s1 has tag-a on two different comments — should count as 1 student
    mockResolveScope.mockResolvedValue(
      makeResolved(
        [
          { id: "c1", studentId: "s1", role: "USER", text: "A" },
          { id: "c2", studentId: "s1", role: "USER", text: "B" },
        ],
        { consentedStudentIds: ["s1"], excludedCount: 0 }
      )
    );
    mockRepos(
      [makeAssoc("c1", "tag-a"), makeAssoc("c2", "tag-a")],
      [makeTag("tag-a", "TagA")]
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.tagCoverage).toHaveLength(1);
    expect(result.data.tagCoverage[0].studentCount).toBe(1);
  });

  it("co-occurrence pairs: 2 tags on 1 comment → 1 pair", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      [makeAssoc("c1", "tag-a"), makeAssoc("c1", "tag-b")],
      [makeTag("tag-a", "TagA"), makeTag("tag-b", "TagB")]
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.coOccurrencePairs).toHaveLength(1);
    expect(result.data.coOccurrencePairs[0].count).toBe(1);
    expect(result.data.coOccurrencePairs[0].tags).toEqual(
      expect.arrayContaining(["TagA", "TagB"])
    );
  });

  it("co-occurrence pairs: same 2 tags on 2 comments → count=2", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolved([
        { id: "c1", studentId: "s1", role: "USER", text: "A" },
        { id: "c2", studentId: "s1", role: "USER", text: "B" },
      ])
    );
    mockRepos(
      [
        makeAssoc("c1", "tag-a"),
        makeAssoc("c1", "tag-b"),
        makeAssoc("c2", "tag-a"),
        makeAssoc("c2", "tag-b"),
      ],
      [makeTag("tag-a", "TagA"), makeTag("tag-b", "TagB")]
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.coOccurrencePairs).toHaveLength(1);
    expect(result.data.coOccurrencePairs[0].count).toBe(2);
  });

  it("co-occurrence deduplication: duplicate tag IDs on same comment → treated as single", async () => {
    // comment c1 has tag-a twice + tag-b → deduplicated to [tag-a, tag-b] → 1 pair
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      [
        makeAssoc("c1", "tag-a"),
        makeAssoc("c1", "tag-a"), // duplicate
        makeAssoc("c1", "tag-b"),
      ],
      [makeTag("tag-a", "TagA"), makeTag("tag-b", "TagB")]
    );

    const result = await getToriAnalysis(scope);

    // After dedup: unique = [tag-a, tag-b] → exactly 1 pair
    expect(result.data.coOccurrencePairs).toHaveLength(1);
  });

  it("co-occurrence triples: 3 tags → 1 triple", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      [
        makeAssoc("c1", "tag-a"),
        makeAssoc("c1", "tag-b"),
        makeAssoc("c1", "tag-c"),
      ],
      [
        makeTag("tag-a", "TagA"),
        makeTag("tag-b", "TagB"),
        makeTag("tag-c", "TagC"),
      ]
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.coOccurrenceTriples).toHaveLength(1);
    expect(result.data.coOccurrenceTriples[0].tags).toHaveLength(3);
  });

  it("co-occurrence triples capped at 20", async () => {
    // To generate 25+ distinct triples, we need at least 6 unique tags on one comment.
    // C(7, 3) = 35 triples — more than enough to hit the cap of 20.
    const tagIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7"];
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      tagIds.map((tid) => makeAssoc("c1", tid)),
      tagIds.map((tid) => makeTag(tid, `Tag-${tid}`))
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.coOccurrenceTriples.length).toBeLessThanOrEqual(20);
    // With 7 tags → 35 triples, all at count=1, the cap kicks in
    expect(result.data.coOccurrenceTriples).toHaveLength(20);
  });

  it("co-occurrence quads capped at 10", async () => {
    // C(6, 4) = 15 quads — more than the cap of 10.
    const tagIds = ["t1", "t2", "t3", "t4", "t5", "t6"];
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      tagIds.map((tid) => makeAssoc("c1", tid)),
      tagIds.map((tid) => makeTag(tid, `Tag-${tid}`))
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.coOccurrenceQuadruples.length).toBeLessThanOrEqual(10);
    expect(result.data.coOccurrenceQuadruples).toHaveLength(10);
  });

  it("missing tag metadata → defaults to 'Unknown'", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    // Association references "unknown-tag" but the tag map is empty
    mockRepos(
      [makeAssoc("c1", "unknown-tag")],
      [] // no tag metadata
    );

    const result = await getToriAnalysis(scope);

    expect(result.data.tagFrequencies[0].tagName).toBe("Unknown");
    expect(result.data.tagFrequencies[0].domain).toBe("Unknown");
  });
});
