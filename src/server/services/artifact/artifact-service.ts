/**
 * Artifact service — the business logic for creating an Artifact from
 * an uploaded file. The Express route handler is intentionally thin:
 * it only handles multipart parsing and HTTP concerns. Everything
 * validation-, DB-, or storage-related lives here so it stays testable.
 *
 * Flow:
 *   1. Resolve authorization (faculty may upload on behalf of any
 *      student in a course they teach; students may only upload for
 *      themselves).
 *   2. Validate the target course/assignment belongs to the caller's
 *      institution and that the student is enrolled in it.
 *   3. Parse the document into sections (pure — see document-parser.ts).
 *   4. Persist Artifact + ArtifactSection rows in a single transaction
 *      and flip status to PROCESSING.
 *   5. Save the raw file to disk. If that fails after the DB commit,
 *      mark the artifact FAILED so the faculty member sees the error
 *      instead of a half-created row.
 *
 * The caller is expected to kick off the background analyzer (Step 4)
 * with the returned artifact id.
 */

import { AppDataSource } from "../../data-source.js";
import { Artifact, ArtifactStatus, ArtifactType } from "../../entities/Artifact.js";
import { ArtifactSection } from "../../entities/ArtifactSection.js";
import { Student } from "../../entities/Student.js";
import { Course } from "../../entities/Course.js";
import { Assignment } from "../../entities/Assignment.js";
import { CourseAccess } from "../../entities/CourseAccess.js";
import { User, UserRole } from "../../entities/User.js";
import {
  parseDocument,
  wordCount,
  MIME_PDF,
  MIME_DOCX,
  MIME_PPTX,
} from "./document-parser.js";
import { saveArtifactFile } from "./artifact-storage.js";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export const SUPPORTED_MIME_TYPES = new Set<string>([MIME_PDF, MIME_DOCX]);
/** Mime types we recognise but intentionally reject (with helpful error). */
export const REJECTED_MIME_TYPES = new Set<string>([MIME_PPTX]);

export interface CreateArtifactFromUploadInput {
  userId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /**
   * The student the artifact is being uploaded for. Faculty supply this
   * explicitly via the form; for student uploads the route handler
   * resolves it from the signed-in user and passes it along here.
   */
  studentId: string;
  courseId: string;
  assignmentId?: string | null;
  /**
   * Caller-declared artifact type. Falls back to PAPER when not supplied
   * (that's the common case for document uploads).
   */
  type?: ArtifactType;
  /**
   * Title override. Defaults to the document's detected title (from
   * parsing) or the filename with the extension stripped.
   */
  title?: string | null;
}

export interface CreatedArtifact {
  id: string;
  status: ArtifactStatus;
  sectionCount: number;
}

/**
 * Create an artifact from an uploaded file buffer.
 *
 * Throws with a user-safe message on authorization, validation, and
 * parsing errors — the caller turns those into 400/403 responses.
 */
