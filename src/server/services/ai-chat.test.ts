import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatSession, ChatScope } from "../entities/ChatSession.js";
import { ChatMessage, ChatMessageRole } from "../entities/ChatMessage.js";
import { Comment } from "../entities/Comment.js";
import { Student } from "../entities/Student.js";
import { Thread } from "../entities/Thread.js";
import { Assignment } from "../entities/Assignment.js";
import { Course } from "../entities/Course.js";
import { CommentToriTag } from "../entities/CommentToriTag.js";
import { ToriTag } from "../entities/ToriTag.js";

// ── Mock repos (Map-based router) ──────────────────────────────────

function makeMockRepo(overrides = {}) {
  return {
    findOneBy: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((entity: Record<string, unknown>) =>
      Promise.resolve({ ...entity, id: entity.id ?? "mock-id" }),
    ),
    create: vi.fn().mockImplementation((data: Record<string, unknown>) => data),
    ...overrides,
  };
}

const repos = new Map<unknown, ReturnType<typeof makeMockRepo>>();
repos.set(ChatSession, makeMockRepo());
repos.set(ChatMessage, makeMockRepo());
repos.set(Comment, makeMockRepo());
repos.set(Student, makeMockRepo());
repos.set(Thread, makeMockRepo());
repos.set(Assignment, makeMockRepo());
repos.set(Course, makeMockRepo());
repos.set(CommentToriTag, makeMockRepo());
repos.set(ToriTag, makeMockRepo());

const mockGetRepository = vi.fn((entity: unknown) => repos.get(entity) ?? makeMockRepo());

vi.mock("../data-source.js", () => ({
  AppDataSource: { getRepository: (...args: unknown[]) => mockGetRepository(...args) },
}));

// ── LLM mock — CRITICAL: match the barrel import path ──────────────

const mockSendChat = vi.fn().mockResolvedValue("AI response text");
vi.mock("./llm/index.js", () => ({
  getLLMProvider: vi.fn(() => ({
    name: "google",
    sendChat: (...args: unknown[]) => mockSendChat(...args),
  })),
}));

vi.mock("./ai-instructions.js", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("System prompt text"),
}));

// ── Import under test AFTER mocks ──────────────────────────────────

import { buildContext, sendChatMessage } from "./ai-chat.js";
import { getLLMProvider } from "./llm/index.js";
import { buildSystemPrompt } from "./ai-instructions.js";

// ── Helpers ─────────────────────────────────────────────────────────

function repo(entity: unknown) {
  return repos.get(entity)!;
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "session-1",
    userId: "user-1",
    title: "Test Chat",
    scope: ChatScope.SELECTION,
    courseId: null,
    assignmentId: null,
    studentId: null,
    selectedCommentIds: null,
    selectedToriTags: null,
    showPII: true,
    llmProvider: null,
    llmModel: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ChatSession;
}

function makeComment(id: string, studentId: string | null, text: string, student?: Partial<Student>) {
  return {
    id,
    studentId,
    text,
    role: "USER",
    student: student ? { id: studentId, ...student } : null,
    thread: { id: `thread-${id}` },
  };
}

// ── Reset between tests ────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  for (const r of repos.values()) {
    r.find.mockResolvedValue([]);
    r.findOne.mockResolvedValue(null);
    r.findOneBy.mockResolvedValue(null);
  }
});

// ====================================================================
// buildContext tests
// ====================================================================

