/**
 * Conversation-as-artifact wrapper — turns an existing chat Thread into
 * an Artifact (type=CONVERSATION) with one ArtifactSection per USER
 * comment. This lets section-level UI and analytics treat chats and
 * documents uniformly.
 *
 * Idempotent: if a CONVERSATION artifact already exists for the thread
 * we return it as-is (and top up missing sections for any USER comments
 * added since). No file is ever written to disk — storagePath stays
 * null.
 *
 * Evidence reuse: USER comments already have EvidenceMoment rows from
 * the Phase 2 pipeline (keyed on commentId). The CONVERSATION artifact
 * does NOT go through the Phase 3 narrative analyzer — that would
 * duplicate narrative work. Instead we set status=ANALYZED on create,
 * and the artifact detail view joins its sections to the existing
 * commentId-keyed EvidenceMoments when displaying.
 */

import { AppDataSource } from "../../data-source.js";
import { Artifact, ArtifactStatus, ArtifactType } from "../../entities/Artifact.js";
import { ArtifactSection, SectionType } from "../../entities/ArtifactSection.js";
import { Thread } from "../../entities/Thread.js";
import { Comment, CommentRole } from "../../entities/Comment.js";
import { Assignment } from "../../entities/Assignment.js";
import { wordCount } from "./document-parser.js";

export interface WrappedConversation {
  artifactId: string;
  sectionCount: number;
  created: boolean;
}

/**
 * Create (or update) a CONVERSATION artifact for the given thread.
 *
 * @param threadId      the Thread to wrap
 * @param uploadedById  optional user who initiated the wrap (for audit)
 *
 * @returns the artifact id and how many sections it has.
 *
 * Throws if the thread has no USER comments or can't be resolved to a
 * student / course (orphan threads from tests etc.).
 */
export async function wrapThreadAsArtifact(
  threadId: string,
  uploadedById?: string | null
): Promise<WrappedConversation> {
  // ── 1. Load the thread + its assignment + a student sample ───────
  const thread = await AppDataSource.getRepository(Thread).findOne({
    where: { id: threadId },
  });
  if (!thread) throw new Error(`Thread ${threadId} not found`);

  const assignment = await AppDataSource.getRepository(Assignment).findOne({
    where: { id: thread.assignmentId },
  });
  if (!assignment) throw new Error(`Assignment ${thread.assignmentId} not found`);

  // USER comments ordered by orderIndex — we need one to read the
  // studentId, and these will become the sections.
  const commentRepo = AppDataSource.getRepository(Comment);
  const userComments = await commentRepo.find({
    where: { threadId, role: CommentRole.USER },
    order: { orderIndex: "ASC" },
  });
  if (userComments.length === 0) {
    throw new Error(`Thread ${threadId} has no USER comments to wrap`);
  }

  // studentId is carried on each USER comment. Use the first one that
  // actually has it set — a handful of legacy rows may be null.
  const studentId = userComments.find((c) => c.studentId)?.studentId;
  if (!studentId) {
    throw new Error(
      `Thread ${threadId} has USER comments but none are linked to a Student`
    );
  }

  // ── 2. Idempotency: find an existing artifact for this thread ────
  const artifactRepo = AppDataSource.getRepository(Artifact);
  const existing = await artifactRepo.findOne({
    where: { threadId, type: ArtifactType.CONVERSATION },
  });

  if (existing) {
    // Top up any new USER comments that aren't yet sections.
    const sectionRepo = AppDataSource.getRepository(ArtifactSection);
    const existingSections = await sectionRepo.find({
      where: { artifactId: existing.id },
      select: { id: true, commentId: true, sequenceOrder: true },
      order: { sequenceOrder: "ASC" },
    });
    const seenCommentIds = new Set(
      existingSections.map((s) => s.commentId).filter(Boolean)
    );
    const missing = userComments.filter((c) => !seenCommentIds.has(c.id));

    if (missing.length > 0) {
      const startOrder =
        existingSections.length > 0
          ? Math.max(...existingSections.map((s) => s.sequenceOrder)) + 1
          : 0;
      const newSections = missing.map((c, i) =>
        sectionRepo.create({
          artifactId: existing.id,
          commentId: c.id,
          sequenceOrder: startOrder + i,
          title: null,
          content: c.text,
          type: SectionType.COMMENT,
          wordCount: wordCount(c.text),
        })
      );
      await sectionRepo.save(newSections);
    }

    return {
      artifactId: existing.id,
      sectionCount: existingSections.length + missing.length,
      created: false,
    };
  }

  // ── 3. Create a fresh artifact + sections in one transaction ─────
  const artifactId = await AppDataSource.transaction(async (em) => {
    const artifact = em.create(Artifact, {
      studentId,
      courseId: assignment.courseId,
      assignmentId: assignment.id,
      threadId: thread.id,
      title: thread.name || `Conversation — ${assignment.name}`,
      type: ArtifactType.CONVERSATION,
      // Conversations already have Phase-2 EvidenceMoments keyed on
      // commentId, so there's nothing for the Phase-3 analyzer to do.
      // Jump straight to ANALYZED.
      status: ArtifactStatus.ANALYZED,
      mimeType: null,
      fileSizeBytes: null,
      storagePath: null,
      uploadedById: uploadedById ?? null,
      sourceUrl: null,
      errorMessage: null,
    });
    const saved = await em.save(artifact);

    const sections = userComments.map((c, i) =>
      em.create(ArtifactSection, {
        artifactId: saved.id,
        commentId: c.id,
        sequenceOrder: i,
        title: null,
        content: c.text,
        type: SectionType.COMMENT,
        wordCount: wordCount(c.text),
      })
    );
    await em.save(sections);

    return saved.id;
  });

  return {
    artifactId,
    sectionCount: userComments.length,
    created: true,
  };
}
