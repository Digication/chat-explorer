# Phase 08 — GraphQL API Layer

## Context

Phases 01-07 built the full data layer: database schema (Institution, Course, Assignment, Thread, Student, Comment, ToriTag, CommentToriTag, StudentConsent, CourseAccess), Better Auth with role-based access (digication_admin, institution_admin, instructor, student), CSV upload with TORI extraction, consent management, and the analytics engine with caching. All computation services exist and are consent-aware. This phase exposes everything through a GraphQL API using GraphQL Yoga, with resolvers that enforce authentication, authorization, and consent filtering on every query.

## Goal

Build a complete GraphQL API layer with 7 resolver groups (Institution, Course, Analytics, Chat, Consent, Export, Admin) and their corresponding type definitions. Every resolver checks authentication, verifies role-based authorization and course access, and applies consent filtering for student-related data. Define types for future phases (Export, LLM) even though their implementations come later.

## Implementation

### 1. GraphQL Type Definitions

**Create `src/server/types/schema.ts`**

Define all GraphQL types using GraphQL Yoga's type system (or a schema-first .graphql file, depending on project convention). Key types:

**Core entity types:**
- `Institution` — id, name, slug, createdAt.
- `Course` — id, name, code, institutionId, institution (relation), createdAt.
- `Assignment` — id, name, courseId, course (relation), uploadedAt, threadCount, commentCount.
- `Thread` — id, externalId, assignmentId, studentId, student (relation), comments (relation), commentCount.
- `Student` — id, externalId, displayName, institutionId. Note: only returned for consented students.
- `Comment` — id, role (USER/ASSISTANT/SYSTEM), content, wordCount, timestamp, threadId, toriTags (relation).
- `ToriTag` — id, name, description.

**Analytics types:**
- `OverviewStats` — totalComments, userComments, assistantComments, systemComments, threadCount, participantCount, wordCountStats (min/max/mean/median), toriTagCount, dateRange (start/end).
- `ToriAnalysis` — tagFrequencies, studentCoverage, coOccurrences (pairs/triples/quadruples), crossCourseComparison.
- `TextSignals` — perComment array and aggregateStats (mean/median/stddev for each signal).
- `EngagementResult` — perStudent scores and depth bands, perComment scores, distribution.
- `HeatmapData` — matrix (2D array of numbers), rowLabels, columnLabels, mode, scaling, clusteringIndices (optional).
- `NetworkData` — nodes (id, label, size, community), edges (source, target, weight), communities.
- `InstructionalInsights` — studentProfiles, exemplars, promptPatterns, depthDistribution.
- `Recommendation` — visualization name, reason, priority (HIGH/MEDIUM/LOW).
- `AnalyticsMeta` — scope, consentedStudentCount, excludedStudentCount, computedAt, cached.

**Chat types (for LLM phase, define now):**
- `ChatSession` — id, userId, title, courseId, assignmentId, createdAt, updatedAt.
- `ChatMessage` — id, sessionId, role (USER/ASSISTANT), content, createdAt, metadata (JSON).

**Export types (for export phase, define now):**
- `ExportRequest` — id, format (PDF/CSV), scope, status (PENDING/PROCESSING/COMPLETE/FAILED), downloadUrl, createdAt.

**Input types:**
- `AnalyticsScopeInput` — institutionId, courseId (optional), assignmentId (optional), studentIds (optional).
- `HeatmapInput` — scope, mode (CLASSIC/CLUSTERED/DOT), scaling (RAW/ROW/GLOBAL).
- `ChatMessageInput` — sessionId, content.
- `ConsentInput` — studentId, institutionId, courseId (optional), consented (boolean).
- `PaginationInput` — limit, offset, cursor.

**Create `src/server/types/context.ts`**

Define the GraphQL context type that every resolver receives:

```ts
export interface GraphQLContext {
  user: AuthUser | null;           // from Better Auth session
  db: DatabaseConnection;          // Drizzle database instance
  analyticsService: AnalyticsService;
  consentService: ConsentService;
  uploadService: UploadService;
}
```

### 2. Auth & Access Middleware

**Create `src/server/resolvers/middleware/auth.ts`**

Middleware/helper functions used by all resolvers:

