import { AppDataSource } from "../../data-source.js";
import { Course } from "../../entities/Course.js";
import type {
  AnalyticsScope,
  AnalyticsResult,
  ReflectionCategory,
  ReflectionCategoryDistribution,
} from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";
import { emptyCategoryDistribution } from "./utils.js";
import { getEngagement } from "./engagement.js";
import { getToriAnalysis } from "./tori.js";
import { getGrowth } from "./growth.js";

// ── Interfaces ──────────────────────────────────────────────────────

export interface CourseMetricsSummary {
  courseId: string;
  courseName: string;
  studentCount: number;
  commentCount: number;
  threadCount: number;
  assignmentCount: number;
  categoryDistribution: ReflectionCategoryDistribution;
  topToriTags: string[];
  avgWordCount: number;
  growthRate: number;
}

export interface CrossCourseComparison {
  courses: CourseMetricsSummary[];
}

// Category ordinal for growth rate calculation
const CATEGORY_ORDINAL: Record<ReflectionCategory, number> = {
  DESCRIPTIVE_WRITING: 0,
  DESCRIPTIVE_REFLECTION: 1,
  DIALOGIC_REFLECTION: 2,
  CRITICAL_REFLECTION: 3,
};

// ── Main function ───────────────────────────────────────────────────

export async function getCrossCourseComparison(
  institutionId: string,
  courseIds: string[]
): Promise<AnalyticsResult<CrossCourseComparison>> {
  if (courseIds.length < 2) {
    throw new Error("Cross-course comparison requires at least 2 courses.");
  }
  if (courseIds.length > 10) {
    throw new Error("Cross-course comparison supports at most 10 courses.");
  }

  const sortedIds = [...courseIds].sort();
  const cacheKey = `crossCourse:${JSON.stringify(sortedIds)}`;
  const cacheScope: AnalyticsScope = { institutionId };

  const { data, cached } = await withCache(cacheKey, cacheScope, async () => {
    // Fetch course names
    const courseRepo = AppDataSource.getRepository(Course);
    const courseEntities = await courseRepo
      .createQueryBuilder("c")
      .select(["c.id", "c.name"])
      .where("c.id IN (:...ids)", { ids: courseIds })
      .getMany();
    const courseNameMap = new Map(courseEntities.map((c) => [c.id, c.name]));

    // Run analytics for each course in parallel
    const summaries = await Promise.all(
      courseIds.map(async (courseId): Promise<CourseMetricsSummary> => {
        const scope: AnalyticsScope = { institutionId, courseId };
        const resolved = await resolveScope(scope);
        const userComments = resolved.comments.filter(
          (c) => c.role === "USER" && c.studentId
        );

        // Engagement (for category distribution)
        const engagementResult = await getEngagement(scope);
        const categoryDistribution =
          engagementResult.data.categoryDistribution ??
          emptyCategoryDistribution();

        // TORI analysis (for top tags)
        const toriResult = await getToriAnalysis(scope);
        const topToriTags = toriResult.data.tagFrequencies
          .slice(0, 5)
          .map((t) => t.tagName);

        // Growth (for growth rate)
        const growthResult = await getGrowth(scope);
        const growthRate = computeGrowthRate(growthResult.data);

        // Word count
        const totalWords = userComments.reduce(
          (sum, c) => sum + c.text.split(/\s+/).filter(Boolean).length,
          0
        );
        const avgWordCount =
          userComments.length > 0
            ? Math.round((totalWords / userComments.length) * 10) / 10
            : 0;

        // Assignment count from threads
        const assignmentCount = new Set(
          resolved.threads.map((t) => t.assignmentId)
        ).size;

        return {
          courseId,
          courseName: courseNameMap.get(courseId) ?? "Unknown",
          studentCount: resolved.consentedStudentIds.length,
          commentCount: userComments.length,
          threadCount: resolved.threads.length,
          assignmentCount,
          categoryDistribution,
          topToriTags,
          avgWordCount,
          growthRate,
        };
      })
    );

    return { courses: summaries };
  });

  return {
    data,
    meta: {
      scope: cacheScope,
      consentedStudentCount: 0,
      excludedStudentCount: 0,
      computedAt: new Date(),
      cached,
    },
  };
}

/**
 * Computes the percentage of students who improved their modal reflection
 * category from first to last assignment.
 */
function computeGrowthRate(
  studentGrowths: Array<{
    studentId: string;
    dataPoints: Array<{ category: ReflectionCategory }>;
  }>
): number {
  let improved = 0;
  let measurable = 0;

  for (const student of studentGrowths) {
    const points = student.dataPoints;
    if (points.length < 2) continue;
    measurable++;
    const firstOrd = CATEGORY_ORDINAL[points[0].category];
    const lastOrd = CATEGORY_ORDINAL[points[points.length - 1].category];
    if (lastOrd > firstOrd) improved++;
  }

  return measurable > 0 ? Math.round((improved / measurable) * 100) : 0;
}
