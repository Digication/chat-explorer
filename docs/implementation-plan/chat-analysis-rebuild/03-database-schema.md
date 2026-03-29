# Phase 03 — Database Schema & TypeORM Setup

You are creating the database schema and TypeORM entities for the **Chat Analysis** app.

**Context:** Phases 01–02 set up the project structure and Docker environment. PostgreSQL 17 is running in a Docker container accessible at `postgresql://dev:dev@db:5432/chat-analysis`. The project uses TypeORM with decorator-based entities and TypeScript strict mode.

## Goal

Define all TypeORM entities for a multi-institution, multi-course academic reflection analysis platform with student consent management, persistent AI chat, and upload provenance tracking.

## Entity Relationship Overview

```
Institution ──1:N──► User (via institutionId)
Institution ──1:N──► Course (via institutionId)
Institution ──1:N──► Student (via institutionId)

User ──1:N──► CourseAccess (which courses a user can see)
User ──1:N──► UploadLog (provenance: who uploaded what)
User ──1:N──► ChatSession

Course ──1:N──► Assignment
Course ──1:N──► CourseAccess
Course ──1:N──► StudentConsent (course-level overrides)

Assignment ──1:N──► Thread
Thread ──1:N──► Comment

Student ──1:N──► Comment (student-authored comments)
Student ──1:N──► StudentConsent

Comment ──N:M──► ToriTag (via CommentToriTag join table)

ChatSession ──1:N──► ChatMessage

ToriTag (standalone lookup — pre-populated with TORI taxonomy)
UserState (per-user UI preferences as JSONB)
```

## Entities (15 total)

