/**
 * Tests for getHeatmapCellEvidence().
 *
 * These tests run inside Docker with a real Postgres connection.
 * Run with: docker compose exec chat-explorer pnpm test
 */
import { describe, it, expect, beforeAll } from "vitest";
import { AppDataSource } from "../../data-source.js";
import { getHeatmapCellEvidence } from "./heatmap.js";
import { Comment, CommentRole } from "../../entities/Comment.js";
import { Thread } from "../../entities/Thread.js";
import { Assignment } from "../../entities/Assignment.js";
import { Course } from "../../entities/Course.js";
import { Institution } from "../../entities/Institution.js";
import { Student } from "../../entities/Student.js";
import { ToriTag } from "../../entities/ToriTag.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";

describe("getHeatmapCellEvidence", () => {
  // These tests depend on seed data from CSV uploads.
  // If the DB is empty, they will pass vacuously (returning []).

  it("returns an array (not null or error) for valid inputs", async () => {
    // Use a non-existent student/tag pair — should return empty array, not throw
    const result = await getHeatmapCellEvidence(
      { institutionId: "00000000-0000-0000-0000-000000000000" },
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002"
    );
    expect(result).toEqual([]);
  });

  it("returns empty array for non-existent student", async () => {
    const result = await getHeatmapCellEvidence(
      { institutionId: "00000000-0000-0000-0000-000000000000" },
      "nonexistent-student-id",
      "nonexistent-tag-id"
    );
    expect(result).toEqual([]);
  });

  it("returns evidence with correct shape when data exists", async () => {
    // Find a real comment with a TORI tag in the DB
    const sample = await AppDataSource.getRepository(CommentToriTag)
      .createQueryBuilder("ctt")
      .innerJoin("ctt.comment", "c")
      .innerJoin("c.thread", "t")
      .innerJoin("t.assignment", "a")
      .innerJoin("a.course", "course")
      .select([
        'c."studentId" AS "studentId"',
        'ctt."toriTagId" AS "toriTagId"',
        'course."institutionId" AS "institutionId"',
      ])
      .where('c.role = :role', { role: "USER" })
      .andWhere('c."studentId" IS NOT NULL')
      .limit(1)
      .getRawOne();

    if (!sample) {
      // No data in DB — skip this test (it will pass after CSV upload)
      console.log("Skipping: no comment+tag data in DB");
      return;
    }

    const result = await getHeatmapCellEvidence(
      { institutionId: sample.institutionId },
      sample.studentId,
      sample.toriTagId
    );

    expect(result.length).toBeGreaterThan(0);

    // Verify shape of each evidence item
    for (const item of result) {
      expect(item).toHaveProperty("commentId");
      expect(item).toHaveProperty("text");
      expect(item).toHaveProperty("threadId");
      expect(item).toHaveProperty("threadName");
      expect(item).toHaveProperty("timestamp");
      expect(typeof item.text).toBe("string");
      expect(item.text.length).toBeGreaterThan(0);
    }
  });

  it("limits results to 20", async () => {
    // This test verifies the LIMIT 20 clause works.
    // With real data, results should never exceed 20.
    const sample = await AppDataSource.getRepository(CommentToriTag)
      .createQueryBuilder("ctt")
      .innerJoin("ctt.comment", "c")
      .innerJoin("c.thread", "t")
      .innerJoin("t.assignment", "a")
      .innerJoin("a.course", "course")
      .select([
        'c."studentId" AS "studentId"',
        'ctt."toriTagId" AS "toriTagId"',
        'course."institutionId" AS "institutionId"',
      ])
      .where('c.role = :role', { role: "USER" })
      .andWhere('c."studentId" IS NOT NULL')
      .limit(1)
      .getRawOne();

    if (!sample) return;

    const result = await getHeatmapCellEvidence(
      { institutionId: sample.institutionId },
      sample.studentId,
      sample.toriTagId
    );

    expect(result.length).toBeLessThanOrEqual(20);
  });
});
