import { ILike, type FindOptionsWhere } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Student } from "../entities/Student.js";
import { UserRole } from "../entities/User.js";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import {
  inviteStudent,
  bulkInviteStudents,
} from "../services/student-invite.js";

export const studentAuthResolvers = {
  Query: {
    myStudentProfile: async (
      _: unknown,
      __: unknown,
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      requireRole(ctx, [UserRole.STUDENT]);
      const studentRepo = AppDataSource.getRepository(Student);
      return studentRepo.findOne({ where: { userId: user.id } });
    },

    students: async (
      _: unknown,
      { institutionId, search }: { institutionId: string; search?: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      requireRole(ctx, [UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN]);

      // Institution admins can only list their own institution's students
      if (
        user.role === UserRole.INSTITUTION_ADMIN &&
        institutionId !== user.institutionId
      ) {
        return [];
      }

      const studentRepo = AppDataSource.getRepository(Student);
      const base: FindOptionsWhere<Student> = { institutionId };

      let where: FindOptionsWhere<Student> | FindOptionsWhere<Student>[];
      if (search) {
        where = [
          { ...base, firstName: ILike(`%${search}%`) },
          { ...base, lastName: ILike(`%${search}%`) },
          { ...base, email: ILike(`%${search}%`) },
        ];
      } else {
        where = base;
      }

      return studentRepo.find({
        where,
        order: { lastName: "ASC", firstName: "ASC" },
        take: 100,
      });
    },
  },

  Mutation: {
    inviteStudent: async (
      _: unknown,
      { studentId }: { studentId: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      requireRole(ctx, [UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN]);
      return inviteStudent(studentId, user.id);
    },

    bulkInviteStudents: async (
      _: unknown,
      { studentIds }: { studentIds: string[] },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      requireRole(ctx, [UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN]);
      return bulkInviteStudents(studentIds, user.id);
    },
  },
};