- `requireAuth(ctx)` — Throws `UNAUTHENTICATED` error if `ctx.user` is null. Returns the user.
- `requireRole(ctx, roles: Role[])` — Calls `requireAuth`, then checks if user's role is in the allowed list. Throws `FORBIDDEN` if not.
- `requireCourseAccess(ctx, courseId)` — Checks that the user has a CourseAccess record for this course, OR is a digication_admin (who can access all courses), OR is an institution_admin for the course's institution. Throws `FORBIDDEN` if none apply.
- `requireInstitutionAccess(ctx, institutionId)` — Checks that the user belongs to this institution or is a digication_admin.

### 3. Institution Resolver

**Create `src/server/resolvers/institution.ts`**

Queries:
- `institutions` — List all institutions. Restricted to `digication_admin` role. Returns `[Institution]`.
- `institution(id)` — Get one institution. `digication_admin` can get any; `institution_admin` can only get their own. Returns `Institution`.
- `myInstitution` — Get the current user's institution. Available to all authenticated users. Returns `Institution`.

Field resolvers:
- `Institution.courses` — List courses for an institution. Filtered by the user's CourseAccess if they are an instructor.

### 4. Course Resolver

**Create `src/server/resolvers/course.ts`**

Queries:
- `courses(institutionId?)` — List courses the current user has access to. If institutionId provided, filter to that institution. Uses CourseAccess table. Returns `[Course]`.
- `course(id)` — Get one course. Requires course access. Returns `Course` with nested assignments.
- `assignments(courseId)` — List assignments for a course. Requires course access. Returns `[Assignment]`.
- `assignment(id)` — Get one assignment with thread count, comment count, and available TORI tags. Requires course access.

Field resolvers:
- `Course.assignments` — Nested assignment list.
- `Course.studentCount` — Count of consented students.
- `Assignment.threads` — List of threads (with pagination). Student data only for consented students.
- `Thread.comments` — List of comments in order. Only for consented student threads.
- `Thread.student` — The student (only if consented).

### 5. Analytics Resolver

**Create `src/server/resolvers/analytics.ts`**

All queries accept an `AnalyticsScopeInput` and require course access for the specified scope:

- `overview(scope)` — Returns `OverviewStats` with `AnalyticsMeta`.
- `toriAnalysis(scope)` — Returns `ToriAnalysis` with `AnalyticsMeta`.
- `textSignals(scope)` — Returns `TextSignals` with `AnalyticsMeta`.
- `engagement(scope)` — Returns `EngagementResult` with `AnalyticsMeta`.
- `heatmap(input: HeatmapInput)` — Returns `HeatmapData` with `AnalyticsMeta`.
- `network(scope)` — Returns `NetworkData` with `AnalyticsMeta`.
- `instructionalInsights(scope)` — Returns `InstructionalInsights` with `AnalyticsMeta`.
- `recommendations(scope)` — Returns `[Recommendation]` with `AnalyticsMeta`.

Each resolver:
1. Calls `requireAuth`.
2. Validates scope: if courseId is specified, calls `requireCourseAccess`. If only institutionId, calls `requireInstitutionAccess`.
3. Delegates to the corresponding `AnalyticsService` method (which handles consent filtering and caching internally).
4. Returns the result with metadata.

### 6. Chat Resolver

**Create `src/server/resolvers/chat.ts`**

For the LLM chat feature (implementation in Phase 14, but CRUD operations defined now):

Queries:
- `chatSessions(courseId?, assignmentId?)` — List the current user's chat sessions, optionally filtered. Returns `[ChatSession]`.
- `chatSession(id)` — Get a session with its messages. Only the session owner can access it. Returns `ChatSession` with messages.

Mutations:
- `createChatSession(courseId, assignmentId?, title?)` — Create a new chat session. Returns `ChatSession`.
- `sendChatMessage(input: ChatMessageInput)` — Send a message in a session. In Phase 14, this will trigger the LLM. For now, store the user message and return a placeholder. Returns `ChatMessage`.
- `deleteChatSession(id)` — Soft-delete a session. Only the owner can delete.
- `renameChatSession(id, title)` — Update session title.

### 7. Consent Resolver

**Create `src/server/resolvers/consent.ts`**

Mutations:
- `setStudentConsent(input: ConsentInput)` — Set consent for a student at institution level (courseId omitted) or course level (courseId provided). Only `institution_admin` or `digication_admin` can set consent. Triggers analytics cache invalidation for affected scopes. Returns the updated `StudentConsent`.
- `bulkSetConsent(studentIds: [String!]!, institutionId, courseId?, consented: Boolean!)` — Batch consent update. Same role restrictions. Returns count of updated records.

