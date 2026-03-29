import { GraphQLError } from "graphql";
import { AppDataSource } from "../data-source.js";
import { ChatSession } from "../entities/ChatSession.js";
import { ChatMessage, ChatMessageRole } from "../entities/ChatMessage.js";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth } from "./middleware/auth.js";
import { sendChatMessage as sendChatMessageService } from "../services/ai-chat.js";

export const chatResolvers = {
  Query: {
    chatSessions: async (
      _: unknown,
      { courseId, assignmentId }: { courseId?: string; assignmentId?: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(ChatSession);
      const where: Record<string, unknown> = { userId: user.id };
      if (courseId) where.courseId = courseId;
      if (assignmentId) where.assignmentId = assignmentId;
      return repo.find({ where, order: { updatedAt: "DESC" } });
    },

    chatSession: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(ChatSession);
      const session = await repo.findOne({ where: { id } });
      if (!session || session.userId !== user.id) {
        throw new GraphQLError("Chat session not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      return session;
    },
  },

  Mutation: {
    createChatSession: async (
      _: unknown,
      args: { courseId?: string; assignmentId?: string; title?: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(ChatSession);
      const session = repo.create({
        userId: user.id,
        courseId: args.courseId ?? null,
        assignmentId: args.assignmentId ?? null,
        title: args.title ?? "New Chat",
      });
      return repo.save(session);
    },

    sendChatMessage: async (
      _: unknown,
      { sessionId, content }: { sessionId: string; content: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const sessionRepo = AppDataSource.getRepository(ChatSession);
      const session = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!session || session.userId !== user.id) {
        throw new GraphQLError("Chat session not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Use the AI chat service to handle message + LLM response
      return sendChatMessageService(sessionId, content, user.id);
    },

    deleteChatSession: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(ChatSession);
      const session = await repo.findOne({ where: { id } });
      if (!session || session.userId !== user.id) {
        throw new GraphQLError("Chat session not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      await repo.remove(session);
      return true;
    },

    renameChatSession: async (
      _: unknown,
      { id, title }: { id: string; title: string },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(ChatSession);
      const session = await repo.findOne({ where: { id } });
      if (!session || session.userId !== user.id) {
        throw new GraphQLError("Chat session not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      session.title = title;
      return repo.save(session);
    },
  },

  ChatSession: {
    messages: async (parent: ChatSession) => {
      const repo = AppDataSource.getRepository(ChatMessage);
      return repo.find({
        where: { sessionId: parent.id },
        order: { createdAt: "ASC" },
      });
    },
    // Convert Date objects to ISO strings for GraphQL String type
    createdAt: (parent: ChatSession) =>
      parent.createdAt instanceof Date ? parent.createdAt.toISOString() : parent.createdAt,
    updatedAt: (parent: ChatSession) =>
      parent.updatedAt instanceof Date ? parent.updatedAt.toISOString() : parent.updatedAt,
  },

  ChatMessage: {
    createdAt: (parent: ChatMessage) =>
      parent.createdAt instanceof Date ? parent.createdAt.toISOString() : parent.createdAt,
  },
};
