import { AppDataSource } from "../../data-source.js";
import { Assignment } from "../../entities/Assignment.js";
import { CommentReflectionClassification } from "../../entities/CommentReflectionClassification.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import { ToriTag } from "../../entities/ToriTag.js";
import type {
  AnalyticsScope,
  AnalyticsResult,
  ReflectionCategory,
  ReflectionCategoryDistribution,
} from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";
import { modalOf, emptyCategoryDistribution } from "./utils.js";

// ── Interfaces ──────────────────────────────────────────────────────

export interface EvidenceHighlight {
  commentId: string;
  text: string;
  category: ReflectionCategory;
  evidenceQuote: string | null;
  rationale: string | null;
  assignmentName: string;
  threadId: string;
  timestamp: Date | null;
}

export interface PerAssignmentBreakdown {
  assignmentId: string;
  assignmentName: string;
  date: string;
  modalCategory: ReflectionCategory;
  commentCount: number;
  categoryDistribution: ReflectionCategoryDistribution;
}

export interface TagFrequencyItem {
  tagId: string;
  tagName: string;
  domain: string;
  count: number;
  percent: number;
}

export interface StudentProfileReport {
  studentId: string;
  name: string;
  totalComments: number;
  totalWordCount: number;
  avgWordCount: number;
  threadCount: number;
  assignmentCount: number;
  overallCategoryDistribution: ReflectionCategoryDistribution;
  perAssignment: PerAssignmentBreakdown[];
  toriTagDistribution: TagFrequencyItem[];
  topToriTags: string[];
  evidenceHighlights: EvidenceHighlight[];
}

const DEFAULT_CATEGORY: ReflectionCategory = "DESCRIPTIVE_WRITING";

// Ordinal for sorting evidence: higher = deeper reflection
const CATEGORY_ORDINAL: Record<ReflectionCategory, number> = {
  DESCRIPTIVE_WRITING: 0,
  DESCRIPTIVE_REFLECTION: 1,
  DIALOGIC_REFLECTION: 2,
  CRITICAL_REFLECTION: 3,
};

// ── Main function ───────────────────────────────────────────────────

