import { AppDataSource } from "../data-source.js";
import { Student } from "../entities/Student.js";
import { ConsentStatus } from "../entities/StudentConsent.js";
import { UserRole } from "../entities/User.js";
import type { GraphQLContext } from "../types/context.js";
import {
  requireAuth,
  requireRole,
  requireInstitutionAccess,
} from "./middleware/auth.js";
import {
  getStudentConsent,
  setStudentConsent,
  setAllStudentsConsent,
} from "../services/consent.js";
import { cacheInvalidate } from "../services/analytics/cache.js";

export const consentResolvers = {
  Query: {
    studentConsent: async (
      _: unknown,
      { studentId, institutionId }: { studentId: string; institutionId: string },
      ctx: GraphQLContext
    ) => {
      requireInstitutionAccess(ctx, institutionId);
      return getStudentConsent(studentId, institutionId);
    },

    consentSummary: async (
      _: unknown,
      { institutionId, courseId }: { institutionId: string; courseId?: string },
      ctx: GraphQLContext
    ) => {
      requireInstitutionAccess(ctx, institutionId);

      // Count all students in the institution
      const studentRepo = AppDataSource.getRepository(Student);
      const total = await studentRepo.count({ where: { institutionId } });

      // Count excluded students
      const excludedResult = await AppDataSource.createQueryBuilder()
        .select("COUNT(DISTINCT sc.studentId)", "count")
        .from("student_consent", "sc")
        .where("sc.institutionId = :institutionId", { institutionId })
        .andWhere("sc.status = :status", { status: ConsentStatus.EXCLUDED })
        .andWhere(
          courseId
            ? "(sc.courseId IS NULL OR sc.courseId = :courseId)"
            : "sc.courseId IS NULL",
          courseId ? { courseId } : {}
        )
        .getRawOne();

      const excluded = parseInt(excludedResult?.count ?? "0", 10);

      return {
        consented: total - excluded,
        excluded,
        total,
      };
    },
  },

  Mutation: {
    setStudentConsent: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          studentId: string;
          institutionId: string;
          courseId?: string;
          status: ConsentStatus;
        };
      },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, [UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN]);
      const user = requireAuth(ctx);

      const result = await setStudentConsent(input, {
        id: user.id,
        role: user.role,
        institutionId: user.institutionId,
      });

      // Invalidate analytics cache for affected scope
      cacheInvalidate({
        institutionId: input.institutionId,
        courseId: input.courseId ?? undefined,
      });

      return result;
    },

    bulkSetConsent: async (
      _: unknown,
      args: {
        studentIds: string[];
        institutionId: string;
        courseId?: string;
        status: ConsentStatus;
      },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, [UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN]);
      const user = requireAuth(ctx);
      const authUser = {
        id: user.id,
        role: user.role,
        institutionId: user.institutionId,
      };

      let updated = 0;
      for (const studentId of args.studentIds) {
        await setStudentConsent(
          {
            studentId,
            institutionId: args.institutionId,
            courseId: args.courseId,
            status: args.status,
          },
          authUser
        );
        updated++;
      }

      cacheInvalidate({
        institutionId: args.institutionId,
        courseId: args.courseId ?? undefined,
      });

      return { updated };
    },
  },
};
