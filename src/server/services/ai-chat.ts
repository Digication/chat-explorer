/**
 * AI Chat Service
 *
 * Orchestrates the flow: load session -> build context from DB ->
 * assemble message history -> call the LLM -> persist the response.
 */

import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { ChatSession, ChatScope } from "../entities/ChatSession.js";
import { ChatMessage, ChatMessageRole } from "../entities/ChatMessage.js";
import { Comment } from "../entities/Comment.js";
import { Student } from "../entities/Student.js";
import { Thread } from "../entities/Thread.js";
import { Assignment } from "../entities/Assignment.js";
import { Course } from "../entities/Course.js";
import { CommentToriTag } from "../entities/CommentToriTag.js";
import { ToriTag } from "../entities/ToriTag.js";
import { getLLMProvider } from "./llm/index.js";
import { buildSystemPrompt } from "./ai-instructions.js";
import type { LLMChatMessage } from "./llm/provider.js";
import type { ProviderName } from "./llm/provider.js";

// ---------------------------------------------------------------------------
// Context builder – turns database rows into a text block the LLM can read
// ---------------------------------------------------------------------------

/**
 * Fetch comments, students, and TORI tags relevant to the session scope
 * and return them as a formatted plain-text string.
 */
export async function buildContext(session: ChatSession): Promise<string> {
  const commentRepo = AppDataSource.getRepository(Comment);
  const studentRepo = AppDataSource.getRepository(Student);
  const toriTagRepo = AppDataSource.getRepository(CommentToriTag);

  let comments: Comment[] = [];
  let scopeLabel = "";

  // -- Fetch comments based on scope --------------------------------------

  switch (session.scope) {
    case ChatScope.SELECTION: {
      if (session.selectedCommentIds && session.selectedCommentIds.length > 0) {
        // Hand-picked comments
        comments = await commentRepo.find({
          where: { id: In(session.selectedCommentIds) },
          relations: ["thread", "student"],
          order: { orderIndex: "ASC" },
        });
        scopeLabel = "selected comments";
      } else if (session.studentId) {
        // Student-level scope: fetch all comments by this student,
        // narrowed to the assignment or course if provided.
        const threadRepo = AppDataSource.getRepository(Thread);

        if (session.assignmentId) {
          // Narrow to threads in this assignment
          const threads = await threadRepo.find({
            where: { assignmentId: session.assignmentId },
          });
          const threadIds = threads.map((t) => t.id);
          if (threadIds.length > 0) {
            comments = await commentRepo.find({
              where: { studentId: session.studentId, threadId: In(threadIds) },
              relations: ["thread", "student"],
              order: { orderIndex: "ASC" },
            });
          }
        } else if (session.courseId) {
          // Narrow to threads in any assignment in this course
          const assignmentRepo = AppDataSource.getRepository(Assignment);
          const assignments = await assignmentRepo.find({
            where: { courseId: session.courseId },
          });
          const assignmentIds = assignments.map((a) => a.id);
          if (assignmentIds.length > 0) {
            const threads = await threadRepo.find({
              where: { assignmentId: In(assignmentIds) },
            });
            const threadIds = threads.map((t) => t.id);
            if (threadIds.length > 0) {
              comments = await commentRepo.find({
                where: { studentId: session.studentId, threadId: In(threadIds) },
                relations: ["thread", "student"],
                order: { orderIndex: "ASC" },
              });
            }
          }
        } else {
          // No course/assignment filter — all comments by this student
          comments = await commentRepo.find({
            where: { studentId: session.studentId },
            relations: ["thread", "student"],
            order: { orderIndex: "ASC" },
          });
        }
        scopeLabel = "student";
      } else {
        scopeLabel = "selected comments";
      }
      break;
    }

    case ChatScope.COURSE: {
      // All comments within every assignment/thread belonging to the course.
      if (session.courseId) {
        const assignmentRepo = AppDataSource.getRepository(Assignment);
        const threadRepo = AppDataSource.getRepository(Thread);

        // Build the chain: course -> assignments -> threads -> comments
        const assignments = await assignmentRepo.find({
          where: { courseId: session.courseId },
        });
        const assignmentIds = assignments.map((a) => a.id);

        if (assignmentIds.length > 0) {
          const threads = await threadRepo.find({
            where: { assignmentId: In(assignmentIds) },
          });
          const threadIds = threads.map((t) => t.id);

          if (threadIds.length > 0) {
            comments = await commentRepo.find({
              where: { threadId: In(threadIds) },
              relations: ["thread", "student"],
              order: { orderIndex: "ASC" },
            });
          }
        }
      }
      scopeLabel = "course";
      break;
    }

    case ChatScope.CROSS_COURSE: {
      // All comments across all courses in the institution.
      // If a courseId is set, delegate to COURSE scope for that single course.
      if (session.courseId) {
        return buildContext({ ...session, scope: ChatScope.COURSE } as ChatSession);
      }

      // Fetch ALL courses for the institution
      if (session.institutionId) {
        const courseRepo = AppDataSource.getRepository(Course);
        const courses = await courseRepo.find({
          where: { institutionId: session.institutionId },
        });
        const courseIds = courses.map((c) => c.id);

        if (courseIds.length > 0) {
          const assignmentRepo = AppDataSource.getRepository(Assignment);
          const threadRepo = AppDataSource.getRepository(Thread);

          const assignments = await assignmentRepo.find({
            where: { courseId: In(courseIds) },
          });
          const assignmentIds = assignments.map((a) => a.id);

          if (assignmentIds.length > 0) {
            const threads = await threadRepo.find({
              where: { assignmentId: In(assignmentIds) },
            });
            const threadIds = threads.map((t) => t.id);

            if (threadIds.length > 0) {
              const where: Record<string, unknown> = { threadId: In(threadIds) };
              // Respect studentId filter for "this student — all courses" scope
              if (session.studentId) {
                where.studentId = session.studentId;
              }
              comments = await commentRepo.find({
                where,
                relations: ["thread", "student"],
                order: { orderIndex: "ASC" },
              });
            }
          }
        }
      }
      scopeLabel = "cross-course";
      break;
    }
  }

  // -- Optionally filter by TORI tags --------------------------------------

  if (
    session.selectedToriTags &&
    session.selectedToriTags.length > 0 &&
    comments.length > 0
  ) {
    const commentIds = comments.map((c) => c.id);
    const tagLinks = await toriTagRepo.find({
      where: { commentId: In(commentIds) },
      relations: ["toriTag"],
    });

    // Keep only comments whose TORI tags overlap with the selection.
    const matchingCommentIds = new Set(
      tagLinks
        .filter((link) => session.selectedToriTags!.includes(link.toriTag.name))
        .map((link) => link.commentId),
    );

    comments = comments.filter((c) => matchingCommentIds.has(c.id));
  }

  // -- Gather unique students for reference --------------------------------

  const studentIds = [
    ...new Set(comments.map((c) => c.studentId).filter(Boolean)),
  ] as string[];

  let students: Student[] = [];
  if (studentIds.length > 0) {
    students = await studentRepo.find({ where: { id: In(studentIds) } });
  }

  // -- Gather TORI tags attached to these comments -------------------------

  let tagsByComment = new Map<string, string[]>();
  if (comments.length > 0) {
    const allTags = await toriTagRepo.find({
      where: { commentId: In(comments.map((c) => c.id)) },
      relations: ["toriTag"],
    });
    for (const link of allTags) {
      const existing = tagsByComment.get(link.commentId) ?? [];
      existing.push(link.toriTag.name);
      tagsByComment.set(link.commentId, existing);
    }
  }

  // -- Format everything into a text block ---------------------------------

  const lines: string[] = [];

  // Student directory
  if (students.length > 0) {
    lines.push("### Students");
    for (const s of students) {
      const name = session.showPII
        ? `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.systemId
        : `${(s.firstName ?? "?")[0]}.${(s.lastName ?? "?")[0]}.`;
      lines.push(`- ${name} (id: ${s.id}, role: ${s.courseRole ?? "unknown"})`);
    }
    lines.push("");
  }

  // Comments
  if (comments.length > 0) {
    lines.push("### Comments");
    for (const c of comments) {
      const studentLabel = c.student
        ? session.showPII
          ? `${c.student.firstName ?? ""} ${c.student.lastName ?? ""}`.trim()
          : `${(c.student.firstName ?? "?")[0]}.${(c.student.lastName ?? "?")[0]}.`
        : "Unknown";
      const tags = tagsByComment.get(c.id);
      const tagStr = tags && tags.length > 0 ? ` [TORI: ${tags.join(", ")}]` : "";
      lines.push(
        `**[${c.role}] ${studentLabel}${tagStr}**\n${c.text}\n`,
      );
    }
  } else {
    lines.push("_No comments found for this scope._");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Chat message handler
// ---------------------------------------------------------------------------

/**
 * Accept a user message, send it (with context) to the configured LLM,
 * and return the saved assistant response.
 */
export async function sendChatMessage(
  sessionId: string,
  userContent: string,
  userId: string,
  analyticsContext?: string,
): Promise<ChatMessage> {
  const sessionRepo = AppDataSource.getRepository(ChatSession);
  const messageRepo = AppDataSource.getRepository(ChatMessage);

  // 1. Load the session
  const session = await sessionRepo.findOneBy({ id: sessionId });
  if (!session) throw new Error(`Chat session not found: ${sessionId}`);
  if (session.userId !== userId) throw new Error("Not authorised for this session");

  // 2. Save the user message
  const userMsg = messageRepo.create({
    sessionId,
    role: ChatMessageRole.USER,
    content: userContent,
  });
  await messageRepo.save(userMsg);

  // 3. Build data context from the database
  const contextData = await buildContext(session);

  // 4. Build the system prompt (with optional analytics dashboard context)
  let data = contextData;
  if (analyticsContext) {
    data = `The user is viewing an analytics dashboard showing:\n${analyticsContext}\n\nBelow is the detailed conversation data:\n${contextData}`;
  }
  const systemPrompt = buildSystemPrompt({
    scope: session.scope,
    data,
    showPII: session.showPII,
  });

  // 5. Load all previous messages in this session (oldest first)
  const history = await messageRepo.find({
    where: { sessionId },
    order: { createdAt: "ASC" },
  });

  // Convert database messages into the shape the LLM expects
  const llmMessages: LLMChatMessage[] = history.map((m) => ({
    role:
      m.role === ChatMessageRole.USER
        ? "user"
        : m.role === ChatMessageRole.ASSISTANT
          ? "assistant"
          : "system",
    content: m.content,
  }));

  // 6. Call the LLM
  const providerName = (session.llmProvider ?? "google") as ProviderName;
  const modelId = session.llmModel ?? "gemini-3.1-pro-preview";

  const provider = getLLMProvider(providerName);
  const assistantText = await provider.sendChat(llmMessages, {
    model: modelId,
    systemPrompt,
  });

  // 7. Save the assistant response
  const assistantMsg = messageRepo.create({
    sessionId,
    role: ChatMessageRole.ASSISTANT,
    content: assistantText,
  });
  await messageRepo.save(assistantMsg);

  // 8. Auto-generate a title from the first exchange
  if (!session.title) {
    try {
      const titlePrompt =
        "Generate a short title (max 6 words) for a chat that starts with this question. " +
        "Reply with ONLY the title, no quotes or punctuation.";
      const titleText = await provider.sendChat(
        [{ role: "user", content: userContent }],
        { model: modelId, systemPrompt: titlePrompt, temperature: 0.3, maxTokens: 30 },
      );
      session.title = titleText.trim().slice(0, 100);
      await sessionRepo.save(session);
    } catch {
      // Title generation is best-effort; don't block the response.
    }
  }

  return assistantMsg;
}
