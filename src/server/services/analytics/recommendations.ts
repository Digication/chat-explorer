import type { AnalyticsScope, AnalyticsResult } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";
import { getEngagement } from "./engagement.js";
import { getToriAnalysis } from "./tori.js";
import { getNetwork } from "./network.js";

export interface Recommendation {
  visualization: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export async function getRecommendations(
  scope: AnalyticsScope
): Promise<AnalyticsResult<Recommendation[]>> {
  const cacheKey = `recommendations:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    const recommendations: Recommendation[] = [];

    if (resolved.comments.length === 0) {
      return [
        {
          visualization: "Upload Data",
          reason: "No data found in this scope. Upload a CSV to get started.",
          priority: "HIGH" as const,
        },
      ];
    }

    // Get engagement data
    const engagement = await getEngagement(scope);

    // Get TORI analysis
    const tori = await getToriAnalysis(scope);

    // Get network data
    const network = await getNetwork(scope);

    // ── Tag diversity check ──────────────────────────────────────
    const totalTagApplications = tori.data.tagFrequencies.reduce(
      (sum, t) => sum + t.count,
      0
    );
    if (totalTagApplications > 0) {
      const top3Sum = tori.data.tagFrequencies
        .slice(0, 3)
        .reduce((sum, t) => sum + t.count, 0);
      const top3Percent = (top3Sum / totalTagApplications) * 100;

      if (top3Percent > 60) {
        recommendations.push({
          visualization: "Tag Frequency Chart",
          reason: `Top 3 TORI tags account for ${Math.round(top3Percent)}% of all tag applications. Investigate why certain tags dominate.`,
          priority: "HIGH",
        });
      }
    }

    // ── Category spread check ─────────────────────────────────────
    // If students span multiple reflection categories, the depth
    // distribution view is useful for identifying who needs support.
    if (engagement.data.perStudent.length > 1) {
      const categoriesUsed = new Set(
        engagement.data.perStudent.map((s) => s.modalCategory)
      );
      if (categoriesUsed.size >= 3) {
        recommendations.push({
          visualization: "Depth Band Distribution",
          reason: `Students span ${categoriesUsed.size} reflection categories. The distribution view highlights who may need support.`,
          priority: "HIGH",
        });
      }
    }

    // ── Network density check ────────────────────────────────────
    if (network.data.nodes.length > 0) {
      const avgDegree =
        network.data.nodes.reduce((sum, n) => sum + n.degree, 0) /
        network.data.nodes.length;

      if (avgDegree > 3) {
        recommendations.push({
          visualization: "Network Graph",
          reason: `TORI tags are highly interconnected (avg degree: ${avgDegree.toFixed(1)}). The network view reveals meaningful clusters.`,
          priority: "MEDIUM",
        });
      }
    }

    // ── Clustering recommendation ────────────────────────────────
    // Simple silhouette approximation: check if students cluster well
    if (engagement.data.perStudent.length >= 6) {
      const cats = engagement.data.categoryDistribution;
      const totalStudents = engagement.data.perStudent.length;
      const maxCat = Math.max(
        cats.DESCRIPTIVE_WRITING,
        cats.DESCRIPTIVE_REFLECTION,
        cats.DIALOGIC_REFLECTION,
        cats.CRITICAL_REFLECTION
      );

      // If one category doesn't completely dominate, clustering is informative
      if (maxCat / totalStudents < 0.7) {
        recommendations.push({
          visualization: "Clustered Heatmap",
          reason:
            "Students show distinct engagement patterns. A clustered heatmap will reveal natural groupings.",
          priority: "MEDIUM",
        });
      }
    }

    // ── Always recommend overview if there's data ────────────────
    if (recommendations.length === 0) {
      recommendations.push({
        visualization: "Overview Dashboard",
        reason:
          "Start with the overview to get a high-level picture of student engagement.",
        priority: "MEDIUM",
      });
    }

    return recommendations.sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return order[a.priority] - order[b.priority];
    });
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
