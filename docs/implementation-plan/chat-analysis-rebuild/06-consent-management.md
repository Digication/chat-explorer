# Phase 06 — Student Consent Management

You are building the student consent management system for the **Chat Analysis** app.

**Context:** Phases 01–05 set up the project, Docker environment, database schema, authentication with roles, and CSV upload with TORI extraction. PostgreSQL is running with TypeORM entities including StudentConsent (with two-level consent: institution-wide and course-level), Student, Institution, Course, CourseAccess, and User (with role enum: `instructor`, `institution_admin`, `digication_admin`). The Express server runs with auth middleware (`requireAuth`) and role guard middleware (`requireRole`, `requireInstitutionAccess`).

## Goal

Build a consent management system that:
- Supports two levels of consent exclusion: institution-wide and course-level
- Filters excluded students from all analytics queries
- Enforces role-based permission for who can manage consent
- Maintains a full audit trail of every consent change
- Provides a reusable consent filter function for any query that touches student data
- Supports bulk operations for initial course setup

## How Consent Works

The StudentConsent entity stores exclusion records. The default state is **INCLUDED** — if no consent record exists for a student, they are included in analytics.

**Two levels of exclusion:**

| Level | What it means | StudentConsent record |
|-------|--------------|----------------------|
| Institution-wide | Student excluded from ALL analytics at this institution | `courseId = NULL`, `status = EXCLUDED` |
| Course-level | Student excluded from a specific course only | `courseId = <course-uuid>`, `status = EXCLUDED` |

**Resolution order:**
1. Check for institution-wide exclusion first (`courseId IS NULL AND status = 'EXCLUDED'`)
2. If found, student is excluded from everything — no need to check course-level
3. If not found, check for course-level exclusion (`courseId = <target-course> AND status = 'EXCLUDED'`)
4. If no exclusion record exists at either level, student is **included** (default)

## Steps

### 1. Create the consent service

**Files to create:** `src/server/services/consent.ts`

This service handles all consent operations: reading, writing, filtering, and bulk updates.

```typescript
import { EntityManager, In, IsNull, SelectQueryBuilder } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { StudentConsent, ConsentStatus } from "../entities/StudentConsent.js";
import { CourseAccess } from "../entities/CourseAccess.js";
import { UserRole } from "../entities/User.js";

// -------------------------------------------------------------------
// Permission checks
// -------------------------------------------------------------------

interface AuthUser {
  id: string;
  role: string;
  institutionId: string | null;
}

/**
 * Checks whether a user has permission to manage consent for a given
 * student/course combination.
 *
 * - Instructors: course-level consent only, and only for courses they
 *   have CourseAccess to
 * - Institution admins: institution-wide + course-level for any course
 *   at their institution
 * - Digication admins: everything
 */
async function canManageConsent(
  user: AuthUser,
  studentInstitutionId: string,
  courseId: string | null
): Promise<boolean> {
  // Digication admins can do everything
  if (user.role === UserRole.DIGICATION_ADMIN) return true;

  // Must belong to the same institution
  if (user.institutionId !== studentInstitutionId) return false;

  // Institution admins can manage any consent at their institution
  if (user.role === UserRole.INSTITUTION_ADMIN) return true;

  // Instructors can only manage course-level consent
  if (user.role === UserRole.INSTRUCTOR) {
    // Institution-wide consent is not allowed for instructors
    if (!courseId) return false;

    // Check that the instructor has access to this course
    const accessRepo = AppDataSource.getRepository(CourseAccess);
    const access = await accessRepo.findOne({
      where: { userId: user.id, courseId },
    });
    return !!access;
  }

  return false;
}

// -------------------------------------------------------------------
// Read consent
// -------------------------------------------------------------------

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
 * Returns both institution-wide and course-level records.
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
 * Implements the two-level resolution: institution-wide overrides course-level.
 */
export async function isStudentExcluded(
  studentId: string,
  institutionId: string,
  courseId: string
): Promise<boolean> {
  const repo = AppDataSource.getRepository(StudentConsent);

  // Check institution-wide exclusion first
  const institutionWide = await repo.findOne({
    where: {
      studentId,
      institutionId,
      courseId: IsNull(),
      status: ConsentStatus.EXCLUDED,
    },
  });
  if (institutionWide) return true;

  // Check course-level exclusion
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

// -------------------------------------------------------------------
// Write consent
// -------------------------------------------------------------------

export interface SetConsentInput {
  studentId: string;
  institutionId: string;
  courseId?: string | null; // null or omitted = institution-wide
  status: ConsentStatus;
}

/**
 * Sets the consent status for a student. Creates or updates the
 * StudentConsent record. Records the user who made the change for
 * the audit trail.
 *
 * Throws if the user does not have permission.
 */
export async function setStudentConsent(
  input: SetConsentInput,
  user: AuthUser
): Promise<ConsentRecord> {
  const courseId = input.courseId ?? null;

  // Permission check
  const allowed = await canManageConsent(user, input.institutionId, courseId);
  if (!allowed) {
    throw new Error("You do not have permission to manage this consent record");
  }

  const repo = AppDataSource.getRepository(StudentConsent);

  // Upsert: find existing record for this student + institution + course combo
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

// -------------------------------------------------------------------
// Bulk operations
// -------------------------------------------------------------------

/**
 * Sets consent status for ALL students in a given course.
 * Useful for initial setup (e.g., "exclude all students in this course").
 *
 * Creates or updates a course-level consent record for each student
 * who has comments in the course.
 */
export async function setAllStudentsConsent(
  courseId: string,
  institutionId: string,
  status: ConsentStatus,
  user: AuthUser
): Promise<{ updated: number }> {
  const allowed = await canManageConsent(user, institutionId, courseId);
  if (!allowed) {
    throw new Error("You do not have permission to manage consent for this course");
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
      where: {
        studentId,
        institutionId,
        courseId,
      },
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

// -------------------------------------------------------------------
// Consent-aware query filter (reusable)
// -------------------------------------------------------------------

/**
 * Applies consent filtering to any TypeORM query builder that involves
 * student data. Excludes students who have institution-wide or
 * course-level exclusion records.
 *
 * This function modifies the query in place by adding a NOT EXISTS
 * subquery that checks the StudentConsent table.
 *
 * Usage:
 *   const qb = commentRepo.createQueryBuilder("c")
 *     .innerJoin("c.thread", "t")
 *     .innerJoin("t.assignment", "a")
 *     .where("a.courseId = :courseId", { courseId });
 *
 *   applyConsentFilter(qb, "c.studentId", institutionId, courseId);
 *
 * @param qb - The query builder to modify
 * @param studentIdColumn - The column reference for the student ID
 *   (e.g., "c.studentId" or "student.id")
 * @param institutionId - The institution to check consent for
 * @param courseId - The specific course context (for course-level checks)
 */
export function applyConsentFilter<T>(
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
```

