/**
 * Unit tests for getNetwork().
 *
 * All external dependencies (DB, scope, cache) are mocked.
 * Louvain community IDs are non-deterministic — tests assert community
 * COUNT, never specific community ID values.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getNetwork } from "./network.js";
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

function makeAssoc(commentId: string, toriTagId: string) {
  return { commentId, toriTagId };
}

function makeTag(id: string, name: string, domain = "test-domain") {
  return { id, name, domain };
}

/**
 * Sets up both repositories for network.ts:
 *   1st call → CommentToriTag repo (createQueryBuilder, .where().getMany())
 *   2nd call → ToriTag repo (find)
 *
 * Note: network.ts uses `.where()` directly (no innerJoinAndSelect).
 */
function mockRepos(
  associations: Array<{ commentId: string; toriTagId: string }>,
  tags: Array<{ id: string; name: string; domain: string }>
) {
  const getManyMock = vi.fn().mockResolvedValue(associations);
  const whereMock = vi.fn().mockReturnValue({ getMany: getManyMock });
  const cttCreateQbMock = vi.fn().mockReturnValue({ where: whereMock });

  const findMock = vi.fn().mockResolvedValue(tags);

  mockGetRepository
    .mockReturnValueOnce({ createQueryBuilder: cttCreateQbMock })
    .mockReturnValueOnce({ find: findMock });
}

const scope: AnalyticsScope = { institutionId: "inst-1" };

// ── Tests ──────────────────────────────────────────────────────────────

