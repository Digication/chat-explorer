import { IsNull, type SelectQueryBuilder } from "typeorm";
import { AppDataSource } from "../data-source.js";
import {
  StudentConsent,
  ConsentStatus,
} from "../entities/StudentConsent.js";
import { CourseAccess } from "../entities/CourseAccess.js";
import { UserRole } from "../entities/User.js";

// ── Permission checks ────────────────────────────────────────────

interface AuthUser {
  id: string;
  role: string;
  institutionId: string | null;
}

/**
 * Checks whether a user has permission to manage consent for a given
 * student/course combination.
 *
 * - Instructors: course-level consent only, for courses they have access to
 * - Institution admins: institution-wide + course-level at their institution
 * - Digication admins: everything
 */
async function canManageConsent(
  user: AuthUser,
  studentInstitutionId: string,
  courseId: string | null
): Promise<boolean> {
  if (user.role === UserRole.DIGICATION_ADMIN) return true;
  if (user.institutionId !== studentInstitutionId) return false;
  if (user.role === UserRole.INSTITUTION_ADMIN) return true;

  if (user.role === UserRole.INSTRUCTOR) {
    // Instructors cannot set institution-wide consent
    if (!courseId) return false;

    const accessRepo = AppDataSource.getRepository(CourseAccess);
    const access = await accessRepo.findOne({
      where: { userId: user.id, courseId },
    });
    return !!access;
  }

  return false;
}

// ── Read consent ─────────────────────────────────────────────────

export interface ConsentRecord {
  studentId: string;
  institutionId: string;
  courseId: string | null;
  status: ConsentStatus;
  updatedById: string;
  updatedAt: Date;
}

/**
 * Gets all consent records for a student at a given institution.
 */
export async function getStudentConsent(
  studentId: string,
  institutionId: string
): Promise<ConsentRecord[]> {
  const repo = AppDataSource.getRepository(StudentConsent);
  const records = await repo.find({
    where: { studentId, institutionId },
    order: { createdAt: "ASC" },
  });
  return records.map((r) => ({
    studentId: r.studentId,
    institutionId: r.institutionId,
    courseId: r.courseId,
    status: r.status,
    updatedById: r.updatedById,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Checks whether a specific student is excluded for a specific course.
 * Institution-wide exclusion overrides course-level.
 */
export async function isStudentExcluded(
  studentId: string,
  institutionId: string,
  courseId: string
): Promise<boolean> {
  const repo = AppDataSource.getRepository(StudentConsent);

  // Institution-wide exclusion takes priority
  const institutionWide = await repo.findOne({
    where: {
      studentId,
      institutionId,
      courseId: IsNull(),
      status: ConsentStatus.EXCLUDED,
    },
  });
  if (institutionWide) return true;

  // Course-level exclusion
  const courseLevel = await repo.findOne({
    where: {
      studentId,
      institutionId,
      courseId,
      status: ConsentStatus.EXCLUDED,
    },
  });
  return !!courseLevel;
}

// ── Write consent ────────────────────────────────────────────────

export interface SetConsentInput {
  studentId: string;
  institutionId: string;
  courseId?: string | null; // null or omitted = institution-wide
  status: ConsentStatus;
}

/**
 * Sets the consent status for a student. Creates or updates the record.
 * Throws if the user does not have permission.
 */
export async function setStudentConsent(
  input: SetConsentInput,
  user: AuthUser
): Promise<ConsentRecord> {
  const courseId = input.courseId ?? null;

  const allowed = await canManageConsent(user, input.institutionId, courseId);
  if (!allowed) {
    throw new Error(
      "You do not have permission to manage this consent record"
    );
  }

  const repo = AppDataSource.getRepository(StudentConsent);

  // Upsert: find existing record for this student + institution + course
  let record = await repo.findOne({
    where: {
      studentId: input.studentId,
      institutionId: input.institutionId,
      courseId: courseId ?? IsNull(),
    },
  });

  if (record) {
    record.status = input.status;
    record.updatedById = user.id;
  } else {
    record = repo.create({
      studentId: input.studentId,
      institutionId: input.institutionId,
      courseId,
      status: input.status,
      updatedById: user.id,
    });
  }

  const saved = await repo.save(record);

  return {
    studentId: saved.studentId,
    institutionId: saved.institutionId,
    courseId: saved.courseId,
    status: saved.status,
    updatedById: saved.updatedById,
    updatedAt: saved.updatedAt,
  };
}

// ── Bulk operations ──────────────────────────────────────────────

/**
 * Sets consent status for ALL students in a given course.
 * Useful for initial setup (e.g. "exclude all students in this course").
 */
export async function setAllStudentsConsent(
  courseId: string,
  institutionId: string,
  status: ConsentStatus,
  user: AuthUser
): Promise<{ updated: number }> {
  const allowed = await canManageConsent(user, institutionId, courseId);
  if (!allowed) {
    throw new Error(
      "You do not have permission to manage consent for this course"
    );
  }

  // Find all students who have comments in this course
  const studentIds: { studentId: string }[] = await AppDataSource
    .createQueryBuilder()
    .select("DISTINCT comment.studentId", "studentId")
    .from("comment", "comment")
    .innerJoin("thread", "t", "t.id = comment.threadId")
    .innerJoin("assignment", "a", "a.id = t.assignmentId")
    .where("a.courseId = :courseId", { courseId })
    .andWhere("comment.studentId IS NOT NULL")
    .getRawMany();

  const repo = AppDataSource.getRepository(StudentConsent);
  let updated = 0;

  for (const { studentId } of studentIds) {
    let record = await repo.findOne({
      where: { studentId, institutionId, courseId },
    });

    if (record) {
      record.status = status;
      record.updatedById = user.id;
    } else {
      record = repo.create({
        studentId,
        institutionId,
        courseId,
        status,
        updatedById: user.id,
      });
    }

    await repo.save(record);
    updated++;
  }

  return { updated };
}

// ── Consent-aware query filter (reusable) ────────────────────────

/**
 * Applies consent filtering to any TypeORM query builder that involves
 * student data. Excludes students who have institution-wide or
 * course-level exclusion records.
 *
 * Usage:
 *   const qb = commentRepo.createQueryBuilder("c")
 *     .innerJoin("c.thread", "t")
 *     .innerJoin("t.assignment", "a")
 *     .where("a.courseId = :courseId", { courseId });
 *
 *   applyConsentFilter(qb, "c.studentId", institutionId, courseId);
 */
export function applyConsentFilter<T extends import("typeorm").ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  studentIdColumn: string,
  institutionId: string,
  courseId: string
): SelectQueryBuilder<T> {
  // Exclude students with institution-wide exclusion
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM student_consent sc_inst
      WHERE sc_inst."studentId" = ${studentIdColumn}
        AND sc_inst."institutionId" = :consentInstitutionId
        AND sc_inst."courseId" IS NULL
        AND sc_inst."status" = :excludedStatus
    )`,
    {
      consentInstitutionId: institutionId,
      excludedStatus: ConsentStatus.EXCLUDED,
    }
  );

  // Exclude students with course-level exclusion for this specific course
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM student_consent sc_course
      WHERE sc_course."studentId" = ${studentIdColumn}
        AND sc_course."institutionId" = :consentInstitutionId
        AND sc_course."courseId" = :consentCourseId
        AND sc_course."status" = :excludedStatus
    )`,
    {
      consentCourseId: courseId,
    }
  );

  return qb;
}
