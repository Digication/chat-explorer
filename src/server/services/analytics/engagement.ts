import { AppDataSource } from "../../data-source.js";
import { CommentReflectionClassification } from "../../entities/CommentReflectionClassification.js";
import type {
  AnalyticsScope,
  AnalyticsResult,
  ReflectionCategory,
  ReflectionCategoryDistribution,
} from "./types.js";
import { ALL_REFLECTION_CATEGORIES } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";

// ── Interfaces ──────────────────────────────────────────────────────

export interface CommentEngagement {
  commentId: string;
  studentId: string | null;
  // The Hatton & Smith category persisted in the DB by the classifier.
  // Falls back to DESCRIPTIVE_WRITING for unclassified comments.
  category: ReflectionCategory;
  evidenceQuote: string | null;
  rationale: string | null;
}

export interface StudentEngagement {
  studentId: string;
  // The most common category across this student's classified comments.
  modalCategory: ReflectionCategory;
  categoryDistribution: ReflectionCategoryDistribution;
  commentCount: number;
}

export interface EngagementResult {
  perComment: CommentEngagement[];
  perStudent: StudentEngagement[];
  categoryDistribution: ReflectionCategoryDistribution;
}

// ── Helpers ─────────────────────────────────────────────────────────

function emptyCategoryDistribution(): ReflectionCategoryDistribution {
  return {
    DESCRIPTIVE_WRITING: 0,
    DESCRIPTIVE_REFLECTION: 0,
    DIALOGIC_REFLECTION: 0,
    CRITICAL_REFLECTION: 0,
  };
}

// Returns the category with the highest count. Ties break toward the
// higher reflective level (later in the array).
function modalCategory(
  dist: ReflectionCategoryDistribution
): ReflectionCategory {
  let best: ReflectionCategory = "DESCRIPTIVE_WRITING";
  let bestCount = -1;
  for (const cat of ALL_REFLECTION_CATEGORIES) {
    if (dist[cat] >= bestCount) {
      best = cat;
      bestCount = dist[cat];
    }
  }
  return best;
}

const DEFAULT_CATEGORY: ReflectionCategory = "DESCRIPTIVE_WRITING";

// ── Main function ───────────────────────────────────────────────────

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
        categoryDistribution: emptyCategoryDistribution(),
      };
    }

    // Fetch persisted classifications for the scoped comments.
    const commentIds = userComments.map((c) => c.id);
    const classificationRepo = AppDataSource.getRepository(
      CommentReflectionClassification
    );
    const classifications = await classificationRepo
      .createQueryBuilder("crc")
      .where('"commentId" IN (:...ids)', { ids: commentIds })
      .getMany();

    const classMap = new Map(
      classifications.map((c) => [c.commentId, c])
    );

    // Build per-comment results. Unclassified comments fall back to
    // DESCRIPTIVE_WRITING so the UI always has something to show.
    const perComment: CommentEngagement[] = userComments.map((c) => {
      const cls = classMap.get(c.id);
      return {
        commentId: c.id,
        studentId: c.studentId,
        category: cls?.category ?? DEFAULT_CATEGORY,
        evidenceQuote: cls?.evidenceQuote ?? null,
        rationale: cls?.rationale ?? null,
      };
    });

    // Aggregate per student: compute category distribution and modal.
    const studentCategories = new Map<string, ReflectionCategory[]>();
    for (const ce of perComment) {
      if (!ce.studentId) continue;
      if (!studentCategories.has(ce.studentId)) {
        studentCategories.set(ce.studentId, []);
      }
      studentCategories.get(ce.studentId)!.push(ce.category);
    }

    const perStudent: StudentEngagement[] = [
      ...studentCategories.entries(),
    ].map(([studentId, categories]) => {
      const dist = emptyCategoryDistribution();
      for (const cat of categories) dist[cat]++;
      return {
        studentId,
        modalCategory: modalCategory(dist),
        categoryDistribution: dist,
        commentCount: categories.length,
      };
    });

    // Scope-wide distribution (across students, not comments).
    const categoryDistribution = emptyCategoryDistribution();
    for (const ps of perStudent) {
      categoryDistribution[ps.modalCategory]++;
    }

    return { perComment, perStudent, categoryDistribution };
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
