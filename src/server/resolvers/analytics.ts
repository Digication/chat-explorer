import type { GraphQLContext } from "../types/context.js";
import {
  requireAuth,
  requireCourseAccess,
  requireInstitutionAccess,
} from "./middleware/auth.js";
import type { AnalyticsScope, HeatmapMode, ScalingMode } from "../services/analytics/types.js";
import { getOverview } from "../services/analytics/overview.js";
import { getToriAnalysis } from "../services/analytics/tori.js";
import { getTextSignals } from "../services/analytics/text-signals.js";
import { getEngagement } from "../services/analytics/engagement.js";
import { getHeatmap, getHeatmapCellEvidence } from "../services/analytics/heatmap.js";
import { getNetwork } from "../services/analytics/network.js";
import { getInsights } from "../services/analytics/instructional-insights.js";
import { getRecommendations } from "../services/analytics/recommendations.js";
import { getGrowth } from "../services/analytics/growth.js";

interface ScopeInput {
  institutionId: string;
  courseId?: string;
  assignmentId?: string;
  studentIds?: string[];
}

async function validateScope(ctx: GraphQLContext, scope: ScopeInput) {
  requireAuth(ctx);
  if (scope.courseId) {
    await requireCourseAccess(ctx, scope.courseId);
  } else {
    requireInstitutionAccess(ctx, scope.institutionId);
  }
  return scope as AnalyticsScope;
}

export const analyticsResolvers = {
  Query: {
    overview: async (
      _: unknown,
      { scope }: { scope: ScopeInput },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getOverview(validated);
    },

    toriAnalysis: async (
      _: unknown,
      { scope }: { scope: ScopeInput },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getToriAnalysis(validated);
    },

    textSignals: async (
      _: unknown,
      { scope }: { scope: ScopeInput },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getTextSignals(validated);
    },

    engagement: async (
      _: unknown,
      { scope }: { scope: ScopeInput },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getEngagement(validated);
    },

    heatmap: async (
      _: unknown,
      { input }: { input: { scope: ScopeInput; mode?: HeatmapMode; scaling?: ScalingMode } },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, input.scope);
      return getHeatmap(validated, input.mode, input.scaling);
    },

    heatmapCellEvidence: async (
      _: unknown,
      { input }: { input: { scope: ScopeInput; studentId?: string; toriTagId?: string } },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, input.scope);
      return getHeatmapCellEvidence(validated, input.studentId, input.toriTagId);
    },

    network: async (
      _: unknown,
      { scope }: { scope: ScopeInput },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getNetwork(validated);
    },

    instructionalInsights: async (
      _: unknown,
      { scope }: { scope: ScopeInput },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getInsights(validated);
    },

    recommendations: async (
      _: unknown,
      { scope }: { scope: ScopeInput },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getRecommendations(validated);
    },

    growth: async (
      _: unknown,
      { scope }: { scope: ScopeInput },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getGrowth(validated);
    },
  },
};
