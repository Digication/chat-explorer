import { AppDataSource } from "../../data-source.js";
import { Comment } from "../../entities/Comment.js";
import { CommentReflectionClassification } from "../../entities/CommentReflectionClassification.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import type { AnalyticsScope } from "./types.js";
import type { CellEvidence, CellEvidenceResult } from "./heatmap.js";

// ── Category Evidence (for Growth cell drill-down) ─────────────

export interface CategoryEvidenceItem {
  commentId: string;
  text: string;
  threadId: string;
  threadName: string;
  category: string;
  evidenceQuote: string | null;
  timestamp: string | null;
}

export interface CategoryEvidenceResult {
  items: CategoryEvidenceItem[];
  totalCount: number;
}

export async function getCategoryEvidence(
  scope: AnalyticsScope,
  studentId: string,
  assignmentId: string,
  category: string,
  limit: number = 20,
  offset: number = 0
): Promise<CategoryEvidenceResult> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  const buildBaseQuery = () => {
    const qb = AppDataSource.getRepository(Comment)
      .createQueryBuilder("c")
      .innerJoin("c.thread", "t")
      .innerJoin("t.assignment", "a")
      .innerJoin("a.course", "co")
      .innerJoin(
        CommentReflectionClassification,
        "crc",
        'crc."commentId" = c.id'
      )
      .where("c.role = :role", { role: "USER" })
      .andWhere("co.institutionId = :instId", { instId: scope.institutionId })
      .andWhere("c.studentId = :studentId", { studentId })
      .andWhere("t.assignmentId = :assignmentId", { assignmentId })
      .andWhere("crc.category = :category", { category });

    if (scope.courseId) {
      qb.andWhere("a.courseId = :courseId", { courseId: scope.courseId });
    }
    return qb;
  };

  const totalCount = await buildBaseQuery().getCount();

  const rows = await buildBaseQuery()
    .select([
      'c.id AS "commentId"',
      'c.text AS "text"',
      'c.threadId AS "threadId"',
      't.name AS "threadName"',
      'crc.category AS "category"',
      'crc."evidenceQuote" AS "evidenceQuote"',
      'c.timestamp AS "timestamp"',
    ])
    .orderBy("c.timestamp", "ASC", "NULLS LAST")
    .addOrderBy("c.orderIndex", "ASC")
    .limit(safeLimit)
    .offset(safeOffset)
    .getRawMany();

  const items: CategoryEvidenceItem[] = rows.map((r) => ({
    commentId: r.commentId ?? r.commentid,
    text: r.text,
    threadId: r.threadId ?? r.threadid,
    threadName: r.threadName ?? r.threadname,
    category: r.category,
    evidenceQuote: r.evidenceQuote ?? r.evidencequote ?? null,
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : null,
  }));

  return { items, totalCount };
}

// ── Multi-Tag Evidence (for Co-occurrence drill-down) ──────────

export async function getMultiTagEvidence(
  scope: AnalyticsScope,
  toriTagIds: string[],
  limit: number = 20,
  offset: number = 0
): Promise<CellEvidenceResult> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  if (toriTagIds.length === 0) {
    return { items: [], totalCount: 0 };
  }

  // Find comment IDs that have ALL specified tags
  const cttRepo = AppDataSource.getRepository(CommentToriTag);
  const intersectionSubQuery = cttRepo
    .createQueryBuilder("ctt_sub")
    .select('ctt_sub."commentId"')
    .where('ctt_sub."toriTagId" IN (:...tagIds)', { tagIds: toriTagIds })
    .groupBy('ctt_sub."commentId"')
    .having("COUNT(DISTINCT ctt_sub.\"toriTagId\") = :tagCount", {
      tagCount: toriTagIds.length,
    });

  const buildBaseQuery = () => {
    const qb = AppDataSource.getRepository(Comment)
      .createQueryBuilder("c")
      .innerJoin("c.thread", "t")
      .innerJoin("t.assignment", "a")
      .innerJoin("a.course", "co")
      .leftJoin("c.student", "s")
      .where("c.role = :role", { role: "USER" })
      .andWhere("co.institutionId = :instId", { instId: scope.institutionId })
      .andWhere(
        `c.id IN (${intersectionSubQuery.getQuery()})`
      )
      .setParameters(intersectionSubQuery.getParameters());

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

  const totalCount = await buildBaseQuery().getCount();

  const rows = await buildBaseQuery()
    .select([
      'c.id AS "commentId"',
      'c.text AS "text"',
      'c.threadId AS "threadId"',
      't.name AS "threadName"',
      'c.studentId AS "studentId"',
      's."firstName" AS "studentFirstName"',
      's."lastName" AS "studentLastName"',
      'c.timestamp AS "timestamp"',
    ])
    .orderBy("c.timestamp", "ASC", "NULLS LAST")
    .addOrderBy("c.orderIndex", "ASC")
    .limit(safeLimit)
    .offset(safeOffset)
    .getRawMany();

  const items: CellEvidence[] = rows.map((r) => {
    const firstName = r.studentFirstName ?? r.studentfirstname;
    const lastName = r.studentLastName ?? r.studentlastname;
    const studentName =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName || lastName || null;
    return {
      commentId: r.commentId ?? r.commentid,
      text: r.text,
      threadId: r.threadId ?? r.threadid,
      threadName: r.threadName ?? r.threadname,
      studentId: r.studentId ?? r.studentid ?? null,
      studentName,
      timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : null,
    };
  });

  return { items, totalCount };
}