describe("getNetwork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("empty comments → empty nodes, edges, communities", async () => {
    mockResolveScope.mockResolvedValue(makeResolved([]));

    const result = await getNetwork(scope);

    expect(result.data.nodes).toEqual([]);
    expect(result.data.edges).toEqual([]);
    expect(result.data.communities).toEqual([]);
  });

  it("two tags on one comment → one edge with weight=1", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      [makeAssoc("c1", "tag-a"), makeAssoc("c1", "tag-b")],
      [makeTag("tag-a", "TagA"), makeTag("tag-b", "TagB")]
    );

    // minEdgeWeight=1 to keep the weight-1 edge
    const result = await getNetwork(scope, 1);

    expect(result.data.edges).toHaveLength(1);
    expect(result.data.edges[0].weight).toBe(1);
    expect(result.data.nodes).toHaveLength(2);
  });

  it("default minEdgeWeight=2 filters weight-1 edges", async () => {
    // Only 1 comment with 2 tags → edge weight=1 → filtered out
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      [makeAssoc("c1", "tag-a"), makeAssoc("c1", "tag-b")],
      [makeTag("tag-a", "TagA"), makeTag("tag-b", "TagB")]
    );

    // default minEdgeWeight = 2
    const result = await getNetwork(scope);

    expect(result.data.edges).toHaveLength(0);
    expect(result.data.nodes).toHaveLength(0);
  });

  it("two comments with same tag pair → weight=2, passes default filter", async () => {
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

    const result = await getNetwork(scope); // default minEdgeWeight=2

    expect(result.data.edges).toHaveLength(1);
    expect(result.data.edges[0].weight).toBe(2);
    expect(result.data.nodes).toHaveLength(2);
  });

  it("custom minEdgeWeight=1 keeps weight-1 edges", async () => {
    mockResolveScope.mockResolvedValue(
      makeResolved([{ id: "c1", studentId: "s1", role: "USER", text: "A" }])
    );
    mockRepos(
      [makeAssoc("c1", "tag-a"), makeAssoc("c1", "tag-b")],
      [makeTag("tag-a", "TagA"), makeTag("tag-b", "TagB")]
    );

    const result = await getNetwork(scope, 1);

    expect(result.data.edges).toHaveLength(1);
    expect(result.data.edges[0].weight).toBe(1);
  });

  it("edge at exact minEdgeWeight boundary passes (filter is strict <)", async () => {
    // weight=2, minEdgeWeight=2 → filter is `weight < 2` → weight=2 passes
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

    const result = await getNetwork(scope, 2);

    // Edge weight=2 with minEdgeWeight=2 should be kept
    expect(result.data.edges).toHaveLength(1);
  });

  it("node degree calculation", async () => {
    // tag-a connected to tag-b and tag-c → degree=2
    // Create 2+ comments so edges pass the default minEdgeWeight=2 filter
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
        // c1 and c2: tag-a + tag-b (weight=2)
        makeAssoc("c1", "tag-a"),
        makeAssoc("c1", "tag-b"),
        makeAssoc("c2", "tag-a"),
        makeAssoc("c2", "tag-b"),
        // c3 and c4: tag-a + tag-c (weight=2)
        makeAssoc("c3", "tag-a"),
        makeAssoc("c3", "tag-c"),
        makeAssoc("c4", "tag-a"),
        makeAssoc("c4", "tag-c"),
      ],
      [
        makeTag("tag-a", "TagA"),
        makeTag("tag-b", "TagB"),
        makeTag("tag-c", "TagC"),
      ]
    );

    const result = await getNetwork(scope); // default minEdgeWeight=2

    const nodeA = result.data.nodes.find((n) => n.id === "tag-a");
    expect(nodeA).toBeDefined();
    expect(nodeA!.degree).toBe(2); // connected to tag-b and tag-c
  });

  it("Louvain: two disconnected clusters → two communities", async () => {
    // [tag-a, tag-b] always co-occur, [tag-c, tag-d] always co-occur,
    // never mixed. Need weight >= 2 to pass the default filter.
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
        makeAssoc("c1", "tag-b"),
        makeAssoc("c2", "tag-a"),
        makeAssoc("c2", "tag-b"),
        makeAssoc("c3", "tag-c"),
        makeAssoc("c3", "tag-d"),
        makeAssoc("c4", "tag-c"),
        makeAssoc("c4", "tag-d"),
      ],
      [
        makeTag("tag-a", "TagA"),
        makeTag("tag-b", "TagB"),
        makeTag("tag-c", "TagC"),
        makeTag("tag-d", "TagD"),
      ]
    );

    const result = await getNetwork(scope);

    // Two completely disconnected pairs → two communities.
    // Do NOT assert on specific community ID values (non-deterministic).
    expect(result.data.communities).toHaveLength(2);
  });

  it("Louvain: single fully-connected cluster → one community", async () => {
    // All four tags always appear together on every comment.
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
        makeAssoc("c1", "tag-c"),
        makeAssoc("c2", "tag-a"),
        makeAssoc("c2", "tag-b"),
        makeAssoc("c2", "tag-c"),
      ],
      [
        makeTag("tag-a", "TagA"),
        makeTag("tag-b", "TagB"),
        makeTag("tag-c", "TagC"),
      ]
    );

    const result = await getNetwork(scope); // minEdgeWeight=2, all pairs have weight=2

    // All tags are fully interconnected → one community
    expect(result.data.communities).toHaveLength(1);
  });

  it("isolated tags (no co-occurrence) → excluded from output", async () => {
    // tag-e only appears alone → no edges → excluded from nodes
    mockResolveScope.mockResolvedValue(
      makeResolved([
        { id: "c1", studentId: "s1", role: "USER", text: "A" },
        { id: "c2", studentId: "s1", role: "USER", text: "B" },
        { id: "c3", studentId: "s1", role: "USER", text: "C" },
      ])
    );
    mockRepos(
      [
        // tag-a + tag-b co-occur twice (weight=2)
        makeAssoc("c1", "tag-a"),
        makeAssoc("c1", "tag-b"),
        makeAssoc("c2", "tag-a"),
        makeAssoc("c2", "tag-b"),
        // tag-e appears alone
        makeAssoc("c3", "tag-e"),
      ],
      [
        makeTag("tag-a", "TagA"),
        makeTag("tag-b", "TagB"),
        makeTag("tag-e", "TagE"),
      ]
    );

    const result = await getNetwork(scope);

    const nodeIds = result.data.nodes.map((n) => n.id);
    expect(nodeIds).not.toContain("tag-e");
    expect(nodeIds).toContain("tag-a");
    expect(nodeIds).toContain("tag-b");
  });
});
