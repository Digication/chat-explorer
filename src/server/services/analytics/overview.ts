import { AppDataSource } from "../../data-source.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import type { AnalyticsScope, AnalyticsResult } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";

export interface WordCountStats {
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface OverviewStats {
  totalComments: number;
  userComments: number;
  assistantComments: number;
  systemComments: number;
  threadCount: number;
  participantCount: number;
  wordCountStats: WordCountStats;
  toriTagCount: number;
  dateRange: { earliest: string | null; latest: string | null };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function getOverview(
  scope: AnalyticsScope
): Promise<AnalyticsResult<OverviewStats>> {
  const cacheKey = `overview:${JSON.stringify(scope)}`;

  const resolved = await resolveScope(scope);
  const { comments } = resolved;

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    const userComments = comments.filter((c) => c.role === "USER");
    const assistantComments = comments.filter((c) => c.role === "ASSISTANT");
    const systemComments = comments.filter((c) => c.role === "SYSTEM");

    const wordCounts = userComments.map((c) => countWords(c.text));
    const wordCountStats: WordCountStats =
      wordCounts.length > 0
        ? {
            min: Math.min(...wordCounts),
            max: Math.max(...wordCounts),
            mean:
              wordCounts.reduce((sum, w) => sum + w, 0) / wordCounts.length,
            median: median(wordCounts),
          }
        : { min: 0, max: 0, mean: 0, median: 0 };

    // Count TORI tag applications for consented student comments
    const studentCommentIds = userComments.map((c) => c.id);
    let toriTagCount = 0;
    if (studentCommentIds.length > 0) {
      const toriRepo = AppDataSource.getRepository(CommentToriTag);
      toriTagCount = await toriRepo
        .createQueryBuilder("ctt")
        .where("ctt.commentId IN (:...ids)", { ids: studentCommentIds })
        .getCount();
    }

    // Date range
    const timestamps = comments
      .map((c) => c.timestamp)
      .filter((t): t is Date => t !== null);
    const earliest =
      timestamps.length > 0
        ? new Date(Math.min(...timestamps.map((t) => t.getTime())))
        : null;
    const latest =
      timestamps.length > 0
        ? new Date(Math.max(...timestamps.map((t) => t.getTime())))
        : null;

    const threadIds = new Set(comments.map((c) => c.threadId));
    const participantIds = new Set(
      userComments.map((c) => c.studentId).filter(Boolean)
    );

    return {
      totalComments: comments.length,
      userComments: userComments.length,
      assistantComments: assistantComments.length,
      systemComments: systemComments.length,
      threadCount: threadIds.size,
      participantCount: participantIds.size,
      wordCountStats,
      toriTagCount,
      dateRange: {
        earliest: earliest?.toISOString() ?? null,
        latest: latest?.toISOString() ?? null,
      },
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
