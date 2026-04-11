import { AppDataSource } from "../data-source.js";
import { ToriTag } from "../entities/ToriTag.js";
import { User } from "../entities/User.js";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth } from "./middleware/auth.js";
import { institutionResolvers } from "./institution.js";
import { courseResolvers } from "./course.js";
import { analyticsResolvers } from "./analytics.js";
import { chatResolvers } from "./chat.js";
import { consentResolvers } from "./consent.js";
import { exportResolvers } from "./export.js";
import { adminResolvers } from "./admin.js";

/**
 * Merges all resolver groups into a single resolver map.
 * Handles Query, Mutation, and field resolvers from each group.
 */
export const resolvers = {
  Query: {
    ...institutionResolvers.Query,
    ...courseResolvers.Query,
    ...analyticsResolvers.Query,
    ...chatResolvers.Query,
    ...consentResolvers.Query,
    ...exportResolvers.Query,
    ...adminResolvers.Query,

    // Reference data
    toriTags: async () => {
      const repo = AppDataSource.getRepository(ToriTag);
      return repo.find({
        order: { domainNumber: "ASC", categoryNumber: "ASC" },
      });
    },

    // Current user
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(User);
      return repo.findOne({ where: { id: user.id } });
    },
  },

  Mutation: {
    ...chatResolvers.Mutation,
    ...consentResolvers.Mutation,
    ...exportResolvers.Mutation,
    ...adminResolvers.Mutation,
    ...institutionResolvers.Mutation,
  },

  // Field resolvers
  User: adminResolvers.User,
  Institution: institutionResolvers.Institution,
  Course: courseResolvers.Course,
  Assignment: courseResolvers.Assignment,
  Thread: courseResolvers.Thread,
  Comment: courseResolvers.Comment,
  Student: courseResolvers.Student,
  ChatSession: chatResolvers.ChatSession,
  ChatMessage: chatResolvers.ChatMessage,
};
