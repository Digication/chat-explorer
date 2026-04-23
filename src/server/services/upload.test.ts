import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { AppDataSource } from "../data-source.js";
import { Institution } from "../entities/Institution.js";
import { User } from "../entities/User.js";
import { Comment } from "../entities/Comment.js";
import { Assignment } from "../entities/Assignment.js";
import { UploadLog } from "../entities/UploadLog.js";
import { previewUpload, commitUpload } from "./upload.js";

// Unique-per-run identifiers so concurrent test runs (and stale data from
// prior failed runs) don't cause UNIQUE-constraint or FK conflicts. The
// suffix also lets the cleanup query match this run's data only.
const RUN_SUFFIX = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const TEST_INSTITUTION_DOMAIN = `upload-test-${RUN_SUFFIX}.digication.com`;
const TEST_INSTITUTION_SLUG = `upload-test-${RUN_SUFFIX}`;
const TEST_USER_ID = `upload-test-user-${RUN_SUFFIX}`;
const TEST_USER_EMAIL = `upload-test-${RUN_SUFFIX}@example.com`;

let fixtureDir: string;
let manyAssignmentsFixturePath: string;
let singleAssignmentFixturePath: string;
let institutionId: string;

async function generateFixture(
  outPath: string,
  rows: number,
  shape: "many-assignments" | "single-assignment" = "many-assignments",
  commentOffset = 0,
  entityOffset = 0
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        "scripts/generate-synthetic-csv.mjs",
        outPath,
        String(rows),
        "10000",
        shape,
        String(commentOffset),
        String(entityOffset),
      ],
      { stdio: "inherit" }
    );
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`generator exited ${code}`))
    );
  });
}

beforeAll(async () => {
  // AppDataSource is initialized by src/server/test-setup.ts via vitest's
  // setupFiles. Do NOT initialize it again here — duplicate initialize
  // would fail with "DataSource is already initialized".

  fixtureDir = await mkdtemp(join(tmpdir(), "upload-test-"));
  manyAssignmentsFixturePath = join(fixtureDir, "many-assignments.csv");
  singleAssignmentFixturePath = join(fixtureDir, "single-assignment.csv");

  // 2000 rows × 10 assignments × 50 threads → exercises cross-assignment chunking.
  await generateFixture(manyAssignmentsFixturePath, 2000, "many-assignments", 0, 0);
  // 2000 rows × 1 assignment × ~100 threads → exercises within-assignment chunking
  // (the 8000-student worst case in miniature). 2000 rows / 5000 chunk size → 1
  // comment-pass transaction; bump to 10000 rows if you want multiple chunks.
  // commentOffset=100000 and entityOffset=100 ensure comment/assignment/course/thread IDs
  // don't overlap with the many-assignments fixture — both share the same institution
  // and dedup is institution-scoped, so overlapping external IDs would appear as dupes.
  await generateFixture(singleAssignmentFixturePath, 2000, "single-assignment", 100000, 100);

  // Throwaway institution + user. Unique per run via RUN_SUFFIX.
  const inst = await AppDataSource.getRepository(Institution).save({
    domain: TEST_INSTITUTION_DOMAIN,
    slug: TEST_INSTITUTION_SLUG,
    name: `Upload Test Institution ${RUN_SUFFIX}`,
  });
  institutionId = inst.id;

  await AppDataSource.getRepository(User).save({
    id: TEST_USER_ID, // explicit — User.id is @PrimaryColumn (no auto-gen)
    name: "Upload Test User",
    email: TEST_USER_EMAIL,
    role: "instructor",      // matches the user_role_enum lowercase values
    institutionId,
  });
}, 60_000);

