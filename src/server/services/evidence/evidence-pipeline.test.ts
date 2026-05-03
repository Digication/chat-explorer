/**
 * Unit tests for the evidence pipeline.
 *
 * All DB and LLM dependencies are mocked so these tests run fast and
 * require no database or API key.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────

const mockGenerateNarrativeBatch = vi.fn();
vi.mock("./narrative-generator.js", () => ({
  generateNarrativeBatch: (...args: unknown[]) =>
    mockGenerateNarrativeBatch(...args),
  NARRATIVE_VERSION: "test/mock@v0",
  MAX_BATCH_SIZE: 5,
  NarrativeError: class NarrativeError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "NarrativeError";
    }
  },
}));

const mockCacheInvalidate = vi.fn();
vi.mock("../analytics/cache.js", () => ({
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

// Mock isDoneMessage
vi.mock("../tori-extractor.js", () => ({
  isDoneMessage: (text: string) =>
    text.toLowerCase().includes("done") && text.length < 20,
}));

// Mock DataSource with chainable query builders
const mockGetMany = vi.fn();
const mockGetCount = vi.fn();
const mockFind = vi.fn();
const mockFindOne = vi.fn();
const mockSave = vi.fn();
const mockCreate = vi.fn();
const mockTransaction = vi.fn();

// Chainable query builder mock
function makeQb(result?: unknown) {
  const qb: Record<string, unknown> = {};
  const chain = [
    "leftJoinAndSelect",
    "leftJoin",
    "addSelect",
    "innerJoin",
    "where",
    "andWhere",
    "select",
    "orderBy",
    "groupBy",
    "addGroupBy",
    "skip",
    "take",
  ];
  for (const method of chain) {
    qb[method] = vi.fn().mockReturnValue(qb);
  }
  qb.getMany = result !== undefined ? vi.fn().mockResolvedValue(result) : mockGetMany;
  qb.getCount = mockGetCount;
  return qb;
}

// Tracks which entity gets which mock behavior
const repoMocks = new Map<string, Record<string, unknown>>();

function mockRepo(entityName: string, overrides?: Record<string, unknown>) {
  const repo: Record<string, unknown> = {
    createQueryBuilder: vi.fn().mockReturnValue(makeQb()),
    find: mockFind,
    findOne: mockFindOne,
    save: mockSave,
    create: mockCreate,
    ...overrides,
  };
  repoMocks.set(entityName, repo);
  return repo;
}

vi.mock("../../data-source.js", () => ({
  AppDataSource: {
    getRepository: (entity: { name?: string } | string) => {
      const name = typeof entity === "string" ? entity : entity?.name ?? "";
      return repoMocks.get(name) ?? mockRepo(name);
    },
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { generateEvidenceInBackground } from "./evidence-pipeline.js";

beforeEach(() => {
  vi.clearAllMocks();
  repoMocks.clear();

  // Default env
  process.env.GOOGLE_AI_API_KEY = "test-key";
});

// ── Helpers ──────────────────────────────────────────────────────────

function setupDefaultMocks(options?: {
  comments?: Array<{
    id: string;
    text: string;
    role?: string;
    studentId?: string | null;
  }>;
  existingMomentIds?: string[];
  toriTags?: Array<{ commentId: string; tagName: string }>;
  reflections?: Array<{ commentId: string; category: string }>;
  framework?: { id: string; name: string } | null;
  outcomes?: Array<{ id: string; code: string; name: string }>;
}) {
  const {
    comments = [
      { id: "c1", text: "I learned to debug systematically." },
      { id: "c2", text: "Collaboration helped me understand teamwork." },
    ],
    existingMomentIds = [],
    toriTags = [{ commentId: "c1", tagName: "Problem-Solving" }],
    reflections = [{ commentId: "c1", category: "DIALOGIC_REFLECTION" }],
    framework = { id: "fw-1", name: "TORI Learning Outcomes" },
    outcomes = [
      { id: "od-1", code: "TORI-1-1", name: "Problem-Solving" },
      { id: "od-2", code: "TORI-2-1", name: "Adaptive Learning" },
    ],
  } = options ?? {};

  // Comment repo — returns comments with thread/assignment metadata.
  // studentId lives on Comment (Thread has no studentId column). The
  // Thread sub-object only carries name + assignment for prompt context.
  const commentQb = makeQb(
    comments.map((c) => ({
      id: c.id,
      text: c.text,
      role: c.role ?? "user",
      studentId: c.studentId === undefined ? "s1" : c.studentId,
      thread: { name: "Week 3", assignment: { description: "Reflect" } },
    }))
  );
  mockRepo("Comment", { createQueryBuilder: vi.fn().mockReturnValue(commentQb) });

  // EvidenceMoment repo — for idempotency check
  const momentQb = makeQb(
    existingMomentIds.map((id) => ({ commentId: id }))
  );
  mockRepo("EvidenceMoment", {
    createQueryBuilder: vi.fn().mockReturnValue(momentQb),
  });

  // CommentToriTag repo — tags per comment
  const toriTagQb = makeQb(
    toriTags.map((t) => ({
      commentId: t.commentId,
      toriTag: { name: t.tagName },
    }))
  );
  mockRepo("CommentToriTag", {
    createQueryBuilder: vi.fn().mockReturnValue(toriTagQb),
  });

  // CommentReflectionClassification repo
  mockRepo("CommentReflectionClassification", {
    find: vi.fn().mockResolvedValue(
      reflections.map((r) => ({
        commentId: r.commentId,
        category: r.category,
      }))
    ),
  });

  // OutcomeFramework repo
  mockRepo("OutcomeFramework", {
    findOne: vi.fn().mockResolvedValue(framework),
  });

  // OutcomeDefinition repo
  mockRepo("OutcomeDefinition", {
    find: vi.fn().mockResolvedValue(
      outcomes.map((o, i) => ({
        id: o.id,
        code: o.code,
        name: o.name,
        description: null,
        sortOrder: i,
      }))
    ),
  });

  // Transaction mock — calls the callback with a mock manager
  mockTransaction.mockImplementation(async (cb: (manager: unknown) => Promise<void>) => {
    const managerRepos = new Map<string, Record<string, unknown>>();
    const manager = {
      getRepository: (entity: { name?: string } | string) => {
        const name = typeof entity === "string" ? entity : entity?.name ?? "";
        if (!managerRepos.has(name)) {
          managerRepos.set(name, {
            create: vi.fn().mockImplementation((data) => ({ ...data, id: `new-${name}-id` })),
            save: vi.fn().mockImplementation(async (data) => data),
          });
        }
        return managerRepos.get(name);
      },
      save: vi.fn().mockImplementation(async (data) => {
        if (Array.isArray(data)) return data;
        return { ...data, id: data.id ?? "new-moment-id" };
      }),
    };
    await cb(manager);
  });

  // Default narrative generator response. The generator's output uses
  // `sourceId` — for Phase 2 callers, sourceId IS the comment id.
  mockGenerateNarrativeBatch.mockResolvedValue([
    {
      sourceId: "c1",
      narrative: "Evidence of systematic debugging skill.",
      outcomeAlignments: [
        {
          outcomeDefinitionId: "od-1",
          strengthLevel: "DEVELOPING",
          rationale: "Systematic approach.",
        },
      ],
    },
    {
      sourceId: "c2",
      narrative: "Evidence of teamwork understanding.",
      outcomeAlignments: [],
    },
  ]);
}

// ── Tests ────────────────────────────────────────────────────────────

describe("generateEvidenceInBackground", () => {
  it("returns early for empty comment IDs", async () => {
    await generateEvidenceInBackground([], "inst-1");
    expect(mockGenerateNarrativeBatch).not.toHaveBeenCalled();
  });

  it("returns early if GOOGLE_AI_API_KEY is not set", async () => {
    delete process.env.GOOGLE_AI_API_KEY;
    setupDefaultMocks();
    await generateEvidenceInBackground(["c1"], "inst-1");
    expect(mockGenerateNarrativeBatch).not.toHaveBeenCalled();
  });

  it("skips comments that already have evidence (idempotent)", async () => {
    setupDefaultMocks({ existingMomentIds: ["c1", "c2"] });
    await generateEvidenceInBackground(["c1", "c2"], "inst-1");
    expect(mockGenerateNarrativeBatch).not.toHaveBeenCalled();
  });

  it("returns early if no active TORI framework exists", async () => {
    setupDefaultMocks({ framework: null });
    await generateEvidenceInBackground(["c1"], "inst-1");
    expect(mockGenerateNarrativeBatch).not.toHaveBeenCalled();
  });

  it("returns early if framework has no outcomes", async () => {
    setupDefaultMocks({ outcomes: [] });
    await generateEvidenceInBackground(["c1"], "inst-1");
    expect(mockGenerateNarrativeBatch).not.toHaveBeenCalled();
  });

  it("skips comments with no studentId (regression: studentId is on Comment, not Thread)", async () => {
    // Both comments lack a studentId — pipeline must NOT call the LLM
    // and must NOT write moments. This protects against the prior bug
    // where evidence-pipeline read `thread.studentId` (a field that
    // doesn't exist on Thread), which silently produced empty studentIds
    // and caused saveEvidenceResults to skip every result.
    setupDefaultMocks({
      comments: [
        { id: "c1", text: "Some reflection text.", studentId: null },
        { id: "c2", text: "Another reflection.", studentId: null },
      ],
    });
    await generateEvidenceInBackground(["c1", "c2"], "inst-1");
    expect(mockGenerateNarrativeBatch).not.toHaveBeenCalled();
  });

  it("calls generateNarrativeBatch and saves results", async () => {
    setupDefaultMocks();
    await generateEvidenceInBackground(["c1", "c2"], "inst-1");

    // Should have called the narrative generator once (both comments fit in one batch)
    expect(mockGenerateNarrativeBatch).toHaveBeenCalledTimes(1);

    // Should have called transaction to save results
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // Should invalidate cache
    expect(mockCacheInvalidate).toHaveBeenCalledWith({ institutionId: "inst-1" });
  });

  it("passes TORI tags and reflection categories to narrative input", async () => {
    setupDefaultMocks();
    await generateEvidenceInBackground(["c1", "c2"], "inst-1");

    const callArgs = mockGenerateNarrativeBatch.mock.calls[0][0];
    const c1Input = callArgs.comments.find(
      (c: { sourceId: string }) => c.sourceId === "c1"
    );
    expect(c1Input.toriTags).toContain("Problem-Solving");
    expect(c1Input.reflectionCategory).toBe("DIALOGIC_REFLECTION");
  });

  it("passes outcome definitions to narrative input", async () => {
    setupDefaultMocks();
    await generateEvidenceInBackground(["c1", "c2"], "inst-1");

    const callArgs = mockGenerateNarrativeBatch.mock.calls[0][0];
    expect(callArgs.outcomes).toHaveLength(2);
    expect(callArgs.outcomes[0].code).toBe("TORI-1-1");
    expect(callArgs.outcomes[1].code).toBe("TORI-2-1");
  });

  it("continues processing other batches if one fails", async () => {
    // Set up with enough comments to create 2 batches
    const comments = Array.from({ length: 7 }, (_, i) => ({
      id: `c${i}`,
      text: `Comment ${i} about learning.`,
    }));
    setupDefaultMocks({ comments });

    // First batch fails, second succeeds
    mockGenerateNarrativeBatch
      .mockRejectedValueOnce(new Error("LLM timeout"))
      .mockResolvedValueOnce([
        {
          sourceId: "c5",
          narrative: "Second batch narrative.",
          outcomeAlignments: [],
        },
      ]);

    // Should not throw — failures are logged
    await generateEvidenceInBackground(
      comments.map((c) => c.id),
      "inst-1"
    );

    expect(mockGenerateNarrativeBatch).toHaveBeenCalledTimes(2);
    // Cache should still be invalidated
    expect(mockCacheInvalidate).toHaveBeenCalled();
  });

  it("invalidates cache after processing", async () => {
    setupDefaultMocks();
    await generateEvidenceInBackground(["c1"], "inst-1");
    expect(mockCacheInvalidate).toHaveBeenCalledWith({
      institutionId: "inst-1",
    });
  });
});