### 2. GraphQL mutations and queries

Add these operations to the GraphQL schema (implemented in a later phase when the GraphQL layer is built, but define the interface now):

**Mutations:**
- `setStudentConsent(studentId: ID!, courseId: ID, status: ConsentStatus!): ConsentRecord` — Set consent for one student. If `courseId` is omitted, sets institution-wide consent.
- `setAllStudentsConsent(courseId: ID!, status: ConsentStatus!): BulkConsentResult` — Set consent for all students in a course.

**Queries:**
- `getStudentConsent(studentId: ID!): [ConsentRecord]` — Get all consent records for a student.

These mutations call the consent service functions, which handle permission checks internally.

### 3. Audit trail

Every consent change is automatically tracked because:
- `updatedById` records which user made the change (FK to User)
- `updatedAt` records when the change was made (auto-updated by TypeORM)
- `createdAt` records when the record was first created

To view the audit trail for a student, query their consent records ordered by `updatedAt`. Each record shows who changed it and when. Since the `status` field is overwritten (not append-only), the current record shows the latest state. If a full history is needed in the future, add a `ConsentAuditLog` entity that appends a row on every change.

### 4. Integration with analytics queries

Every analytics query that returns student-level data must apply the consent filter. The `applyConsentFilter` function makes this easy:

```typescript
// Example: counting comments per student in a course, respecting consent
const qb = commentRepo
  .createQueryBuilder("c")
  .select("c.studentId", "studentId")
  .addSelect("COUNT(*)", "commentCount")
  .innerJoin("c.thread", "t")
  .innerJoin("t.assignment", "a")
  .where("a.courseId = :courseId", { courseId })
  .andWhere("c.studentId IS NOT NULL")
  .groupBy("c.studentId");

// This single call adds the consent exclusion logic
applyConsentFilter(qb, "c.studentId", institutionId, courseId);

const results = await qb.getRawMany();
// Results will NOT include excluded students
```

## Files Summary

| File | Purpose |
|------|---------|
| `src/server/services/consent.ts` | Consent service: read, write, bulk, filter, permission checks |

## Verification

Write a unit test that verifies the consent filtering logic:

```typescript
// Test file: src/server/services/__tests__/consent.test.ts

describe("consent filtering", () => {
  // Setup: create institution, course, and three students (A, B, C)
  // with comments in the course

  it("includes all students when no consent records exist", async () => {
    // Query comments with applyConsentFilter
    // Expected: all three students' comments are returned
  });

  it("excludes student with institution-wide exclusion from all courses", async () => {
    // Create: StudentConsent for student A, courseId=NULL, status=EXCLUDED
    // Query comments with applyConsentFilter
    // Expected: only students B and C are returned
  });

  it("excludes student with course-level exclusion from that course only", async () => {
    // Create: StudentConsent for student B, courseId=course1, status=EXCLUDED
    // Query comments for course1 with applyConsentFilter
    // Expected: only students A and C are returned for course1
    // Query comments for course2 with applyConsentFilter
    // Expected: all three students are returned for course2
  });

  it("institution-wide exclusion overrides course-level inclusion", async () => {
    // Create: StudentConsent for student C, courseId=NULL, status=EXCLUDED
    // Create: StudentConsent for student C, courseId=course1, status=INCLUDED
    // Query comments with applyConsentFilter
    // Expected: student C is still excluded (institution-wide takes priority)
  });

  it("setAllStudentsConsent updates all students in a course", async () => {
    // Call setAllStudentsConsent(course1, EXCLUDED)
    // Expected: all three students have EXCLUDED records for course1
  });

  it("instructors cannot set institution-wide consent", async () => {
    // Call setStudentConsent with courseId=null as an instructor
    // Expected: throws permission error
  });

  it("instructors can only manage consent for courses they have access to", async () => {
    // Call setStudentConsent for a course the instructor does NOT have CourseAccess to
    // Expected: throws permission error
    // Call setStudentConsent for a course the instructor DOES have CourseAccess to
    // Expected: succeeds
  });
});
```

Run the tests:

```bash
docker compose exec app pnpm test -- --testPathPattern="consent"
```

Expected: All consent filtering tests pass. Institution-wide exclusion blocks all analytics. Course-level exclusion blocks only the specified course. No consent record means the student is included. Permission checks enforce the role hierarchy correctly.

## When done

Report: files created/modified (with summary per file), verification results, and any issues encountered.
