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
 * Everything runs inside a single database transaction — if anything
 * fails, nothing is written.
 */
export async function commitUpload(
  filePath: string,
  uploadedById: string,
  institutionId: string,
  originalFilename: string,
  replaceMode = false
): Promise<UploadCommitResult> {
  const rows = await parseCsvFile(filePath);

  // Move the temp file to its permanent location. Keeps the original CSV on
  // disk for debugging and re-processing, but without a second in-memory copy.
  const savedFilePath = await saveUploadedFile(filePath, originalFilename);

  return AppDataSource.transaction(async (manager: EntityManager) => {
    // ── Deduplication ────────────────────────────────────────────
    const threadIds = [
      ...new Set(rows.map((r) => r.threadId).filter(Boolean)),
    ];
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
      institutionId,
      threadIds,
      commentIds,
      studentIds,
      assignmentIds
    );

    // ── Group rows by assignment ─────────────────────────────────
    const rowsByAssignment = new Map<string, RawCsvRow[]>();
    for (const row of rows) {
      if (!row.assignmentId) continue;
      const group = rowsByAssignment.get(row.assignmentId) ?? [];
      group.push(row);
      rowsByAssignment.set(row.assignmentId, group);
    }

    // ── Counters ─────────────────────────────────────────────────
    let newCommentsCount = 0;
    let updatedCommentsCount = 0;
    let newThreadsCount = 0;
    let newStudentsCount = 0;
    let newAssignmentsCount = 0;
    let newCoursesCount = 0;
    let toriTagsExtracted = 0;
    const courseIdsForAccess = new Set<string>();
    // Collected for the post-commit reflection-classification hook.
    const newUserCommentIds: string[] = [];

    // Caches to avoid repeated DB lookups within this transaction
    const studentCache = new Map<string, Student>(); // systemId → Student
    const courseCache = new Map<string, Course>(); // assignmentExternalId → Course
    const assignmentCache = new Map<string, Assignment>(); // externalId → Assignment
    const threadCache = new Map<string, Thread>(); // externalId → Thread

    // ── Process each assignment group ────────────────────────────
    for (const [assignmentExternalId, assignmentRows] of rowsByAssignment) {
      // ── 1. Ensure a Course exists ──────────────────────────────
      const firstRow = assignmentRows[0];
      const csvCourseId = firstRow.courseId?.trim() || null;

      // Cache key: use the CSV course ID if available, otherwise fall back
      // to assignment ID (legacy behavior for CSVs without course data)
      const courseCacheKey = csvCourseId ?? `__assignment__${assignmentExternalId}`;
      let course = courseCache.get(courseCacheKey);

      if (!course) {
        if (csvCourseId) {
          // ── New CSV format: real course data available ──────────
          // Try to find existing course by externalId within this institution
          course =
            (await manager.findOne(Course, {
              where: { externalId: csvCourseId, institutionId },
            })) ?? undefined;

          if (!course) {
            // Create course with full metadata from CSV
            course = await manager.save(Course, {
              institutionId,
              externalId: csvCourseId,
              name: firstRow.courseName || "Untitled Course",
              url: firstRow.courseUrl || null,
              startDate: parseDateOrNull(firstRow.courseStartDate),
              endDate: parseDateOrNull(firstRow.courseEndDate),
              courseNumber: firstRow.courseNumber || null,
              syncId: firstRow.courseSyncId || null,
              faculty: firstRow.courseFaculty || null,
            });
            newCoursesCount++;
          }
        } else {
          // ── Legacy CSV format: no course data — one course per assignment
          const courseName = `${firstRow.assignmentName ?? "Untitled"} — Course`;

          if (!dedup.existingAssignmentIds.has(assignmentExternalId)) {
            course = await manager.save(Course, {
              institutionId,
              name: courseName,
            });
            newCoursesCount++;
          } else {
            const existingAssignment = await manager.findOne(Assignment, {
              where: { externalId: assignmentExternalId },
              relations: { course: true },
            });
            course = existingAssignment?.course as Course | undefined;
            if (!course) {
              course = await manager.save(Course, {
                institutionId,
                name: courseName,
              });
              newCoursesCount++;
            }
          }
        }
        courseCache.set(courseCacheKey, course);
      }
      courseIdsForAccess.add(course.id);

      // ── 2. Ensure the Assignment exists ────────────────────────
      let assignment = assignmentCache.get(assignmentExternalId);
      if (!assignment) {
        if (dedup.existingAssignmentIds.has(assignmentExternalId)) {
          // Already in DB — fetch it
          assignment =
            (await manager.findOne(Assignment, {
              where: { externalId: assignmentExternalId, courseId: course.id },
            })) ?? undefined;
        }
        if (!assignment) {
          const row = assignmentRows[0];
          assignment = await manager.save(Assignment, {
            courseId: course.id,
            externalId: assignmentExternalId,
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
            aiAssistantGenerateAnswers: parseBool(
              row.aiAssistantGenerateAnswers
            ),
            aiAssistantIntendedAudience:
              row.aiAssistantIntendedAudience || null,
          });
          newAssignmentsCount++;
        }
        assignmentCache.set(assignmentExternalId, assignment);
      }

      // ── 3. Group this assignment's rows by thread ──────────────
      const rowsByThread = new Map<string, RawCsvRow[]>();
      for (const row of assignmentRows) {
        if (!row.threadId) continue;
        const group = rowsByThread.get(row.threadId) ?? [];
        group.push(row);
        rowsByThread.set(row.threadId, group);
      }

      // ── 4. Process each thread ─────────────────────────────────
      for (const [threadExternalId, threadRows] of rowsByThread) {
        // Ensure the Thread exists
        let thread = threadCache.get(threadExternalId);
        if (!thread) {
          if (dedup.existingThreadIds.has(threadExternalId)) {
            thread =
              (await manager.findOne(Thread, {
                where: {
                  externalId: threadExternalId,
                  assignmentId: assignment.id,
                },
              })) ?? undefined;
          }
          if (!thread) {
            const firstRow = threadRows[0];
            thread = await manager.save(Thread, {
              assignmentId: assignment.id,
              externalId: threadExternalId,
              name: firstRow.threadName ?? "Untitled Thread",
              totalInputTokens: parseIntOrNull(
                firstRow.threadTotalInputTokens
              ),
              totalOutputTokens: parseIntOrNull(
                firstRow.threadTotalOutputTokens
              ),
              totalCost: parseFloatOrNull(firstRow.threadTotalCost),
              submissionUrl: firstRow.submissionUrl || null,
            });
            newThreadsCount++;
          }
          threadCache.set(threadExternalId, thread);
        }

        // ── 5. Create comments within this thread ────────────────
        // Track new comments for TORI extraction at end of thread
        const newCommentsForTori: Array<{
          id: string;
          externalId: string;
          role: string;
          text: string;
          orderIndex: number;
        }> = [];

        // Track comment IDs we've already inserted in this upload
        // to handle duplicates within the same CSV file
        const insertedCommentIds = new Set<string>();

        for (const row of threadRows) {
          // Handle duplicate comments — skip or update depending on mode
          if (dedup.existingCommentIds.has(row.commentId)) {
            if (replaceMode) {
              // Find the existing comment by joining through the institution,
              // rather than relying on thread.id from the resolution chain
              // (which may point to a newly-created thread if the course/
              // assignment/thread chain didn't resolve correctly).
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
                existing.timestamp = parseDateOrNull(row.commentTimestamp) ?? existing.timestamp;
                existing.grade = row.grade || existing.grade;
                await manager.save(Comment, existing);
                updatedCommentsCount++;
              }
            }
            continue;
          }
          if (insertedCommentIds.has(row.commentId)) continue;
          insertedCommentIds.add(row.commentId);

          // Determine comment role
          const role = resolveCommentRole(row);

          // Ensure student exists (only for USER comments)
          let studentId: string | null = null;
          if (role === CommentRole.USER && row.authorSystemId?.trim()) {
            let student = studentCache.get(row.authorSystemId);
            if (!student) {
              if (dedup.existingStudentSystemIds.has(row.authorSystemId)) {
                student =
                  (await manager.findOne(Student, {
                    where: {
                      systemId: row.authorSystemId,
                      institutionId,
                    },
                  })) ?? undefined;

                // In replace mode, update student info with the cleaner data
                if (student && replaceMode) {
                  student.firstName = row.authorFirstName || student.firstName;
                  student.lastName = row.authorLastName || student.lastName;
                  student.email = row.authorEmail || student.email;
                  await manager.save(Student, student);
                }
              }
              if (!student) {
                student = await manager.save(Student, {
                  institutionId,
                  systemId: row.authorSystemId,
                  syncId: row.authorSyncId || null,
                  firstName: row.authorFirstName || null,
                  lastName: row.authorLastName || null,
                  email: row.authorEmail || null,
                  systemRole: row.authorSystemRole || null,
                  courseRole: row.authorCourseRole || null,
                });
                newStudentsCount++;
              }
              studentCache.set(row.authorSystemId, student);
            }
            studentId = student.id;
          }

          // Create the comment
          const comment = await manager.save(Comment, {
            threadId: thread.id,
            studentId,
            externalId: row.commentId,
            role,
            text: decodeEntities(row.commentFullText ?? ""),
            timestamp: parseDateOrNull(row.commentTimestamp),
            orderIndex: parseIntOrNull(row.commentOrder) ?? 0,
            totalComments: parseIntOrNull(row.totalComments),
            grade: row.grade || null,
            uploadedById,
          });

          newCommentsCount++;
          if (comment.role === CommentRole.USER) {
            newUserCommentIds.push(comment.id);
          }

          newCommentsForTori.push({
            id: comment.id,
            externalId: comment.externalId,
            role: comment.role,
            text: comment.text,
            orderIndex: comment.orderIndex,
          });
        }

        // ── 6. Extract TORI tags for this thread ─────────────────
        if (newCommentsForTori.length > 0) {
          const associations = await extractToriForThread(newCommentsForTori);

          for (const assoc of associations) {
            await manager.save(CommentToriTag, {
              commentId: assoc.studentCommentId,
              toriTagId: assoc.toriTagId,
              sourceCommentId: assoc.sourceCommentId,
              extractionMethod: "extracted",
            });
            toriTagsExtracted++;
          }
        }
      } // end thread loop
    } // end assignment loop

    // ── Create CourseAccess for uploader ──────────────────────────
    for (const courseId of courseIdsForAccess) {
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

    // ── Create UploadLog ─────────────────────────────────────────
    const uploadLog = await manager.save(UploadLog, {
      uploadedById,
      institutionId,
      originalFilename,
      filePath: savedFilePath,
      totalRows: rows.length,
      newComments: newCommentsCount,
      skippedDuplicates: commentIds.length - newCommentsCount,
      newThreads: newThreadsCount,
      newStudents: newStudentsCount,
      newCourses: newCoursesCount,
      newAssignments: newAssignmentsCount,
      toriTagsExtracted,
    });

    return {
      totalRows: rows.length,
      newComments: newCommentsCount,
      duplicateComments: commentIds.length - newCommentsCount,
      newThreads: newThreadsCount,
      newStudents: newStudentsCount,
      newAssignments: newAssignmentsCount,
      newCourses: newCoursesCount,
      detectedInstitutionId: institutionId,
      detectedInstitutionName: null,
      uploadLogId: uploadLog.id,
      toriTagsExtracted,
      courseAccessCreated: courseIdsForAccess.size > 0,
      newUserCommentIds,
      updatedComments: updatedCommentsCount,
    };
  });
}
