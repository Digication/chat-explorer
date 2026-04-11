import { describe, it, expect, vi, beforeEach } from "vitest";
import { Thread } from "../entities/Thread.js";
import { Comment } from "../entities/Comment.js";
import { Student } from "../entities/Student.js";
import { Assignment } from "../entities/Assignment.js";

// ── Per-entity query builder mocks ────────────────────────────────
const makeQb = (returnVal: unknown[]) => ({
  select: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  getMany: vi.fn().mockResolvedValue(returnVal),
});

let threadQb = makeQb([]);
let commentQb = makeQb([]);
let assignmentQb = makeQb([]);

const studentRepo = {
  find: vi.fn().mockResolvedValue([]),
  findOne: vi.fn(),
  findOneBy: vi.fn(),
};

vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === Thread) return { createQueryBuilder: () => threadQb };
      if (entity === Comment) return { createQueryBuilder: () => commentQb };
      if (entity === Student) return studentRepo;
      if (entity === Assignment) return { createQueryBuilder: () => assignmentQb };
      return {};
    }),
  },
}));

import { checkDuplicates } from "./dedup.js";

beforeEach(() => {
  vi.clearAllMocks();
  threadQb = makeQb([]);
  commentQb = makeQb([]);
  assignmentQb = makeQb([]);
  studentRepo.find.mockResolvedValue([]);
});

describe("checkDuplicates", () => {
  it("all empty arrays → all result Sets empty", async () => {
    const result = await checkDuplicates("i1", [], [], [], []);

    expect(result.existingThreadIds).toBeInstanceOf(Set);
    expect(result.existingCommentIds).toBeInstanceOf(Set);
    expect(result.existingStudentSystemIds).toBeInstanceOf(Set);
    expect(result.existingAssignmentIds).toBeInstanceOf(Set);

    expect(result.existingThreadIds.size).toBe(0);
    expect(result.existingCommentIds.size).toBe(0);
    expect(result.existingStudentSystemIds.size).toBe(0);
    expect(result.existingAssignmentIds.size).toBe(0);
  });

  it("all IDs exist in DB → Sets contain all input IDs", async () => {
    threadQb = makeQb([{ externalId: "t1" }, { externalId: "t2" }]);
    commentQb = makeQb([{ externalId: "cm1" }, { externalId: "cm2" }]);
    studentRepo.find.mockResolvedValue([{ systemId: "stu1" }, { systemId: "stu2" }]);
    assignmentQb = makeQb([{ externalId: "a1" }]);

    const result = await checkDuplicates(
      "i1",
      ["t1", "t2"],
      ["cm1", "cm2"],
      ["stu1", "stu2"],
      ["a1"]
    );

    expect(result.existingThreadIds).toEqual(new Set(["t1", "t2"]));
    expect(result.existingCommentIds).toEqual(new Set(["cm1", "cm2"]));
    expect(result.existingStudentSystemIds).toEqual(new Set(["stu1", "stu2"]));
    expect(result.existingAssignmentIds).toEqual(new Set(["a1"]));
  });

  it("no IDs exist in DB → all Sets empty", async () => {
    // All repos return empty arrays (default mock state)
    const result = await checkDuplicates(
      "i1",
      ["t1"],
      ["cm1"],
      ["stu1"],
      ["a1"]
    );

    expect(result.existingThreadIds.size).toBe(0);
    expect(result.existingCommentIds.size).toBe(0);
    expect(result.existingStudentSystemIds.size).toBe(0);
    expect(result.existingAssignmentIds.size).toBe(0);
  });

  it("mixed: some exist, some don't", async () => {
    threadQb = makeQb([{ externalId: "t1" }]); // only t1 found, not t2
    commentQb = makeQb([]);
    studentRepo.find.mockResolvedValue([]);
    assignmentQb = makeQb([]);

    const result = await checkDuplicates("i1", ["t1", "t2"], [], [], []);

    expect(result.existingThreadIds).toEqual(new Set(["t1"]));
    expect(result.existingThreadIds.has("t2")).toBe(false);
  });

  it('empty array uses __none__ sentinel to prevent empty IN () SQL error', async () => {
    // We need to capture what the andWhere call received
    const capturedIds: string[][] = [];
    threadQb = {
      select: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockImplementation((_sql, params) => {
        if (params?.ids) capturedIds.push(params.ids);
        return threadQb;
      }),
      getMany: vi.fn().mockResolvedValue([]),
    };

    await checkDuplicates("i1", [], [], [], []);

    // The sentinel should have been passed instead of an empty array
    expect(capturedIds).toContainEqual(["__none__"]);
  });

  it("returns Sets (not arrays) for O(1) lookup", async () => {
    threadQb = makeQb([{ externalId: "t1" }]);
    studentRepo.find.mockResolvedValue([{ systemId: "stu1" }]);

    const result = await checkDuplicates("i1", ["t1"], [], ["stu1"], []);

    expect(result.existingThreadIds).toBeInstanceOf(Set);
    expect(result.existingCommentIds).toBeInstanceOf(Set);
    expect(result.existingStudentSystemIds).toBeInstanceOf(Set);
    expect(result.existingAssignmentIds).toBeInstanceOf(Set);
  });
});