describe("buildContext", () => {
  it("SELECTION + selectedCommentIds fetches only those comments", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
      selectedCommentIds: ["c1", "c2"],
    });
    const comments = [
      makeComment("c1", "s1", "Hello", { firstName: "Alice", lastName: "B" }),
      makeComment("c2", "s1", "World", { firstName: "Alice", lastName: "B" }),
    ];
    repo(Comment).find.mockResolvedValue(comments);
    repo(Student).find.mockResolvedValue([{ id: "s1", firstName: "Alice", lastName: "B", courseRole: "student" }]);
    // CommentToriTag find for the "gather all tags" step
    repo(CommentToriTag).find.mockResolvedValue([]);

    const result = await buildContext(session);

    // The Comment repo.find should have been called with the selected IDs
    expect(repo(Comment).find).toHaveBeenCalled();
    const callArgs = repo(Comment).find.mock.calls[0][0];
    expect(callArgs.where.id).toBeDefined();
    expect(result).toContain("Alice B");
  });

  it("SELECTION + studentId + assignmentId filters by assignment", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
      studentId: "s1",
      assignmentId: "a1",
    });
    repo(Thread).find.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    repo(Comment).find.mockResolvedValue([]);
    repo(CommentToriTag).find.mockResolvedValue([]);

    await buildContext(session);

    // Thread repo queried with assignmentId
    expect(repo(Thread).find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignmentId: "a1" } }),
    );
  });

  it("SELECTION + studentId + courseId filters by course", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
      studentId: "s1",
      courseId: "course-1",
    });
    repo(Assignment).find.mockResolvedValue([{ id: "a1" }]);
    repo(Thread).find.mockResolvedValue([{ id: "t1" }]);
    repo(Comment).find.mockResolvedValue([]);
    repo(CommentToriTag).find.mockResolvedValue([]);

    await buildContext(session);

    expect(repo(Assignment).find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId: "course-1" } }),
    );
  });

  it("SELECTION + studentId only fetches all student comments", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
      studentId: "s1",
    });
    const comments = [makeComment("c1", "s1", "Hi", { firstName: "A", lastName: "B" })];
    repo(Comment).find.mockResolvedValue(comments);
    repo(Student).find.mockResolvedValue([{ id: "s1", firstName: "A", lastName: "B", courseRole: "student" }]);
    repo(CommentToriTag).find.mockResolvedValue([]);

    const result = await buildContext(session);

    expect(repo(Comment).find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: "s1" }) }),
    );
    expect(result).toContain("A B");
  });

  it("COURSE scope fetches all comments in course", async () => {
    const session = makeSession({
      scope: ChatScope.COURSE,
      courseId: "course-1",
    });
    repo(Assignment).find.mockResolvedValue([{ id: "a1" }]);
    repo(Thread).find.mockResolvedValue([{ id: "t1" }]);
    repo(Comment).find.mockResolvedValue([
      makeComment("c1", "s1", "text", { firstName: "X", lastName: "Y" }),
    ]);
    repo(Student).find.mockResolvedValue([{ id: "s1", firstName: "X", lastName: "Y", courseRole: "student" }]);
    repo(CommentToriTag).find.mockResolvedValue([]);

    const result = await buildContext(session);

    expect(repo(Assignment).find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId: "course-1" } }),
    );
    expect(result).toContain("X Y");
  });

  it("empty scope (no comments) returns minimal context string", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
    });
    // No selectedCommentIds and no studentId → scopeLabel = "selected comments", comments = []

    const result = await buildContext(session);

    expect(result).toContain("No comments found");
  });

  it("TORI tag filtering narrows comments to matching tags", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
      selectedCommentIds: ["c1", "c2"],
      selectedToriTags: ["Descriptive"],
    });
    const comments = [
      makeComment("c1", "s1", "tagged", { firstName: "A", lastName: "B" }),
      makeComment("c2", "s1", "not tagged", { firstName: "A", lastName: "B" }),
    ];
    repo(Comment).find.mockResolvedValue(comments);
    // First toriTagRepo.find call — filtering step
    // Second toriTagRepo.find call — gather all tags
    repo(CommentToriTag).find
      .mockResolvedValueOnce([
        { commentId: "c1", toriTag: { name: "Descriptive" } },
        { commentId: "c2", toriTag: { name: "Critical" } },
      ])
      .mockResolvedValueOnce([
        { commentId: "c1", toriTag: { name: "Descriptive" } },
      ]);
    repo(Student).find.mockResolvedValue([{ id: "s1", firstName: "A", lastName: "B", courseRole: "student" }]);

    const result = await buildContext(session);

    // c2 should be filtered out (its tag "Critical" doesn't match "Descriptive")
    expect(result).toContain("tagged");
    expect(result).not.toContain("not tagged");
  });

  it("showPII=false uses initials", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
      selectedCommentIds: ["c1"],
      showPII: false,
    });
    const student = { firstName: "John", lastName: "Smith" };
    repo(Comment).find.mockResolvedValue([
      makeComment("c1", "s1", "hello", student),
    ]);
    repo(Student).find.mockResolvedValue([{ id: "s1", ...student, courseRole: "student" }]);
    repo(CommentToriTag).find.mockResolvedValue([]);

    const result = await buildContext(session);

    expect(result).toContain("J.S.");
    expect(result).not.toContain("John Smith");
  });

  it("showPII=true uses full names", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
      selectedCommentIds: ["c1"],
      showPII: true,
    });
    const student = { firstName: "John", lastName: "Smith" };
    repo(Comment).find.mockResolvedValue([
      makeComment("c1", "s1", "hello", student),
    ]);
    repo(Student).find.mockResolvedValue([{ id: "s1", ...student, courseRole: "student" }]);
    repo(CommentToriTag).find.mockResolvedValue([]);

    const result = await buildContext(session);

    expect(result).toContain("John Smith");
  });

  it("student with no name falls back to systemId", async () => {
    const session = makeSession({
      scope: ChatScope.SELECTION,
      selectedCommentIds: ["c1"],
      showPII: true,
    });
    repo(Comment).find.mockResolvedValue([
      { id: "c1", studentId: "s1", text: "hi", role: "USER", student: { id: "s1", firstName: null, lastName: null }, thread: { id: "t1" } },
    ]);
    repo(Student).find.mockResolvedValue([{ id: "s1", firstName: null, lastName: null, systemId: "SYS-42", courseRole: null }]);
    repo(CommentToriTag).find.mockResolvedValue([]);

    const result = await buildContext(session);

    expect(result).toContain("SYS-42");
  });
});

