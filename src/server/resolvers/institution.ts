import { GraphQLError } from "graphql";
import { AppDataSource } from "../data-source.js";
import { Institution } from "../entities/Institution.js";
import { Course } from "../entities/Course.js";
import { CourseAccess } from "../entities/CourseAccess.js";
import { UserRole } from "../entities/User.js";
import type { GraphQLContext } from "../types/context.js";
import {
  requireAuth,
  requireRole,
  requireInstitutionAccess,
} from "./middleware/auth.js";

export const institutionResolvers = {
  Query: {
    institutions: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireRole(ctx, [UserRole.DIGICATION_ADMIN]);
      const repo = AppDataSource.getRepository(Institution);
      return repo.find({ order: { name: "ASC" } });
    },

    institution: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      requireInstitutionAccess(ctx, id);
      const repo = AppDataSource.getRepository(Institution);
      return repo.findOne({ where: { id } });
    },

    myInstitution: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const user = requireAuth(ctx);
      if (!user.institutionId) return null;
      const repo = AppDataSource.getRepository(Institution);
      return repo.findOne({ where: { id: user.institutionId } });
    },
  },

  Mutation: {
    createInstitution: async (
      _: unknown,
      { name, domain, slug }: { name: string; domain?: string; slug?: string },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, [UserRole.DIGICATION_ADMIN]);
      const repo = AppDataSource.getRepository(Institution);

      // Check name uniqueness
      const existing = await repo.findOne({ where: { name } });
      if (existing) {
        throw new GraphQLError("An institution with this name already exists", {
          extensions: { code: "BAD_REQUEST" },
        });
      }

      return repo.save(
        repo.create({
          name,
          domain: domain ?? null,
          slug: slug ?? null,
        })
      );
    },

    updateInstitution: async (
      _: unknown,
      {
        id,
        name,
        domain,
        slug,
      }: { id: string; name?: string; domain?: string; slug?: string },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, [UserRole.DIGICATION_ADMIN]);
      const repo = AppDataSource.getRepository(Institution);
      const inst = await repo.findOne({ where: { id } });
      if (!inst) {
        throw new GraphQLError("Institution not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (name !== undefined) inst.name = name;
      if (domain !== undefined) inst.domain = domain;
      if (slug !== undefined) inst.slug = slug;
      return repo.save(inst);
    },
  },

  Institution: {
    courses: async (
      parent: Institution,
      _: unknown,
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const courseRepo = AppDataSource.getRepository(Course);

      if (
        user.role === UserRole.DIGICATION_ADMIN ||
        user.role === UserRole.INSTITUTION_ADMIN
      ) {
        return courseRepo.find({
          where: { institutionId: parent.id },
          order: { name: "ASC" },
        });
      }

      // Instructors: only courses they have access to
      const accessRepo = AppDataSource.getRepository(CourseAccess);
      const accesses = await accessRepo.find({
        where: { userId: user.id },
        select: ["courseId"],
      });
      const courseIds = accesses.map((a) => a.courseId);
      if (courseIds.length === 0) return [];

      return courseRepo
        .createQueryBuilder("c")
        .where("c.institutionId = :instId", { instId: parent.id })
        .andWhere("c.id IN (:...courseIds)", { courseIds })
        .orderBy("c.name", "ASC")
        .getMany();
    },
  },
};
