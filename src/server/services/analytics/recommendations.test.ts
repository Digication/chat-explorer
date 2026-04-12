/**
 * Tests for getRecommendations().
 *
 * All analytics dependencies (resolveScope, withCache, getEngagement,
 * getToriAnalysis, getNetwork) are mocked so these tests run without a DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must appear before imports that use them) ─────────────

vi.mock("./scope.js", () => ({ resolveScope: vi.fn() }));
vi.mock("./cache.js", () => ({
  withCache: vi.fn(async (_k: unknown, _s: unknown, compute: () => unknown) => ({
    data: await compute(),
    cached: false,
  })),
}));

const mockGetEngagement = vi.fn();
const mockGetToriAnalysis = vi.fn();
const mockGetNetwork = vi.fn();

vi.mock("./engagement.js", () => ({
  getEngagement: (...a: unknown[]) => mockGetEngagement(...a),
}));
vi.mock("./tori.js", () => ({
  getToriAnalysis: (...a: unknown[]) => mockGetToriAnalysis(...a),
}));
vi.mock("./network.js", () => ({
  getNetwork: (...a: unknown[]) => mockGetNetwork(...a),
}));

import { getRecommendations } from "./recommendations.js";
import { resolveScope } from "./scope.js";

// ── Helpers ──────────────────────────────────────────────────────

const INST = "00000000-0000-0000-0000-000000000001";
const SCOPE = { institutionId: INST };

/** Build a minimal ResolvedScope */
function makeScope(comments: { id: string; studentId: string | null; role: string; text: string }[] = []) {
  return {
    comments,
    consentedStudentIds: [...new Set(comments.map((c) => c.studentId).filter(Boolean))] as string[],
    excludedCount: 0,
    threads: [],
  };
}

/** Build a minimal AnalyticsResult wrapper */
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

/** Build default empty engagement result */
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

/** Build default empty TORI result */
function emptyTori() {
  return wrapData({
    tagFrequencies: [],
    tagCoverage: [],
    coOccurrencePairs: [],
    coOccurrenceTriples: [],
    coOccurrenceQuadruples: [],
  });
}

/** Build default empty network result */
function emptyNetwork() {
  return wrapData({ nodes: [], edges: [], communities: [] });
}

