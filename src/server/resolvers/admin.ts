import { GraphQLError } from "graphql";
import { ILike, type FindOptionsWhere } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { User, UserRole } from "../entities/User.js";
import { Institution } from "../entities/Institution.js";
import { CourseAccess, AccessLevel } from "../entities/CourseAccess.js";
import { Course } from "../entities/Course.js";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth, requireRole, requireCourseAccess } from "./middleware/auth.js";
import { sendInvitationEmail, notifyAdminOfBlockedSignIn } from "../auth.js";

export const adminResolvers = {
  Query: {
    users: async (
      _: unknown,
      { institutionId, search }: { institutionId?: string; search?: string },
      ctx: GraphQLContext
    ) => {
      const user = requireRole(ctx, [
        UserRole.INSTITUTION_ADMIN,
        UserRole.DIGICATION_ADMIN,
      ]);

      const repo = AppDataSource.getRepository(User);

      // Build base where clause
      const base: FindOptionsWhere<User> = {};
      if (user.role === UserRole.INSTITUTION_ADMIN) {
        base.institutionId = user.institutionId!;
      } else if (institutionId) {
        base.institutionId = institutionId;
      }

      // Apply search filter (case-insensitive on name or email)
      let where: FindOptionsWhere<User> | FindOptionsWhere<User>[];
      if (search) {
        where = [
          { ...base, name: ILike(`%${search}%`) },
          { ...base, email: ILike(`%${search}%`) },
        ];
      } else {
        where = base;
      }

      return repo.find({ where, order: { name: "ASC" } });
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
    inviteUser: async (
      _: unknown,
      {
        email,
        name,
        institutionId,
        role,
      }: {
        email: string;
        name: string;
        institutionId: string;
        role: UserRole;
      },
      ctx: GraphQLContext
    ) => {
      const currentUser = requireRole(ctx, [
        UserRole.INSTITUTION_ADMIN,
        UserRole.DIGICATION_ADMIN,
      ]);

      // Institution admins can only invite to their own institution
      if (
        currentUser.role === UserRole.INSTITUTION_ADMIN &&
        institutionId !== currentUser.institutionId
      ) {
        throw new GraphQLError(
          "Cannot invite users to a different institution",
          { extensions: { code: "FORBIDDEN" } }
        );
      }

      // Institution admins cannot create digication_admin users
      if (
        currentUser.role === UserRole.INSTITUTION_ADMIN &&
        role === UserRole.DIGICATION_ADMIN
      ) {
        throw new GraphQLError(
          "Only Digication admins can assign the digication_admin role",
          { extensions: { code: "FORBIDDEN" } }
        );
      }

      // Verify institution exists
      const instRepo = AppDataSource.getRepository(Institution);
      const institution = await instRepo.findOne({
        where: { id: institutionId },
      });
      if (!institution) {
        throw new GraphQLError("Institution not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Check email doesn't already exist
      const userRepo = AppDataSource.getRepository(User);
      const existing = await userRepo.findOne({ where: { email } });
      if (existing) {
        throw new GraphQLError("A user with this email already exists", {
          extensions: { code: "BAD_REQUEST" },
        });
      }

      // Create the user record. better-auth uses text IDs, so generate
      // a random one matching its format (nanoid-style).
      const id = crypto.randomUUID();
      const now = new Date();
      const newUser = userRepo.create({
        id,
        email,
        name,
        role,
        institutionId,
        emailVerified: false,
        invitedAt: now,
        lastInvitedAt: now,
        image: null,
        preferredLlmProvider: null,
        preferredLlmModel: null,
      });
      await userRepo.save(newUser);

      // Send the invitation magic link email
      try {
        await sendInvitationEmail(email, currentUser.name);
      } catch {
        // User was created but email failed — don't roll back, admin can
        // resend later. Log the error (sendInvitationEmail already logs).
      }

      return newUser;
    },

    resendInvitation: async (
      _: unknown,
      { userId }: { userId: string },
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

      if (targetUser.emailVerified) {
        throw new GraphQLError(
          "This user has already accepted their invitation",
          { extensions: { code: "BAD_REQUEST" } }
        );
      }

      // Institution admins can only resend for their own institution
      if (
        currentUser.role === UserRole.INSTITUTION_ADMIN &&
        targetUser.institutionId !== currentUser.institutionId
      ) {
        throw new GraphQLError(
          "Cannot resend invitations for users outside your institution",
          { extensions: { code: "FORBIDDEN" } }
        );
      }

      await sendInvitationEmail(targetUser.email, currentUser.name);

      targetUser.lastInvitedAt = new Date();
      await repo.save(targetUser);

      return targetUser;
    },

    setUserDeactivated: async (
      _: unknown,
      { userId, deactivated }: { userId: string; deactivated: boolean },
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

      // Prevent deactivating yourself
      if (targetUser.id === currentUser.id) {
        throw new GraphQLError("You cannot deactivate your own account", {
          extensions: { code: "BAD_REQUEST" },
        });
      }

      // Institution admins can only manage their own institution's users
      if (
        currentUser.role === UserRole.INSTITUTION_ADMIN &&
        targetUser.institutionId !== currentUser.institutionId
      ) {
        throw new GraphQLError(
          "Cannot modify users outside your institution",
          { extensions: { code: "FORBIDDEN" } }
        );
      }

      // Institution admins cannot deactivate digication_admin users
      if (
        currentUser.role === UserRole.INSTITUTION_ADMIN &&
        targetUser.role === UserRole.DIGICATION_ADMIN
      ) {
        throw new GraphQLError(
          "Cannot deactivate a Digication admin",
          { extensions: { code: "FORBIDDEN" } }
        );
      }

      targetUser.deactivated = deactivated;
      return repo.save(targetUser);
    },

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
      const currentUser = requireRole(ctx, [
        UserRole.INSTITUTION_ADMIN,
        UserRole.DIGICATION_ADMIN,
      ]);

      // Security: institution admins can only revoke for their own institution's courses
      if (currentUser.role === UserRole.INSTITUTION_ADMIN) {
        const courseRepo = AppDataSource.getRepository(Course);
        const course = await courseRepo.findOne({ where: { id: courseId } });
        if (!course || course.institutionId !== currentUser.institutionId) {
          throw new GraphQLError("Course is not in your institution", {
            extensions: { code: "FORBIDDEN" },
          });
        }
      }

      const repo = AppDataSource.getRepository(CourseAccess);
      const access = await repo.findOne({ where: { userId, courseId } });
      if (!access) return false;
      await repo.remove(access);
      return true;
    },

    updateUserInstitution: async (
      _: unknown,
      {
        userId,
        institutionId,
      }: { userId: string; institutionId: string | null },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, [UserRole.DIGICATION_ADMIN]);

      const repo = AppDataSource.getRepository(User);
      const targetUser = await repo.findOne({ where: { id: userId } });
      if (!targetUser) {
        throw new GraphQLError("User not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Verify institution exists if assigning
      if (institutionId) {
        const instRepo = AppDataSource.getRepository(Institution);
        const inst = await instRepo.findOne({ where: { id: institutionId } });
        if (!inst) {
          throw new GraphQLError("Institution not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }
      }

      targetUser.institutionId = institutionId;
      return repo.save(targetUser);
    },
  },

  // Field resolvers
  User: {
    institution: async (parent: User) => {
      if (!parent.institutionId) return null;
      const repo = AppDataSource.getRepository(Institution);
      return repo.findOne({ where: { id: parent.institutionId } });
    },
  },
};
