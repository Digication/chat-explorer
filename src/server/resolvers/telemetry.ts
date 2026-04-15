import { AppDataSource } from "../data-source.js";
import { TelemetryEvent } from "../entities/TelemetryEvent.js";
import { UserRole } from "../entities/User.js";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth, requireRole } from "./middleware/auth.js";

interface TelemetryEventInput {
  eventCategory: string;
  eventAction: string;
  metadata?: string | null;
  pageUrl?: string | null;
  sessionId: string;
  timestamp?: string | null;
}

export const telemetryResolvers = {
  Query: {
    telemetrySummary: async (
      _: unknown,
      args: { institutionId?: string; startDate: string; endDate: string },
      ctx: GraphQLContext
    ) => {
      const user = requireRole(ctx, [
        UserRole.INSTITUTION_ADMIN,
        UserRole.DIGICATION_ADMIN,
      ]);

      // institution_admin can only see their own institution's data
      const institutionId =
        user.role === UserRole.DIGICATION_ADMIN
          ? args.institutionId ?? null
          : user.institutionId;

      const repo = AppDataSource.getRepository(TelemetryEvent);
      const baseWhere = institutionId
        ? `"institutionId" = $3`
        : "TRUE";
      const baseParams = institutionId
        ? [args.startDate, args.endDate, institutionId]
        : [args.startDate, args.endDate];

      // Active users (daily / weekly / monthly)
      const activeUsersResult = await repo.query(
        `SELECT
          COUNT(DISTINCT CASE WHEN "createdAt" >= NOW() - INTERVAL '1 day' THEN "userId" END) AS daily,
          COUNT(DISTINCT CASE WHEN "createdAt" >= NOW() - INTERVAL '7 days' THEN "userId" END) AS weekly,
          COUNT(DISTINCT CASE WHEN "createdAt" >= NOW() - INTERVAL '30 days' THEN "userId" END) AS monthly
        FROM "telemetry_event"
        WHERE "createdAt" >= $1::timestamptz
          AND "createdAt" <= $2::timestamptz
          AND ${baseWhere}`,
        baseParams
      );
      const au = activeUsersResult[0] ?? { daily: 0, weekly: 0, monthly: 0 };

      // Top features by event count
      const topFeatures = await repo.query(
        `SELECT
          "eventCategory" AS category,
          "eventAction" AS action,
          COUNT(*)::int AS count,
          COUNT(DISTINCT "userId")::int AS "uniqueUsers"
        FROM "telemetry_event"
        WHERE "createdAt" >= $1::timestamptz
          AND "createdAt" <= $2::timestamptz
          AND ${baseWhere}
        GROUP BY "eventCategory", "eventAction"
        ORDER BY count DESC
        LIMIT 20`,
        baseParams
      );

      // AI chat adoption rate
      const adoptionResult = await repo.query(
        `SELECT
          (SELECT COUNT(DISTINCT "userId")::int
           FROM "telemetry_event"
           WHERE "eventCategory" = 'AI_CHAT'
             AND "createdAt" >= $1::timestamptz
             AND "createdAt" <= $2::timestamptz
             AND ${baseWhere}) AS "usersWhoUsedFeature",
          COUNT(DISTINCT "userId")::int AS "totalUsers"
        FROM "telemetry_event"
        WHERE "createdAt" >= $1::timestamptz
          AND "createdAt" <= $2::timestamptz
          AND ${baseWhere}`,
        baseParams
      );
      const ad = adoptionResult[0] ?? {
        totalUsers: 0,
        usersWhoUsedFeature: 0,
      };
      const totalUsers = Number(ad.totalUsers);
      const usersWhoUsedFeature = Number(ad.usersWhoUsedFeature);

      // Daily event counts
      const dailyEvents = await repo.query(
        `SELECT
          TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count
        FROM "telemetry_event"
        WHERE "createdAt" >= $1::timestamptz
          AND "createdAt" <= $2::timestamptz
          AND ${baseWhere}
        GROUP BY "createdAt"::date
        ORDER BY "createdAt"::date`,
        baseParams
      );

      return {
        activeUsers: {
          daily: Number(au.daily),
          weekly: Number(au.weekly),
          monthly: Number(au.monthly),
        },
        topFeatures,
        aiChatAdoption: {
          totalUsers,
          usersWhoUsedFeature,
          rate: totalUsers > 0 ? usersWhoUsedFeature / totalUsers : 0,
        },
        dailyEvents,
      };
    },
  },

  Mutation: {
    trackEvents: async (
      _: unknown,
      { events }: { events: TelemetryEventInput[] },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(TelemetryEvent);

      const entities = events.map((e) =>
        repo.create({
          userId: user.id,
          institutionId: user.institutionId,
          eventCategory: e.eventCategory,
          eventAction: e.eventAction,
          metadata: e.metadata ? JSON.parse(e.metadata) : null,
          pageUrl: e.pageUrl ?? null,
          sessionId: e.sessionId,
          createdAt: e.timestamp ? new Date(e.timestamp) : new Date(),
        })
      );

      await repo.save(entities);
      return true;
    },

    purgeOldTelemetry: async (
      _: unknown,
      { olderThanDays }: { olderThanDays: number },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, [UserRole.DIGICATION_ADMIN]);

      const result = await AppDataSource.getRepository(TelemetryEvent)
        .createQueryBuilder()
        .delete()
        .where(`"createdAt" < NOW() - INTERVAL '1 day' * :days`, {
          days: olderThanDays,
        })
        .execute();

      return result.affected ?? 0;
    },
  },
};
