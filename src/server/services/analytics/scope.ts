import { AppDataSource } from "../../data-source.js";
import { Comment } from "../../entities/Comment.js";
import { StudentConsent, ConsentStatus } from "../../entities/StudentConsent.js";
import { In, IsNull } from "typeorm";
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
 *
 * `consentedStudentIds` is the set of students who actually have at least
 * one comment in this scope AND have not been excluded by consent. It is
 * NOT the institution-wide student roster — earlier versions returned that
 * broader set, which caused students from other courses to leak into per-
 * course analytics (heatmap rows, percentages, etc.).
 */
export async function resolveScope(
  scope: AnalyticsScope
): Promise<ResolvedScope> {
  // 1. Query comments filtered to scope (institution + optional course/assignment).
  //    We do this FIRST so we know which students actually participated.
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
  if (scope.studentIds?.length) {
    commentQb.andWhere(
      "(c.studentId IS NULL OR c.studentId IN (:...studentIds))",
      { studentIds: scope.studentIds }
    );
  }

  const allComments = await commentQb
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

  // 2. Extract the set of students who actually participated in this scope.
  const participatingStudentIds = Array.from(
    new Set(
      allComments
        .map((c) => c.studentId)
        .filter((id): id is string => id !== null)
    )
  );

  // 3. Apply consent exclusions, but only against students who actually
  //    participated. A student excluded in an unrelated course shouldn't
  //    inflate this scope's "excluded count".
  const excludedIds = new Set<string>();

  if (participatingStudentIds.length > 0) {
    const consentRepo = AppDataSource.getRepository(StudentConsent);

    // Institution-wide exclusions
    const instExclusions = await consentRepo.find({
      where: {
        studentId: In(participatingStudentIds),
        institutionId: scope.institutionId,
        courseId: IsNull(),
        status: ConsentStatus.EXCLUDED,
      },
      select: ["studentId"],
    });
    for (const exc of instExclusions) excludedIds.add(exc.studentId);

    // Course-level exclusions (only when scoped to a course)
    if (scope.courseId) {
      const courseExclusions = await consentRepo.find({
        where: {
          studentId: In(participatingStudentIds),
          institutionId: scope.institutionId,
          courseId: scope.courseId,
          status: ConsentStatus.EXCLUDED,
        },
        select: ["studentId"],
      });
      for (const exc of courseExclusions) excludedIds.add(exc.studentId);
    }
  }

  const consentedStudentIds = participatingStudentIds.filter(
    (id) => !excludedIds.has(id)
  );

  // 4. Filter comments to consented-or-non-student rows.
  const consentedSet = new Set(consentedStudentIds);
  const comments = allComments.filter(
    (c) => c.studentId === null || consentedSet.has(c.studentId)
  );

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
