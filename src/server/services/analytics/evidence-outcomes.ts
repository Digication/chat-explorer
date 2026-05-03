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

    // Count evidence moments for consented students in scope
    const momentQb = AppDataSource.getRepository(EvidenceMoment)
      .createQueryBuilder("em")
      .where("em.studentId IN (:...studentIds)", { studentIds: consentedIds })
      .andWhere("em.isLatest = true");

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
    const alignmentRows = await AppDataSource.getRepository(EvidenceOutcomeLink)
      .createQueryBuilder("eol")
      .innerJoin("eol.evidenceMoment", "em")
      .where("em.studentId IN (:...studentIds)", { studentIds: consentedIds })
      .andWhere("em.isLatest = true")
      .select([
        'eol."outcomeDefinitionId" AS "outcomeDefinitionId"',
        'eol."strengthLevel" AS "strengthLevel"',
        "COUNT(*) AS count",
      ])
      .groupBy('eol."outcomeDefinitionId"')
      .addGroupBy('eol."strengthLevel"')
      .getRawMany();

    // Get distinct student counts per outcome
    const studentCountRows = await AppDataSource.getRepository(
      EvidenceOutcomeLink
    )
      .createQueryBuilder("eol")
      .innerJoin("eol.evidenceMoment", "em")
      .where("em.studentId IN (:...studentIds)", { studentIds: consentedIds })
      .andWhere("em.isLatest = true")
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
 */
export async function getStudentEvidenceMoments(
  scope: AnalyticsScope,
  studentId: string,
  limit: number = 50,
  offset: number = 0
): Promise<StudentEvidenceResult> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  // Count total
  const totalCount = await AppDataSource.getRepository(EvidenceMoment)
    .createQueryBuilder("em")
    .where("em.studentId = :studentId", { studentId })
    .andWhere("em.isLatest = true")
    .getCount();

  // Load moments with outcome links
  const moments = await AppDataSource.getRepository(EvidenceMoment)
    .createQueryBuilder("em")
    .leftJoinAndSelect("em.outcomeLinks", "eol")
    .leftJoin("eol.outcomeDefinition", "od")
    .addSelect(["od.code", "od.name"])
    .where("em.studentId = :studentId", { studentId })
    .andWhere("em.isLatest = true")
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
