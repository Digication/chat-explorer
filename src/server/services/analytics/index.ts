// Barrel exports for all analytics modules

export * from "./types.js";
export * from "./scope.js";
export * from "./cache.js";
export * from "./overview.js";
export * from "./tori.js";
export * from "./text-signals.js";
export * from "./engagement.js";
export * from "./heatmap.js";
export * from "./clustering.js";
export * from "./network.js";
export * from "./instructional-insights.js";
export * from "./recommendations.js";

// ── Convenience service class ────────────────────────────────────

import type {
  AnalyticsScope,
  AnalyticsResult,
  HeatmapMode,
  ScalingMode,
} from "./types.js";
import type { OverviewStats } from "./overview.js";
import type { ToriAnalysis } from "./tori.js";
import type { TextSignals } from "./text-signals.js";
import type { EngagementResult } from "./engagement.js";
import type { HeatmapData } from "./heatmap.js";
import type { NetworkData } from "./network.js";
import type { InstructionalInsights } from "./instructional-insights.js";
import type { Recommendation } from "./recommendations.js";

import { getOverview } from "./overview.js";
import { getToriAnalysis } from "./tori.js";
import { getTextSignals } from "./text-signals.js";
import { getEngagement } from "./engagement.js";
import { getHeatmap } from "./heatmap.js";
import { getNetwork } from "./network.js";
import { getInsights } from "./instructional-insights.js";
import { getRecommendations } from "./recommendations.js";

/**
 * Bundles all analytics modules behind a single interface.
 */
export class AnalyticsService {
  async getOverview(
    scope: AnalyticsScope
  ): Promise<AnalyticsResult<OverviewStats>> {
    return getOverview(scope);
  }

  async getToriAnalysis(
    scope: AnalyticsScope
  ): Promise<AnalyticsResult<ToriAnalysis>> {
    return getToriAnalysis(scope);
  }

  async getTextSignals(
    scope: AnalyticsScope
  ): Promise<AnalyticsResult<TextSignals>> {
    return getTextSignals(scope);
  }

  async getEngagement(
    scope: AnalyticsScope
  ): Promise<AnalyticsResult<EngagementResult>> {
    return getEngagement(scope);
  }

  async getHeatmap(
    scope: AnalyticsScope,
    mode?: HeatmapMode,
    scaling?: ScalingMode
  ): Promise<AnalyticsResult<HeatmapData>> {
    return getHeatmap(scope, mode, scaling);
  }

  async getNetwork(
    scope: AnalyticsScope,
    minEdgeWeight?: number
  ): Promise<AnalyticsResult<NetworkData>> {
    return getNetwork(scope, minEdgeWeight);
  }

  async getInsights(
    scope: AnalyticsScope
  ): Promise<AnalyticsResult<InstructionalInsights>> {
    return getInsights(scope);
  }

  async getRecommendations(
    scope: AnalyticsScope
  ): Promise<AnalyticsResult<Recommendation[]>> {
    return getRecommendations(scope);
  }
}
