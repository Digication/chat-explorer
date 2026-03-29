import { AppDataSource } from "../../data-source.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import { ToriTag } from "../../entities/ToriTag.js";
import { Student } from "../../entities/Student.js";
import { In } from "typeorm";
import type {
  AnalyticsScope,
  AnalyticsResult,
  HeatmapMode,
  ScalingMode,
} from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";
import { clusterMatrix } from "./clustering.js";

export interface HeatmapData {
  matrix: number[][];
  rowLabels: string[]; // student identifiers
  colLabels: string[]; // tag names
  rowOrder: number[]; // ordering indices (identity unless clustered)
  colOrder: number[];
  mode: HeatmapMode;
  scaling: ScalingMode;
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

    if (mode === "CLUSTERED") {
      const clustered = clusterMatrix(scaled);
      rowOrder = clustered.rowOrder;
      colOrder = clustered.colOrder;
    }

    return { matrix: scaled, rowLabels, colLabels, rowOrder, colOrder, mode, scaling };
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
