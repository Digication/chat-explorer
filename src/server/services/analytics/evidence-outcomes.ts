/**
 * Evidence analytics — queries narrative evidence moments and their
 * outcome alignments for faculty-facing summaries.
 *
 * Follows the same scope/cache/result patterns as the other analytics
 * modules (tori.ts, engagement.ts, etc.).
 */

import { AppDataSource } from "../../data-source.js";
import { EvidenceMoment } from "../../entities/EvidenceMoment.js";
import { EvidenceOutcomeLink, StrengthLevel } from "../../entities/EvidenceOutcomeLink.js";
import { OutcomeFramework, FrameworkType } from "../../entities/OutcomeFramework.js";
import { OutcomeDefinition } from "../../entities/OutcomeDefinition.js";
import type { AnalyticsScope, AnalyticsResult } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";

// ── Types ───────────────────────────────────────────────────────────

export interface OutcomeSummaryItem {
  outcomeId: string;
  outcomeCode: string;
  outcomeName: string;
  totalAlignments: number;
  strengthDistribution: Record<StrengthLevel, number>;
  studentCount: number;
}

export interface EvidenceSummary {
  frameworkId: string | null;
  frameworkName: string | null;
  totalMoments: number;
  outcomes: OutcomeSummaryItem[];
}

export interface StudentEvidenceMomentItem {
  momentId: string;
  commentId: string | null;
  narrative: string;
  sourceText: string;
  type: string;
  processedAt: string;
  outcomeAlignments: Array<{
    outcomeCode: string;
    outcomeName: string;
    strengthLevel: StrengthLevel;
    rationale: string | null;
  }>;
}

export interface StudentEvidenceResult {
  moments: StudentEvidenceMomentItem[];
  totalCount: number;
}

// ── Source-narrowing helper ─────────────────────────────────────────
//
// At narrow scope (courseId or assignmentId set), evidence moments must
// be additionally constrained to sources whose Comment or
// ArtifactSection actually sits in the scope — otherwise a course-
// scoped query would include the same student's moments from any other
// course they're enrolled in.
//
// Returns:
//  - `narrowed=false` (institution-only scope) → no additional filter;
//    consent is the only gate.
//  - `narrowed=true, allowedCommentIds + allowedSectionIds` → caller
//    should add `(em.commentId IN (...) OR em.artifactSectionId IN (...))`
//    to its query. If both arrays are empty, the caller MUST short-
//    circuit to an empty result without issuing the moments query.

interface SourceNarrowing {
  narrowed: boolean;
  allowedCommentIds: string[];
  allowedSectionIds: string[];
}

async function computeSourceNarrowing(
  scope: AnalyticsScope,
  resolved: { comments: Array<{ id: string; studentId: string | null }> },
  options: { studentIdFilter?: string } = {}
): Promise<SourceNarrowing> {
  const narrowed = Boolean(scope.courseId || scope.assignmentId);
  if (!narrowed) {
    return { narrowed: false, allowedCommentIds: [], allowedSectionIds: [] };
  }

  // Comment ids that are in-scope. resolveScope already enforces
  // course/assignment for Comments. Optionally narrow to one student
  // (used by getStudentEvidenceMoments).
  const allowedCommentIds = resolved.comments
    .filter(
      (c) =>
        !options.studentIdFilter ||
        c.studentId === options.studentIdFilter
    )
    .map((c) => c.id);

  // ArtifactSection ids that are in-scope: sections of artifacts whose
  // courseId/assignmentId match the scope. Optionally narrow to one
  // student.
  const sectionQb = AppDataSource.getRepository("ArtifactSection")
    .createQueryBuilder("asec")
    .innerJoin("artifact", "art", 'art.id = asec."artifactId"')
    .select(["asec.id"]);
  if (options.studentIdFilter) {
    sectionQb.andWhere('art."studentId" = :studentId', {
      studentId: options.studentIdFilter,
    });
  }
  if (scope.courseId) {
    sectionQb.andWhere('art."courseId" = :courseId', {
      courseId: scope.courseId,
    });
  }
  if (scope.assignmentId) {
    sectionQb.andWhere('art."assignmentId" = :assignmentId', {
      assignmentId: scope.assignmentId,
    });
  }
  const rows = await sectionQb.getRawMany();
  const allowedSectionIds = rows.map((r) => r.asec_id ?? r.id);

  return { narrowed: true, allowedCommentIds, allowedSectionIds };
}

