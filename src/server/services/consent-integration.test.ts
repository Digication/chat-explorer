/**
 * Integration tests for consent.ts functions.
 *
 * Uses the real Postgres database inside Docker.
 * Tests gracefully handle empty tables / missing data.
 *
 * Run with: docker compose exec app pnpm test
 */
import { describe, it, expect } from "vitest";
import { AppDataSource } from "../data-source.js";
import {
  applyConsentFilter,
  isStudentExcluded,
  getStudentConsent,
} from "./consent.js";
import { Comment } from "../entities/Comment.js";

const FAKE_STUDENT_ID = "00000000-0000-0000-0000-000000000099";
const FAKE_INST_ID = "00000000-0000-0000-0000-000000000001";
const FAKE_COURSE_ID = "00000000-0000-0000-0000-000000000002";

describe("consent (integration)", () => {
  // ── 1. applyConsentFilter returns a valid query builder ───────

  it("applyConsentFilter returns a valid query builder and getMany does not throw", async () => {
    const commentRepo = AppDataSource.getRepository(Comment);
    const qb = commentRepo
      .createQueryBuilder("c")
      .innerJoin("c.thread", "t")
      .innerJoin("t.assignment", "a")
      .innerJoin("a.course", "co")
      .where("co.institutionId = :inst", { inst: FAKE_INST_ID });

    applyConsentFilter(qb, '"c"."studentId"', FAKE_INST_ID, FAKE_COURSE_ID);

    // Should not throw even when student_consent table is empty
    await expect(qb.getMany()).resolves.toEqual(expect.any(Array));
  });

  // ── 2. isStudentExcluded: false for non-existent student ──────

  it("isStudentExcluded returns false for a non-existent student", async () => {
    const result = await isStudentExcluded(
      FAKE_STUDENT_ID,
      FAKE_INST_ID,
      FAKE_COURSE_ID
    );
    expect(result).toBe(false);
  });

  // ── 3. isStudentExcluded: false when no exclusion records exist ─

  it("isStudentExcluded returns false when student has no consent records", async () => {
    // Find a real student who has no exclusion records
    const realStudent = await AppDataSource.createQueryBuilder()
      .select("s.id", "id")
      .from("student", "s")
      .where(
        `NOT EXISTS (
          SELECT 1 FROM student_consent sc
          WHERE sc."studentId" = s.id
            AND sc.status = 'EXCLUDED'
        )`
      )
      .limit(1)
      .getRawOne();

    if (!realStudent?.id) {
      // No students without exclusions — the test is vacuously true
      console.log(
        "Skipping: no students without exclusion records in DB"
      );
      return;
    }

    const result = await isStudentExcluded(
      realStudent.id,
      FAKE_INST_ID,
      FAKE_COURSE_ID
    );
    expect(result).toBe(false);
  });

  // ── 4. applyConsentFilter does not throw on empty student_consent ─

  it("applyConsentFilter does not throw when student_consent has no matching rows", async () => {
    const commentRepo = AppDataSource.getRepository(Comment);

    // Use a fake institutionId so nothing matches
    const qb = commentRepo
      .createQueryBuilder("c")
      .where("c.studentId = :sid", { sid: FAKE_STUDENT_ID });

    applyConsentFilter(qb, '"c"."studentId"', FAKE_INST_ID, FAKE_COURSE_ID);

    await expect(qb.getMany()).resolves.toEqual([]);
  });

  // ── 5. getStudentConsent: empty array for unknown student ─────

  it("getStudentConsent returns empty array for unknown studentId", async () => {
    const records = await getStudentConsent(FAKE_STUDENT_ID, FAKE_INST_ID);
    expect(records).toEqual([]);
  });
});
