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

export interface CellEvidenceResult {
  items: CellEvidence[];
  totalCount: number;
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
 * Returns the actual comment text for evidence drill-down.
 * Supports three modes:
 *   - Both studentId + toriTagId: intersection (heatmap cell)
 *   - Only toriTagId: all evidence for that tag across students
 *   - Only studentId: all evidence for that student across tags
 *
 * Pagination: pass `limit` (default 20, capped at 200) and `offset` (default 0).
 * `totalCount` is returned alongside `items` so the UI can show "showing N of M".
 */
export async function getHeatmapCellEvidence(
  scope: AnalyticsScope,
  studentId?: string,
  toriTagId?: string,
  limit: number = 20,
  offset: number = 0
): Promise<CellEvidenceResult> {
  // Clamp limit to a sane range to prevent runaway queries.
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  // If filtering by a specific student, do consent check
  if (studentId) {
    const consentRepo = AppDataSource.getRepository(StudentConsent);

    const instExclusion = await consentRepo.findOne({
      where: {
        studentId,
        institutionId: scope.institutionId,
        courseId: IsNull(),
        status: ConsentStatus.EXCLUDED,
      },
    });
    if (instExclusion) return { items: [], totalCount: 0 };

    if (scope.courseId) {
      const courseExclusion = await consentRepo.findOne({
        where: {
          studentId,
          institutionId: scope.institutionId,
          courseId: scope.courseId,
          status: ConsentStatus.EXCLUDED,
        },
      });
      if (courseExclusion) return { items: [], totalCount: 0 };
    }
  }

  // Build the evidence query using property-path joins so TypeORM
  // handles camelCase column quoting (Postgres lowercases unquoted identifiers).
  const buildBaseQuery = () => {
    const qb = AppDataSource.getRepository(Comment)
      .createQueryBuilder("c")
      .innerJoin("c.thread", "t")
      .innerJoin("t.assignment", "a")
      .innerJoin("a.course", "co")
      .where("c.role = :role", { role: "USER" })
      .andWhere("co.institutionId = :instId", {
        instId: scope.institutionId,
      });

    // Use the c.toriTags relation (not a raw join condition string), so
    // TypeORM resolves the join columns through entity metadata.
    if (toriTagId) {
      qb.innerJoin("c.toriTags", "ctt").andWhere(
        "ctt.toriTagId = :toriTagId",
        { toriTagId }
      );
    }

    if (studentId) {
      qb.andWhere("c.studentId = :studentId", { studentId });
    }
    if (scope.courseId) {
      qb.andWhere("a.courseId = :courseId", { courseId: scope.courseId });
    }
    if (scope.assignmentId) {
      qb.andWhere("t.assignmentId = :assignmentId", {
        assignmentId: scope.assignmentId,
      });
    }
    return qb;
  };

  // Total count (independent of limit/offset).
  const totalCount = await buildBaseQuery().getCount();

  // Page of items.
  const rows = await buildBaseQuery()
    .select([
      'c.id AS "commentId"',
      'c.text AS "text"',
      'c.threadId AS "threadId"',
      't.name AS "threadName"',
      'c.timestamp AS "timestamp"',
    ])
    .orderBy("c.timestamp", "ASC", "NULLS LAST")
    .addOrderBy("c.orderIndex", "ASC")
    .limit(safeLimit)
    .offset(safeOffset)
    .getRawMany();

  const items: CellEvidence[] = rows.map((r) => ({
    commentId: r.commentId ?? r.commentid,
    text: r.text,
    threadId: r.threadId ?? r.threadid,
    threadName: r.threadName ?? r.threadname,
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : null,
  }));

  return { items, totalCount };
}
