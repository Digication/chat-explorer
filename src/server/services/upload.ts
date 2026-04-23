import { type EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { AppDataSource } from "../data-source.js";
import { parseCsvFile, decodeEntities, type RawCsvRow } from "./csv-parser.js";
import { checkDuplicates } from "./dedup.js";
import { extractToriForThread } from "./tori-extractor.js";
import { Institution } from "../entities/Institution.js";
import { Course } from "../entities/Course.js";
import { Assignment } from "../entities/Assignment.js";
import { Thread } from "../entities/Thread.js";
import { Student } from "../entities/Student.js";
import { Comment, CommentRole } from "../entities/Comment.js";
import { CommentToriTag } from "../entities/CommentToriTag.js";
import { CourseAccess, AccessLevel } from "../entities/CourseAccess.js";
import { UploadLog } from "../entities/UploadLog.js";

// ── File storage ──────────────────────────────────────────────────
// Saved CSV files go into data/uploads/<year-month>/<uuid>.csv
// This keeps the original file around for debugging and re-processing.
const UPLOADS_DIR = join(process.cwd(), "data", "uploads");

// ── Chunking tunables ─────────────────────────────────────────────
// Comment rows per database transaction. At this size, worst-case:
// 5000 × ~60 fields × ~200 bytes = ~60 MB of SQL payload per txn. Postgres's
// max_allocated_packet is 1 GB, so we have plenty of headroom. Each txn
// commits in a few seconds locally, under 30s even against Railway.
const ROW_CHUNK_SIZE = 5000;

// Rows per SQL INSERT statement. 500 keeps each INSERT well under any
// reasonable statement-length limit while amortizing round-trip cost.
const COMMENT_INSERT_BATCH_SIZE = 500;

// Parent entities per transaction. Parents are low volume but 8000 students
// × manager.save() round-trips is still ~minutes. Chunking keeps each txn
// short and avoids long-held locks on the students table.
const PARENT_CHUNK_SIZE = 500;

// TORI tags per INSERT. Typically small per-thread, so 500 is plenty.
const TORI_TAG_INSERT_BATCH_SIZE = 500;

async function saveUploadedFile(
  tempPath: string,
  originalFilename: string
): Promise<string> {
  const now = new Date();
  const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = join(UPLOADS_DIR, monthDir);
  await mkdir(dir, { recursive: true });

  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${randomUUID()}_${safeName}`;
  const destPath = join(dir, filename);

  // rename() is atomic within the same filesystem and does not load the file
  // into memory. If tempPath and destPath are on different filesystems we
  // fall back to a copy+unlink (rare — only happens if /tmp is a separate
  // mount), which still streams and doesn't hold the file in RAM.
  try {
    await rename(tempPath, destPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      // Cross-device: fall back to streaming copy.
      const { createReadStream, createWriteStream } = await import("node:fs");
      const { pipeline } = await import("node:stream/promises");
      await pipeline(createReadStream(tempPath), createWriteStream(destPath));
      await unlink(tempPath);
    } else {
      throw err;
    }
  }

  // Return a relative path (from project root) for portability
  return `data/uploads/${monthDir}/${filename}`;
}

// ── Public interfaces ──────────────────────────────────────────────

export interface UploadPreviewResult {
  totalRows: number;
  newComments: number;
  duplicateComments: number;
  newThreads: number;
  newStudents: number;
  newAssignments: number;
  newCourses: number;
  detectedInstitutionId: string | null;
  detectedInstitutionName: string | null;
}

export interface UploadCommitResult extends UploadPreviewResult {
  uploadLogId: string;
  toriTagsExtracted: number;
  courseAccessCreated: boolean;
  // IDs of newly created USER comments — used by the upload route to fire
  // off background reflection-classification (Plan 3 / Hatton & Smith).
  newUserCommentIds: string[];
  // Number of existing comments whose text was replaced (replaceMode only)
  updatedComments: number;
}

// ── Institution detection ──────────────────────────────────────────

/**
 * Looks at the Submission URL in the CSV to figure out which institution
 * the data belongs to (e.g. "lagcc-cuny.digication.com" → LAGCC).
 * If no matching institution exists, auto-creates one from the domain.
 */
async function detectInstitution(
  rows: RawCsvRow[]
): Promise<Institution | null> {
  const rowWithUrl = rows.find((r) => r.submissionUrl?.trim());
  if (!rowWithUrl) return null;

  try {
    const url = new URL(rowWithUrl.submissionUrl);
    const domain = url.hostname;
    const repo = AppDataSource.getRepository(Institution);

    // Try to find an existing institution
    let institution = await repo.findOne({ where: { domain } });
    if (institution) return institution;

    // Auto-create from the domain (e.g. "lagcc-cuny.digication.com" → "lagcc-cuny")
    const slug = domain.replace(".digication.com", "");
    const name = slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    institution = repo.create({ domain, slug, name });
    return await repo.save(institution);
  } catch {
    return null;
  }
}

// ── Helper: determine comment role from CSV author fields ──────────

function resolveCommentRole(row: RawCsvRow): CommentRole {
  // ── Priority 1: explicit "Comment Role" column (2026-04+ CSV format).
  // When present, this is the definitive answer — skip all heuristics.
  const commentRole = (row.commentRole ?? "").toUpperCase().trim();
  if (commentRole === "ASSISTANT" || commentRole === "AI") {
    return CommentRole.ASSISTANT;
  }
  if (commentRole === "USER" || commentRole === "STUDENT") {
    return CommentRole.USER;
  }
  if (commentRole === "SYSTEM") {
    return CommentRole.SYSTEM;
  }

  // ── Priority 1b: legacy "Comment Author Type" column (older CSV format).
  const authorType = (row.commentAuthorType ?? "").toLowerCase().trim();
  if (authorType === "ai" || authorType === "ai_assistant" || authorType === "assistant") {
    return CommentRole.ASSISTANT;
  }
  if (authorType === "student" || authorType === "user") {
    return CommentRole.USER;
  }
  if (authorType === "system") {
    return CommentRole.SYSTEM;
  }

  // ── Priority 2: existing heuristics (for older CSVs without the column) ──
  const courseRole = (row.authorCourseRole ?? "").toLowerCase().trim();
  const systemRole = (row.authorSystemRole ?? "").toLowerCase().trim();

  // In Digication, a user's course role can be "ai" for AI assistants
  if (
    courseRole === "ai" ||
    courseRole === "ai_tutor" ||
    courseRole === "assistant" ||
    systemRole === "ai" ||
    systemRole === "assistant"
  ) {
    return CommentRole.ASSISTANT;
  }

  if (systemRole === "system") {
    return CommentRole.SYSTEM;
  }

  // Fallback: if the row has no author identification (no system ID, no name),
  // it's an AI assistant comment.
  const hasAuthor =
    row.authorSystemId?.trim() ||
    row.authorFirstName?.trim() ||
    row.authorLastName?.trim() ||
    row.authorEmail?.trim();

  if (!hasAuthor) {
    return CommentRole.ASSISTANT;
  }

  // Fallback: detect AI responses by the explicit (TORI: ...) marker in text.
  // Some CSV exports use the student's author info for ALL rows (including AI
  // responses), so the author columns alone can't distinguish them.
  if (/\(TORI:\s*[^)]+\)/i.test(row.commentFullText ?? "")) {
    return CommentRole.ASSISTANT;
  }

  // Default: it's a student (USER) comment
  return CommentRole.USER;
}

// ── Helper: parse a numeric string or return null ──────────────────

function parseIntOrNull(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function parseFloatOrNull(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function parseDateOrNull(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBool(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  return ["true", "1", "yes"].includes(value.trim().toLowerCase());
}

// ── Helper: slice an array into fixed-size chunks ─────────────────
// Used by every pass of the upload pipeline to keep each transaction /
// INSERT statement bounded regardless of total volume.
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// ── Preview (dry-run) ──────────────────────────────────────────────

/**
 * Parses the CSV and returns counts of what would be new vs. duplicate
 * — without writing anything to the database.
 */
export async function previewUpload(
  filePath: string
): Promise<UploadPreviewResult> {
  const rows = await parseCsvFile(filePath);
  const institution = await detectInstitution(rows);

  if (!institution) {
    return {
      totalRows: rows.length,
      newComments: rows.length,
      duplicateComments: 0,
      newThreads: 0,
      newStudents: 0,
      newAssignments: 0,
      newCourses: 0,
      detectedInstitutionId: null,
      detectedInstitutionName: null,
    };
  }

  // Collect unique IDs from the CSV
  const threadIds = [...new Set(rows.map((r) => r.threadId).filter(Boolean))];
  const commentIds = [
    ...new Set(rows.map((r) => r.commentId).filter(Boolean)),
  ];
  const studentIds = [
    ...new Set(rows.map((r) => r.authorSystemId).filter(Boolean)),
  ];
  const assignmentIds = [
    ...new Set(rows.map((r) => r.assignmentId).filter(Boolean)),
  ];

  const dedup = await checkDuplicates(
    institution.id,
    threadIds,
    commentIds,
    studentIds,
    assignmentIds
  );

  const newComments = commentIds.filter(
    (id) => !dedup.existingCommentIds.has(id)
  ).length;

  return {
    totalRows: rows.length,
    newComments,
    duplicateComments: commentIds.length - newComments,
    newThreads: threadIds.filter((id) => !dedup.existingThreadIds.has(id))
      .length,
    newStudents: studentIds.filter(
      (id) => !dedup.existingStudentSystemIds.has(id)
    ).length,
    newAssignments: assignmentIds.filter(
      (id) => !dedup.existingAssignmentIds.has(id)
    ).length,
    newCourses: 0, // Course column not in CSV yet
    detectedInstitutionId: institution.id,
    detectedInstitutionName: institution.name,
  };
}

// ── Commit (write to DB) ───────────────────────────────────────────

/**
 * Parses the CSV, deduplicates, creates all new entities, extracts
 * TORI tags, creates CourseAccess for the uploader, and logs the upload.
 *
 * The write path is now a four-pass pipeline with row-chunked transactions:
 *
 *   Pass A (importParents) — upsert Courses, Assignments, Threads, Students
 *     in chunked transactions (up to PARENT_CHUNK_SIZE per commit). Returns
 *     lookup maps keyed by external/system ID so the comment pass can wire
 *     up foreign keys without re-querying.
 *   Pass B (importComments) — process rows in chunks of ROW_CHUNK_SIZE per
 *     transaction. Inside each transaction, bulk-insert with manager.insert()
 *     in batches of COMMENT_INSERT_BATCH_SIZE. Replace-mode UPDATEs happen
 *     inside the same chunk's transaction.
 *   Pass C (importToriTags) — after all comments are committed, run TORI
 *     extraction per thread and batch-insert CommentToriTag rows.
 *   Pass D (finalize) — one short transaction for CourseAccess + UploadLog.
 *
 * This structure means each individual transaction commits quickly and
 * releases locks, so an 8,000-student single-assignment import no longer
 * holds one giant write transaction open for the full duration.
 */
export async function commitUpload(
  filePath: string,
  uploadedById: string,
  institutionId: string,
  originalFilename: string,
  replaceMode = false
): Promise<UploadCommitResult> {
  // ── Parse (streaming, outside any transaction) ────────────────────
  const rows = await parseCsvFile(filePath);

  // ── Save the CSV file (no DB) ─────────────────────────────────────
  // Move the temp file to its permanent location. Keeps the original CSV on
  // disk for debugging and re-processing, but without a second in-memory copy.
  const savedFilePath = await saveUploadedFile(filePath, originalFilename);

  // ── Dedup lookup (one short query, outside any txn) ───────────────
  const allThreadIds = [...new Set(rows.map((r) => r.threadId).filter(Boolean))];
  const allCommentIds = [
    ...new Set(rows.map((r) => r.commentId).filter(Boolean)),
  ];
  const allStudentSystemIds = [
    ...new Set(rows.map((r) => r.authorSystemId).filter(Boolean)),
  ];
  const allAssignmentIds = [
    ...new Set(rows.map((r) => r.assignmentId).filter(Boolean)),
  ];

  const dedup = await checkDuplicates(
    institutionId,
    allThreadIds,
    allCommentIds,
    allStudentSystemIds,
    allAssignmentIds
  );

  // ── Pass A: parent entities (chunked transactions) ────────────────
  const parents = await importParents({
    rows,
    dedup,
    institutionId,
    replaceMode,
  });

  // ── Pass B: comments (row-chunked transactions) ───────────────────
  const comments = await importComments({
    rows,
    dedup,
    parents,
    uploadedById,
    institutionId,
    replaceMode,
  });

  // ── Pass C: TORI tags (after comments are committed) ──────────────
  const toriTagsExtracted = await importToriTags({
    insertedByThread: comments.insertedByThread,
  });

  // ── Pass D: finalize (CourseAccess + UploadLog) ───────────────────
  const uploadLog = await AppDataSource.transaction(
    async (manager: EntityManager) => {
      for (const courseId of parents.courseIdsForAccess) {
        const existing = await manager.findOne(CourseAccess, {
          where: { userId: uploadedById, courseId },
        });
        if (!existing) {
          await manager.save(CourseAccess, {
            userId: uploadedById,
            courseId,
            accessLevel: AccessLevel.OWNER,
            grantedById: uploadedById,
          });
        }
      }

      return manager.save(UploadLog, {
        uploadedById,
        institutionId,
        originalFilename,
        filePath: savedFilePath,
        totalRows: rows.length,
        newComments: comments.newCommentsCount,
        skippedDuplicates: allCommentIds.length - comments.newCommentsCount,
        newThreads: parents.newThreadsCount,
        newStudents: parents.newStudentsCount,
        newCourses: parents.newCoursesCount,
        newAssignments: parents.newAssignmentsCount,
        toriTagsExtracted,
      });
    }
  );

  return {
    totalRows: rows.length,
    newComments: comments.newCommentsCount,
    duplicateComments: allCommentIds.length - comments.newCommentsCount,
    newThreads: parents.newThreadsCount,
    newStudents: parents.newStudentsCount,
    newAssignments: parents.newAssignmentsCount,
    newCourses: parents.newCoursesCount,
    detectedInstitutionId: institutionId,
    detectedInstitutionName: null,
    uploadLogId: uploadLog.id,
    toriTagsExtracted,
    courseAccessCreated: parents.courseIdsForAccess.size > 0,
    newUserCommentIds: comments.newUserCommentIds,
    updatedComments: comments.updatedCommentsCount,
  };
}

// ── Pass A: importParents ─────────────────────────────────────────
// Pre-creates Courses, Assignments, Threads, Students in chunked
// transactions. Total parent volume is bounded by the CSV's distinct-
// entity count (thousands at most in real data), not by row count.
interface ParentImportInput {
  rows: RawCsvRow[];
  dedup: Awaited<ReturnType<typeof checkDuplicates>>;
  institutionId: string;
  replaceMode: boolean;
}

interface ParentLookups {
  // Primary-key lookups used by the comment pass.
  courseIdByCourseExtId: Map<string, string>; // CSV course id → DB id
  assignmentIdByExtId: Map<string, string>; // CSV assignment id → DB id
  threadIdByExtId: Map<string, string>; // CSV thread id → DB id
  studentIdBySystemId: Map<string, string>; // author systemId → DB id

  // Counters + side effects for the UploadLog.
  courseIdsForAccess: Set<string>;
  newCoursesCount: number;
  newAssignmentsCount: number;
  newThreadsCount: number;
  newStudentsCount: number;
}

async function importParents(
  input: ParentImportInput
): Promise<ParentLookups> {
  const { rows, dedup, institutionId, replaceMode } = input;

  const courseIdByCourseExtId = new Map<string, string>();
  const assignmentIdByExtId = new Map<string, string>();
  const threadIdByExtId = new Map<string, string>();
  const studentIdBySystemId = new Map<string, string>();
  const courseIdsForAccess = new Set<string>();

  let newCoursesCount = 0;
  let newAssignmentsCount = 0;
  let newThreadsCount = 0;
  let newStudentsCount = 0;

  // ── A. Collect distinct parents from the CSV ──────────────────────
  // Preserve first-occurrence order so the "first row wins" behavior for
  // metadata (thread name, assignment description, etc.) matches what
  // the old implementation did.
  const courseSpecs: Array<{ externalId: string | null; row: RawCsvRow }> = [];
  const seenCourseKeys = new Set<string>();
  const assignmentSpecs: Array<{ externalId: string; row: RawCsvRow }> = [];
  const seenAssignmentIds = new Set<string>();
  const threadSpecs: Array<{
    externalId: string;
    assignmentExternalId: string;
    row: RawCsvRow;
  }> = [];
  const seenThreadIds = new Set<string>();
  const studentSpecs: Array<{ systemId: string; row: RawCsvRow }> = [];
  const seenStudentIds = new Set<string>();

  for (const row of rows) {
    if (!row.assignmentId) continue;

    const csvCourseId = row.courseId?.trim() || null;
    const courseKey = csvCourseId ?? `__assignment__${row.assignmentId}`;
    if (!seenCourseKeys.has(courseKey)) {
      seenCourseKeys.add(courseKey);
      courseSpecs.push({ externalId: csvCourseId, row });
    }

    if (!seenAssignmentIds.has(row.assignmentId)) {
      seenAssignmentIds.add(row.assignmentId);
      assignmentSpecs.push({ externalId: row.assignmentId, row });
    }

    if (row.threadId && !seenThreadIds.has(row.threadId)) {
      seenThreadIds.add(row.threadId);
      threadSpecs.push({
        externalId: row.threadId,
        assignmentExternalId: row.assignmentId,
        row,
      });
    }

    // Students only come from USER rows — we figure that out using
    // resolveCommentRole. Comments that turn out to be ASSISTANT/SYSTEM
    // don't create a student even if the author columns are populated.
    if (row.authorSystemId?.trim() && !seenStudentIds.has(row.authorSystemId)) {
      if (resolveCommentRole(row) === CommentRole.USER) {
        seenStudentIds.add(row.authorSystemId);
        studentSpecs.push({ systemId: row.authorSystemId, row });
      }
    }
  }

  // ── B. Courses (chunked transactions) ─────────────────────────────
  for (const batch of chunk(courseSpecs, PARENT_CHUNK_SIZE)) {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      for (const spec of batch) {
        const course = await ensureCourse(
          manager,
          spec,
          institutionId,
          dedup
        );
        if (course.wasCreated) newCoursesCount++;
        courseIdByCourseExtId.set(courseKeyFor(spec), course.id);
        courseIdsForAccess.add(course.id);
      }
    });
  }

  // ── C. Assignments (chunked transactions) ────────────────────────
  for (const batch of chunk(assignmentSpecs, PARENT_CHUNK_SIZE)) {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      for (const spec of batch) {
        const courseExt = spec.row.courseId?.trim() || null;
        const courseKey = courseExt ?? `__assignment__${spec.externalId}`;
        const courseId = courseIdByCourseExtId.get(courseKey);
        if (!courseId) {
          throw new Error(
            `Internal: course id missing for assignment ${spec.externalId} (courseKey=${courseKey})`
          );
        }
        const a = await ensureAssignment(manager, spec, courseId, dedup);
        if (a.wasCreated) newAssignmentsCount++;
        assignmentIdByExtId.set(spec.externalId, a.id);
      }
    });
  }

  // ── D. Threads (chunked transactions) ────────────────────────────
  for (const batch of chunk(threadSpecs, PARENT_CHUNK_SIZE)) {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      for (const spec of batch) {
        const assignmentId = assignmentIdByExtId.get(spec.assignmentExternalId);
        if (!assignmentId) {
          throw new Error(
            `Internal: assignment id missing for thread ${spec.externalId}`
          );
        }
        const t = await ensureThread(manager, spec, assignmentId, dedup);
        if (t.wasCreated) newThreadsCount++;
        threadIdByExtId.set(spec.externalId, t.id);
      }
    });
  }

  // ── E. Students (chunked transactions) ───────────────────────────
  for (const batch of chunk(studentSpecs, PARENT_CHUNK_SIZE)) {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      for (const spec of batch) {
        const s = await ensureStudent(
          manager,
          spec,
          institutionId,
          dedup,
          replaceMode
        );
        if (s.wasCreated) newStudentsCount++;
        studentIdBySystemId.set(spec.systemId, s.id);
      }
    });
  }

  return {
    courseIdByCourseExtId,
    assignmentIdByExtId,
    threadIdByExtId,
    studentIdBySystemId,
    courseIdsForAccess,
    newCoursesCount,
    newAssignmentsCount,
    newThreadsCount,
    newStudentsCount,
  };
}

function courseKeyFor(spec: {
  externalId: string | null;
  row: RawCsvRow;
}): string {
  return spec.externalId ?? `__assignment__${spec.row.assignmentId}`;
}

// ── ensureCourse / ensureAssignment / ensureThread / ensureStudent ─
// Per-entity helpers called by the parent pass. Each returns
// { id, wasCreated }. They still use manager.save() (not manager.insert())
// because they preserve the original logic for dedup, legacy-CSV fallback,
// and replace-mode updates — and parent volume is small enough that the
// extra round-trip cost doesn't matter.

async function ensureCourse(
  manager: EntityManager,
  spec: { externalId: string | null; row: RawCsvRow },
  institutionId: string,
  dedup: Awaited<ReturnType<typeof checkDuplicates>>
): Promise<{ id: string; wasCreated: boolean }> {
  const { externalId, row } = spec;

  if (externalId) {
    // New CSV format: look up by externalId within institution.
    const existing = await manager.findOne(Course, {
      where: { externalId, institutionId },
    });
    if (existing) return { id: existing.id, wasCreated: false };

    const created = await manager.save(Course, {
      institutionId,
      externalId,
      name: row.courseName || "Untitled Course",
      url: row.courseUrl || null,
      startDate: parseDateOrNull(row.courseStartDate),
      endDate: parseDateOrNull(row.courseEndDate),
      courseNumber: row.courseNumber || null,
      syncId: row.courseSyncId || null,
      faculty: row.courseFaculty || null,
    });
    return { id: created.id, wasCreated: true };
  }

  // Legacy CSV: no course column → one course per assignment.
  const courseName = `${row.assignmentName ?? "Untitled"} — Course`;
  const assignmentIsKnown = dedup.existingAssignmentIds.has(row.assignmentId);
  if (assignmentIsKnown) {
    const existingAssignment = await manager.findOne(Assignment, {
      where: { externalId: row.assignmentId },
      relations: { course: true },
    });
    if (existingAssignment?.course) {
      return { id: existingAssignment.course.id, wasCreated: false };
    }
  }
  const created = await manager.save(Course, {
    institutionId,
    name: courseName,
  });
  return { id: created.id, wasCreated: true };
}

async function ensureAssignment(
  manager: EntityManager,
  spec: { externalId: string; row: RawCsvRow },
  courseId: string,
  dedup: Awaited<ReturnType<typeof checkDuplicates>>
): Promise<{ id: string; wasCreated: boolean }> {
  const { externalId, row } = spec;
  if (dedup.existingAssignmentIds.has(externalId)) {
    const existing = await manager.findOne(Assignment, {
      where: { externalId, courseId },
    });
    if (existing) return { id: existing.id, wasCreated: false };
  }
  const created = await manager.save(
    Assignment,
    buildAssignmentEntity(row, courseId, externalId)
  );
  return { id: created.id, wasCreated: true };
}

async function ensureThread(
  manager: EntityManager,
  spec: { externalId: string; assignmentExternalId: string; row: RawCsvRow },
  assignmentId: string,
  dedup: Awaited<ReturnType<typeof checkDuplicates>>
): Promise<{ id: string; wasCreated: boolean }> {
  const { externalId, row } = spec;
  // Short-circuit: only findOne if we know the thread already exists.
  // Matters a lot for 8k-student imports where most threads are new.
  if (dedup.existingThreadIds.has(externalId)) {
    const existing = await manager.findOne(Thread, {
      where: { externalId, assignmentId },
    });
    if (existing) return { id: existing.id, wasCreated: false };
  }
  const created = await manager.save(Thread, {
    assignmentId,
    externalId,
    name: row.threadName ?? "Untitled Thread",
    totalInputTokens: parseIntOrNull(row.threadTotalInputTokens),
    totalOutputTokens: parseIntOrNull(row.threadTotalOutputTokens),
    totalCost: parseFloatOrNull(row.threadTotalCost),
    submissionUrl: row.submissionUrl || null,
  });
  return { id: created.id, wasCreated: true };
}

async function ensureStudent(
  manager: EntityManager,
  spec: { systemId: string; row: RawCsvRow },
  institutionId: string,
  dedup: Awaited<ReturnType<typeof checkDuplicates>>,
  replaceMode: boolean
): Promise<{ id: string; wasCreated: boolean }> {
  const { systemId, row } = spec;
  // Short-circuit: only findOne when we know the student might exist.
  // On an 8k-student fresh import this skips 8k pointless SELECTs.
  if (dedup.existingStudentSystemIds.has(systemId)) {
    const existing = await manager.findOne(Student, {
      where: { systemId, institutionId },
    });
    if (existing) {
      if (replaceMode) {
        existing.firstName = row.authorFirstName || existing.firstName;
        existing.lastName = row.authorLastName || existing.lastName;
        existing.email = row.authorEmail || existing.email;
        await manager.save(Student, existing);
      }
      return { id: existing.id, wasCreated: false };
    }
  }
  const created = await manager.save(Student, {
    institutionId,
    systemId,
    syncId: row.authorSyncId || null,
    firstName: row.authorFirstName || null,
    lastName: row.authorLastName || null,
    email: row.authorEmail || null,
    systemRole: row.authorSystemRole || null,
    courseRole: row.authorCourseRole || null,
  });
  return { id: created.id, wasCreated: true };
}

function buildAssignmentEntity(
  row: RawCsvRow,
  courseId: string,
  externalId: string
): Partial<Assignment> {
  return {
    courseId,
    externalId,
    name: row.assignmentName ?? "Untitled Assignment",
    description: row.assignmentDescription || null,
    url: row.assignmentUrl || null,
    createdDate: parseDateOrNull(row.assignmentCreatedDate),
    dueDate: parseDateOrNull(row.assignmentDueDate),
    gradeMaxPoints: parseFloatOrNull(row.gradeMaxPoints),
    intendedOutcomes: row.assignmentIntendedOutcomes || null,
    aiAssistantId: row.aiAssistantId || null,
    aiAssistantName: row.aiAssistantName || null,
    aiAssistantDescription: row.aiAssistantDescription || null,
    aiAssistantInstruction: row.aiAssistantInstruction || null,
    aiAssistantRestriction: row.aiAssistantRestriction || null,
    aiAssistantRole: row.aiAssistantRole || null,
    aiAssistantTags: row.aiAssistantTags || null,
    aiAssistantGradeLevel: row.aiAssistantGradeLevel || null,
    aiAssistantResponseLength: row.aiAssistantResponseLength || null,
    aiAssistantVisibility: row.aiAssistantVisibility || null,
    aiAssistantReflections: parseBool(row.aiAssistantReflections),
    aiAssistantGenerateAnswers: parseBool(row.aiAssistantGenerateAnswers),
    aiAssistantIntendedAudience: row.aiAssistantIntendedAudience || null,
  };
}

// ── Pass B: importComments ────────────────────────────────────────
// Main scale lever. Rows processed in chunks of ROW_CHUNK_SIZE per
// transaction. Inside each transaction, new comments are bulk-inserted
// with manager.insert(Comment, batchOf500). Replace-mode updates still
// use manager.save() one-at-a-time (uncommon code path).
interface CommentImportInput {
  rows: RawCsvRow[];
  dedup: Awaited<ReturnType<typeof checkDuplicates>>;
  parents: ParentLookups;
  uploadedById: string;
  institutionId: string;
  replaceMode: boolean;
}

interface InsertedCommentMeta {
  id: string;
  externalId: string;
  role: CommentRole;
  text: string;
  orderIndex: number;
}

interface CommentImportResult {
  newCommentsCount: number;
  updatedCommentsCount: number;
  newUserCommentIds: string[];
  // Inserted comments grouped by their threadId (DB id, not external id).
  // The TORI pass reads this to extract tags per-thread without re-querying.
  insertedByThread: Map<string, InsertedCommentMeta[]>;
}

async function importComments(
  input: CommentImportInput
): Promise<CommentImportResult> {
  const { rows, dedup, parents, uploadedById, institutionId, replaceMode } =
    input;

  const newUserCommentIds: string[] = [];
  const insertedByThread = new Map<string, InsertedCommentMeta[]>();
  let newCommentsCount = 0;
  let updatedCommentsCount = 0;

  // De-dup within the CSV itself (same commentId appearing twice in one
  // file) — tracked globally across chunks because a dup might span chunks.
  const insertedExternalIds = new Set<string>();

  for (const rowChunk of chunk(rows, ROW_CHUNK_SIZE)) {
    const { chunkNewCount, chunkUpdatedCount } = await AppDataSource.transaction(
      async (manager: EntityManager) => {
        let chunkNewCount = 0;
        let chunkUpdatedCount = 0;

        // ── Build insert drafts for this chunk ──────────────────────
        interface NewCommentDraft {
          threadId: string;
          studentId: string | null;
          externalId: string;
          role: CommentRole;
          text: string;
          timestamp: Date | null;
          orderIndex: number;
          totalComments: number | null;
          grade: string | null;
        }
        const drafts: NewCommentDraft[] = [];
        // Rows that are dupes and need replace-mode UPDATE handled below.
        const replaceRows: RawCsvRow[] = [];

        for (const row of rowChunk) {
          if (!row.assignmentId || !row.threadId) continue;
          if (!row.commentId) continue;

          if (dedup.existingCommentIds.has(row.commentId)) {
            if (replaceMode) replaceRows.push(row);
            continue;
          }
          if (insertedExternalIds.has(row.commentId)) continue;
          insertedExternalIds.add(row.commentId);

          const threadId = parents.threadIdByExtId.get(row.threadId);
          if (!threadId) {
            throw new Error(
              `Internal: threadId missing for row with externalId ${row.commentId} (thread ${row.threadId})`
            );
          }

          const role = resolveCommentRole(row);
          let studentId: string | null = null;
          if (role === CommentRole.USER && row.authorSystemId?.trim()) {
            studentId =
              parents.studentIdBySystemId.get(row.authorSystemId) ?? null;
          }

          drafts.push({
            threadId,
            studentId,
            externalId: row.commentId,
            role,
            text: decodeEntities(row.commentFullText ?? ""),
            timestamp: parseDateOrNull(row.commentTimestamp),
            orderIndex: parseIntOrNull(row.commentOrder) ?? 0,
            totalComments: parseIntOrNull(row.totalComments),
            grade: row.grade || null,
          });
        }

        // ── Insert in batches of COMMENT_INSERT_BATCH_SIZE ─────────
        for (const batch of chunk(drafts, COMMENT_INSERT_BATCH_SIZE)) {
          const toInsert = batch.map((d) => ({
            threadId: d.threadId,
            studentId: d.studentId,
            externalId: d.externalId,
            role: d.role,
            text: d.text,
            timestamp: d.timestamp,
            orderIndex: d.orderIndex,
            totalComments: d.totalComments,
            grade: d.grade,
            uploadedById,
          }));
          const result = await manager.insert(Comment, toInsert);

          // Sanity check: TypeORM's RETURNING-based insert is supposed to
          // give us the same number of identifiers as input rows, in the
          // same order. If this ever fails the rest of the function would
          // silently associate the wrong ID with the wrong externalId for
          // TORI tagging — better to fail loudly here.
          if (result.identifiers.length !== batch.length) {
            throw new Error(
              `Internal: insert returned ${result.identifiers.length} identifiers for ${batch.length} rows`
            );
          }

          // result.identifiers is same-length, same-order as the input.
          for (let i = 0; i < batch.length; i++) {
            const id = (result.identifiers[i] as { id: string }).id;
            const d = batch[i];
            chunkNewCount++;
            if (d.role === CommentRole.USER) {
              newUserCommentIds.push(id);
            }
            const list = insertedByThread.get(d.threadId) ?? [];
            list.push({
              id,
              externalId: d.externalId,
              role: d.role,
              text: d.text,
              orderIndex: d.orderIndex,
            });
            insertedByThread.set(d.threadId, list);
          }
        }

        // ── Replace-mode updates (one at a time; only runs when the
        //    user has enabled replaceMode, which is the uncommon path) ─
        if (replaceMode && replaceRows.length > 0) {
          for (const row of replaceRows) {
            const existing = await manager
              .createQueryBuilder(Comment, "c")
              .innerJoin("c.thread", "t")
              .innerJoin("t.assignment", "a")
              .innerJoin("a.course", "co")
              .where("co.institutionId = :institutionId", { institutionId })
              .andWhere("c.externalId = :externalId", {
                externalId: row.commentId,
              })
              .getOne();
            if (existing) {
              existing.text = decodeEntities(row.commentFullText ?? "");
              existing.timestamp =
                parseDateOrNull(row.commentTimestamp) ?? existing.timestamp;
              existing.grade = row.grade || existing.grade;
              await manager.save(Comment, existing);
              chunkUpdatedCount++;
            }
          }
        }

        return { chunkNewCount, chunkUpdatedCount };
      }
    );

    newCommentsCount += chunkNewCount;
    updatedCommentsCount += chunkUpdatedCount;
  }

  return {
    newCommentsCount,
    updatedCommentsCount,
    newUserCommentIds,
    insertedByThread,
  };
}

// ── Pass C: importToriTags ────────────────────────────────────────
// After all comments are committed, run TORI extraction per thread
// and batch-insert the resulting CommentToriTag rows.
async function importToriTags(input: {
  insertedByThread: Map<string, InsertedCommentMeta[]>;
}): Promise<number> {
  const { insertedByThread } = input;
  let total = 0;

  for (const [, threadComments] of insertedByThread) {
    if (threadComments.length === 0) continue;
    const associations = await extractToriForThread(threadComments);
    if (associations.length === 0) continue;

    const tagRows = associations.map((assoc) => ({
      commentId: assoc.studentCommentId,
      toriTagId: assoc.toriTagId,
      sourceCommentId: assoc.sourceCommentId,
      extractionMethod: "extracted" as const,
    }));

    for (const tagBatch of chunk(tagRows, TORI_TAG_INSERT_BATCH_SIZE)) {
      // ON CONFLICT DO NOTHING: if a prior run partially inserted tags
      // (e.g. crashed mid-batch before this fix) or if two uploads race
      // on the same (commentId, toriTagId) pair, skip rather than throw.
      // The count returned below may slightly over-report because ignored
      // rows still count as "batched"; this is acceptable for an idempotent
      // safety net. For a new upload with the dedup fix in extractToriForThread,
      // no conflicts should ever fire.
      const result = await AppDataSource.transaction(
        async (manager: EntityManager) => {
          return manager
            .createQueryBuilder()
            .insert()
            .into(CommentToriTag)
            .values(tagBatch)
            .orIgnore()
            .execute();
        }
      );
      total += result.identifiers.length;
    }
  }

  return total;
}