export async function getStudentProfile(
  scope: AnalyticsScope,
  studentId: string
): Promise<AnalyticsResult<StudentProfileReport>> {
  // Force scope to this student only
  const studentScope: AnalyticsScope = { ...scope, studentIds: [studentId] };
  const cacheKey = `studentProfile:${studentId}:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(studentScope);
  const userComments = resolved.comments.filter(
    (c) => c.role === "USER" && c.studentId === studentId
  );

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    // ── Empty case ──────────────────────────────────────────────
    if (userComments.length === 0) {
      return emptyReport(studentId);
    }

    // ── Student name ────────────────────────────────────────────
    const studentRows = await AppDataSource.createQueryBuilder()
      .select(["s.id", 's."firstName"', 's."lastName"'])
      .from("student", "s")
      .where("s.id = :id", { id: studentId })
      .getRawMany();
    const nameRow = studentRows[0];
    const name = nameRow
      ? [nameRow.firstName, nameRow.lastName].filter(Boolean).join(" ") || "Student"
      : "Student";

    // ── Word counts ─────────────────────────────────────────────
    const totalWordCount = userComments.reduce(
      (sum, c) => sum + c.text.split(/\s+/).filter(Boolean).length,
      0
    );
    const avgWordCount =
      userComments.length > 0 ? totalWordCount / userComments.length : 0;

    // ── Thread/assignment info ──────────────────────────────────
    const threadAssignmentMap = new Map(
      resolved.threads.map((t) => [t.id, t.assignmentId])
    );
    const uniqueThreadIds = new Set(userComments.map((c) => c.threadId));
    const assignmentIds = [
      ...new Set(
        resolved.threads
          .filter((t) => uniqueThreadIds.has(t.id))
          .map((t) => t.assignmentId)
      ),
    ];

    // Fetch assignment metadata
    let assignmentMap = new Map<
      string,
      { name: string; date: Date }
    >();
    if (assignmentIds.length > 0) {
      const assignmentRepo = AppDataSource.getRepository(Assignment);
      const assignments = await assignmentRepo
        .createQueryBuilder("a")
        .select(["a.id", "a.name", "a.importedAt"])
        .where("a.id IN (:...ids)", { ids: assignmentIds })
        .getMany();
      assignmentMap = new Map(
        assignments.map((a) => [a.id, { name: a.name, date: a.importedAt }])
      );
    }

    // ── Classifications ─────────────────────────────────────────
    const commentIds = userComments.map((c) => c.id);
    const classificationRepo = AppDataSource.getRepository(
      CommentReflectionClassification
    );
    let classMap = new Map<
      string,
      { category: ReflectionCategory; evidenceQuote: string | null; rationale: string | null }
    >();
    if (commentIds.length > 0) {
      const classifications = await classificationRepo
        .createQueryBuilder("crc")
        .where('"commentId" IN (:...ids)', { ids: commentIds })
        .getMany();
      classMap = new Map(
        classifications.map((c) => [
          c.commentId,
          {
            category: c.category as ReflectionCategory,
            evidenceQuote: c.evidenceQuote ?? null,
            rationale: c.rationale ?? null,
          },
        ])
      );
    }

    // ── Overall category distribution ───────────────────────────
    const overallDist = emptyCategoryDistribution();
    for (const c of userComments) {
      const cat = classMap.get(c.id)?.category ?? DEFAULT_CATEGORY;
      overallDist[cat]++;
    }

    // ── Per-assignment breakdown ────────────────────────────────
    const byAssignment = new Map<string, ReflectionCategory[]>();
    const commentCountByAssignment = new Map<string, number>();
    for (const c of userComments) {
      const aId = threadAssignmentMap.get(c.threadId);
      if (!aId) continue;
      if (!byAssignment.has(aId)) byAssignment.set(aId, []);
      byAssignment.get(aId)!.push(classMap.get(c.id)?.category ?? DEFAULT_CATEGORY);
      commentCountByAssignment.set(aId, (commentCountByAssignment.get(aId) ?? 0) + 1);
    }

    // Sort assignments chronologically
    const sortedAssignmentIds = [...byAssignment.keys()].sort((a, b) => {
      const da = assignmentMap.get(a)?.date ?? new Date(0);
      const db = assignmentMap.get(b)?.date ?? new Date(0);
      return new Date(da).getTime() - new Date(db).getTime();
    });

    const perAssignment: PerAssignmentBreakdown[] = sortedAssignmentIds.map(
      (aId) => {
        const cats = byAssignment.get(aId)!;
        const dist = emptyCategoryDistribution();
        for (const cat of cats) dist[cat]++;
        const info = assignmentMap.get(aId);
        return {
          assignmentId: aId,
          assignmentName: info?.name ?? "Unknown",
          date:
            info?.date instanceof Date
              ? info.date.toISOString()
              : String(info?.date ?? ""),
          modalCategory: modalOf(cats),
          commentCount: commentCountByAssignment.get(aId) ?? 0,
          categoryDistribution: dist,
        };
      }
    );

    // ── TORI tag distribution ───────────────────────────────────
    let toriTagDistribution: TagFrequencyItem[] = [];
    if (commentIds.length > 0) {
      const cttRepo = AppDataSource.getRepository(CommentToriTag);
      const associations = await cttRepo
        .createQueryBuilder("ctt")
        .where("ctt.commentId IN (:...ids)", { ids: commentIds })
        .getMany();

      const tagRepo = AppDataSource.getRepository(ToriTag);
      const allTags = await tagRepo.find();
      const tagLookup = new Map(allTags.map((t) => [t.id, t]));

      const tagCounts = new Map<string, number>();
      for (const assoc of associations) {
        tagCounts.set(
          assoc.toriTagId,
          (tagCounts.get(assoc.toriTagId) ?? 0) + 1
        );
      }

      const totalAssociations = associations.length;
      toriTagDistribution = [...tagCounts.entries()]
        .map(([tagId, count]) => {
          const tag = tagLookup.get(tagId);
          return {
            tagId,
            tagName: tag?.name ?? "Unknown",
            domain: tag?.domain ?? "Unknown",
            count,
            percent:
              totalAssociations > 0 ? (count / totalAssociations) * 100 : 0,
          };
        })
        .sort((a, b) => b.count - a.count);
    }

    const topToriTags = toriTagDistribution.slice(0, 5).map((t) => t.tagName);

    // ── Evidence highlights (up to 5, highest category first) ──
    const evidenceHighlights: EvidenceHighlight[] = userComments
      .map((c) => {
        const cls = classMap.get(c.id);
        const aId = threadAssignmentMap.get(c.threadId);
        return {
          commentId: c.id,
          text: c.text,
          category: cls?.category ?? DEFAULT_CATEGORY,
          evidenceQuote: cls?.evidenceQuote ?? null,
          rationale: cls?.rationale ?? null,
          assignmentName: aId ? assignmentMap.get(aId)?.name ?? "Unknown" : "Unknown",
          threadId: c.threadId,
          timestamp: c.timestamp,
        };
      })
      .sort(
        (a, b) =>
          CATEGORY_ORDINAL[b.category] - CATEGORY_ORDINAL[a.category]
      )
      .slice(0, 5);

    return {
      studentId,
      name,
      totalComments: userComments.length,
      totalWordCount,
      avgWordCount: Math.round(avgWordCount * 10) / 10,
      threadCount: uniqueThreadIds.size,
      assignmentCount: assignmentIds.length,
      overallCategoryDistribution: overallDist,
      perAssignment,
      toriTagDistribution,
      topToriTags,
      evidenceHighlights,
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

function emptyReport(studentId: string): StudentProfileReport {
  return {
    studentId,
    name: "Student",
    totalComments: 0,
    totalWordCount: 0,
    avgWordCount: 0,
    threadCount: 0,
    assignmentCount: 0,
    overallCategoryDistribution: emptyCategoryDistribution(),
    perAssignment: [],
    toriTagDistribution: [],
    topToriTags: [],
    evidenceHighlights: [],
  };
}
