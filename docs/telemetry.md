# Telemetry / Usage Analytics

Lightweight, custom analytics system for tracking how users interact with Chat Explorer. Deployed to production 2026-04-15.

## Purpose

No third-party analytics. All data stays in our Postgres database. Goal: understand which features users engage with, how often, and identify inactive beta users.

## Architecture

### Server

| File | Description |
|---|---|
| `src/server/entities/TelemetryEvent.ts` | TypeORM entity — uuid PK, jsonb metadata, 3 indexes |
| `src/server/migrations/1775574800000-AddTelemetryEvent.ts` | Creates `telemetry_event` table with indexes and FKs |
| `src/server/resolvers/telemetry.ts` | GraphQL resolvers: `trackEvents`, `telemetrySummary`, `purgeOldTelemetry` |

### Client

| File | Description |
|---|---|
| `src/lib/hooks/useTrackEvent.ts` | Batching hook — queues events, flushes every 5s or at 20 events |
| `src/components/tracking/PageViewTracker.tsx` | Automatic page view tracking on route change |
| `src/lib/queries/telemetry.ts` | GraphQL query/mutation definitions |

### Admin Dashboard

| File | Description |
|---|---|
| `src/components/admin/AnalyticsTab.tsx` | Analytics tab on Admin page |

## Database Schema

```sql
CREATE TABLE telemetry_event (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId        varchar NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  institutionId uuid REFERENCES institution(id) ON DELETE SET NULL,
  eventCategory varchar(50) NOT NULL,
  eventAction   varchar(100) NOT NULL,
  metadata      jsonb,
  pageUrl       varchar,
  sessionId     varchar(64) NOT NULL,
  createdAt     timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX ON telemetry_event ("userId", "createdAt");
CREATE INDEX ON telemetry_event ("institutionId", "createdAt");
CREATE INDEX ON telemetry_event ("eventCategory", "createdAt");
```

## Adding New Events

No migration needed — `eventCategory` and `eventAction` are plain strings.

```tsx
import { useTrackEvent } from "@/lib/hooks/useTrackEvent";

function MyComponent() {
  const trackEvent = useTrackEvent();

  const handleAction = () => {
    trackEvent("MY_FEATURE", "action_name", { optional: "metadata" });
  };
}
```

### Currently Instrumented Events

| Category | Action | Where | Description |
|---|---|---|---|
| `PAGE_VIEW` | `view` | PageViewTracker | Automatic on every route change |
| `AI_CHAT` | `send_message` | AiChatPanel | User sends a chat message |
| `AI_CHAT` | `create_session` | AiChatPanel | New AI chat session created |
| `SCOPE_SELECTOR` | `change_institution` | ScopeSelector | Institution scope changed |
| `SCOPE_SELECTOR` | `change_course` | ScopeSelector | Course scope changed |
| `SCOPE_SELECTOR` | `change_assignment` | ScopeSelector | Assignment scope changed |
| `UPLOAD` | `success` | CsvUploadCard | CSV upload completed |
| `UPLOAD` | `failure` | CsvUploadCard | CSV upload failed |
| `REPORTS` | `generate` | ReportsPage | Report generation triggered |
| `CHAT_EXPLORER` | `select_student` | ChatExplorerPage | Student selected in explorer |
| `CHAT_EXPLORER` | `toggle_tori_filter` | ChatExplorerPage | TORI filter toggled |

## Admin Dashboard Features

Access: **Admin > Analytics tab** (institution_admin and digication_admin only)

### Filters
- **Date range** — start/end date pickers (defaults to last 30 days)
- **Institution** — dropdown filter (digication_admin only, sees all institutions)
- **User** — click any user row to filter the entire dashboard to that user; chip appears with X to clear

### Sections
1. **Active Users** — DAU / WAU / MAU cards
2. **AI Chat Adoption** — percentage of users who have used AI chat
3. **Top Features** — table of event categories ranked by count, with unique user counts
4. **User Activity** — per-user table showing name, email, last active time, total events, and feature chips (clickable to filter)
5. **Daily Activity** — SVG bar chart of events per day
6. **Purge** — button to delete events older than 90 days (digication_admin only, with confirmation dialog)

## GraphQL API

### Mutation: `trackEvents`

Batch-inserts telemetry events. Called automatically by the `useTrackEvent` hook.

```graphql
mutation TrackEvents($events: [TelemetryEventInput!]!) {
  trackEvents(events: $events)
}
```

### Query: `telemetrySummary`

Returns aggregated analytics. Supports optional `institutionId` and `userId` filters.

```graphql
query TelemetrySummary(
  $institutionId: ID
  $userId: ID
  $startDate: String!
  $endDate: String!
) {
  telemetrySummary(
    institutionId: $institutionId
    userId: $userId
    startDate: $startDate
    endDate: $endDate
  ) {
    activeUsers { daily weekly monthly }
    topFeatures { category action count uniqueUsers }
    aiChatAdoption { totalUsers usersWhoUsedFeature rate }
    dailyEvents { date count }
    userActivity { userId name email lastActive totalEvents featuresUsed }
  }
}
```

### Mutation: `purgeOldTelemetry`

Deletes events older than N days. Digication admin only.

```graphql
mutation PurgeOldTelemetry($olderThanDays: Int!) {
  purgeOldTelemetry(olderThanDays: $olderThanDays)
}
```

## Deployment History

| Commit | Description |
|---|---|
| `5506e92` | Initial implementation: entity, migration, resolvers, client hooks, instrumentation, admin dashboard |
| `b645ab6` | User activity table, per-user dashboard filter, end-date query bug fix |
| `f3a24ee` | Hotfix: `institutionId` column type `varchar` → `uuid` to match production schema |

## Known Gotchas

- **End-date handling**: Date strings like `2026-04-15` cast to midnight in Postgres. The query uses `< endDate + INTERVAL '1 day'` (not `<=`) to include the full end date.
- **Column types**: `user.id` is `varchar` but `institution.id` is `uuid`. The migration must use matching types for foreign keys. Dev mode (`synchronize: true`) can mask these mismatches.
- **Batching**: Events are queued client-side and flushed every 5 seconds. If a user closes the tab before the flush, those events are lost. This is an acceptable tradeoff for reducing network requests.
