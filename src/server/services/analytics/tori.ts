import { AppDataSource } from "../../data-source.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import { ToriTag } from "../../entities/ToriTag.js";
import type { AnalyticsScope, AnalyticsResult } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";

export interface TagFrequency {
  tagId: string;
  tagName: string;
  domain: string;
  count: number;
  percent: number;
}

export interface TagCoverage {
  tagId: string;
  tagName: string;
  studentCount: number;
  coveragePercent: number;
}

export interface CoOccurrence {
  tags: string[];
  tagIds: string[];
  count: number;
}

export interface ToriAnalysis {
  tagFrequencies: TagFrequency[];
  tagCoverage: TagCoverage[];
  coOccurrencePairs: CoOccurrence[];
  coOccurrenceTriples: CoOccurrence[];
  coOccurrenceQuadruples: CoOccurrence[];
}

export async function getToriAnalysis(
  scope: AnalyticsScope
): Promise<AnalyticsResult<ToriAnalysis>> {
  const cacheKey = `tori:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);
  const userComments = resolved.comments.filter((c) => c.role === "USER");
  const commentIds = userComments.map((c) => c.id);

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    if (commentIds.length === 0) {
      return {
        tagFrequencies: [],
        tagCoverage: [],
        coOccurrencePairs: [],
        coOccurrenceTriples: [],
        coOccurrenceQuadruples: [],
      };
    }

    // Get all TORI tag associations for these comments
    const cttRepo = AppDataSource.getRepository(CommentToriTag);
    const associations = await cttRepo
      .createQueryBuilder("ctt")
      .innerJoinAndSelect("ctt.toriTag", "tag")
      .where("ctt.commentId IN (:...ids)", { ids: commentIds })
      .getMany();

    // Load tag metadata
    const tagRepo = AppDataSource.getRepository(ToriTag);
    const allTags = await tagRepo.find();
    const tagMap = new Map(allTags.map((t) => [t.id, t]));

    // Group by comment for co-occurrence analysis
    const tagsByComment = new Map<string, string[]>();
    const tagCounts = new Map<string, number>();
    const tagStudents = new Map<string, Set<string>>();

    // Map commentId → studentId
    const commentStudentMap = new Map(
      userComments.map((c) => [c.id, c.studentId])
    );

    for (const assoc of associations) {
      const tagId = assoc.toriTagId;
      tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);

      const studentId = commentStudentMap.get(assoc.commentId);
      if (studentId) {
        if (!tagStudents.has(tagId)) tagStudents.set(tagId, new Set());
        tagStudents.get(tagId)!.add(studentId);
      }

      if (!tagsByComment.has(assoc.commentId)) {
        tagsByComment.set(assoc.commentId, []);
      }
      tagsByComment.get(assoc.commentId)!.push(tagId);
    }

    const totalAssociations = associations.length;
    const totalStudents = resolved.consentedStudentIds.length;

    // Tag frequencies
    const tagFrequencies: TagFrequency[] = [...tagCounts.entries()]
      .map(([tagId, count]) => {
        const tag = tagMap.get(tagId);
        return {
          tagId,
          tagName: tag?.name ?? "Unknown",
          domain: tag?.domain ?? "Unknown",
          count,
          percent:
            totalAssociations > 0 ? (count / totalAssociations) * 100 : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Tag coverage
    const tagCoverage: TagCoverage[] = [...tagStudents.entries()]
      .map(([tagId, students]) => {
        const tag = tagMap.get(tagId);
        return {
          tagId,
          tagName: tag?.name ?? "Unknown",
          studentCount: students.size,
          coveragePercent:
            totalStudents > 0 ? (students.size / totalStudents) * 100 : 0,
        };
      })
      .sort((a, b) => b.studentCount - a.studentCount);

    // Co-occurrence analysis
    const pairCounts = new Map<string, number>();
    const tripleCounts = new Map<string, number>();
    const quadCounts = new Map<string, number>();

    for (const tags of tagsByComment.values()) {
      const unique = [...new Set(tags)].sort();

      // Pairs
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = `${unique[i]}|${unique[j]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }

      // Triples
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          for (let k = j + 1; k < unique.length; k++) {
            const key = `${unique[i]}|${unique[j]}|${unique[k]}`;
            tripleCounts.set(key, (tripleCounts.get(key) ?? 0) + 1);
          }
        }
      }

      // Quadruples
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          for (let k = j + 1; k < unique.length; k++) {
            for (let l = k + 1; l < unique.length; l++) {
              const key = `${unique[i]}|${unique[j]}|${unique[k]}|${unique[l]}`;
              quadCounts.set(key, (quadCounts.get(key) ?? 0) + 1);
            }
          }
        }
      }
    }

    const toCoOccurrence = (
      counts: Map<string, number>,
      limit?: number
    ): CoOccurrence[] => {
      const sorted = [...counts.entries()]
        .map(([key, count]) => {
          const ids = key.split("|");
          return {
            tags: ids.map((id) => tagMap.get(id)?.name ?? id),
            tagIds: ids,
            count,
          };
        })
        .sort((a, b) => b.count - a.count);
      return limit ? sorted.slice(0, limit) : sorted;
    };

    return {
      tagFrequencies,
      tagCoverage,
      coOccurrencePairs: toCoOccurrence(pairCounts),
      coOccurrenceTriples: toCoOccurrence(tripleCounts, 20),
      coOccurrenceQuadruples: toCoOccurrence(quadCounts, 10),
    };
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
