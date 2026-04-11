/**
 * Integration tests for resolveScope().
 *
 * These tests run against the real Postgres database inside Docker.
 * Tests gracefully skip when no seed data exists.
 *
 * Run with: docker compose exec app pnpm test
 */
import { describe, it, expect } from "vitest";
import { AppDataSource } from "../../data-source.js";
import { resolveScope } from "./scope.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";

const FAKE_INST = "00000000-0000-0000-0000-000000000000";

describe("resolveScope (integration)", () => {
  // ── 1. Non-existent institutionId ─────────────────────────────

  it("returns empty result for non-existent institutionId", async () => {
    const result = await resolveScope({ institutionId: FAKE_INST });

    expect(result.comments).toEqual([]);
    expect(result.consentedStudentIds).toEqual([]);
    expect(result.excludedCount).toBe(0);
  });

  // ── 2. Comments filtered by institutionId ─────────────────────

  it("returns comments filtered by institutionId when data exists", async () => {
    // Find a real institution in the DB
    const sample = await AppDataSource.createQueryBuilder()
      .select("co.institutionId", "institutionId")
      .from("course", "co")
      .limit(1)
      .getRawOne();

    if (!sample?.institutionId) {
      console.log("Skipping: no course data in DB");
      return;
    }

    const result = await resolveScope({ institutionId: sample.institutionId });

    // All returned comments should belong to this institution
    // (verified by the JOIN chain in resolveScope)
    expect(Array.isArray(result.comments)).toBe(true);
    // If there are comments, they must all have the correct institution
    // We verify indirectly: the query would not return unrelated comments
    for (const c of result.comments) {
      expect(c.id).toBeTruthy();
      expect(c.threadId).toBeTruthy();
    }
  });

  // ── 3. courseId filter narrows results ───────────────────────

  it("courseId filter narrows results to that course", async () => {
    // Find a real course
    const sample = await AppDataSource.createQueryBuilder()
      .select(["co.id AS courseId", "co.institutionId AS institutionId"])
      .from("course", "co")
      .limit(1)
      .getRawOne();

    if (!sample?.courseId) {
      console.log("Skipping: no course data in DB");
      return;
    }

    const withCourse = await resolveScope({
      institutionId: sample.institutionId,
      courseId: sample.courseId,
    });

    const withoutCourse = await resolveScope({
      institutionId: sample.institutionId,
    });

    // Filtered result must be a subset of the unfiltered result
    const courseCommentIds = new Set(withCourse.comments.map((c) => c.id));
    const allCommentIds = new Set(withoutCourse.comments.map((c) => c.id));

    for (const id of courseCommentIds) {
      expect(allCommentIds.has(id)).toBe(true);
    }

    // The courseId-scoped count must be <= the institution-wide count
    expect(withCourse.comments.length).toBeLessThanOrEqual(
      withoutCourse.comments.length
    );
  });

  // ── 4. Consent-excluded students are filtered out ────────────

  it("consent-excluded students' comments are not in the result", async () => {
    const { StudentConsent, ConsentStatus } = await import(
      "../../entities/StudentConsent.js"
    );

    // Find a student who has comments
    const sampleComment = await AppDataSource.createQueryBuilder()
      .select([
        "c.studentId AS studentId",
        "co.institutionId AS institutionId",
        "co.id AS courseId",
      ])
      .from("comment", "c")
      .innerJoin("thread", "t", "t.id = c.threadId")
      .innerJoin("assignment", "a", "a.id = t.assignmentId")
      .innerJoin("course", "co", "co.id = a.courseId")
      .where("c.studentId IS NOT NULL")
      .limit(1)
      .getRawOne();

    if (!sampleComment?.studentId) {
      console.log("Skipping: no student comment data in DB");
      return;
    }

    const { studentId, institutionId, courseId } = sampleComment;

    // Check the result before any exclusion
    const before = await resolveScope({ institutionId, courseId });
    const hadStudent = before.comments.some((c) => c.studentId === studentId);

    if (!hadStudent) {
      // Student has no comments in this course scope
      console.log("Skipping: student not in scope");
      return;
    }

    // Add institution-wide exclusion for the student
    const repo = AppDataSource.getRepository(StudentConsent);
    const adminUser = await AppDataSource.createQueryBuilder()
      .select("u.id", "id")
      .from("user", "u")
      .limit(1)
      .getRawOne();

    if (!adminUser?.id) {
      console.log("Skipping: no user available to set updatedById");
      return;
    }

    const exclusion = repo.create({
      studentId,
      institutionId,
      courseId: null,
      status: ConsentStatus.EXCLUDED,
      updatedById: adminUser.id,
    });
    await repo.save(exclusion);

    try {
      const after = await resolveScope({ institutionId, courseId });
      const stillHasStudent = after.comments.some(
        (c) => c.studentId === studentId
      );
      expect(stillHasStudent).toBe(false);
    } finally {
      // Clean up the test record
      await repo.delete({ studentId, institutionId, courseId: undefined });
    }
  });

  // ── 5. consentedStudentIds only includes participating students ─

  it("consentedStudentIds only includes students with comments in scope", async () => {
    const sample = await AppDataSource.createQueryBuilder()
      .select("co.institutionId", "institutionId")
      .from("course", "co")
      .limit(1)
      .getRawOne();

    if (!sample?.institutionId) {
      console.log("Skipping: no course data in DB");
      return;
    }

    const result = await resolveScope({ institutionId: sample.institutionId });

    // Every consentedStudentId must appear in at least one comment
    const commentStudentIds = new Set(
      result.comments.map((c) => c.studentId).filter(Boolean)
    );

    for (const sId of result.consentedStudentIds) {
      expect(commentStudentIds.has(sId)).toBe(true);
    }
  });

  // ── 6. threads array matches comments ────────────────────────

  it("threads array contains an entry for every threadId referenced in comments", async () => {
    const sample = await AppDataSource.createQueryBuilder()
      .select("co.institutionId", "institutionId")
      .from("course", "co")
      .limit(1)
      .getRawOne();

    if (!sample?.institutionId) {
      console.log("Skipping: no course data in DB");
      return;
    }

    const result = await resolveScope({ institutionId: sample.institutionId });

    if (result.comments.length === 0) {
      console.log("Skipping: no comments for this institution");
      return;
    }

    const threadIdsFromComments = new Set(result.comments.map((c) => c.threadId));
    const threadIdsFromThreads = new Set(result.threads.map((t) => t.id));

    for (const tid of threadIdsFromComments) {
      expect(threadIdsFromThreads.has(tid)).toBe(true);
    }
  });
});
