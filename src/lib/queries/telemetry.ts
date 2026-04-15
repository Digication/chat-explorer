import { gql } from "@apollo/client";

// ── Mutations ─────────────────────────────────────────────────────

export const TRACK_EVENTS = gql`
  mutation TrackEvents($events: [TelemetryEventInput!]!) {
    trackEvents(events: $events)
  }
`;

export const PURGE_OLD_TELEMETRY = gql`
  mutation PurgeOldTelemetry($olderThanDays: Int!) {
    purgeOldTelemetry(olderThanDays: $olderThanDays)
  }
`;

// ── Queries ───────────────────────────────────────────────────────

export const GET_TELEMETRY_SUMMARY = gql`
  query TelemetrySummary(
    $institutionId: ID
    $startDate: String!
    $endDate: String!
  ) {
    telemetrySummary(
      institutionId: $institutionId
      startDate: $startDate
      endDate: $endDate
    ) {
      activeUsers {
        daily
        weekly
        monthly
      }
      topFeatures {
        category
        action
        count
        uniqueUsers
      }
      aiChatAdoption {
        totalUsers
        usersWhoUsedFeature
        rate
      }
      dailyEvents {
        date
        count
      }
    }
  }
`;
