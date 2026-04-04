import { AppDataSource } from "../data-source.js";
import { Course } from "../entities/Course.js";
import { Assignment } from "../entities/Assignment.js";
import { Thread } from "../entities/Thread.js";
import { Comment } from "../entities/Comment.js";
import { Student } from "../entities/Student.js";
import { CourseAccess } from "../entities/CourseAccess.js";
import { CommentToriTag } from "../entities/CommentToriTag.js";
import { ToriTag } from "../entities/ToriTag.js";
import { UserRole } from "../entities/User.js";
import { In } from "typeorm";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth, requireCourseAccess } from "./middleware/auth.js";

export const courseResolvers = {
  Query: {
    courses: async (
      _: unknown,
      { institutionId }: { institutionId?: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const courseRepo = AppDataSource.getRepository(Course);

      if (user.role === UserRole.DIGICATION_ADMIN) {
        const where = institutionId ? { institutionId } : {};
        return courseRepo.find({ where, order: { name: "ASC" } });
      }

      if (user.role === UserRole.INSTITUTION_ADMIN) {
        return courseRepo.find({
          where: { institutionId: user.institutionId! },
          order: { name: "ASC" },
        });
      }

      // Instructors: only courses they have access to
      const accessRepo = AppDataSource.getRepository(CourseAccess);
      const accesses = await accessRepo.find({
        where: { userId: user.id },
        select: ["courseId"],
      });
      const ids = accesses.map((a) => a.courseId);
      if (ids.length === 0) return [];
      return courseRepo.find({
        where: { id: In(ids) },
        order: { name: "ASC" },
      });
    },

    course: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      await requireCourseAccess(ctx, id);
      const repo = AppDataSource.getRepository(Course);
      return repo.findOne({ where: { id } });
    },

    assignments: async (
      _: unknown,
      { courseId }: { courseId: string },
      ctx: GraphQLContext
    ) => {
      await requireCourseAccess(ctx, courseId);
      const repo = AppDataSource.getRepository(Assignment);
      return repo.find({ where: { courseId }, order: { name: "ASC" } });
    },

    assignment: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      const repo = AppDataSource.getRepository(Assignment);
      const assignment = await repo.findOne({ where: { id } });
      if (!assignment) return null;
      await requireCourseAccess(ctx, assignment.courseId);
      return assignment;
    },

    thread: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      const repo = AppDataSource.getRepository(Thread);
      const thread = await repo.findOne({ where: { id } });
      if (!thread) return null;

      // Verify user has access to the course this thread belongs to
      const assignmentRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignmentRepo.findOne({ where: { id: thread.assignmentId } });
      if (!assignment) return null; // orphaned thread — treat as not found
      await requireCourseAccess(ctx, assignment.courseId);

      return thread;
    },
  },

  Course: {
    assignments: async (parent: Course) => {
      const repo = AppDataSource.getRepository(Assignment);
      return repo.find({ where: { courseId: parent.id }, order: { name: "ASC" } });
    },
    studentCount: async (parent: Course) => {
      // Count distinct students with comments in this course
      const result = await AppDataSource.createQueryBuilder()
        .select("COUNT(DISTINCT comment.studentId)", "count")
        .from("comment", "comment")
        .innerJoin("thread", "t", "t.id = comment.threadId")
        .innerJoin("assignment", "a", "a.id = t.assignmentId")
        .where("a.courseId = :courseId", { courseId: parent.id })
        .andWhere("comment.studentId IS NOT NULL")
        .getRawOne();
      return parseInt(result?.count ?? "0", 10);
    },
  },

  Assignment: {
    threadCount: async (parent: Assignment) => {
      const repo = AppDataSource.getRepository(Thread);
      return repo.count({ where: { assignmentId: parent.id } });
    },
    commentCount: async (parent: Assignment) => {
      const result = await AppDataSource.createQueryBuilder()
        .select("COUNT(*)", "count")
        .from("comment", "comment")
        .innerJoin("thread", "t", "t.id = comment.threadId")
        .where("t.assignmentId = :assignmentId", { assignmentId: parent.id })
        .getRawOne();
      return parseInt(result?.count ?? "0", 10);
    },
    threads: async (
      parent: Assignment,
      { limit, offset }: { limit?: number; offset?: number }
    ) => {
      const repo = AppDataSource.getRepository(Thread);
      return repo.find({
        where: { assignmentId: parent.id },
        order: { name: "ASC" },
        take: limit ?? 50,
        skip: offset ?? 0,
      });
    },
  },

  Thread: {
    comments: async (parent: Thread) => {
      const repo = AppDataSource.getRepository(Comment);
      return repo.find({
        where: { threadId: parent.id },
        order: { orderIndex: "ASC" },
      });
    },
    commentCount: async (parent: Thread) => {
      const repo = AppDataSource.getRepository(Comment);
      return repo.count({ where: { threadId: parent.id } });
    },
  },

  Comment: {
    timestamp: (parent: Comment) => {
      // Serialize the Date as an ISO string for the GraphQL String type
      return parent.timestamp ? parent.timestamp.toISOString() : null;
    },
    wordCount: (parent: Comment) => {
      return parent.text.trim().split(/\s+/).filter(Boolean).length;
    },
    student: async (parent: Comment) => {
      if (!parent.studentId) return null;
      const repo = AppDataSource.getRepository(Student);
      return repo.findOne({ where: { id: parent.studentId } });
    },
    toriTags: async (parent: Comment) => {
      const cttRepo = AppDataSource.getRepository(CommentToriTag);
      const associations = await cttRepo.find({
        where: { commentId: parent.id },
        select: ["toriTagId"],
      });
      if (associations.length === 0) return [];
      const tagRepo = AppDataSource.getRepository(ToriTag);
      return tagRepo.find({
        where: { id: In(associations.map((a) => a.toriTagId)) },
      });
    },
  },

  Student: {
    displayName: (parent: Student) => {
      if (parent.firstName && parent.lastName) {
        return `${parent.firstName} ${parent.lastName}`;
      }
      return parent.systemId;
    },
  },
};
