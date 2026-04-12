import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatSession, ChatScope } from "../entities/ChatSession.js";
import { ChatMessage } from "../entities/ChatMessage.js";

// ── Mock repos ──────────────────────────────────────────────────────

const sessionRepo = {
  findOne: vi.fn(),
  findOneBy: vi.fn(),
  find: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockImplementation((e: Record<string, unknown>) => Promise.resolve(e)),
  create: vi.fn().mockImplementation((d: Record<string, unknown>) => d),
  remove: vi.fn().mockResolvedValue(undefined),
};
const messageRepo = {
  findOne: vi.fn(),
  findOneBy: vi.fn(),
  find: vi.fn().mockResolvedValue([]),
};

vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === ChatSession) return sessionRepo;
      if (entity === ChatMessage) return messageRepo;
      return { findOne: vi.fn(), findOneBy: vi.fn(), find: vi.fn().mockResolvedValue([]) };
    }),
  },
}));

const mockSendChatMessage = vi.fn().mockResolvedValue({ id: "msg-1", role: "ASSISTANT", content: "response" });
vi.mock("../services/ai-chat.js", () => ({
  sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
}));

vi.mock("./middleware/auth.js", () => ({
  requireAuth: vi.fn((ctx: { user: unknown }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    return ctx.user;
  }),
  requireInstitutionAccess: vi.fn((ctx: { user: unknown }, _institutionId: string) => {
    if (!ctx.user) throw new Error("Not authenticated");
    return ctx.user;
  }),
}));

// ── Import under test ───────────────────────────────────────────────

import { chatResolvers } from "./chat.js";
import { requireAuth } from "./middleware/auth.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeCtx(user: Record<string, unknown> | null = null) {
  return { user } as never;
}

const defaultUser = { id: "user-1", name: "Test", email: "t@t.com", role: "instructor", institutionId: "inst-1" };

beforeEach(() => {
  vi.clearAllMocks();
  sessionRepo.find.mockResolvedValue([]);
  sessionRepo.findOne.mockResolvedValue(null);
});

// ====================================================================

describe("chatResolvers.Query", () => {
  it("chatSessions requires auth", async () => {
    await expect(
      chatResolvers.Query.chatSessions(null, { institutionId: "inst-1" }, makeCtx()),
    ).rejects.toThrow("Not authenticated");
  });

  it("chatSessions returns sessions for current user only", async () => {
    const sessions = [{ id: "s1", userId: "user-1" }];
    sessionRepo.find.mockResolvedValue(sessions);

    const result = await chatResolvers.Query.chatSessions(
      null, { institutionId: "inst-1" }, makeCtx(defaultUser),
    );

    expect(sessionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", institutionId: "inst-1" }),
      }),
    );
    expect(result).toEqual(sessions);
  });

  it("chatSessions filters by courseId when provided", async () => {
    sessionRepo.find.mockResolvedValue([]);
    await chatResolvers.Query.chatSessions(
      null, { institutionId: "inst-1", courseId: "c-1" }, makeCtx(defaultUser),
    );

    expect(sessionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", institutionId: "inst-1", courseId: "c-1" }),
      }),
    );
  });

  it("chatSession not found throws NOT_FOUND", async () => {
    sessionRepo.findOne.mockResolvedValue(null);

    await expect(
      chatResolvers.Query.chatSession(null, { id: "missing" }, makeCtx(defaultUser)),
    ).rejects.toThrow("Chat session not found");
  });

  it("chatSession wrong user throws NOT_FOUND", async () => {
    sessionRepo.findOne.mockResolvedValue({ id: "s1", userId: "other-user" });

    await expect(
      chatResolvers.Query.chatSession(null, { id: "s1" }, makeCtx(defaultUser)),
    ).rejects.toThrow("Chat session not found");
  });
});

describe("chatResolvers.Mutation", () => {
  it("createChatSession creates with defaults", async () => {
    sessionRepo.save.mockImplementation((e: Record<string, unknown>) => Promise.resolve(e));

    await chatResolvers.Mutation.createChatSession(null, { institutionId: "inst-1" }, makeCtx(defaultUser));

    expect(sessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        institutionId: "inst-1",
        scope: ChatScope.SELECTION,
        title: "New Chat",
      }),
    );
    expect(sessionRepo.save).toHaveBeenCalled();
  });

  it("sendChatMessage ownership check before service call", async () => {
    sessionRepo.findOne.mockResolvedValue({ id: "s1", userId: "other-user" });

    await expect(
      chatResolvers.Mutation.sendChatMessage(
        null, { sessionId: "s1", content: "hi" }, makeCtx(defaultUser),
      ),
    ).rejects.toThrow("Chat session not found");

    // The service should NOT have been called
    expect(mockSendChatMessage).not.toHaveBeenCalled();
  });

  it("sendChatMessage delegates to service", async () => {
    sessionRepo.findOne.mockResolvedValue({ id: "s1", userId: "user-1" });

    await chatResolvers.Mutation.sendChatMessage(
      null, { sessionId: "s1", content: "hello" }, makeCtx(defaultUser),
    );

    expect(mockSendChatMessage).toHaveBeenCalledWith("s1", "hello", "user-1");
  });

  it("deleteChatSession removes session", async () => {
    const session = { id: "s1", userId: "user-1" };
    sessionRepo.findOne.mockResolvedValue(session);

    const result = await chatResolvers.Mutation.deleteChatSession(
      null, { id: "s1" }, makeCtx(defaultUser),
    );

    expect(sessionRepo.remove).toHaveBeenCalledWith(session);
    expect(result).toBe(true);
  });

  it("renameChatSession updates title", async () => {
    const session = { id: "s1", userId: "user-1", title: "Old" };
    sessionRepo.findOne.mockResolvedValue(session);
    sessionRepo.save.mockImplementation((e: Record<string, unknown>) => Promise.resolve(e));

    const result = await chatResolvers.Mutation.renameChatSession(
      null, { id: "s1", title: "New Title" }, makeCtx(defaultUser),
    );

    expect(result).toEqual(expect.objectContaining({ title: "New Title" }));
    expect(sessionRepo.save).toHaveBeenCalled();
  });
});
