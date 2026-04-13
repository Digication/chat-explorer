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
import { getCategoryEvidence, getMultiTagEvidence } from "../services/analytics/evidence.js";
import { getNetwork } from "../services/analytics/network.js";
import { getInsights } from "../services/analytics/instructional-insights.js";
import { getRecommendations } from "../services/analytics/recommendations.js";
import { getGrowth } from "../services/analytics/growth.js";
import { getStudentProfile } from "../services/analytics/student-profile.js";
import { getCrossCourseComparison } from "../services/analytics/cross-course.js";

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
      {
        input,
      }: {
        input: {
          scope: ScopeInput;
          studentId?: string;
          toriTagId?: string;
          limit?: number;
          offset?: number;
        };
      },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, input.scope);
      return getHeatmapCellEvidence(
        validated,
        input.studentId,
        input.toriTagId,
        input.limit,
        input.offset
      );
    },

    categoryEvidence: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          scope: ScopeInput;
          studentId: string;
          assignmentId: string;
          category: string;
          limit?: number;
          offset?: number;
        };
      },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, input.scope);
      return getCategoryEvidence(
        validated,
        input.studentId,
        input.assignmentId,
        input.category,
        input.limit,
        input.offset
      );
    },

    multiTagEvidence: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          scope: ScopeInput;
          toriTagIds: string[];
          limit?: number;
          offset?: number;
        };
      },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, input.scope);
      return getMultiTagEvidence(
        validated,
        input.toriTagIds,
        input.limit,
        input.offset
      );
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

    studentProfile: async (
      _: unknown,
      { scope, studentId }: { scope: ScopeInput; studentId: string },
      ctx: GraphQLContext
    ) => {
      const validated = await validateScope(ctx, scope);
      return getStudentProfile(validated, studentId);
    },

    crossCourseComparison: async (
      _: unknown,
      { input }: { input: { institutionId: string; courseIds: string[] } },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      // Validate access to EVERY requested course
      for (const courseId of input.courseIds) {
        await requireCourseAccess(ctx, courseId);
      }
      return getCrossCourseComparison(input.institutionId, input.courseIds);
    },
  },
};
