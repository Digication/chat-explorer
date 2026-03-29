import { GraphQLError } from "graphql";
import { AppDataSource } from "../data-source.js";
import { User, UserRole } from "../entities/User.js";
import { CourseAccess, AccessLevel } from "../entities/CourseAccess.js";
import { Course } from "../entities/Course.js";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth, requireRole, requireCourseAccess } from "./middleware/auth.js";

export const adminResolvers = {
  Query: {
    users: async (
      _: unknown,
      { institutionId }: { institutionId?: string },
      ctx: GraphQLContext
    ) => {
      const user = requireRole(ctx, [
        UserRole.INSTITUTION_ADMIN,
        UserRole.DIGICATION_ADMIN,
      ]);

      const repo = AppDataSource.getRepository(User);

      if (user.role === UserRole.DIGICATION_ADMIN) {
        const where = institutionId ? { institutionId } : {};
        return repo.find({ where, order: { name: "ASC" } });
      }

      // Institution admin sees users in their institution
      return repo.find({
        where: { institutionId: user.institutionId! },
        order: { name: "ASC" },
      });
    },

    courseAccessList: async (
      _: unknown,
      { courseId }: { courseId: string },
      ctx: GraphQLContext
    ) => {
      await requireCourseAccess(ctx, courseId);
      const repo = AppDataSource.getRepository(CourseAccess);
      return repo.find({
        where: { courseId },
        relations: { user: true },
        order: { grantedAt: "ASC" },
      });
    },
  },

  Mutation: {
    assignRole: async (
      _: unknown,
      { userId, role }: { userId: string; role: UserRole },
      ctx: GraphQLContext
    ) => {
      const currentUser = requireRole(ctx, [
        UserRole.INSTITUTION_ADMIN,
        UserRole.DIGICATION_ADMIN,
      ]);

      const repo = AppDataSource.getRepository(User);
      const targetUser = await repo.findOne({ where: { id: userId } });
      if (!targetUser) {
        throw new GraphQLError("User not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Institution admins can only assign roles within their institution
      // and cannot assign digication_admin
      if (currentUser.role === UserRole.INSTITUTION_ADMIN) {
        if (targetUser.institutionId !== currentUser.institutionId) {
          throw new GraphQLError(
            "Cannot modify users outside your institution",
            { extensions: { code: "FORBIDDEN" } }
          );
        }
        if (role === UserRole.DIGICATION_ADMIN) {
          throw new GraphQLError(
            "Only Digication admins can assign the digication_admin role",
            { extensions: { code: "FORBIDDEN" } }
          );
        }
      }

      targetUser.role = role;
      return repo.save(targetUser);
    },

    grantCourseAccess: async (
      _: unknown,
      {
        userId,
        courseId,
        accessLevel,
      }: { userId: string; courseId: string; accessLevel: AccessLevel },
      ctx: GraphQLContext
    ) => {
      const currentUser = requireRole(ctx, [
        UserRole.INSTITUTION_ADMIN,
        UserRole.DIGICATION_ADMIN,
      ]);

      // Verify the course exists and is in the admin's institution
      const courseRepo = AppDataSource.getRepository(Course);
      const course = await courseRepo.findOne({ where: { id: courseId } });
      if (!course) {
        throw new GraphQLError("Course not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (
        currentUser.role === UserRole.INSTITUTION_ADMIN &&
        course.institutionId !== currentUser.institutionId
      ) {
        throw new GraphQLError("Course is not in your institution", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const repo = AppDataSource.getRepository(CourseAccess);
      const existing = await repo.findOne({
        where: { userId, courseId },
      });

      if (existing) {
        existing.accessLevel = accessLevel;
        return repo.save(existing);
      }

      return repo.save(
        repo.create({
          userId,
          courseId,
          accessLevel,
          grantedById: currentUser.id,
        })
      );
    },

    revokeCourseAccess: async (
      _: unknown,
      { userId, courseId }: { userId: string; courseId: string },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, [
        UserRole.INSTITUTION_ADMIN,
        UserRole.DIGICATION_ADMIN,
      ]);

      const repo = AppDataSource.getRepository(CourseAccess);
      const access = await repo.findOne({ where: { userId, courseId } });
      if (!access) return false;
      await repo.remove(access);
      return true;
    },
  },
};
