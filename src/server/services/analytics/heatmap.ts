import { AppDataSource } from "../../data-source.js";
import { Comment } from "../../entities/Comment.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import { ToriTag } from "../../entities/ToriTag.js";
import { Student } from "../../entities/Student.js";
import { StudentConsent, ConsentStatus } from "../../entities/StudentConsent.js";
import { In, IsNull } from "typeorm";
import type {
  AnalyticsScope,
  AnalyticsResult,
  HeatmapMode,
  ScalingMode,
} from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";

export interface HeatmapData {
  matrix: number[][];
  rowLabels: string[]; // student identifiers
  colLabels: string[]; // tag names
  rowIds: string[];    // student UUIDs, same order as rowLabels
  colIds: string[];    // ToriTag UUIDs, same order as colLabels
  rowOrder: number[]; // ordering indices (identity unless clustered)
  colOrder: number[];
  mode: HeatmapMode;
  scaling: ScalingMode;
}

export interface CellEvidence {
  commentId: string;
  text: string;
  threadId: string;
  threadName: string;
  timestamp: string | null;
}

export async function getHeatmap(
  scope: AnalyticsScope,
  mode: HeatmapMode = "CLASSIC",
  scaling: ScalingMode = "RAW"
): Promise<AnalyticsResult<HeatmapData>> {
  const cacheKey = `heatmap:${mode}:${scaling}:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);
  const userComments = resolved.comments.filter(
    (c) => c.role === "USER" && c.studentId
  );

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    const commentIds = userComments.map((c) => c.id);
    const studentIds = resolved.consentedStudentIds;

    if (commentIds.length === 0 || studentIds.length === 0) {
      return {
        matrix: [],
        rowLabels: [],
        colLabels: [],
        rowIds: [],
        colIds: [],
        rowOrder: [],
        colOrder: [],
        mode,
        scaling,
      };
    }

    // Get all TORI associations for these comments
    const cttRepo = AppDataSource.getRepository(CommentToriTag);
    const associations = await cttRepo
      .createQueryBuilder("ctt")
      .where("ctt.commentId IN (:...ids)", { ids: commentIds })
      .getMany();

    // Map commentId → studentId
    const commentStudentMap = new Map(
      userComments.map((c) => [c.id, c.studentId!])
    );

    // Get all TORI tags (columns)
    const tagRepo = AppDataSource.getRepository(ToriTag);
    const allTags = await tagRepo.find({ order: { domainNumber: "ASC", categoryNumber: "ASC" } });

    // Get student labels
    const studentRepo = AppDataSource.getRepository(Student);
    const students = await studentRepo.find({
      where: { id: In(studentIds) },
      select: ["id", "firstName", "lastName", "systemId"],
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));

    // Build matrix: rows = students, columns = tags
    const studentIndex = new Map(studentIds.map((id, i) => [id, i]));
    const tagIndex = new Map(allTags.map((t, i) => [t.id, i]));

    const matrix: number[][] = Array.from({ length: studentIds.length }, () =>
      Array(allTags.length).fill(0)
    );

    for (const assoc of associations) {
      const sId = commentStudentMap.get(assoc.commentId);
      if (!sId) continue;
      const row = studentIndex.get(sId);
      const col = tagIndex.get(assoc.toriTagId);
      if (row !== undefined && col !== undefined) {
        matrix[row][col]++;
      }
    }

    // Apply scaling
    const scaled = applyScaling(matrix, scaling);

    // Build labels
    const rowLabels = studentIds.map((id) => {
      const s = studentMap.get(id);
      if (s?.firstName && s?.lastName) return `${s.firstName} ${s.lastName}`;
      return s?.systemId ?? id;
    });
    const colLabels = allTags.map((t) => t.name);

    // Ordering
    let rowOrder = rowLabels.map((_, i) => i);
    let colOrder = colLabels.map((_, i) => i);

    const rowIds = studentIds;
    const colIds = allTags.map((t) => t.id);

    return { matrix: scaled, rowLabels, colLabels, rowIds, colIds, rowOrder, colOrder, mode, scaling };
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

function applyScaling(matrix: number[][], scaling: ScalingMode): number[][] {
  if (scaling === "RAW") return matrix;

  if (scaling === "ROW") {
    return matrix.map((row) => {
      const max = Math.max(...row);
      if (max === 0) return row;
      return row.map((v) => v / max);
    });
  }

  // GLOBAL
  let globalMax = 0;
  for (const row of matrix) {
    for (const v of row) {
      if (v > globalMax) globalMax = v;
    }
  }
  if (globalMax === 0) return matrix;
  return matrix.map((row) => row.map((v) => v / globalMax));
}

/**
 * Returns the actual comment text for a specific (student, TORI tag) pair.
 * Uses a direct consent check instead of resolveScope() to avoid loading
 * all comments into memory.
 */
export async function getHeatmapCellEvidence(
  scope: AnalyticsScope,
  studentId: string,
  toriTagId: string
): Promise<CellEvidence[]> {
  // Direct consent check — lightweight, no resolveScope()
  const consentRepo = AppDataSource.getRepository(StudentConsent);

  // Check institution-level exclusion
  const instExclusion = await consentRepo.findOne({
    where: {
      studentId,
      institutionId: scope.institutionId,
      courseId: IsNull(),
      status: ConsentStatus.EXCLUDED,
    },
  });
  if (instExclusion) return [];

  // Check course-level exclusion
  if (scope.courseId) {
    const courseExclusion = await consentRepo.findOne({
      where: {
        studentId,
        institutionId: scope.institutionId,
        courseId: scope.courseId,
        status: ConsentStatus.EXCLUDED,
      },
    });
    if (courseExclusion) return [];
  }

  // Direct evidence query
  const qb = AppDataSource.getRepository(Comment)
    .createQueryBuilder("c")
    .innerJoin(CommentToriTag, "ctt", "ctt.commentId = c.id")
    .innerJoin("c.thread", "t")
    .innerJoin("t.assignment", "a")
    .select([
      'c.id AS "commentId"',
      "c.text AS text",
      'c.threadId AS "threadId"',
      't.name AS "threadName"',
      "c.timestamp AS timestamp",
    ])
    .where("c.studentId = :studentId", { studentId })
    .andWhere("ctt.toriTagId = :toriTagId", { toriTagId })
    .andWhere("c.role = :role", { role: "USER" })
    .andWhere(
      'a."courseId" IN (SELECT id FROM course WHERE "institutionId" = :instId)',
      { instId: scope.institutionId }
    );

  if (scope.courseId) {
    qb.andWhere("a.courseId = :courseId", { courseId: scope.courseId });
  }
  if (scope.assignmentId) {
    qb.andWhere("t.assignmentId = :assignmentId", {
      assignmentId: scope.assignmentId,
    });
  }

  qb.orderBy("c.timestamp", "ASC", "NULLS LAST")
    .addOrderBy("c.orderIndex", "ASC")
    .limit(20);

  const rows = await qb.getRawMany();

  return rows.map((r) => ({
    commentId: r.commentId ?? r.commentid,
    text: r.text,
    threadId: r.threadId ?? r.threadid,
    threadName: r.threadName ?? r.threadname,
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : null,
  }));
}
