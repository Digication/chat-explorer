import { GraphQLError } from "graphql";
import { AppDataSource } from "../data-source.js";
import { ChatSession, ChatScope } from "../entities/ChatSession.js";
import { ChatMessage, ChatMessageRole } from "../entities/ChatMessage.js";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth, requireInstitutionAccess } from "./middleware/auth.js";
import { sendChatMessage as sendChatMessageService } from "../services/ai-chat.js";

export const chatResolvers = {
  Query: {
    chatSessions: async (
      _: unknown,
      { institutionId, courseId, assignmentId }: { institutionId: string; courseId?: string; assignmentId?: string },
      ctx: GraphQLContext
    ) => {
      const user = requireInstitutionAccess(ctx, institutionId);
      const repo = AppDataSource.getRepository(ChatSession);
      const where: Record<string, unknown> = { userId: user.id, institutionId };
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
      // Verify institutional access (skip for legacy sessions without institutionId)
      if (session.institutionId) {
        requireInstitutionAccess(ctx, session.institutionId);
      }
      return session;
    },
  },

  Mutation: {
    createChatSession: async (
      _: unknown,
      args: {
        institutionId: string;
        courseId?: string;
        assignmentId?: string;
        studentId?: string;
        scope?: string;
        selectedToriTags?: string[];
        selectedCommentIds?: string[];
        title?: string;
      },
      ctx: GraphQLContext
    ) => {
      const user = requireInstitutionAccess(ctx, args.institutionId);
      const repo = AppDataSource.getRepository(ChatSession);
      const session = repo.create({
        userId: user.id,
        institutionId: args.institutionId,
        courseId: args.courseId ?? null,
        assignmentId: args.assignmentId ?? null,
        studentId: args.studentId ?? null,
        scope: (args.scope as ChatScope) ?? ChatScope.SELECTION,
        selectedToriTags: args.selectedToriTags ?? null,
        selectedCommentIds: args.selectedCommentIds ?? null,
        title: args.title ?? "New Chat",
      });
      return repo.save(session);
    },

    sendChatMessage: async (
      _: unknown,
      { sessionId, content, analyticsContext }: { sessionId: string; content: string; analyticsContext?: string },
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
      return sendChatMessageService(sessionId, content, user.id, analyticsContext);
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

    updateChatSessionScope: async (
      _: unknown,
      { id, scope, studentId, courseId, assignmentId }: {
        id: string;
        scope: string;
        studentId?: string;
        courseId?: string;
        assignmentId?: string;
      },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const sessionRepo = AppDataSource.getRepository(ChatSession);
      const session = await sessionRepo.findOne({ where: { id } });
      if (!session || session.userId !== user.id) {
        throw new GraphQLError("Chat session not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      if (session.institutionId) {
        requireInstitutionAccess(ctx, session.institutionId);
      }

      // Update scope fields
      session.scope = scope as ChatScope;
      session.studentId = studentId ?? null;
      session.courseId = courseId ?? null;
      session.assignmentId = assignmentId ?? null;
      const updated = await sessionRepo.save(session);

      // Create a SYSTEM message to mark the scope change
      const msgRepo = AppDataSource.getRepository(ChatMessage);
      const scopeLabels: Record<string, string> = {
        SELECTION: studentId ? "This student" : "Selected comments",
        COURSE: "This course",
        CROSS_COURSE: "All courses",
      };
      const label = scopeLabels[scope] ?? scope;
      const systemMsg = msgRepo.create({
        sessionId: id,
        role: ChatMessageRole.SYSTEM,
        content: `Context changed to: ${label}. AI context refreshed.`,
      });
      await msgRepo.save(systemMsg);

      return updated;
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
