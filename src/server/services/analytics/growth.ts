import { AppDataSource } from "../../data-source.js";
import { Assignment } from "../../entities/Assignment.js";
import { CommentReflectionClassification } from "../../entities/CommentReflectionClassification.js";
import type { AnalyticsScope, AnalyticsResult, ReflectionCategory } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";
import { modalOf } from "./utils.js";

export interface GrowthDataPoint {
  assignmentId: string;
  assignmentName: string;
  date: string;
  // The modal (most-common) reflection category for this student in
  // this assignment. Replaces the old numerical score + depth band.
  category: ReflectionCategory;
}

export interface StudentGrowth {
  studentId: string;
  name: string;
  dataPoints: GrowthDataPoint[];
}

const DEFAULT_CATEGORY: ReflectionCategory = "DESCRIPTIVE_WRITING";

/**
 * Computes the modal reflection category per student per assignment,
 * enabling growth-over-time visualization.
 */
export async function getGrowth(
  scope: AnalyticsScope
): Promise<AnalyticsResult<StudentGrowth[]>> {
  const cacheKey = `growth:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);
  const userComments = resolved.comments.filter(
    (c) => c.role === "USER" && c.studentId
  );

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    if (userComments.length === 0) return [];

    // Get assignment info (name, date) for all assignments in scope.
    const assignmentIds = [
      ...new Set(resolved.threads.map((t) => t.assignmentId)),
    ];
    if (assignmentIds.length === 0) return [];

    const assignmentRepo = AppDataSource.getRepository(Assignment);
    const assignments = await assignmentRepo
      .createQueryBuilder("a")
      .select(["a.id", "a.name", "a.importedAt"])
      .where("a.id IN (:...ids)", { ids: assignmentIds })
      .getMany();

    const assignmentMap = new Map(
      assignments.map((a) => [a.id, { name: a.name, date: a.importedAt }])
    );

    // Map comment → assignment via thread.
    const threadAssignmentMap = new Map(
      resolved.threads.map((t) => [t.id, t.assignmentId])
    );

    // Fetch persisted classifications for scoped comments.
    const commentIds = userComments.map((c) => c.id);
    const classificationRepo = AppDataSource.getRepository(
      CommentReflectionClassification
    );
    let classMap = new Map<string, ReflectionCategory>();
    if (commentIds.length > 0) {
      const classifications = await classificationRepo
        .createQueryBuilder("crc")
        .select(['"commentId"', "category"])
        .where('"commentId" IN (:...ids)', { ids: commentIds })
        .getRawMany<{ commentId: string; category: ReflectionCategory }>();
      classMap = new Map(classifications.map((c) => [c.commentId, c.category]));
    }

    // Group by student → assignment → list of categories.
    const grouped = new Map<
      string,
      Map<string, ReflectionCategory[]>
    >();
    for (const c of userComments) {
      const aId = threadAssignmentMap.get(c.threadId);
      if (!aId || !c.studentId) continue;
      if (!grouped.has(c.studentId)) grouped.set(c.studentId, new Map());
      const studentMap = grouped.get(c.studentId)!;
      if (!studentMap.has(aId)) studentMap.set(aId, []);
      studentMap.get(aId)!.push(classMap.get(c.id) ?? DEFAULT_CATEGORY);
    }

    // Get student names.
    const studentIds = [...grouped.keys()];
    let studentNameMap = new Map<string, string>();
    if (studentIds.length > 0) {
      const students = await AppDataSource.createQueryBuilder()
        .select(["s.id", 's."firstName"', 's."lastName"'])
        .from("student", "s")
        .where("s.id IN (:...ids)", { ids: studentIds })
        .getRawMany();
      studentNameMap = new Map(
        students.map((s: any) => [
          s.s_id,
          [s.firstName, s.lastName].filter(Boolean).join(" ") || "Student",
        ])
      );
    }

    // Sort assignments by date.
    const sortedAssignmentIds = [...assignmentMap.entries()]
      .sort(
        (a, b) =>
          new Date(a[1].date).getTime() - new Date(b[1].date).getTime()
      )
      .map(([id]) => id);

    // Build growth data — one data point per student per assignment.
    const result: StudentGrowth[] = [];
    for (const [studentId, assignmentCategories] of grouped) {
      const dataPoints: GrowthDataPoint[] = [];
      for (const aId of sortedAssignmentIds) {
        const cats = assignmentCategories.get(aId);
        if (!cats || cats.length === 0) continue;
        const info = assignmentMap.get(aId)!;
        dataPoints.push({
          assignmentId: aId,
          assignmentName: info.name,
          date:
            info.date instanceof Date
              ? info.date.toISOString()
              : String(info.date),
          category: modalOf(cats),
        });
      }
      if (dataPoints.length > 0) {
        result.push({
          studentId,
          name: studentNameMap.get(studentId) ?? "Student",
          dataPoints,
        });
      }
    }

    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
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

// modalOf() has been extracted to utils.ts for shared use.