Queries:
- `studentConsent(studentId, institutionId, courseId?)` — Get consent status for one student. Returns `StudentConsent`.
- `consentSummary(institutionId, courseId?)` — Get counts of consented vs. excluded students. Returns `{ consented: Int, excluded: Int, total: Int }`.

### 8. Export Resolver

**Create `src/server/resolvers/export.ts`**

Types and resolver stubs for Phase 13 implementation:

Mutations:
- `requestExport(scope: AnalyticsScopeInput, format: ExportFormat!)` — Queue an export job. Returns `ExportRequest` with status PENDING. Actual generation happens in Phase 13.
- `ExportFormat` enum: `PDF`, `CSV`.

Queries:
- `exportStatus(id)` — Check status of an export request. Returns `ExportRequest`.
- `myExports` — List the current user's export requests. Returns `[ExportRequest]`.

For now, mutations return a stub response indicating the feature is not yet implemented, with an appropriate message in the response.

### 9. Admin Resolver

**Create `src/server/resolvers/admin.ts`**

Restricted to `institution_admin` and `digication_admin`:

Queries:
- `users(institutionId?)` — List users. `institution_admin` sees users in their institution. `digication_admin` sees all. Returns `[User]`.
- `courseAccessList(courseId)` — List who has access to a course. Returns `[CourseAccess]` with user details.

Mutations:
- `assignRole(userId, role)` — Change a user's role. `institution_admin` can assign instructor/student roles within their institution. `digication_admin` can assign any role.
- `grantCourseAccess(userId, courseId, role)` — Give a user access to a course with a specific role. Creates a CourseAccess record.
- `revokeCourseAccess(userId, courseId)` — Remove a user's course access. Deletes the CourseAccess record.

### 10. GraphQL Server Setup

**Update `src/server/index.ts`** (or create `src/server/graphql.ts`)

Wire up GraphQL Yoga with all resolvers:

- Create the Yoga server with the schema built from all resolver modules.
- Context factory: Extract the Better Auth session from the request, attach database connection, analytics service, consent service.
- Enable `credentials: 'include'` in CORS configuration for cookie-based auth.
- Mount at `/graphql` endpoint.
- Enable GraphQL Playground/GraphiQL in development mode only.

## Files to Create

| File | Purpose |
|------|---------|
| `src/server/types/schema.ts` | All GraphQL type definitions (entities, analytics, chat, export, inputs) |
| `src/server/types/context.ts` | GraphQL context type with user, db, services |
| `src/server/resolvers/middleware/auth.ts` | Auth, role, course access, institution access guards |
| `src/server/resolvers/institution.ts` | Institution queries + field resolvers |
| `src/server/resolvers/course.ts` | Course, assignment, thread, comment queries + field resolvers |
| `src/server/resolvers/analytics.ts` | All analytics queries (overview, tori, heatmap, network, etc.) |
| `src/server/resolvers/chat.ts` | Chat session CRUD + message mutations |
| `src/server/resolvers/consent.ts` | Consent get/set mutations + summary query |
| `src/server/resolvers/export.ts` | Export request stubs (types now, implementation Phase 13) |
| `src/server/resolvers/admin.ts` | User management, role assignment, course access management |
| `src/server/resolvers/index.ts` | Barrel export combining all resolvers into one schema |

## Verification

Run from the project root:

```bash
# Type-check all resolver and type files
docker compose exec chat-explorer pnpm tsc --noEmit

# Run resolver unit tests
docker compose exec chat-explorer pnpm test -- --grep "resolver"

# Start the server and verify GraphQL endpoint responds
docker compose up -d --build
curl -s https://chat-explorer.localhost/graphql?query=%7B__typename%7D
```

Verify:
- [ ] All 11 files exist in `src/server/resolvers/` and `src/server/types/`.
- [ ] TypeScript compiles with no errors.
- [ ] Unauthenticated requests to any query return `UNAUTHENTICATED` error.
- [ ] An instructor can query courses they have access to, but not others.
- [ ] A `digication_admin` can query all institutions and courses.
- [ ] Analytics queries return consent-filtered results (test: opt out a student, verify they disappear from analytics).
- [ ] Analytics queries return `AnalyticsMeta` with correct consented/excluded counts.
- [ ] Chat session queries only return sessions owned by the requesting user.
- [ ] Consent mutations are restricted to admin roles.
- [ ] Export resolver stubs return appropriate "not yet implemented" responses.
- [ ] Admin mutations enforce role hierarchy (institution_admin cannot assign digication_admin role).
- [ ] GraphiQL is accessible in development mode at `/graphql`.