function makeComment(id: string, studentId = "s1") {
  return {
    id,
    externalId: id,
    threadId: "t1",
    studentId,
    role: "USER",
    text: "some text",
    orderIndex: 0,
    timestamp: null,
    totalComments: null,
    grade: null,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("getRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: data exists so deeper checks can run
    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeScope([makeComment("c1")])
    );
    mockGetEngagement.mockResolvedValue(emptyEngagement());
    mockGetToriAnalysis.mockResolvedValue(emptyTori());
    mockGetNetwork.mockResolvedValue(emptyNetwork());
  });

  it("empty comments → single 'Upload Data' HIGH recommendation", async () => {
    (resolveScope as ReturnType<typeof vi.fn>).mockResolvedValue(makeScope([]));

    const result = await getRecommendations(SCOPE);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].visualization).toBe("Upload Data");
    expect(result.data[0].priority).toBe("HIGH");
  });

  it("tag diversity: top 3 > 60% → 'Tag Frequency Chart' HIGH", async () => {
    // total=100, top3=65 → 65% > 60
    mockGetToriAnalysis.mockResolvedValue(
      wrapData({
        tagFrequencies: [
          { tagId: "t1", tagName: "A", domain: "d", count: 50, percent: 50 },
          { tagId: "t2", tagName: "B", domain: "d", count: 10, percent: 10 },
          { tagId: "t3", tagName: "C", domain: "d", count: 5, percent: 5 },
          { tagId: "t4", tagName: "D", domain: "d", count: 20, percent: 20 },
          { tagId: "t5", tagName: "E", domain: "d", count: 15, percent: 15 },
        ],
        tagCoverage: [],
        coOccurrencePairs: [],
        coOccurrenceTriples: [],
        coOccurrenceQuadruples: [],
      })
    );

    const result = await getRecommendations(SCOPE);

    const tagRec = result.data.find((r) => r.visualization === "Tag Frequency Chart");
    expect(tagRec).toBeDefined();
    expect(tagRec?.priority).toBe("HIGH");
  });

  it("tag diversity: top 3 ≤ 60% → no tag frequency rec", async () => {
    // [20, 20, 20, 20, 20] → total=100, top3=60 → NOT > 60
    mockGetToriAnalysis.mockResolvedValue(
      wrapData({
        tagFrequencies: [
          { tagId: "t1", tagName: "A", domain: "d", count: 20, percent: 20 },
          { tagId: "t2", tagName: "B", domain: "d", count: 20, percent: 20 },
          { tagId: "t3", tagName: "C", domain: "d", count: 20, percent: 20 },
          { tagId: "t4", tagName: "D", domain: "d", count: 20, percent: 20 },
          { tagId: "t5", tagName: "E", domain: "d", count: 20, percent: 20 },
        ],
        tagCoverage: [],
        coOccurrencePairs: [],
        coOccurrenceTriples: [],
        coOccurrenceQuadruples: [],
      })
    );

    const result = await getRecommendations(SCOPE);

    expect(result.data.find((r) => r.visualization === "Tag Frequency Chart")).toBeUndefined();
  });

  it("tag diversity: 0 total applications → no tag rec", async () => {
    // tagFrequencies is empty → totalTagApplications = 0, skip check
    mockGetToriAnalysis.mockResolvedValue(
      wrapData({
        tagFrequencies: [],
        tagCoverage: [],
        coOccurrencePairs: [],
        coOccurrenceTriples: [],
        coOccurrenceQuadruples: [],
      })
    );

    const result = await getRecommendations(SCOPE);

    expect(result.data.find((r) => r.visualization === "Tag Frequency Chart")).toBeUndefined();
  });

  it("category spread: 3+ categories → 'Depth Band Distribution' HIGH", async () => {
    // 3 students, each with a different modal category
    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DESCRIPTIVE_WRITING",
            categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
            commentCount: 1,
          },
          {
            studentId: "s2",
            modalCategory: "DIALOGIC_REFLECTION",
            categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 0 },
            commentCount: 1,
          },
          {
            studentId: "s3",
            modalCategory: "CRITICAL_REFLECTION",
            categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 1 },
            commentCount: 1,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 1 },
      })
    );

    const result = await getRecommendations(SCOPE);

    const rec = result.data.find((r) => r.visualization === "Depth Band Distribution");
    expect(rec).toBeDefined();
    expect(rec?.priority).toBe("HIGH");
  });

  it("category spread: only 1 student → no depth rec", async () => {
    // perStudent.length > 1 fails
    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
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

    const result = await getRecommendations(SCOPE);

    expect(result.data.find((r) => r.visualization === "Depth Band Distribution")).toBeUndefined();
  });

  it("category spread: only 2 distinct categories → no depth rec", async () => {
    // 2 students but only 2 distinct modal categories → categoriesUsed.size >= 3 fails
    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent: [
          {
            studentId: "s1",
            modalCategory: "DIALOGIC_REFLECTION",
            categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 0 },
            commentCount: 1,
          },
          {
            studentId: "s2",
            modalCategory: "CRITICAL_REFLECTION",
            categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 1 },
            commentCount: 1,
          },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 1 },
      })
    );

    const result = await getRecommendations(SCOPE);

    expect(result.data.find((r) => r.visualization === "Depth Band Distribution")).toBeUndefined();
  });

  it("network: avgDegree > 3 → 'Network Graph' MEDIUM", async () => {
    // nodes with degrees [4, 4] → avg 4 > 3
    mockGetNetwork.mockResolvedValue(
      wrapData({
        nodes: [
          { id: "n1", name: "A", domain: "d", frequency: 2, degree: 4, communityId: 0 },
          { id: "n2", name: "B", domain: "d", frequency: 2, degree: 4, communityId: 0 },
        ],
        edges: [],
        communities: [],
      })
    );

    const result = await getRecommendations(SCOPE);

    const rec = result.data.find((r) => r.visualization === "Network Graph");
    expect(rec).toBeDefined();
    expect(rec?.priority).toBe("MEDIUM");
  });

  it("clustering: ≥6 students, max < 70% → 'Clustered Heatmap' MEDIUM", async () => {
    // 6 students: DW=2, DR=2, DLG=1, CR=1 → max=2, 2/6≈0.33 < 0.7
    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent: [
          { studentId: "s1", modalCategory: "DESCRIPTIVE_WRITING", categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 }, commentCount: 1 },
          { studentId: "s2", modalCategory: "DESCRIPTIVE_WRITING", categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 }, commentCount: 1 },
          { studentId: "s3", modalCategory: "DESCRIPTIVE_REFLECTION", categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 1, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 }, commentCount: 1 },
          { studentId: "s4", modalCategory: "DESCRIPTIVE_REFLECTION", categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 1, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 }, commentCount: 1 },
          { studentId: "s5", modalCategory: "DIALOGIC_REFLECTION", categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 0 }, commentCount: 1 },
          { studentId: "s6", modalCategory: "CRITICAL_REFLECTION", categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 1 }, commentCount: 1 },
        ],
        categoryDistribution: { DESCRIPTIVE_WRITING: 2, DESCRIPTIVE_REFLECTION: 2, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 1 },
      })
    );

    const result = await getRecommendations(SCOPE);

    const rec = result.data.find((r) => r.visualization === "Clustered Heatmap");
    expect(rec).toBeDefined();
    expect(rec?.priority).toBe("MEDIUM");
  });

  it("clustering: max ≥ 70% → no clustering rec", async () => {
    // 10 students: DW=7, DR=1, DLG=1, CR=1 → max=7, 7/10=0.7 → NOT < 0.7
    const perStudent: Array<{ studentId: string; modalCategory: string; categoryDistribution: Record<string, number>; commentCount: number }> = Array.from({ length: 7 }, (_, i) => ({
      studentId: `s${i}`,
      modalCategory: "DESCRIPTIVE_WRITING",
      categoryDistribution: { DESCRIPTIVE_WRITING: 1, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 },
      commentCount: 1,
    }));
    perStudent.push(
      { studentId: "s7", modalCategory: "DESCRIPTIVE_REFLECTION", categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 1, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 0 }, commentCount: 1 },
      { studentId: "s8", modalCategory: "DIALOGIC_REFLECTION", categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 0 }, commentCount: 1 },
      { studentId: "s9", modalCategory: "CRITICAL_REFLECTION", categoryDistribution: { DESCRIPTIVE_WRITING: 0, DESCRIPTIVE_REFLECTION: 0, DIALOGIC_REFLECTION: 0, CRITICAL_REFLECTION: 1 }, commentCount: 1 }
    );

    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
        perStudent,
        categoryDistribution: { DESCRIPTIVE_WRITING: 7, DESCRIPTIVE_REFLECTION: 1, DIALOGIC_REFLECTION: 1, CRITICAL_REFLECTION: 1 },
      })
    );

    const result = await getRecommendations(SCOPE);

    expect(result.data.find((r) => r.visualization === "Clustered Heatmap")).toBeUndefined();
  });

  it("no heuristics triggered → 'Overview Dashboard' MEDIUM fallback", async () => {
    // Data exists but no thresholds met: 1 student, empty tags, no network nodes
    mockGetEngagement.mockResolvedValue(
      wrapData({
        perComment: [],
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
    mockGetToriAnalysis.mockResolvedValue(
      wrapData({
        tagFrequencies: [],
        tagCoverage: [],
        coOccurrencePairs: [],
        coOccurrenceTriples: [],
        coOccurrenceQuadruples: [],
      })
    );
    mockGetNetwork.mockResolvedValue(
      wrapData({ nodes: [], edges: [], communities: [] })
    );

    const result = await getRecommendations(SCOPE);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].visualization).toBe("Overview Dashboard");
    expect(result.data[0].priority).toBe("MEDIUM");
  });
});