/**
 * Build the andWhere expression + params for a SourceNarrowing.
 * Returns null when the narrowing is not applicable (institution scope)
 * or both allowed lists are empty (caller should short-circuit).
 */
function buildSourceFilter(
  s: SourceNarrowing
): { clause: string; params: Record<string, unknown> } | null {
  if (!s.narrowed) return null;
  const parts: string[] = [];
  const params: Record<string, unknown> = {};
  if (s.allowedCommentIds.length > 0) {
    parts.push('em."commentId" IN (:...allowedCommentIds)');
    params.allowedCommentIds = s.allowedCommentIds;
  }
  if (s.allowedSectionIds.length > 0) {
    parts.push('em."artifactSectionId" IN (:...allowedSectionIds)');
    params.allowedSectionIds = s.allowedSectionIds;
  }
  if (parts.length === 0) {
    // Narrow scope but no allowed sources — return a clause that
    // matches nothing so the caller can keep its query shape simple
    // without a separate short-circuit branch (still useful to short-
    // circuit when possible, since this clause forces a 0-row scan).
    return { clause: "1=0", params };
  }
  return { clause: `(${parts.join(" OR ")})`, params };
}

// ── Evidence Summary ────────────────────────────────────────────────

/**
 * Aggregated evidence summary for the scope: how many moments exist,
 * how they align to outcomes, and the strength distribution per outcome.
 */
