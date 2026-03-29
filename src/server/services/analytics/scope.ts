import { AppDataSource } from "../../data-source.js";
import { Comment } from "../../entities/Comment.js";
import { Student } from "../../entities/Student.js";
import { StudentConsent, ConsentStatus } from "../../entities/StudentConsent.js";
import { IsNull } from "typeorm";
import type { AnalyticsScope } from "./types.js";

export interface ResolvedScope {
  consentedStudentIds: string[];
  excludedCount: number;
  comments: Array<{
    id: string;
    externalId: string;
    threadId: string;
    studentId: string | null;
    role: string;
    text: string;
    orderIndex: number;
    timestamp: Date | null;
    totalComments: number | null;
    grade: string | null;
  }>;
  threads: Array<{ id: string; assignmentId: string; name: string }>;
}

/**
 * Resolves a scope into filtered student IDs and comments.
 * All analytics modules call this first instead of querying directly.
 */
export async function resolveScope(
  scope: AnalyticsScope
): Promise<ResolvedScope> {
  // 1. Find all students in this institution
  const studentRepo = AppDataSource.getRepository(Student);
  const studentQb = studentRepo
    .createQueryBuilder("s")
    .select(["s.id"])
    .where("s.institutionId = :institutionId", {
      institutionId: scope.institutionId,
    });

  if (scope.studentIds?.length) {
    studentQb.andWhere("s.id IN (:...studentIds)", {
      studentIds: scope.studentIds,
    });
  }

  const allStudents = await studentQb.getMany();
  const allStudentIds = allStudents.map((s) => s.id);

  // 2. Find excluded students
  const consentRepo = AppDataSource.getRepository(StudentConsent);
  const excludedIds = new Set<string>();

  if (allStudentIds.length > 0) {
    // Institution-wide exclusions
    const instExclusions = await consentRepo.find({
      where: {
        institutionId: scope.institutionId,
        courseId: IsNull(),
        status: ConsentStatus.EXCLUDED,
      },
      select: ["studentId"],
    });
    for (const exc of instExclusions) {
      if (allStudentIds.includes(exc.studentId)) {
        excludedIds.add(exc.studentId);
      }
    }

    // Course-level exclusions (if scope has a courseId)
    if (scope.courseId) {
      const courseExclusions = await consentRepo.find({
        where: {
          institutionId: scope.institutionId,
          courseId: scope.courseId,
          status: ConsentStatus.EXCLUDED,
        },
        select: ["studentId"],
      });
      for (const exc of courseExclusions) {
        if (allStudentIds.includes(exc.studentId)) {
          excludedIds.add(exc.studentId);
        }
      }
    }
  }

  const consentedStudentIds = allStudentIds.filter(
    (id) => !excludedIds.has(id)
  );

  // 3. Query comments filtered to scope and consented students
  const commentRepo = AppDataSource.getRepository(Comment);
  const commentQb = commentRepo
    .createQueryBuilder("c")
    .innerJoin("c.thread", "t")
    .innerJoin("t.assignment", "a")
    .innerJoin("a.course", "co")
    .where("co.institutionId = :institutionId", {
      institutionId: scope.institutionId,
    });

  if (scope.courseId) {
    commentQb.andWhere("a.courseId = :courseId", { courseId: scope.courseId });
  }
  if (scope.assignmentId) {
    commentQb.andWhere("t.assignmentId = :assignmentId", {
      assignmentId: scope.assignmentId,
    });
  }

  // Only include comments from consented students (or non-student comments)
  if (consentedStudentIds.length > 0) {
    commentQb.andWhere(
      "(c.studentId IS NULL OR c.studentId IN (:...consentedIds))",
      { consentedIds: consentedStudentIds }
    );
  } else {
    // No consented students — only include non-student comments
    commentQb.andWhere("c.studentId IS NULL");
  }

  const comments = await commentQb
    .select([
      "c.id",
      "c.externalId",
      "c.threadId",
      "c.studentId",
      "c.role",
      "c.text",
      "c.orderIndex",
      "c.timestamp",
      "c.totalComments",
      "c.grade",
    ])
    .getMany();

  // 4. Get unique threads from the comments
  const threadIds = [...new Set(comments.map((c) => c.threadId))];
  let threads: Array<{ id: string; assignmentId: string; name: string }> = [];
  if (threadIds.length > 0) {
    threads = await AppDataSource.createQueryBuilder()
      .select(["t.id", "t.assignmentId", "t.name"])
      .from("thread", "t")
      .where("t.id IN (:...threadIds)", { threadIds })
      .getRawMany()
      .then((rows) =>
        rows.map((r) => ({
          id: r.t_id,
          assignmentId: r.t_assignmentId,
          name: r.t_name,
        }))
      );
  }

  return {
    consentedStudentIds,
    excludedCount: excludedIds.size,
    comments: comments.map((c) => ({
      id: c.id,
      externalId: c.externalId,
      threadId: c.threadId,
      studentId: c.studentId,
      role: c.role,
      text: c.text,
      orderIndex: c.orderIndex,
      timestamp: c.timestamp,
      totalComments: c.totalComments,
      grade: c.grade,
    })),
    threads,
  };
}