// ====================================================================
// sendChatMessage tests
// ====================================================================

describe("sendChatMessage", () => {
  const sessionData = makeSession({ id: "sess-1", userId: "user-1", title: "Existing" });

  beforeEach(() => {
    // Default: session found and owned by user
    repo(ChatSession).findOneBy.mockResolvedValue({ ...sessionData });
    repo(ChatMessage).find.mockResolvedValue([]);
    // buildContext will need Comment repo to return empty
    repo(Comment).find.mockResolvedValue([]);
    repo(CommentToriTag).find.mockResolvedValue([]);
    mockSendChat.mockResolvedValue("AI response text");
  });

  it("session not found throws", async () => {
    repo(ChatSession).findOneBy.mockResolvedValue(null);
    await expect(sendChatMessage("sess-1", "hello", "user-1")).rejects.toThrow(
      "Chat session not found",
    );
  });

  it("session belongs to different user throws", async () => {
    repo(ChatSession).findOneBy.mockResolvedValue({ ...sessionData, userId: "other-user" });
    await expect(sendChatMessage("sess-1", "hello", "user-1")).rejects.toThrow(
      "Not authorised",
    );
  });

  it("saves user message to DB", async () => {
    await sendChatMessage("sess-1", "hello world", "user-1");

    expect(repo(ChatMessage).create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-1",
        role: ChatMessageRole.USER,
        content: "hello world",
      }),
    );
    expect(repo(ChatMessage).save).toHaveBeenCalled();
  });

  it("calls buildSystemPrompt with session data", async () => {
    await sendChatMessage("sess-1", "test", "user-1");

    expect(buildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: ChatScope.SELECTION,
        showPII: true,
      }),
    );
  });

  it("calls LLM provider with message history", async () => {
    // Simulate one previous message in history
    repo(ChatMessage).find.mockResolvedValue([
      { role: ChatMessageRole.USER, content: "test", createdAt: new Date() },
    ]);

    await sendChatMessage("sess-1", "test", "user-1");

    expect(mockSendChat).toHaveBeenCalled();
    const messages = mockSendChat.mock.calls[0][0];
    expect(Array.isArray(messages)).toBe(true);
  });

  it("uses session providerName (default google)", async () => {
    await sendChatMessage("sess-1", "test", "user-1");

    expect(getLLMProvider).toHaveBeenCalledWith("google");
  });

  it("uses session modelId in sendChat options", async () => {
    repo(ChatSession).findOneBy.mockResolvedValue({
      ...sessionData,
      llmModel: "gemini-3.1-pro-preview",
    });

    await sendChatMessage("sess-1", "test", "user-1");

    const options = mockSendChat.mock.calls[0][1];
    expect(options).toEqual(
      expect.objectContaining({ model: "gemini-3.1-pro-preview" }),
    );
  });

  it("saves assistant response to DB", async () => {
    await sendChatMessage("sess-1", "test", "user-1");

    // Second call to create should be the assistant message
    const createCalls = repo(ChatMessage).create.mock.calls;
    const assistantCall = createCalls.find(
      (c: unknown[]) => (c[0] as Record<string, unknown>).role === ChatMessageRole.ASSISTANT,
    );
    expect(assistantCall).toBeDefined();
    expect((assistantCall![0] as Record<string, unknown>).content).toBe("AI response text");
  });

  it("auto-generates title on first message (title is null)", async () => {
    repo(ChatSession).findOneBy.mockResolvedValue({ ...sessionData, title: null });
    mockSendChat
      .mockResolvedValueOnce("AI response text") // Main LLM call
      .mockResolvedValueOnce("Generated Title"); // Title generation call

    await sendChatMessage("sess-1", "test", "user-1");

    // sendChat called twice: once for the response, once for the title
    expect(mockSendChat).toHaveBeenCalledTimes(2);
    // session.save should have been called with the new title
    expect(repo(ChatSession).save).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Generated Title" }),
    );
  });

  it("title generation failure does NOT throw", async () => {
    repo(ChatSession).findOneBy.mockResolvedValue({ ...sessionData, title: null });
    mockSendChat
      .mockResolvedValueOnce("AI response text") // Main LLM call
      .mockRejectedValueOnce(new Error("LLM title failure")); // Title generation fails

    // Should NOT throw
    const result = await sendChatMessage("sess-1", "test", "user-1");
    expect(result).toBeDefined();
  });
});
