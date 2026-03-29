import { AppDataSource } from "../../data-source.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import type { AnalyticsScope, AnalyticsResult, DepthBand } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";
import { type CommentSignals } from "./text-signals.js";

// Signal weights for composite score
const WEIGHTS = {
  toriTagCount: 0.3,
  lexicalDiversity: 0.2,
  evidenceCount: 0.2,
  logicalConnectorCount: 0.15,
  questionCount: 0.15,
};

export interface CommentEngagement {
  commentId: string;
  studentId: string | null;
  score: number; // 0 to 1
  depthBand: DepthBand;
  components: {
    toriTagCountNorm: number;
    lexicalDiversity: number;
    evidenceCountNorm: number;
    logicalConnectorCountNorm: number;
    questionCountNorm: number;
  };
}

export interface StudentEngagement {
  studentId: string;
  averageScore: number;
  depthBand: DepthBand;
  commentCount: number;
}

export interface EngagementResult {
  perComment: CommentEngagement[];
  perStudent: StudentEngagement[];
  depthDistribution: Record<DepthBand, number>;
}

function assignDepthBand(score: number): DepthBand {
  if (score <= 0.33) return "SURFACE";
  if (score <= 0.66) return "DEVELOPING";
  return "DEEP";
}

// Min-max normalization
function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

/**
 * Computes text signals for comments inline (avoids circular dependency
 * with text-signals module by doing lightweight extraction here).
 */
function extractSignals(text: string): Pick<
  CommentSignals,
  "lexicalDiversity" | "evidenceCount" | "logicalConnectorCount" | "questionCount"
> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words);
  const lexicalDiversity = words.length > 0 ? uniqueWords.size / words.length : 0;
  const questionCount = (text.match(/\?/g) ?? []).length;

  const evidencePhrases = [
    "for example", "such as", "according to",
    "research shows", "data suggests", "studies indicate",
  ];
  const connectors = [
    "because", "therefore", "however", "although",
    "furthermore", "consequently", "in contrast",
  ];

  const lower = text.toLowerCase();
  let evidenceCount = 0;
  for (const p of evidencePhrases) {
    let idx = 0;
    while ((idx = lower.indexOf(p, idx)) !== -1) { evidenceCount++; idx += p.length; }
  }
  let logicalConnectorCount = 0;
  for (const c of connectors) {
    let idx = 0;
    while ((idx = lower.indexOf(c, idx)) !== -1) { logicalConnectorCount++; idx += c.length; }
  }

  return { lexicalDiversity, evidenceCount, logicalConnectorCount, questionCount };
}

export async function getEngagement(
  scope: AnalyticsScope
): Promise<AnalyticsResult<EngagementResult>> {
  const cacheKey = `engagement:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);
  const userComments = resolved.comments.filter(
    (c) => c.role === "USER" && c.studentId
  );

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    if (userComments.length === 0) {
      return {
        perComment: [],
        perStudent: [],
        depthDistribution: { SURFACE: 0, DEVELOPING: 0, DEEP: 0 },
      };
    }

    // Get TORI tag counts per comment
    const commentIds = userComments.map((c) => c.id);
    const cttRepo = AppDataSource.getRepository(CommentToriTag);
    const tagCounts = await cttRepo
      .createQueryBuilder("ctt")
      .select("ctt.commentId", "commentId")
      .addSelect("COUNT(*)", "count")
      .where("ctt.commentId IN (:...ids)", { ids: commentIds })
      .groupBy("ctt.commentId")
      .getRawMany<{ commentId: string; count: string }>();

    const tagCountMap = new Map(
      tagCounts.map((r) => [r.commentId, parseInt(r.count, 10)])
    );

    // Extract signals for each comment
    const rawSignals = userComments.map((c) => ({
      commentId: c.id,
      studentId: c.studentId,
      toriTagCount: tagCountMap.get(c.id) ?? 0,
      ...extractSignals(c.text),
    }));

    // Normalize each dimension
    const toriNorm = normalize(rawSignals.map((s) => s.toriTagCount));
    const evidenceNorm = normalize(rawSignals.map((s) => s.evidenceCount));
    const connectorNorm = normalize(
      rawSignals.map((s) => s.logicalConnectorCount)
    );
    const questionNorm = normalize(rawSignals.map((s) => s.questionCount));

    // Compute per-comment scores
    const perComment: CommentEngagement[] = rawSignals.map((s, i) => {
      const components = {
        toriTagCountNorm: toriNorm[i],
        lexicalDiversity: s.lexicalDiversity,
        evidenceCountNorm: evidenceNorm[i],
        logicalConnectorCountNorm: connectorNorm[i],
        questionCountNorm: questionNorm[i],
      };

      const score =
        components.toriTagCountNorm * WEIGHTS.toriTagCount +
        components.lexicalDiversity * WEIGHTS.lexicalDiversity +
        components.evidenceCountNorm * WEIGHTS.evidenceCount +
        components.logicalConnectorCountNorm * WEIGHTS.logicalConnectorCount +
        components.questionCountNorm * WEIGHTS.questionCount;

      return {
        commentId: s.commentId,
        studentId: s.studentId,
        score: Math.min(1, Math.max(0, score)),
        depthBand: assignDepthBand(score),
        components,
      };
    });

    // Aggregate per student
    const studentScores = new Map<string, number[]>();
    for (const ce of perComment) {
      if (!ce.studentId) continue;
      if (!studentScores.has(ce.studentId)) {
        studentScores.set(ce.studentId, []);
      }
      studentScores.get(ce.studentId)!.push(ce.score);
    }

    const perStudent: StudentEngagement[] = [...studentScores.entries()].map(
      ([studentId, scores]) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return {
          studentId,
          averageScore: avg,
          depthBand: assignDepthBand(avg),
          commentCount: scores.length,
        };
      }
    );

    // Depth band distribution
    const depthDistribution: Record<DepthBand, number> = {
      SURFACE: 0,
      DEVELOPING: 0,
      DEEP: 0,
    };
    for (const ps of perStudent) {
      depthDistribution[ps.depthBand]++;
    }

    return { perComment, perStudent, depthDistribution };
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
