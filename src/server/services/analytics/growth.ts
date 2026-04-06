import { AppDataSource } from "../../data-source.js";
import { Assignment } from "../../entities/Assignment.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import type { AnalyticsScope, AnalyticsResult, DepthBand } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";

// Signal weights (same as engagement.ts)
const WEIGHTS = {
  toriTagCount: 0.3,
  lexicalDiversity: 0.2,
  evidenceCount: 0.2,
  logicalConnectorCount: 0.15,
  questionCount: 0.15,
};

function assignDepthBand(score: number): DepthBand {
  if (score <= 0.33) return "SURFACE";
  if (score <= 0.66) return "DEVELOPING";
  return "DEEP";
}

function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

function extractSignals(text: string) {
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

export interface GrowthDataPoint {
  assignmentId: string;
  assignmentName: string;
  date: string;
  score: number;
  depthBand: DepthBand;
}

export interface StudentGrowth {
  studentId: string;
  name: string;
  dataPoints: GrowthDataPoint[];
}

/**
 * Computes engagement score per student per assignment, enabling
 * growth-over-time visualization (sparklines, delta comparison).
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

    // Get assignment info (name, date) for all assignments in scope
    const assignmentIds = [...new Set(resolved.threads.map((t) => t.assignmentId))];
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

    // Map comment → assignment via thread
    const threadAssignmentMap = new Map(
      resolved.threads.map((t) => [t.id, t.assignmentId])
    );

    // Get TORI tag counts per comment
    const commentIds = userComments.map((c) => c.id);
    const cttRepo = AppDataSource.getRepository(CommentToriTag);

    // Batch query tag counts (only if there are comments)
    let tagCountMap = new Map<string, number>();
    if (commentIds.length > 0) {
      const tagCounts = await cttRepo
        .createQueryBuilder("ctt")
        .select("ctt.commentId", "commentId")
        .addSelect("COUNT(*)", "count")
        .where("ctt.commentId IN (:...ids)", { ids: commentIds })
        .groupBy("ctt.commentId")
        .getRawMany<{ commentId: string; count: string }>();
      tagCountMap = new Map(
        tagCounts.map((r) => [r.commentId, parseInt(r.count, 10)])
      );
    }

    // Extract raw signals per comment
    const rawSignals = userComments.map((c) => ({
      commentId: c.id,
      studentId: c.studentId!,
      assignmentId: threadAssignmentMap.get(c.threadId),
      toriTagCount: tagCountMap.get(c.id) ?? 0,
      ...extractSignals(c.text),
    }));

    // Normalize dimensions across all comments
    const toriNorm = normalize(rawSignals.map((s) => s.toriTagCount));
    const evidenceNorm = normalize(rawSignals.map((s) => s.evidenceCount));
    const connectorNorm = normalize(rawSignals.map((s) => s.logicalConnectorCount));
    const questionNorm = normalize(rawSignals.map((s) => s.questionCount));

    // Compute per-comment engagement scores
    const commentScores = rawSignals.map((s, i) => {
      const score =
        toriNorm[i] * WEIGHTS.toriTagCount +
        s.lexicalDiversity * WEIGHTS.lexicalDiversity +
        evidenceNorm[i] * WEIGHTS.evidenceCount +
        connectorNorm[i] * WEIGHTS.logicalConnectorCount +
        questionNorm[i] * WEIGHTS.questionCount;

      return {
        studentId: s.studentId,
        assignmentId: s.assignmentId,
        score: Math.min(1, Math.max(0, score)),
      };
    });

    // Group by student → assignment → average score
    const grouped = new Map<string, Map<string, number[]>>();
    for (const cs of commentScores) {
      if (!cs.assignmentId) continue;
      if (!grouped.has(cs.studentId)) grouped.set(cs.studentId, new Map());
      const studentMap = grouped.get(cs.studentId)!;
      if (!studentMap.has(cs.assignmentId)) studentMap.set(cs.assignmentId, []);
      studentMap.get(cs.assignmentId)!.push(cs.score);
    }

    // Get student names from the comments (resolve from DB)
    const studentIds = [...grouped.keys()];
    let studentNameMap = new Map<string, string>();
    if (studentIds.length > 0) {
      const students = await AppDataSource.createQueryBuilder()
        .select(["s.id", "s.\"firstName\"", "s.\"lastName\""])
        .from("student", "s")
        .where("s.id IN (:...ids)", { ids: studentIds })
        .getRawMany();
      studentNameMap = new Map(
        students.map((s: any) => [
          s.s_id,
          [s.s_firstName, s.s_lastName].filter(Boolean).join(" ") || "Student",
        ])
      );
    }

    // Sort assignments by date
    const sortedAssignmentIds = [...assignmentMap.entries()]
      .sort((a, b) => new Date(a[1].date).getTime() - new Date(b[1].date).getTime())
      .map(([id]) => id);

    // Build growth data
    const result: StudentGrowth[] = [];
    for (const [studentId, assignmentScores] of grouped) {
      const dataPoints: GrowthDataPoint[] = [];
      for (const aId of sortedAssignmentIds) {
        const scores = assignmentScores.get(aId);
        if (!scores) continue;
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const info = assignmentMap.get(aId)!;
        dataPoints.push({
          assignmentId: aId,
          assignmentName: info.name,
          date: info.date instanceof Date ? info.date.toISOString() : String(info.date),
          score: Math.round(avg * 1000) / 1000,
          depthBand: assignDepthBand(avg),
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

    // Sort by student name
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
