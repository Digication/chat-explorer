/**
 * Unit tests for the scope/consent guard in getStudentEvidenceMoments.
 *
 * These tests are the regression contract for the security fix that
 * stops getStudentEvidenceMoments from leaking evidence for students
 * outside the caller's validated scope or for students who opted out
 * via StudentConsent.
 *
 * resolveScope is mocked so we can drive consentedStudentIds directly.
 * AppDataSource is mocked so we can verify whether the SQL path was
 * taken (an out-of-scope query MUST short-circuit before touching the
 * DB).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (declared before importing the SUT) ──────────────────────

vi.mock("./scope.js", () => ({ resolveScope: vi.fn() }));
vi.mock("./cache.js", () => ({
  withCache: vi.fn(async (_k: unknown, _s: unknown, compute: () => unknown) => ({
    data: await compute(),
    cached: false,
  })),
}));

const mockGetCount = vi.fn();
const mockGetMany = vi.fn();
const mockCreateQueryBuilder = vi.fn();
const mockGetRepository = vi.fn();

vi.mock("../../data-source.js", () => ({
  AppDataSource: {
    getRepository: (...a: unknown[]) => mockGetRepository(...a),
  },
}));

import {
  getStudentEvidenceMoments,
  getEvidenceSummary,
} from "./evidence-outcomes.js";
import { resolveScope } from "./scope.js";

// ── Helpers ────────────────────────────────────────────────────────

const INST_A = "00000000-0000-0000-0000-00000000000a";
const INST_B = "00000000-0000-0000-0000-00000000000b";
const STUDENT_IN_A_1 = "11111111-1111-1111-1111-111111111111";
const STUDENT_IN_A_2 = "22222222-2222-2222-2222-222222222222";
const STUDENT_IN_B = "33333333-3333-3333-3333-333333333333";
const STUDENT_OPTED_OUT = "44444444-4444-4444-4444-444444444444";

function setupQueryBuilderForCount(count: number, moments: unknown[] = []) {
  const qb = {
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getCount: () => Promise.resolve(count),
    getMany: () => Promise.resolve(moments),
  };
  mockCreateQueryBuilder.mockReturnValue(qb);
  mockGetRepository.mockReturnValue({
    createQueryBuilder: mockCreateQueryBuilder,
  });
  return qb;
}

beforeEach(() => {
  vi.mocked(resolveScope).mockReset();
  mockGetCount.mockReset();
  mockGetMany.mockReset();
  mockCreateQueryBuilder.mockReset();
  mockGetRepository.mockReset();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("getStudentEvidenceMoments scope/consent guard", () => {
  it("returns empty when studentId is outside the validated scope (cross-tenant)", async () => {
    // Faculty caller's scope is institution A — only students in A are consented.
    vi.mocked(resolveScope).mockResolvedValue({
      comments: [],
      threads: [],
      consentedStudentIds: [STUDENT_IN_A_1, STUDENT_IN_A_2],
      excludedCount: 0,
    });

    const result = await getStudentEvidenceMoments(
      { institutionId: INST_A },
      STUDENT_IN_B // student belongs to a different institution
    );

    expect(result).toEqual({ moments: [], totalCount: 0 });
    // Critical: the DB must NOT be queried for the out-of-scope student.
    // If we called getRepository, that means the function went past the
    // guard and tried to query — that's the regression we're preventing.
    expect(mockGetRepository).not.toHaveBeenCalled();
  });

  it("returns empty when studentId belongs to a consent-excluded student", async () => {
    // Same institution, but the student opted out — resolveScope does
    // not include them in consentedStudentIds.
    vi.mocked(resolveScope).mockResolvedValue({
      comments: [],
      threads: [],
      consentedStudentIds: [STUDENT_IN_A_1],
      excludedCount: 1,
    });

    const result = await getStudentEvidenceMoments(
      { institutionId: INST_A },
      STUDENT_OPTED_OUT
    );

    expect(result).toEqual({ moments: [], totalCount: 0 });
    expect(mockGetRepository).not.toHaveBeenCalled();
  });

  it("returns empty when consentedStudentIds is empty (no scope match at all)", async () => {
    vi.mocked(resolveScope).mockResolvedValue({
      comments: [],
      threads: [],
      consentedStudentIds: [],
      excludedCount: 0,
    });

    const result = await getStudentEvidenceMoments(
      { institutionId: INST_A },
      STUDENT_IN_A_1
    );

    expect(result).toEqual({ moments: [], totalCount: 0 });
    expect(mockGetRepository).not.toHaveBeenCalled();
  });

  it("proceeds with the DB query when studentId is in the consented set (institution scope)", async () => {
    vi.mocked(resolveScope).mockResolvedValue({
      comments: [],
      threads: [],
      consentedStudentIds: [STUDENT_IN_A_1, STUDENT_IN_A_2],
      excludedCount: 0,
    });
    setupQueryBuilderForCount(0, []);

    const result = await getStudentEvidenceMoments(
      { institutionId: INST_A },
      STUDENT_IN_A_1
    );

    expect(result.totalCount).toBe(0);
    expect(result.moments).toEqual([]);
    // At institution scope, no source narrowing — only the moments
    // count + list queries (2). No ArtifactSection lookup needed.
    expect(mockGetRepository).toHaveBeenCalledTimes(2);
  });

  // ── Source narrowing for course/assignment-scoped calls (the leak
  //    Codex flagged: same student, different course). At narrow scope
  //    we additionally require the moment's source (Comment or
  //    ArtifactSection) to belong to the in-scope course/assignment.

  it("returns empty when narrow scope has no in-scope comments OR sections for the student", async () => {
    // Student is consented at the course level, but has zero comments
    // in the scoped course AND zero artifact sections in the scoped
    // course. The fix must short-circuit before the moments query.
    vi.mocked(resolveScope).mockResolvedValue({
      comments: [], // no comments by this student in this course
      threads: [],
      consentedStudentIds: [STUDENT_IN_A_1],
      excludedCount: 0,
    });
    // Mock the ArtifactSection repo to return no rows.
    const sectionQb = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      getRawMany: () => Promise.resolve([]),
    };
    mockGetRepository.mockReturnValueOnce({
      createQueryBuilder: () => sectionQb,
    });

    const result = await getStudentEvidenceMoments(
      { institutionId: INST_A, courseId: "course-x" },
      STUDENT_IN_A_1
    );

    expect(result).toEqual({ moments: [], totalCount: 0 });
    // Only the ArtifactSection lookup ran (1). The EvidenceMoment
    // count/list queries (which would have been #2 and #3) MUST NOT
    // have fired — the guard short-circuited.
    expect(mockGetRepository).toHaveBeenCalledTimes(1);
  });

  it("getEvidenceSummary applies source narrowing at course/assignment scope", async () => {
    // Course-scoped summary must constrain its moments query so a
    // student's evidence from OTHER courses doesn't leak into the
    // outcome roll-up. Assert the count query receives the
    // `em."commentId" IN` clause (or `em."artifactSectionId" IN`).
    vi.mocked(resolveScope).mockResolvedValue({
      comments: [
        {
          id: "c-1",
          externalId: "ext-1",
          threadId: "t-1",
          studentId: STUDENT_IN_A_1,
          role: "user",
          text: "...",
          orderIndex: 0,
          timestamp: null,
          totalComments: null,
          grade: null,
        },
      ],
      threads: [],
      consentedStudentIds: [STUDENT_IN_A_1],
      excludedCount: 0,
    });

    // Section-narrowing query (returns no in-scope sections).
    const sectionQb = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      getRawMany: () => Promise.resolve([]),
    };
    // Framework lookup
    const frameworkRepo = {
      findOne: () =>
        Promise.resolve({ id: "fw-1", name: "TORI", institutionId: INST_A }),
    };
    // OutcomeDefinition list
    const outcomeRepo = { find: () => Promise.resolve([]) };
    // Moments count query — capture the andWhere clauses.
    const countQb = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getCount: () => Promise.resolve(0),
    };
    mockGetRepository.mockImplementation((entity: unknown) => {
      const name =
        typeof entity === "string"
          ? entity
          : (entity as { name?: string })?.name;
      if (name === "ArtifactSection") {
        return { createQueryBuilder: () => sectionQb };
      }
      if (name === "OutcomeFramework") return frameworkRepo;
      if (name === "OutcomeDefinition") return outcomeRepo;
      // Assume it's the EvidenceMoment for the count
      return { createQueryBuilder: () => countQb };
    });

    await getEvidenceSummary({
      institutionId: INST_A,
      courseId: "course-x",
    });

    const andWhereCalls = countQb.andWhere.mock.calls.map(
      (c) => c[0] as string
    );
    // At narrow scope with empty allowed-comments AND empty
    // allowed-sections, buildSourceFilter returns the "1=0" sentinel
    // — that is the correct, scope-respecting behavior. Either form is
    // an acceptable closure of the leak; here we assert that SOME
    // narrowing clause was added (not just em.studentId IN + isLatest).
    const hasNarrowing = andWhereCalls.some(
      (s) =>
        s.includes('em."commentId" IN') ||
        s.includes('em."artifactSectionId" IN') ||
        s.includes("1=0")
    );
    expect(hasNarrowing).toBe(true);
  });

  it("includes the source-filter clause when narrow scope has in-scope comments", async () => {
    // Student has a comment in the course scope. The moments query
    // should add an `(em.commentId IN (...))` clause.
    vi.mocked(resolveScope).mockResolvedValue({
      comments: [
        {
          id: "c-1",
          externalId: "ext-1",
          threadId: "t-1",
          studentId: STUDENT_IN_A_1,
          role: "user",
          text: "...",
          orderIndex: 0,
          timestamp: null,
          totalComments: null,
          grade: null,
        },
      ],
      threads: [],
      consentedStudentIds: [STUDENT_IN_A_1],
      excludedCount: 0,
    });
    // ArtifactSection lookup returns empty
    const sectionQb = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      getRawMany: () => Promise.resolve([]),
    };
    // Capture the moments-query builders so we can assert the
    // source-filter clause was added.
    const countQb = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getCount: () => Promise.resolve(0),
      getMany: () => Promise.resolve([]),
    };
    const listQb = { ...countQb };
    // Order: ArtifactSection (1), EvidenceMoment count (2), EvidenceMoment list (3)
    mockGetRepository
      .mockReturnValueOnce({ createQueryBuilder: () => sectionQb })
      .mockReturnValueOnce({ createQueryBuilder: () => countQb })
      .mockReturnValueOnce({ createQueryBuilder: () => listQb });

    await getStudentEvidenceMoments(
      { institutionId: INST_A, courseId: "course-x" },
      STUDENT_IN_A_1
    );

    // The countQb must have received an `andWhere` call carrying the
    // source-filter clause that references commentId.
    const andWhereCalls = countQb.andWhere.mock.calls.map((c) => c[0] as string);
    const hasSourceFilter = andWhereCalls.some((s) =>
      s.includes('em."commentId" IN')
    );
    expect(hasSourceFilter).toBe(true);
  });
});
