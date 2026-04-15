import { AppDataSource } from "../../data-source.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import { ToriTag } from "../../entities/ToriTag.js";
import { Student } from "../../entities/Student.js";
import { In } from "typeorm";
import type {
  AnalyticsScope,
  AnalyticsResult,
  ReflectionCategory,
  ReflectionCategoryDistribution,
} from "./types.js";
import { ALL_REFLECTION_CATEGORIES } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";
import { getEngagement } from "./engagement.js";

export interface StudentProfile {
  studentId: string;
  name: string;
  topToriTags: string[]; // top 3 tag names
  modalCategory: ReflectionCategory;
  categoryDistribution: Record<ReflectionCategory, number>;
  commentCount: number;
  avgWordCount: number;
}

export interface TagExemplar {
  tagName: string;
  exemplars: Array<{
    commentId: string;
    studentLabel: string;
    textExcerpt: string;
  }>;
}

export interface PromptPattern {
  promptExcerpt: string; // first 200 chars of the AI opening
  threadCount: number;
  avgEngagement: number;
  topToriTags: string[];
}

export interface InstructionalInsights {
  studentProfiles: StudentProfile[];
  tagExemplars: TagExemplar[];
  promptPatterns: PromptPattern[];
  categoryDistribution: Record<
    ReflectionCategory,
    { count: number; percent: number }
  >;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function getInsights(
  scope: AnalyticsScope
): Promise<AnalyticsResult<InstructionalInsights>> {
  const cacheKey = `insights:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);
  const userComments = resolved.comments.filter(
    (c) => c.role === "USER" && c.studentId
  );
  const allComments = resolved.comments;

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    // Get engagement data
    const engagementResult = await getEngagement(scope);
    const engagementByComment = new Map(
      engagementResult.data.perComment.map((ce) => [ce.commentId, ce])
    );
    const engagementByStudent = new Map(
      engagementResult.data.perStudent.map((se) => [se.studentId, se])
    );

    // Get TORI tags
    const commentIds = userComments.map((c) => c.id);
    let associations: Array<{ commentId: string; toriTagId: string }> = [];
    if (commentIds.length > 0) {
      const cttRepo = AppDataSource.getRepository(CommentToriTag);
      associations = await cttRepo
        .createQueryBuilder("ctt")
        .select(["ctt.commentId", "ctt.toriTagId"])
        .where("ctt.commentId IN (:...ids)", { ids: commentIds })
        .getMany();
    }

    const tagRepo = AppDataSource.getRepository(ToriTag);
    const allTags = await tagRepo.find();
    const tagMap = new Map(allTags.map((t) => [t.id, t]));

    // Get student info
    const studentIds = resolved.consentedStudentIds;
    const studentRepo = AppDataSource.getRepository(Student);
    const students =
      studentIds.length > 0
        ? await studentRepo.find({
            where: { id: In(studentIds) },
            select: ["id", "firstName", "lastName", "systemId"],
          })
        : [];
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const studentLabel = (id: string) => {
      const s = studentMap.get(id);
      if (s?.firstName && s?.lastName) return `${s.firstName} ${s.lastName}`;
      return s?.systemId ?? id;
    };

    // ── Student profiles ─────────────────────────────────────────
    // Tags per student
    const tagsByStudent = new Map<string, Map<string, number>>();
    const commentStudentMap = new Map(
      userComments.map((c) => [c.id, c.studentId!])
    );
    for (const assoc of associations) {
      const sId = commentStudentMap.get(assoc.commentId);
      if (!sId) continue;
      if (!tagsByStudent.has(sId)) tagsByStudent.set(sId, new Map());
      const m = tagsByStudent.get(sId)!;
      m.set(assoc.toriTagId, (m.get(assoc.toriTagId) ?? 0) + 1);
    }

    const studentProfiles: StudentProfile[] = studentIds.map((sId) => {
      const sComments = userComments.filter((c) => c.studentId === sId);
      // Skip students with no comments in this scope
      if (sComments.length === 0) return null as unknown as StudentProfile;
      const tagCounts = tagsByStudent.get(sId) ?? new Map<string, number>();
      const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tagId]) => tagMap.get(tagId)?.name ?? "Unknown");

      const eng = engagementByStudent.get(sId);
      const avgWordCount =
        sComments.length > 0
          ? sComments.reduce((sum, c) => sum + countWords(c.text), 0) /
            sComments.length
          : 0;

      return {
        studentId: sId,
        name: studentLabel(sId),
        topToriTags: topTags,
        modalCategory: eng?.modalCategory ?? "DESCRIPTIVE_WRITING",
        categoryDistribution: eng?.categoryDistribution ?? {
          DESCRIPTIVE_WRITING: 0,
          DESCRIPTIVE_REFLECTION: 0,
          DIALOGIC_REFLECTION: 0,
          CRITICAL_REFLECTION: 0,
        },
        commentCount: sComments.length,
        avgWordCount,
      };
    }).filter((p): p is StudentProfile => p !== null);

    // ── Tag exemplars ────────────────────────────────────────────
    // Group associations by tag, then pick top 3 by engagement score
    const commentsByTag = new Map<string, string[]>();
    for (const assoc of associations) {
      if (!commentsByTag.has(assoc.toriTagId)) {
        commentsByTag.set(assoc.toriTagId, []);
      }
      commentsByTag.get(assoc.toriTagId)!.push(assoc.commentId);
    }

    const commentMap = new Map(userComments.map((c) => [c.id, c]));
    const tagExemplars: TagExemplar[] = [];

    for (const [tagId, cIds] of commentsByTag) {
      const tag = tagMap.get(tagId);
      if (!tag) continue;

      // Sort by reflection depth (higher = better exemplar).
      const CATEGORY_ORDINAL: Record<string, number> = {
        DESCRIPTIVE_WRITING: 0,
        DESCRIPTIVE_REFLECTION: 1,
        DIALOGIC_REFLECTION: 2,
        CRITICAL_REFLECTION: 3,
      };
      const scored = cIds
        .map((cId) => ({
          commentId: cId,
          category: engagementByComment.get(cId)?.category ?? "DESCRIPTIVE_WRITING",
          comment: commentMap.get(cId),
        }))
        .filter((s) => s.comment)
        .sort(
          (a, b) =>
            (CATEGORY_ORDINAL[b.category] ?? 0) -
            (CATEGORY_ORDINAL[a.category] ?? 0)
        )
        .slice(0, 3);

      tagExemplars.push({
        tagName: tag.name,
        exemplars: scored.map((s) => ({
          commentId: s.commentId,
          studentLabel: s.comment?.studentId
            ? studentLabel(s.comment.studentId)
            : "Unknown",
          textExcerpt: s.comment!.text.slice(0, 200),
        })),
      });
    }

    // ── Prompt patterns ──────────────────────────────────────────
    // Group threads by the assistant's first message
    const threadFirstAssistant = new Map<string, string>();
    const commentsByThread = new Map<string, typeof allComments>();
    for (const c of allComments) {
      if (!commentsByThread.has(c.threadId)) {
        commentsByThread.set(c.threadId, []);
      }
      commentsByThread.get(c.threadId)!.push(c);
    }

    for (const [threadId, threadComments] of commentsByThread) {
      const sorted = [...threadComments].sort(
        (a, b) => a.orderIndex - b.orderIndex
      );
      const firstAssistant = sorted.find((c) => c.role === "ASSISTANT");
      if (firstAssistant) {
        threadFirstAssistant.set(threadId, firstAssistant.text.slice(0, 200));
      }
    }

    // Group by prompt
    const promptGroups = new Map<
      string,
      { threadIds: string[]; engagements: number[]; tagIds: string[] }
    >();

    for (const [threadId, prompt] of threadFirstAssistant) {
      if (!promptGroups.has(prompt)) {
        promptGroups.set(prompt, {
          threadIds: [],
          engagements: [],
          tagIds: [],
        });
      }
      const group = promptGroups.get(prompt)!;
      group.threadIds.push(threadId);

      // Get engagement scores for user comments in this thread
      const threadUserComments = userComments.filter(
        (c) => c.threadId === threadId
      );
      // Engagement scores no longer exist — kept for prompt pattern
      // sort key (0/1/2/3 ordinal from the category).
      const CAT_ORD: Record<string, number> = {
        DESCRIPTIVE_WRITING: 0,
        DESCRIPTIVE_REFLECTION: 1,
        DIALOGIC_REFLECTION: 2,
        CRITICAL_REFLECTION: 3,
      };
      for (const c of threadUserComments) {
        const eng = engagementByComment.get(c.id);
        if (eng) group.engagements.push(CAT_ORD[eng.category] ?? 0);
      }

      // Get tags for this thread's comments
      for (const c of threadUserComments) {
        const tags = associations.filter((a) => a.commentId === c.id);
        for (const t of tags) group.tagIds.push(t.toriTagId);
      }
    }

    const promptPatterns: PromptPattern[] = [...promptGroups.entries()]
      .filter(([, g]) => g.threadIds.length > 1) // only repeated prompts
      .map(([prompt, g]) => {
        const avgEng =
          g.engagements.length > 0
            ? g.engagements.reduce((a, b) => a + b, 0) / g.engagements.length
            : 0;

        // Top tags by frequency
        const tagCounts = new Map<string, number>();
        for (const tid of g.tagIds) {
          tagCounts.set(tid, (tagCounts.get(tid) ?? 0) + 1);
        }
        const topTags = [...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tagId]) => tagMap.get(tagId)?.name ?? "Unknown");

        return {
          promptExcerpt: prompt,
          threadCount: g.threadIds.length,
          avgEngagement: avgEng,
          topToriTags: topTags,
        };
      })
      .sort((a, b) => b.threadCount - a.threadCount);

    // ── Category distribution ───────────────────────────────────
    const totalStudents = studentProfiles.length;
    const catCounts: Record<ReflectionCategory, number> = {
      DESCRIPTIVE_WRITING: 0,
      DESCRIPTIVE_REFLECTION: 0,
      DIALOGIC_REFLECTION: 0,
      CRITICAL_REFLECTION: 0,
    };
    for (const sp of studentProfiles) {
      catCounts[sp.modalCategory]++;
    }
    const categoryDistribution = {} as Record<
      ReflectionCategory,
      { count: number; percent: number }
    >;
    for (const cat of ALL_REFLECTION_CATEGORIES) {
      categoryDistribution[cat] = {
        count: catCounts[cat],
        percent:
          totalStudents > 0 ? (catCounts[cat] / totalStudents) * 100 : 0,
      };
    }

    return {
      studentProfiles,
      tagExemplars,
      promptPatterns,
      categoryDistribution,
    };
  });

  return {
    data,
    meta: {
      scope,
      consentedStudentCount: resolved.consentedStudentIds.length,
      excludedStudentCount: resolved.excludedCount,
      computedAt: new Date(),
      cached,
    },
  };
}