afterAll(async () => {
  if (!AppDataSource.isInitialized) return;

  // Clean up THIS RUN's data. Order matters for FK constraints. Table names
  // are SINGULAR (TypeORM default naming) — confirmed against the Initial
  // migration: "user", "institution", "course", "assignment", "thread",
  // "student", "comment", "upload_log", "course_access", "comment_tori_tag".
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  try {
    await qr.query(
      `DELETE FROM "comment_tori_tag" WHERE "commentId" IN (SELECT id FROM "comment" WHERE "uploadedById" = $1)`,
      [TEST_USER_ID]
    );
    await qr.query(`DELETE FROM "comment" WHERE "uploadedById" = $1`, [TEST_USER_ID]);
    await qr.query(
      `DELETE FROM "thread" WHERE "assignmentId" IN (SELECT a.id FROM "assignment" a JOIN "course" c ON a."courseId" = c.id WHERE c."institutionId" = $1)`,
      [institutionId]
    );
    await qr.query(
      `DELETE FROM "assignment" WHERE "courseId" IN (SELECT id FROM "course" WHERE "institutionId" = $1)`,
      [institutionId]
    );
    await qr.query(`DELETE FROM "upload_log" WHERE "institutionId" = $1`, [institutionId]);
    await qr.query(`DELETE FROM "course_access" WHERE "userId" = $1`, [TEST_USER_ID]);
    await qr.query(`DELETE FROM "course" WHERE "institutionId" = $1`, [institutionId]);
    await qr.query(`DELETE FROM "student" WHERE "institutionId" = $1`, [institutionId]);
    await qr.query(`DELETE FROM "user" WHERE id = $1`, [TEST_USER_ID]);
    await qr.query(`DELETE FROM "institution" WHERE id = $1`, [institutionId]);
  } finally {
    await qr.release();
  }

  await rm(fixtureDir, { recursive: true, force: true });
}, 60_000);

describe("commitUpload — many assignments shape", () => {
  it("previews and commits a 2000-row CSV across 10 assignments", async () => {
    // Copy to a fresh path because commitUpload renames its input.
    const previewPath = join(fixtureDir, `preview-many-${RUN_SUFFIX}.csv`);
    await copyFile(manyAssignmentsFixturePath, previewPath);

    const preview = await previewUpload(previewPath);
    expect(preview.totalRows).toBe(2000);
    expect(preview.newComments).toBe(2000);
    expect(preview.duplicateComments).toBe(0);

    const commitPath = join(fixtureDir, `commit-many-${RUN_SUFFIX}.csv`);
    await copyFile(manyAssignmentsFixturePath, commitPath);

    const result = await commitUpload(
      commitPath,
      TEST_USER_ID,
      institutionId,
      "synthetic.csv"
    );

    expect(result.totalRows).toBe(2000);
    expect(result.newComments).toBe(2000);
    expect(result.newThreads).toBeGreaterThan(0);
    expect(result.newAssignments).toBe(10);
    expect(result.newCourses).toBe(10);
    expect(result.uploadLogId).toBeTruthy();

    // DB row counts.
    const commentCount = await AppDataSource.getRepository(Comment).count({
      where: { uploadedById: TEST_USER_ID },
    });
    expect(commentCount).toBe(2000);

    const assignmentCount = await AppDataSource.getRepository(Assignment).count({
      where: { course: { institutionId } },
      relations: { course: true },
    });
    expect(assignmentCount).toBe(10);

    const logCount = await AppDataSource.getRepository(UploadLog).count({
      where: { institutionId },
    });
    expect(logCount).toBe(1);
  }, 120_000);

  it("is idempotent — re-uploading the same file produces zero new rows", async () => {
    const path = join(fixtureDir, `idempotent-${RUN_SUFFIX}.csv`);
    await copyFile(manyAssignmentsFixturePath, path);

    const result = await commitUpload(
      path,
      TEST_USER_ID,
      institutionId,
      "synthetic.csv"
    );

    expect(result.totalRows).toBe(2000);
    expect(result.newComments).toBe(0);
    expect(result.duplicateComments).toBe(2000);
  }, 120_000);
});

describe("commitUpload — single assignment shape (8000-student-style)", () => {
  it("previews and commits a 2000-row CSV in one assignment with many threads", async () => {
    const path = join(fixtureDir, `single-${RUN_SUFFIX}.csv`);
    await copyFile(singleAssignmentFixturePath, path);

    const result = await commitUpload(
      path,
      TEST_USER_ID,
      institutionId,
      "single-assignment.csv"
    );

    expect(result.totalRows).toBe(2000);
    expect(result.newComments).toBe(2000);
    // Single-assignment shape: exactly 1 new assignment in this run.
    expect(result.newAssignments).toBe(1);
    expect(result.newThreads).toBeGreaterThan(50); // many threads in one assignment
  }, 120_000);
});