export async function getEvidenceSummary(
  scope: AnalyticsScope
): Promise<AnalyticsResult<EvidenceSummary>> {
  const cacheKey = `evidence-summary:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);
  const consentedIds = resolved.consentedStudentIds;

  // Source narrowing for course/assignment-scoped summaries — without
  // this, a course-scoped roll-up would count any consented student's
  // moments across all of their courses (cross-course leak). At
  // institution scope the narrowing is not applied; consent is the
  // only gate.
  const narrowing = await computeSourceNarrowing(scope, resolved);
  const sourceFilter = buildSourceFilter(narrowing);

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    // Load the TORI framework for this institution
    const framework = await AppDataSource.getRepository(
      OutcomeFramework
    ).findOne({
      where: {
        institutionId: scope.institutionId,
        type: FrameworkType.TORI,
        isActive: true,
      },
    });

    if (!framework || consentedIds.length === 0) {
      return {
        frameworkId: framework?.id ?? null,
        frameworkName: framework?.name ?? null,
        totalMoments: 0,
        outcomes: [],
      };
    }

    // Load outcome definitions
    const outcomeDefs = await AppDataSource.getRepository(
      OutcomeDefinition
    ).find({
      where: { frameworkId: framework.id },
      order: { sortOrder: "ASC" },
    });

    // Helper to apply the source filter to an EvidenceMoment-derived
    // query that already has `em.studentId IN (...)` and isLatest set.
    const applySourceFilter = <T extends { andWhere: Function }>(qb: T): T => {
      if (sourceFilter) {
        qb.andWhere(sourceFilter.clause, sourceFilter.params);
      }
      return qb;
    };

    // Count evidence moments for consented students in scope
    const momentQb = applySourceFilter(
      AppDataSource.getRepository(EvidenceMoment)
        .createQueryBuilder("em")
        .where("em.studentId IN (:...studentIds)", { studentIds: consentedIds })
        .andWhere("em.isLatest = true")
    );

    const totalMoments = await momentQb.getCount();

    if (totalMoments === 0) {
      return {
        frameworkId: framework.id,
        frameworkName: framework.name,
        totalMoments: 0,
        outcomes: outcomeDefs.map((o) => ({
          outcomeId: o.id,
          outcomeCode: o.code,
          outcomeName: o.name,
          totalAlignments: 0,
          strengthDistribution: {
            [StrengthLevel.EMERGING]: 0,
            [StrengthLevel.DEVELOPING]: 0,
            [StrengthLevel.DEMONSTRATING]: 0,
            [StrengthLevel.EXEMPLARY]: 0,
          },
          studentCount: 0,
        })),
      };
    }

    // Get alignment counts grouped by outcome + strength level
    const alignmentQb = applySourceFilter(
      AppDataSource.getRepository(EvidenceOutcomeLink)
        .createQueryBuilder("eol")
        .innerJoin("eol.evidenceMoment", "em")
        .where("em.studentId IN (:...studentIds)", {
          studentIds: consentedIds,
        })
        .andWhere("em.isLatest = true")
    );
    const alignmentRows = await alignmentQb
      .select([
        'eol."outcomeDefinitionId" AS "outcomeDefinitionId"',
        'eol."strengthLevel" AS "strengthLevel"',
        "COUNT(*) AS count",
      ])
      .groupBy('eol."outcomeDefinitionId"')
      .addGroupBy('eol."strengthLevel"')
      .getRawMany();

    // Get distinct student counts per outcome
    const studentCountQb = applySourceFilter(
      AppDataSource.getRepository(EvidenceOutcomeLink)
        .createQueryBuilder("eol")
        .innerJoin("eol.evidenceMoment", "em")
        .where("em.studentId IN (:...studentIds)", {
          studentIds: consentedIds,
        })
        .andWhere("em.isLatest = true")
    );
    const studentCountRows = await studentCountQb
      .select([
        'eol."outcomeDefinitionId" AS "outcomeDefinitionId"',
        'COUNT(DISTINCT em."studentId") AS "studentCount"',
      ])
      .groupBy('eol."outcomeDefinitionId"')
      .getRawMany();

    // Build lookup maps
    const alignmentMap = new Map<string, Record<StrengthLevel, number>>();
    for (const row of alignmentRows) {
      const id = row.outcomeDefinitionId ?? row.outcomedefinitionid;
      const level = row.strengthLevel ?? row.strengthlevel;
      const count = parseInt(row.count, 10);
      if (!alignmentMap.has(id)) {
        alignmentMap.set(id, {
          [StrengthLevel.EMERGING]: 0,
          [StrengthLevel.DEVELOPING]: 0,
          [StrengthLevel.DEMONSTRATING]: 0,
          [StrengthLevel.EXEMPLARY]: 0,
        });
      }
      alignmentMap.get(id)![level as StrengthLevel] = count;
    }

    const studentCountMap = new Map<string, number>();
    for (const row of studentCountRows) {
      const id = row.outcomeDefinitionId ?? row.outcomedefinitionid;
      studentCountMap.set(id, parseInt(row.studentCount ?? row.studentcount, 10));
    }

    const outcomes: OutcomeSummaryItem[] = outcomeDefs.map((o) => {
      const dist = alignmentMap.get(o.id) ?? {
        [StrengthLevel.EMERGING]: 0,
        [StrengthLevel.DEVELOPING]: 0,
        [StrengthLevel.DEMONSTRATING]: 0,
        [StrengthLevel.EXEMPLARY]: 0,
      };
      const totalAlignments = Object.values(dist).reduce((a, b) => a + b, 0);
      return {
        outcomeId: o.id,
        outcomeCode: o.code,
        outcomeName: o.name,
        totalAlignments,
        strengthDistribution: dist,
        studentCount: studentCountMap.get(o.id) ?? 0,
      };
    });

    return {
      frameworkId: framework.id,
      frameworkName: framework.name,
      totalMoments,
      outcomes,
    };
  });

  return {
    data,
    meta: {
      scope,
      consentedStudentCount: consentedIds.length,
      excludedStudentCount: resolved.excludedCount,
      computedAt: new Date(),
      cached,
    },
  };
}

// ── Student Evidence Moments ────────────────────────────────────────

/**
 * Returns the evidence moments for a specific student, with their
 * outcome alignments. Used for the student detail drill-down.
 *
 * Authorization (two layers):
 *
 *   1. Student-level — the caller must have already validated the
 *      outer `scope` (via validateScope at the resolver). This function
 *      additionally enforces that `studentId` falls inside
 *      `scope.consentedStudentIds` — i.e., the student is in the
 *      validated scope AND has not opted out via StudentConsent.
 *
 *   2. Source-level (course/assignment narrowing) — when scope narrows
 *      below institution (courseId or assignmentId set), evidence
 *      moments must additionally come from a Comment or ArtifactSection
 *      that ALSO sits in that course/assignment. Without this, a course-
 *      scoped caller would receive the same student's moments from any
 *      other course they're enrolled in. We compute the in-scope
 *      Comment ids from `resolved.comments` and the in-scope
 *      ArtifactSection ids by joining ArtifactSection→Artifact and
 *      filtering on the same scope predicates.
 *
 * Either guard returning empty short-circuits before the moments query.
 */
export async function getStudentEvidenceMoments(
  scope: AnalyticsScope,
  studentId: string,
  limit: number = 50,
  offset: number = 0
): Promise<StudentEvidenceResult> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  // Layer 1: scope/consent guard.
  const resolved = await resolveScope(scope);
  if (!resolved.consentedStudentIds.includes(studentId)) {
    return { moments: [], totalCount: 0 };
  }

  // Layer 2: source narrowing for course/assignment-scoped calls.
  const narrowing = await computeSourceNarrowing(scope, resolved, {
    studentIdFilter: studentId,
  });
  if (
    narrowing.narrowed &&
    narrowing.allowedCommentIds.length === 0 &&
    narrowing.allowedSectionIds.length === 0
  ) {
    return { moments: [], totalCount: 0 };
  }
  const sourceFilter = buildSourceFilter(narrowing);

  // Count total
  const countQb = AppDataSource.getRepository(EvidenceMoment)
    .createQueryBuilder("em")
    .where("em.studentId = :studentId", { studentId })
    .andWhere("em.isLatest = true");
  if (sourceFilter) countQb.andWhere(sourceFilter.clause, sourceFilter.params);
  const totalCount = await countQb.getCount();

  // Load moments with outcome links
  const momentsQb = AppDataSource.getRepository(EvidenceMoment)
    .createQueryBuilder("em")
    .leftJoinAndSelect("em.outcomeLinks", "eol")
    .leftJoin("eol.outcomeDefinition", "od")
    .addSelect(["od.code", "od.name"])
    .where("em.studentId = :studentId", { studentId })
    .andWhere("em.isLatest = true");
  if (sourceFilter) momentsQb.andWhere(sourceFilter.clause, sourceFilter.params);
  const moments = await momentsQb
    .orderBy("em.processedAt", "DESC")
    .skip(safeOffset)
    .take(safeLimit)
    .getMany();

  const items: StudentEvidenceMomentItem[] = moments.map((m) => ({
    momentId: m.id,
    commentId: m.commentId,
    narrative: m.narrative,
    sourceText: m.sourceText,
    type: m.type,
    processedAt: m.processedAt.toISOString(),
    outcomeAlignments: (m.outcomeLinks ?? []).map((link) => ({
      outcomeCode: (link as any).outcomeDefinition?.code ?? "",
      outcomeName: (link as any).outcomeDefinition?.name ?? "",
      strengthLevel: link.strengthLevel,
      rationale: link.rationale,
    })),
  }));

  return { moments: items, totalCount };
}
