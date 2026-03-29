import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Thread } from "../entities/Thread.js";
import { Comment } from "../entities/Comment.js";
import { Student } from "../entities/Student.js";
import { Assignment } from "../entities/Assignment.js";

export interface DedupResult {
  existingThreadIds: Set<string>;
  existingCommentIds: Set<string>;
  existingStudentSystemIds: Set<string>;
  existingAssignmentIds: Set<string>;
}

export async function checkDuplicates(
  institutionId: string,
  threadExternalIds: string[],
  commentExternalIds: string[],
  studentSystemIds: string[],
  assignmentExternalIds: string[]
): Promise<DedupResult> {
  const threadRepo = AppDataSource.getRepository(Thread);
  const commentRepo = AppDataSource.getRepository(Comment);
  const studentRepo = AppDataSource.getRepository(Student);
  const assignmentRepo = AppDataSource.getRepository(Assignment);

  const none = ["__none__"];

  const [existingThreads, existingComments, existingStudents, existingAssignments] =
    await Promise.all([
      threadRepo
        .createQueryBuilder("t")
        .select("t.externalId")
        .innerJoin("t.assignment", "a")
        .innerJoin("a.course", "c")
        .where("c.institutionId = :institutionId", { institutionId })
        .andWhere("t.externalId IN (:...ids)", {
          ids: threadExternalIds.length ? threadExternalIds : none,
        })
        .getMany(),
      commentRepo
        .createQueryBuilder("cm")
        .select("cm.externalId")
        .innerJoin("cm.thread", "t")
        .innerJoin("t.assignment", "a")
        .innerJoin("a.course", "co")
        .where("co.institutionId = :institutionId", { institutionId })
        .andWhere("cm.externalId IN (:...ids)", {
          ids: commentExternalIds.length ? commentExternalIds : none,
        })
        .getMany(),
      studentRepo.find({
        where: {
          institutionId,
          systemId: In(studentSystemIds.length ? studentSystemIds : none),
        },
        select: ["systemId"],
      }),
      assignmentRepo
        .createQueryBuilder("a")
        .select("a.externalId")
        .innerJoin("a.course", "c")
        .where("c.institutionId = :institutionId", { institutionId })
        .andWhere("a.externalId IN (:...ids)", {
          ids: assignmentExternalIds.length ? assignmentExternalIds : none,
        })
        .getMany(),
    ]);

  return {
    existingThreadIds: new Set(existingThreads.map((t) => t.externalId)),
    existingCommentIds: new Set(existingComments.map((c) => c.externalId)),
    existingStudentSystemIds: new Set(existingStudents.map((s) => s.systemId)),
    existingAssignmentIds: new Set(existingAssignments.map((a) => a.externalId)),
  };
}