Create each entity in `src/server/entities/`. Every entity uses UUID primary keys (except User, which uses Better Auth's string ID, and UserState, which uses userId as PK).

### 1. Institution

Represents a university or organization. All data belongs to one institution.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| name | varchar | unique, not null | e.g., "LaGuardia Community College" |
| domain | varchar | nullable | e.g., "lagcc-cuny.digication.com" — for auto-detection from CSV URLs |
| slug | varchar | nullable, unique | URL-safe identifier |
| createdAt | timestamptz | auto | |
| updatedAt | timestamptz | auto | |

Relations: `1:N → User`, `1:N → Course`, `1:N → Student`

### 2. User

Managed by Better Auth for authentication. Extended with role and institution.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PK | Better Auth manages the ID |
| name | varchar | not null | |
| email | varchar | unique, not null | |
| image | varchar | nullable | Profile image URL |
| role | enum | not null, default 'instructor' | 'instructor', 'institution_admin', 'digication_admin' |
| institutionId | uuid | FK → Institution, nullable | null for digication_admin (they can access all) |
| preferredLlmProvider | varchar | nullable | 'openai', 'anthropic', 'google' |
| preferredLlmModel | varchar | nullable | e.g., 'gpt-4o', 'claude-sonnet-4-5-20250514' |
| createdAt | timestamptz | auto | |
| updatedAt | timestamptz | auto | |

Relations: `N:1 → Institution`, `1:N → CourseAccess`, `1:N → ChatSession`, `1:N → UploadLog`

Role enum:
```typescript
export enum UserRole {
  INSTRUCTOR = 'instructor',
  INSTITUTION_ADMIN = 'institution_admin',
  DIGICATION_ADMIN = 'digication_admin',
}
```

### 3. Course

A course within an institution. Populated from CSV data.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| institutionId | uuid | FK → Institution, not null | |
| externalId | varchar | nullable | From source system, for dedup |
| name | varchar | not null | e.g., "AI Course Demo" |
| description | text | nullable | |
| createdAt | timestamptz | auto | |
| updatedAt | timestamptz | auto | |

Unique index: `(externalId, institutionId)` when externalId is not null.

Relations: `N:1 → Institution`, `1:N → Assignment`, `1:N → CourseAccess`, `1:N → StudentConsent`

### 4. Assignment

An assignment within a course. Rich metadata from the CSV.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| courseId | uuid | FK → Course, not null | |
| externalId | varchar | not null | "Assignment ID" from CSV |
| name | varchar | not null | "Assignment name" |
| description | text | nullable | "Assignment description" |
| url | varchar | nullable | "Assignment URL" |
| createdDate | date | nullable | "Assignment created date" |
| dueDate | date | nullable | "Assignment due date" |
| gradeMaxPoints | decimal | nullable | "Grade max points" |
| intendedOutcomes | text | nullable | "Assignment intended outcomes" |
| aiAssistantId | varchar | nullable | "AI assistant ID" |
| aiAssistantName | varchar | nullable | "AI assistant name" |
| aiAssistantDescription | text | nullable | "AI assistant description" |
| aiAssistantInstruction | text | nullable | "AI assistant instruction" |
| aiAssistantRestriction | text | nullable | "AI assistant restriction" |
| aiAssistantRole | varchar | nullable | "AI assistant role" (GUIDE, etc.) |
| aiAssistantTags | text | nullable | "AI assistant tags" (comma-separated) |
| aiAssistantGradeLevel | varchar | nullable | "AI assistant grade level" |
| aiAssistantResponseLength | varchar | nullable | "AI assistant response length" |
| aiAssistantVisibility | varchar | nullable | "AI assistant visibility" |
| aiAssistantReflections | boolean | default false | "AI assistant reflections" |
| aiAssistantGenerateAnswers | boolean | default false | "AI assistant generate answers / content" |
| aiAssistantIntendedAudience | varchar | nullable | "AI assistant intended audience" |
| importedAt | timestamptz | auto | |

Unique index: `(externalId, courseId)`

Relations: `N:1 → Course`, `1:N → Thread`

### 5. Thread

A discussion thread within an assignment.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| assignmentId | uuid | FK → Assignment, not null | |
| externalId | varchar | not null | "Thread ID" from CSV |
| name | varchar | not null | "Thread Name" |
| totalInputTokens | int | nullable | "Thread total input tokens" |
| totalOutputTokens | int | nullable | "Thread total output tokens" |
| totalCost | decimal | nullable | "Thread total cost" |
| submissionUrl | varchar | nullable | "Submission URL" |

Unique index: `(externalId, assignmentId)`

Relations: `N:1 → Assignment`, `1:N → Comment`

### 6. Student

A student within an institution. Appears across courses.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| institutionId | uuid | FK → Institution, not null | |
| systemId | varchar | not null | "Comment author system ID" |
| syncId | varchar | nullable | "Comment author sync ID" |
| firstName | varchar | nullable | "Comment author first name" |
| lastName | varchar | nullable | "Comment author last name" |
| email | varchar | nullable | "Comment author email" |
| systemRole | varchar | nullable | "Comment author system role" |
| courseRole | varchar | nullable | "Comment author course role" |

Unique index: `(systemId, institutionId)`

Relations: `N:1 → Institution`, `1:N → Comment`, `1:N → StudentConsent`

### 7. Comment

An individual comment in a thread.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| threadId | uuid | FK → Thread, not null | |
| studentId | uuid | FK → Student, nullable | null for ASSISTANT/SYSTEM comments |
| externalId | varchar | not null | "Comment ID" from CSV |
| role | enum | not null | 'USER', 'ASSISTANT', 'SYSTEM' |
| text | text | not null | "Comment full text" |
| timestamp | timestamptz | nullable | "Comment timestamp" |
| orderIndex | int | not null | "Comment order #" |
| totalComments | int | nullable | "Total # of comments" in thread |
| grade | varchar | nullable | "Grade" |
| uploadedById | varchar | FK → User, nullable | Who uploaded this data |
| importedAt | timestamptz | auto | |

Unique index: `(externalId, threadId)`

Role enum:
```typescript
export enum CommentRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  SYSTEM = 'SYSTEM',
}
```

Relations: `N:1 → Thread`, `N:1 → Student`, `1:N → CommentToriTag`

### 8. ToriTag

Pre-populated lookup table with all TORI taxonomy categories (49 main categories + subcategories).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| name | varchar | unique, not null | e.g., "Cognitive Flexibility" |
| domain | varchar | not null | e.g., "Cognitive & Analytical Reflection" |
| domainNumber | int | not null | 1–6 |
| categoryNumber | varchar | nullable | e.g., "1.4" |
| description | text | nullable | Full description from TORI map |
| parentCategory | varchar | nullable | For subcategories — name of parent |

Relations: `1:N → CommentToriTag`

Seed this table on first run from `docs/reference/tori-resources/tori/domains/TORI-map.md`. Include all 49 main categories plus all subcategories listed in the TORI taxonomy (approximately 67 total entries).

### 9. CommentToriTag

Join table linking student comments to TORI tags extracted from the following AI response.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| commentId | uuid | FK → Comment, not null, CASCADE | The STUDENT comment this tag applies to |
| toriTagId | uuid | FK → ToriTag, not null, CASCADE | |
| sourceCommentId | varchar | nullable | The AI comment where this tag was mentioned |
| extractionMethod | varchar | default 'extracted' | 'extracted' or 'manual' |

Unique index: `(commentId, toriTagId)`

Relations: `N:1 → Comment`, `N:1 → ToriTag`

### 10. StudentConsent

Tracks consent for data analysis. Two levels: institution-wide or course-specific.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| studentId | uuid | FK → Student, not null, CASCADE | |
| institutionId | uuid | FK → Institution, not null | |
| courseId | uuid | FK → Course, nullable, CASCADE | null = institution-wide, non-null = course override |
| status | enum | not null | 'INCLUDED', 'EXCLUDED' |
| updatedById | varchar | FK → User, not null | Who changed this — audit trail |
| updatedAt | timestamptz | auto | |
| createdAt | timestamptz | auto | |

Unique index: `(studentId, institutionId, courseId)` — allows null courseId for institution-wide record.

Consent query logic (implemented in the consent service, Phase 06):
1. `WHERE studentId = X AND courseId IS NULL AND status = 'EXCLUDED'` → excluded from everything
2. `WHERE studentId = X AND courseId = Y AND status = 'EXCLUDED'` → excluded from that course
3. No matching exclusion → included (default)

Consent enum:
```typescript
export enum ConsentStatus {
  INCLUDED = 'INCLUDED',
  EXCLUDED = 'EXCLUDED',
}
```

### 11. CourseAccess

Tracks which users have access to which courses.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| userId | varchar | FK → User, not null, CASCADE | |
| courseId | uuid | FK → Course, not null, CASCADE | |
| accessLevel | enum | not null | 'owner' (uploaded), 'collaborator' (granted) |
| grantedById | varchar | FK → User, nullable | Who granted this access |
| grantedAt | timestamptz | auto | |

Unique index: `(userId, courseId)`

Access level enum:
```typescript
export enum AccessLevel {
  OWNER = 'owner',
  COLLABORATOR = 'collaborator',
}
```

### 12. UploadLog

Tracks provenance of data uploads for auditing.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| uploadedById | varchar | FK → User, not null | |
| institutionId | uuid | FK → Institution, not null | |
| originalFilename | varchar | not null | |
| totalRows | int | not null | Total CSV rows processed |
| newComments | int | not null | New comments added |
| skippedDuplicates | int | not null | Rows skipped (already existed) |
| newThreads | int | not null | |
| newStudents | int | not null | |
| newCourses | int | default 0 | |
| newAssignments | int | default 0 | |
| toriTagsExtracted | int | not null | Total TORI tag associations created |
| uploadedAt | timestamptz | auto | |

### 13. ChatSession

A persistent AI chat session. Survives browser close, works across devices.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| userId | varchar | FK → User, not null, CASCADE | |
| title | varchar | nullable | Auto-generated or user-edited |
| scope | enum | default 'SELECTION' | 'SELECTION', 'COURSE', 'CROSS_COURSE' |
| courseId | uuid | nullable | If scoped to a course |
| assignmentId | uuid | nullable | If scoped to an assignment |
| studentId | uuid | nullable | If scoped to a student |
| selectedCommentIds | text[] | nullable | If scoped to specific comments |
| selectedToriTags | text[] | nullable | TORI tags in context |
| showPII | boolean | default false | Whether full names are shown |
| llmProvider | varchar | nullable | 'openai', 'anthropic', 'google' |
| llmModel | varchar | nullable | Model identifier |
| createdAt | timestamptz | auto | |
| updatedAt | timestamptz | auto | |

Chat scope enum:
```typescript
export enum ChatScope {
  SELECTION = 'SELECTION',
  COURSE = 'COURSE',
  CROSS_COURSE = 'CROSS_COURSE',
}
```

Relations: `N:1 → User`, `1:N → ChatMessage`

### 14. ChatMessage

Individual message in a chat session.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| sessionId | uuid | FK → ChatSession, not null, CASCADE | |
| role | enum | not null | 'USER', 'ASSISTANT', 'SYSTEM' |
| content | text | not null | |
| contextMeta | jsonb | nullable | Metadata about what data was in context |
| createdAt | timestamptz | auto | |

### 15. UserState

Per-user UI preferences stored as JSONB.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| userId | varchar | PK, FK → User | |
| state | jsonb | default '{}' | Selected course, filters, sidebar state, theme, etc. |
| updatedAt | timestamptz | auto | |

## Data Source Configuration

Create `src/server/data-source.ts`:
- Connect using `DATABASE_URL` environment variable
- `synchronize: true` in development only (auto-creates tables)
- `logging: true` in development
- Register all 15 entities

## TORI Tag Seed Data

Create `src/server/seeds/tori-tags.ts` — a seed script that populates the ToriTag table on first run (skip if data already exists).

Source: `docs/reference/tori-resources/tori/domains/TORI-map.md`

Include all 49 main categories plus subcategories. Each entry needs: name, domain, domainNumber, categoryNumber, description, parentCategory (for subcategories).

Run the seed after data source initialization in `src/server/index.ts`.

## Files to Create

| File | Purpose |
|------|---------|
| `src/server/data-source.ts` | TypeORM DataSource configuration |
| `src/server/entities/Institution.ts` | Institution entity |
| `src/server/entities/User.ts` | User entity with role enum |
| `src/server/entities/Course.ts` | Course entity |
| `src/server/entities/Assignment.ts` | Assignment entity with AI assistant metadata |
| `src/server/entities/Thread.ts` | Thread entity |
| `src/server/entities/Student.ts` | Student entity |
| `src/server/entities/Comment.ts` | Comment entity with role enum |
| `src/server/entities/ToriTag.ts` | ToriTag entity |
| `src/server/entities/CommentToriTag.ts` | Join table entity |
| `src/server/entities/StudentConsent.ts` | Consent entity with status enum |
| `src/server/entities/CourseAccess.ts` | Course access entity with level enum |
| `src/server/entities/UploadLog.ts` | Upload provenance entity |
| `src/server/entities/ChatSession.ts` | Chat session entity with scope enum |
| `src/server/entities/ChatMessage.ts` | Chat message entity |
| `src/server/entities/UserState.ts` | User state entity |
| `src/server/entities/index.ts` | Barrel export for all entities |
| `src/server/seeds/tori-tags.ts` | TORI taxonomy seed data |

## Verification

```bash
# Typecheck
docker compose exec app pnpm typecheck

# Verify tables are created:
docker compose exec db psql -U dev -d chat-analysis -c '\dt'
# Should list 15+ tables (including Better Auth's own tables)

# Verify TORI tags were seeded:
docker compose exec db psql -U dev -d chat-analysis -c 'SELECT count(*) FROM tori_tag;'
# Should return ~67 (49 main + 18 subcategories)
```
