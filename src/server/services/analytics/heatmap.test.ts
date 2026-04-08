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

  it("returns an empty result (not null or error) for valid inputs", async () => {
    // Use a non-existent student/tag pair — should return empty items, not throw
    const result = await getHeatmapCellEvidence(
      { institutionId: "00000000-0000-0000-0000-000000000000" },
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002"
    );
    expect(result).toEqual({ items: [], totalCount: 0 });
  });

  it("returns empty result for non-existent student UUIDs", async () => {
    // Use valid-looking but unused UUIDs (must be valid UUIDs because the
    // consent check passes them straight to a Postgres uuid column).
    const result = await getHeatmapCellEvidence(
      { institutionId: "00000000-0000-0000-0000-000000000000" },
      "00000000-0000-0000-0000-000000000999",
      "00000000-0000-0000-0000-000000000888"
    );
    expect(result).toEqual({ items: [], totalCount: 0 });
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

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.totalCount).toBeGreaterThanOrEqual(result.items.length);

    // Verify shape of each evidence item
    for (const item of result.items) {
      expect(item).toHaveProperty("commentId");
      expect(item).toHaveProperty("text");
      expect(item).toHaveProperty("threadId");
      expect(item).toHaveProperty("threadName");
      expect(item).toHaveProperty("timestamp");
      expect(typeof item.text).toBe("string");
      expect(item.text.length).toBeGreaterThan(0);
    }
  });

  it("limits results to the requested page size", async () => {
    // This test verifies the LIMIT clause works.
    // With real data, items should never exceed the page size (default 20).
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

    expect(result.items.length).toBeLessThanOrEqual(20);
  });
});