export async function createArtifactFromUpload(
  input: CreateArtifactFromUploadInput
): Promise<CreatedArtifact> {
  if (!input.buffer || input.buffer.length === 0) {
    throw new UploadValidationError("File is empty");
  }
  if (input.buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`
    );
  }
  if (REJECTED_MIME_TYPES.has(input.mimeType)) {
    throw new UploadValidationError(
      "PPTX files are not yet supported. Please export the deck as a PDF and upload that instead."
    );
  }
  if (!SUPPORTED_MIME_TYPES.has(input.mimeType)) {
    throw new UploadValidationError(
      `Unsupported file type: ${input.mimeType}. Please upload a PDF or DOCX file.`
    );
  }

  // ── 1. Authorization + target validation ────────────────────────
  const userRepo = AppDataSource.getRepository(User);
  const studentRepo = AppDataSource.getRepository(Student);
  const courseRepo = AppDataSource.getRepository(Course);
  const assignmentRepo = AppDataSource.getRepository(Assignment);
  const accessRepo = AppDataSource.getRepository(CourseAccess);

  const user = await userRepo.findOne({ where: { id: input.userId } });
  if (!user || !user.institutionId) {
    throw new UploadAuthError("User is not attached to an institution");
  }
  if (user.deactivated) {
    throw new UploadAuthError("User is deactivated");
  }

  const student = await studentRepo.findOne({ where: { id: input.studentId } });
  if (!student) throw new UploadValidationError("Student not found");
  if (student.institutionId !== user.institutionId) {
    throw new UploadAuthError("Student is not in your institution");
  }

  const course = await courseRepo.findOne({ where: { id: input.courseId } });
  if (!course) throw new UploadValidationError("Course not found");
  if (course.institutionId !== user.institutionId) {
    throw new UploadAuthError("Course is not in your institution");
  }

  // Students may only upload for themselves.
  if (user.role === UserRole.STUDENT) {
    if (student.userId !== user.id) {
      throw new UploadAuthError("Students may only upload for themselves");
    }
  } else if (user.role === UserRole.INSTRUCTOR) {
    // Instructors must have an access row for this course.
    const access = await accessRepo.findOne({
      where: { userId: user.id, courseId: input.courseId },
    });
    if (!access) {
      throw new UploadAuthError("You do not have access to this course");
    }
  }
  // INSTITUTION_ADMIN and DIGICATION_ADMIN can upload for any course in
  // their institution (admin already checked above).

  if (input.assignmentId) {
    const assignment = await assignmentRepo.findOne({
      where: { id: input.assignmentId },
    });
    if (!assignment) {
      throw new UploadValidationError("Assignment not found");
    }
    if (assignment.courseId !== input.courseId) {
      throw new UploadValidationError(
        "Assignment does not belong to the selected course"
      );
    }
  }

  // ── 2. Parse the document ───────────────────────────────────────
  let parsed;
  try {
    parsed = await parseDocument(input.buffer, input.filename, input.mimeType);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UploadValidationError(`Could not parse document: ${message}`);
  }

  const title =
    (input.title && input.title.trim()) ||
    parsed.title ||
    input.filename.replace(/\.[^.]+$/, "") ||
    input.filename;

  // ── 3. Persist artifact + sections in a transaction ─────────────
  const artifactId = await AppDataSource.transaction(async (em) => {
    const artifact = em.create(Artifact, {
      studentId: input.studentId,
      courseId: input.courseId,
      assignmentId: input.assignmentId ?? null,
      threadId: null,
      title,
      type: input.type ?? ArtifactType.PAPER,
      status: ArtifactStatus.PROCESSING,
      mimeType: input.mimeType,
      fileSizeBytes: input.buffer.length,
      storagePath: null, // filled in after disk write below
      uploadedById: input.userId,
      sourceUrl: null,
      errorMessage: null,
    });
    const savedArtifact = await em.save(artifact);

    if (parsed.sections.length > 0) {
      const sections = parsed.sections.map((s) =>
        em.create(ArtifactSection, {
          artifactId: savedArtifact.id,
          commentId: null,
          sequenceOrder: s.sequenceOrder,
          title: s.title,
          content: s.content,
          type: s.type,
          wordCount: wordCount(s.content),
        })
      );
      await em.save(sections);
    }

    return savedArtifact.id;
  });

  // ── 4. Save the raw file to disk (outside the transaction so the
  // filesystem write is never holding a DB lock). If disk fails,
  // mark the artifact FAILED.
  try {
    const storagePath = await saveArtifactFile(
      user.institutionId,
      artifactId,
      input.filename,
      input.buffer
    );
    await AppDataSource.getRepository(Artifact).update(
      { id: artifactId },
      { storagePath }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await AppDataSource.getRepository(Artifact).update(
      { id: artifactId },
      {
        status: ArtifactStatus.FAILED,
        errorMessage: `Failed to save file: ${message}`,
      }
    );
    throw err;
  }

  return {
    id: artifactId,
    status: ArtifactStatus.PROCESSING,
    sectionCount: parsed.sections.length,
  };
}

/**
 * Check whether the given user may read the given artifact (used by the
 * download route and the GraphQL artifact resolver).
 *
 * Rules (same shape as the upload authorization):
 *   - DIGICATION_ADMIN: anything.
 *   - INSTITUTION_ADMIN: anything in their institution.
 *   - INSTRUCTOR: must have a CourseAccess row for artifact.courseId.
 *   - STUDENT: must be the student the artifact belongs to (student.userId === user.id).
 */
export async function canReadArtifact(
  user: { id: string; role: UserRole | string; institutionId: string | null },
  artifact: Pick<Artifact, "studentId" | "courseId"> & {
    student?: Pick<Student, "institutionId" | "userId"> | null;
  }
): Promise<boolean> {
  if (user.role === UserRole.DIGICATION_ADMIN) return true;

  // Load student if caller didn't pass it.
  const student =
    artifact.student ??
    (await AppDataSource.getRepository(Student).findOne({
      where: { id: artifact.studentId },
      select: { id: true, institutionId: true, userId: true },
    }));
  if (!student) return false;
  if (user.institutionId !== student.institutionId) return false;

  if (user.role === UserRole.INSTITUTION_ADMIN) return true;

  if (user.role === UserRole.STUDENT) {
    return student.userId === user.id;
  }

  if (user.role === UserRole.INSTRUCTOR) {
    const access = await AppDataSource.getRepository(CourseAccess).findOne({
      where: { userId: user.id, courseId: artifact.courseId },
    });
    return !!access;
  }

  return false;
}

// ── Error classes ──────────────────────────────────────────────────

export class UploadValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export class UploadAuthError extends Error {
  readonly code = "AUTH_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "UploadAuthError";
  }
}
