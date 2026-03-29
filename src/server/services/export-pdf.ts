import { getOverview } from "./analytics/overview.js";
import { getToriAnalysis } from "./analytics/tori.js";
import { getEngagement } from "./analytics/engagement.js";
import type { AnalyticsScope } from "./analytics/types.js";
import { AppDataSource } from "../data-source.js";
import { Course } from "../entities/Course.js";

/**
 * Structured report data that the frontend renders as a PDF
 * using @react-pdf/renderer.
 */
export interface CourseReport {
  courseName: string;
  generatedAt: string;
  overview: {
    totalComments: number;
    threadCount: number;
    participantCount: number;
    toriTagCount: number;
  };
  toriFrequencies: Array<{
    tagName: string;
    domain: string;
    count: number;
    percent: number;
  }>;
  depthDistribution: {
    SURFACE: number;
    DEVELOPING: number;
    DEEP: number;
  };
  topCoOccurrences: Array<{
    tags: string[];
    count: number;
  }>;
}

/**
 * Gathers analytics data and returns a structured object
 * that the frontend can render into a PDF report.
 */
export async function generateCourseReportData(
  scope: AnalyticsScope
): Promise<CourseReport> {
  // Look up the course name (if a courseId was provided)
  let courseName = "All Courses";
  if (scope.courseId) {
    const courseRepo = AppDataSource.getRepository(Course);
    const course = await courseRepo.findOne({ where: { id: scope.courseId } });
    if (course) {
      courseName = course.name;
    }
  }

  // Run the three analytics queries in parallel
  const [overviewResult, toriResult, engagementResult] = await Promise.all([
    getOverview(scope),
    getToriAnalysis(scope),
    getEngagement(scope),
  ]);

  const overview = overviewResult.data;
  const tori = toriResult.data;
  const engagement = engagementResult.data;

  return {
    courseName,
    generatedAt: new Date().toISOString(),
    overview: {
      totalComments: overview.totalComments,
      threadCount: overview.threadCount,
      participantCount: overview.participantCount,
      toriTagCount: overview.toriTagCount,
    },
    toriFrequencies: tori.tagFrequencies.map((f) => ({
      tagName: f.tagName,
      domain: f.domain,
      count: f.count,
      percent: Math.round(f.percent * 100) / 100,
    })),
    depthDistribution: engagement.depthDistribution,
    topCoOccurrences: tori.coOccurrencePairs.slice(0, 10).map((co) => ({
      tags: co.tags,
      count: co.count,
    })),
  };
}
