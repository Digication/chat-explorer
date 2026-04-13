# Technical Spec: Outcomes, Evidence & Conceptual Trees (Revised)

> One-shot implementation guide. Every file, entity, service, resolver, component, and test specified.
> Revised 2026-04-13 — addresses all audit findings from `outcomes-spec-critique.md`.

---

## Conventions (from existing codebase)

| Aspect | Pattern |
|--------|---------|
| **Entities** | TypeORM decorators, `@PrimaryGeneratedColumn("uuid")`, string FK columns, `Relation<T>` types, string refs in decorators |
| **Enums** | TS enum above class, UPPER_SNAKE values, `@Column({ type: "enum", enum: Name })` |
| **Migrations** | `timestamp-Description.ts`, raw SQL in `up`/`down`, class `DescriptionTimestamp implements MigrationInterface` |
| **Services** | Pure async functions. Use `resolveScope()` for consent, `withCache()` for caching. Return `AnalyticsResult<T>` assembled manually from `withCache` output + resolved scope metadata. |
| **Resolvers** | `validateScope(ctx, scope)` for auth. Grouped in files, merged in `resolvers/index.ts`. |
| **Schema** | SDL string in `src/server/types/schema.ts`. All types, enums, inputs, queries, mutations in one file. |
| **Client queries** | `gql` templates in `src/lib/queries/*.ts`, `useQuery<any>()` with `skip` conditions |
| **Components** | MUI + `sx` prop, `useInsightsScope()`, `useFacultyPanel()`, Skeletons for loading, Alerts for errors |
| **Routes** | All Express routes inline in `src/server/index.ts` (no routes directory). multer instance is `upload`. |
| **React routing** | `RoleProtectedRoute` wraps `{children}` (not `<Outlet />`). All protected routes nest under the `<ProtectedRoute>` layout route. |
| **Tests** | Vitest. `vi.mock()` before imports. `@testing-library/react` for components. Playwright for E2E. |
| **Registration** | Entities → `entities/index.ts` + `data-source.ts` entities array. Migrations → `data-source.ts` migrations array. Resolvers → `resolvers/index.ts` merge. |

---

# Phase 1: Student Auth

## 1.1 User Role Extension

**`src/server/entities/User.ts`** — add to enum:

```typescript
export enum UserRole {
  INSTRUCTOR = "instructor",
  INSTITUTION_ADMIN = "institution_admin",
  DIGICATION_ADMIN = "digication_admin",
  STUDENT = "student",                      // ← new
}
```

**`src/server/entities/Student.ts`** — add fields:

```typescript
@Column({ type: "varchar", nullable: true })
userId!: string | null;

@ManyToOne("User", { nullable: true })
@JoinColumn({ name: "userId" })
user!: Relation<User> | null;
```

## 1.2 Migration

**`src/server/migrations/1775574500000-AddStudentRole.ts`**

```sql
-- up:
ALTER TYPE "public"."user_role_enum" ADD VALUE IF NOT EXISTS 'student';
ALTER TABLE "student" ADD COLUMN "userId" varchar;
ALTER TABLE "student" ADD CONSTRAINT "FK_student_user"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL;
CREATE INDEX "IDX_student_userId" ON "student" ("userId");

-- down:
ALTER TABLE "student" DROP CONSTRAINT IF EXISTS "FK_student_user";
DROP INDEX IF EXISTS "IDX_student_userId";
ALTER TABLE "student" DROP COLUMN IF EXISTS "userId";
-- Note: cannot remove enum value in Postgres. Harmless to leave it.
```

Register in `data-source.ts` entities array (Student already registered — just add migration).

## 1.3 Student Invite Service

**`src/server/services/student-invite.ts`**

```typescript
import { AppDataSource } from "../data-source.js";
import { Student } from "../entities/Student.js";
import { User, UserRole } from "../entities/User.js";
import { auth } from "../auth.js";

/**
 * Invite a student to access the app. Creates a User with student role,
 * links it to the Student record, and sends a magic link invitation.
 * Idempotent — if student already has a userId, returns the existing user.
 *
 * Uses the same better-auth invitation flow as admin invites:
 * the `auth.api.signUpEmail` call creates the user record in better-auth's
 * tables, then we create our User entity and link it to Student.
 */
export async function inviteStudent(
  studentId: string,
  invitedById: string
): Promise<{ userId: string; email: string }>

export async function bulkInviteStudents(
  studentIds: string[],
  invitedById: string
): Promise<Array<{ studentId: string; userId: string; email: string; error?: string }>>
```

**Flow for `inviteStudent`:**
1. Load Student record. Throw if no email.
2. Check `student.userId` — if already set, return existing user.
3. Create User via better-auth's user creation API (same as admin invite in `resolvers/admin.ts`).
4. Save our `User` entity with `role: UserRole.STUDENT`, `institutionId` from student's institution.
5. Update `student.userId = newUser.id`.
6. Send magic link email (same as existing invite flow).
7. Return `{ userId, email }`.

**`bulkInviteStudents`:** Loops `inviteStudent`, catches per-student errors, returns results array.

## 1.4 GraphQL Schema Additions

Add to `src/server/types/schema.ts`:

```graphql
# Update UserRole enum:
enum UserRole {
  instructor
  institution_admin
  digication_admin
  student
}

# New query:
# myStudentProfile: Student  (returns Student record for logged-in student user)

# New mutations:
# inviteStudent(studentId: ID!): InviteResult!
# bulkInviteStudents(studentIds: [ID!]!): [BulkInviteResult!]!

type InviteResult {
  userId: ID!
  email: String!
}

type BulkInviteResult {
  studentId: ID!
  userId: ID
  email: String
  error: String
}
```

## 1.5 Resolver

**`src/server/resolvers/student-auth.ts`**

```typescript
export const studentAuthResolvers = {
  Query: {
    myStudentProfile: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const user = requireAuth(ctx);
      requireRole(ctx, [UserRole.STUDENT]);
      const studentRepo = AppDataSource.getRepository(Student);
      return studentRepo.findOne({ where: { userId: user.id } });
    },
  },
  Mutation: {
    inviteStudent: async (_: unknown, { studentId }: { studentId: string }, ctx: GraphQLContext) => {
      const user = requireAuth(ctx);
      requireRole(ctx, [UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN]);
      return inviteStudent(studentId, user.id);
    },
    bulkInviteStudents: async (_: unknown, { studentIds }: { studentIds: string[] }, ctx: GraphQLContext) => {
      const user = requireAuth(ctx);
      requireRole(ctx, [UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN]);
      return bulkInviteStudents(studentIds, user.id);
    },
  },
};
```

Register in `resolvers/index.ts`: spread into Query and Mutation.

## 1.6 Frontend: Student Routing

**`src/App.tsx`** — add student routes inside the existing `<ProtectedRoute>` layout route:

```typescript
{/* Student routes — RoleProtectedRoute wraps children, not Outlet */}
<Route
  path="student"
  element={
    <RoleProtectedRoute allowedRoles={["student"]}>
      <StudentDashboardPlaceholder />
    </RoleProtectedRoute>
  }
/>
<Route
  path="student/tree"
  element={
    <RoleProtectedRoute allowedRoles={["student"]}>
      <StudentTreePlaceholder />
    </RoleProtectedRoute>
  }
/>
<Route
  path="student/growth"
  element={
    <RoleProtectedRoute allowedRoles={["student"]}>
      <StudentGrowthPlaceholder />
    </RoleProtectedRoute>
  }
/>
<Route
  path="student/outcomes"
  element={
    <RoleProtectedRoute allowedRoles={["student"]}>
      <StudentOutcomesPlaceholder />
    </RoleProtectedRoute>
  }
/>
```

Note: each route wraps `RoleProtectedRoute` around `{children}` — matching the existing pattern where `RoleProtectedRoute` renders `<>{children}</>`, not `<Outlet />`.

**Placeholder pages:** Simple "Coming Soon" components for `/student/*` routes. Replaced with real pages in later phases.

**Default redirect:** Update the root `<Route index>` to redirect based on role:

```typescript
<Route index element={<RoleBasedRedirect />} />
```

**`src/components/layout/RoleBasedRedirect.tsx`:**
```typescript
export default function RoleBasedRedirect() {
  const { user } = useAuth();
  if (user?.role === "student") return <Navigate to="/student" replace />;
  return <Navigate to="/insights" replace />;
}
```

## 1.7 Frontend: Conditional Sidebar

**`src/components/layout/Sidebar.tsx`** — conditional nav items:

```typescript
const { user } = useAuth();
const isStudent = user?.role === "student";

const navItems = isStudent
  ? [
      { label: "My Dashboard", path: "/student", icon: DashboardOutlined },
      { label: "My Learning Map", path: "/student/tree", icon: AccountTreeOutlined },
      { label: "My Growth", path: "/student/growth", icon: TrendingUpOutlined },
      { label: "My Outcomes", path: "/student/outcomes", icon: EmojiEventsOutlined },
    ]
  : [
      // existing faculty nav items unchanged
    ];
```

## 1.8 Student Context Hook

**`src/lib/useStudentContext.ts`**

```typescript
import { useAuth } from "./AuthProvider";
import { useQuery } from "@apollo/client/react";
import { GET_MY_STUDENT_PROFILE } from "./queries/student";

export function useStudentContext() {
  const { user } = useAuth();
  const { data, loading } = useQuery(GET_MY_STUDENT_PROFILE, {
    skip: user?.role !== "student",
  });
  return {
    student: data?.myStudentProfile ?? null,
    studentId: data?.myStudentProfile?.id ?? null,
    loading,
  };
}
```

**`src/lib/queries/student.ts`:**
```typescript
import { gql } from "@apollo/client";

export const GET_MY_STUDENT_PROFILE = gql`
  query MyStudentProfile {
    myStudentProfile {
      id
      firstName
      lastName
      email
      systemId
      institutionId
    }
  }
`;
```

## 1.9 Admin UI: Invite Students

**`src/pages/AdminPage.tsx`** — add "Invite Students" section (or dialog):
- Select students from existing student list (filtered by institution)
- "Invite" button calls `inviteStudent` mutation
- Shows success/error per student
- Bulk invite option: select multiple → "Invite All"

## 1.10 Tests

### Unit Tests

**`src/server/services/__tests__/student-invite.test.ts`**

```
describe("inviteStudent")
  it("creates User with student role linked to Student record")
  it("sets student.userId to the new user ID")
  it("sends magic link invitation email")
  it("rejects student without email address")
  it("is idempotent — returns existing user if student.userId already set")
  it("sets correct institutionId on User from Student's institution")

describe("bulkInviteStudents")
  it("invites multiple students, returns results array")
  it("continues after individual failures, reports errors per student")
```

**`src/server/resolvers/__tests__/student-auth.test.ts`**

```
describe("myStudentProfile")
  it("returns Student for logged-in student user")
  it("returns null if student record has no userId match")
  it("rejects non-student roles")
  it("rejects unauthenticated requests")

describe("inviteStudent mutation")
  it("requires institution_admin or digication_admin role")
  it("rejects instructor role")
  it("returns userId and email on success")
```

### Component Tests

**`src/components/layout/__tests__/Sidebar.test.tsx`** — add cases:

```
describe("Student sidebar")
  it("shows student nav items when user role is student")
  it("hides faculty nav items (Insights, Chat, Upload, Admin) for students")
  it("shows 'My Dashboard' as first nav item for students")
```

**`src/components/layout/__tests__/RoleBasedRedirect.test.tsx`**

```
describe("RoleBasedRedirect")
  it("redirects student to /student")
  it("redirects instructor to /insights")
  it("redirects admin to /insights")
```

### E2E Tests

**`e2e/student-auth.spec.ts`**

```
test.describe("Student auth")
  test("student user sees student sidebar after login")
  test("student user is redirected to /student on root access")
  test("student user cannot access /insights")
  test("student user cannot access /admin")
  test("faculty user cannot access /student routes")
```

### Browser Verification

- [ ] Log in as student → redirected to `/student`
- [ ] Student sidebar shows: My Dashboard, My Learning Map, My Growth, My Outcomes
- [ ] Faculty nav items NOT visible to student
- [ ] Navigating to `/insights` as student → redirected
- [ ] Log in as faculty → redirected to `/insights`, no student routes accessible
- [ ] Admin can invite a student from admin page
- [ ] No console errors

---

# Phase 2: Narrative Evidence on Existing Comments

## 2.1 New Entities

### `src/server/entities/OutcomeFramework.ts`

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, type Relation,
} from "typeorm";

export enum FrameworkType {
  TORI = "TORI",
  GEN_ED = "GEN_ED",
  ABET = "ABET",
  NURSING = "NURSING",
  CUSTOM = "CUSTOM",
}

@Entity()
export class OutcomeFramework {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  institutionId!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "enum", enum: FrameworkType })
  type!: FrameworkType;

  @Column({ type: "boolean", default: false })
  isDefault!: boolean;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @Column({ type: "boolean", default: false })
  isSystem!: boolean;                  // true for auto-seeded TORI — prevents deletion

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne("Institution", { nullable: false })
  @JoinColumn({ name: "institutionId" })
  institution!: Relation<Institution>;

  @OneToMany("OutcomeDefinition", "framework")
  outcomes!: Relation<OutcomeDefinition[]>;
}
```

### `src/server/entities/OutcomeDefinition.ts`

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany,
  JoinColumn, Index, type Relation,
} from "typeorm";

@Entity()
@Index(["frameworkId", "code"], { unique: true })
export class OutcomeDefinition {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  frameworkId!: string;

  @Column({ type: "varchar" })
  code!: string;                    // e.g. "CT-1", "ABET-1"

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", nullable: true })
  parentId!: string | null;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  @ManyToOne("OutcomeFramework", "outcomes", { onDelete: "CASCADE" })
  @JoinColumn({ name: "frameworkId" })
  framework!: Relation<OutcomeFramework>;

  @ManyToOne("OutcomeDefinition", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parentId" })
  parent!: Relation<OutcomeDefinition> | null;

  @OneToMany("OutcomeDefinition", "parent")
  children!: Relation<OutcomeDefinition[]>;

  @OneToMany("EvidenceOutcomeLink", "outcomeDefinition")
  evidenceLinks!: Relation<EvidenceOutcomeLink[]>;
}
```

### `src/server/entities/EvidenceMoment.ts`

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index, type Relation,
} from "typeorm";

export enum EvidenceType {
  TORI = "TORI",
  REFLECTION = "REFLECTION",
  OUTCOME = "OUTCOME",
  STRUCTURAL = "STRUCTURAL",
}

@Entity()
@Index(["studentId"])
@Index(["commentId"])
@Index(["artifactSectionId"])
@Index(["processedAt"])
export class EvidenceMoment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  studentId!: string;

  @Column({ type: "varchar", nullable: true })
  commentId!: string | null;

  @Column({ type: "varchar", nullable: true })
  artifactSectionId!: string | null;    // Phase 3

  @Column({ type: "text" })
  narrative!: string;

  @Column({ type: "text" })
  sourceText!: string;

  @Column({ type: "enum", enum: EvidenceType })
  type!: EvidenceType;

  @Column({ type: "varchar" })
  modelVersion!: string;

  @CreateDateColumn({ type: "timestamptz" })
  processedAt!: Date;

  @Column({ type: "varchar", nullable: true })
  parentMomentId!: string | null;

  @Column({ type: "boolean", default: true })
  isLatest!: boolean;                   // false when superseded by reprocessing

  @ManyToOne("Student", { onDelete: "CASCADE" })
  @JoinColumn({ name: "studentId" })
  student!: Relation<Student>;

  @ManyToOne("Comment", { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "commentId" })
  comment!: Relation<Comment> | null;

  @ManyToOne("EvidenceMoment", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parentMomentId" })
  parentMoment!: Relation<EvidenceMoment> | null;

  @OneToMany("EvidenceOutcomeLink", "evidenceMoment")
  outcomeLinks!: Relation<EvidenceOutcomeLink[]>;
}
```

### `src/server/entities/EvidenceOutcomeLink.ts`

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  JoinColumn, Index, type Relation,
} from "typeorm";

export enum StrengthLevel {
  EMERGING = "EMERGING",
  DEVELOPING = "DEVELOPING",
  DEMONSTRATING = "DEMONSTRATING",
  EXEMPLARY = "EXEMPLARY",
}

@Entity()
@Index(["evidenceMomentId", "outcomeDefinitionId"], { unique: true })
export class EvidenceOutcomeLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  evidenceMomentId!: string;

  @Column({ type: "varchar" })
  outcomeDefinitionId!: string;

  @Column({ type: "enum", enum: StrengthLevel })
  strengthLevel!: StrengthLevel;

  @Column({ type: "text", nullable: true })
  rationale!: string | null;

  @ManyToOne("EvidenceMoment", "outcomeLinks", { onDelete: "CASCADE" })
  @JoinColumn({ name: "evidenceMomentId" })
  evidenceMoment!: Relation<EvidenceMoment>;

  @ManyToOne("OutcomeDefinition", "evidenceLinks", { onDelete: "CASCADE" })
  @JoinColumn({ name: "outcomeDefinitionId" })
  outcomeDefinition!: Relation<OutcomeDefinition>;
}
```

## 2.2 Registration

**`src/server/entities/index.ts`** — add:
```typescript
export { OutcomeFramework, FrameworkType } from "./OutcomeFramework.js";
export { OutcomeDefinition } from "./OutcomeDefinition.js";
export { EvidenceMoment, EvidenceType } from "./EvidenceMoment.js";
export { EvidenceOutcomeLink, StrengthLevel } from "./EvidenceOutcomeLink.js";
```

**`src/server/data-source.ts`** — add all four to `entities` array. Add migration to `migrations` array.

## 2.3 Migration

**`src/server/migrations/1775574600000-AddEvidenceEntities.ts`**

Creates `outcome_framework`, `outcome_definition`, `evidence_moment`, `evidence_outcome_link` tables with all columns, indexes, and foreign keys. Includes `"isLatest"` and `"isSystem"` columns. SQL follows the exact patterns from existing migrations (see `1775574300000` for reference).

Down: drops in reverse order (constraints → indexes → tables → enum types).

## 2.4 TORI Seed as OutcomeFramework

**`src/server/services/evidence/seed-tori-framework.ts`**

```typescript
import { AppDataSource } from "../../data-source.js";
import { OutcomeFramework, FrameworkType } from "../../entities/OutcomeFramework.js";
import { OutcomeDefinition } from "../../entities/OutcomeDefinition.js";
import { ToriTag } from "../../entities/ToriTag.js";
import { Institution } from "../../entities/Institution.js";

/**
 * Seeds a TORI OutcomeFramework for every institution that doesn't have one.
 * Called during server startup. Idempotent.
 */
export async function seedToriFrameworks(): Promise<void> {
  const institutions = await AppDataSource.getRepository(Institution).find({ select: ["id"] });
  for (const inst of institutions) {
    await seedToriFrameworkForInstitution(inst.id);
  }
}

async function seedToriFrameworkForInstitution(institutionId: string): Promise<void> {
  const frameworkRepo = AppDataSource.getRepository(OutcomeFramework);
  const existing = await frameworkRepo.findOne({
    where: { institutionId, type: FrameworkType.TORI },
  });
  if (existing) return;

  const framework = await frameworkRepo.save({
    institutionId,
    name: "TORI Learning Outcomes",
    description: "Transformative Outcomes Research Institute taxonomy",
    type: FrameworkType.TORI,
    isDefault: true,
    isSystem: true,       // prevents deletion via admin UI
  });

  const toriTags = await AppDataSource.getRepository(ToriTag).find({
    order: { domainNumber: "ASC", categoryNumber: "ASC" },
  });

  const outcomeRepo = AppDataSource.getRepository(OutcomeDefinition);
  for (const tag of toriTags) {
    const catNum = tag.categoryNumber ?? "0";
    const sortVal = tag.domainNumber * 100 + (parseInt(catNum, 10) || 0);
    await outcomeRepo.save({
      frameworkId: framework.id,
      code: `TORI-${tag.domainNumber}-${catNum}`,
      name: tag.name,
      description: tag.description,
      sortOrder: sortVal,
    });
  }
}
```

**Integration:** Call `seedToriFrameworks()` in `src/server/index.ts` after `seedToriTags()` and `AppDataSource.initialize()`:

```typescript
await seedToriTags();
await seedToriFrameworks();   // ← add here
```

## 2.5 Consent Helper (extracted for reuse)

**`src/server/services/analytics/consent.ts`**

Extract the consent-filtering logic from `resolveScope()` into a reusable function:

```typescript
/**
 * Returns the set of consented student IDs for a given scope.
 * Used by both comment-based analytics (via resolveScope) and
 * evidence-based analytics (directly).
 */
export async function getConsentedStudentIds(
  scope: AnalyticsScope,
  participatingStudentIds: string[]
): Promise<{ consentedStudentIds: string[]; excludedCount: number }>
```

Refactor `resolveScope()` to call `getConsentedStudentIds()` internally (no behavior change, just extraction).

## 2.6 Evidence Generation Service

### `src/server/services/evidence/narrative-generator.ts`

```typescript
export interface NarrativeInput {
  comments: Array<{
    commentId: string;
    studentId: string;
    text: string;
    threadName: string;
    assignmentDescription: string | null;
    toriTags: string[];
    reflectionCategory: string | null;
  }>;
  outcomes: Array<{ id: string; code: string; name: string; description: string | null }>;
}

export interface NarrativeOutput {
  commentId: string;
  narrative: string;
  outcomeAlignments: Array<{
    outcomeCode: string;           // LLM returns code, we map to ID below
    strengthLevel: StrengthLevel;
    rationale: string;
  }>;
}

export const NARRATIVE_MODEL = "gemini-2.5-flash";
export const NARRATIVE_VERSION = "google/gemini-2.5-flash@2026-04-08";
const MAX_BATCH_SIZE = 5;

/**
 * Generate narratives for a batch of up to 5 comments in a single LLM call.
 * Returns one NarrativeOutput per comment.
 */
export async function generateNarrativeBatch(
  input: NarrativeInput
): Promise<NarrativeOutput[]>
```

**System prompt instructs the model to:**
1. For each comment in the batch, write a 2-3 sentence interpretive narrative (max 500 chars each)
2. Assess alignment to provided outcomes with strength level + 1-sentence rationale
3. Return strict JSON array: `[{ commentId, narrative, outcomeAlignments: [{ outcomeCode, strengthLevel, rationale }] }]`

**Validation (in `parseAndValidateNarratives`):**
- Each narrative: non-empty, max 500 chars
- Strength levels: must be valid `StrengthLevel` enum value, else drop alignment
- Outcome codes: must exist in the provided outcomes list, else drop alignment (**code → ID lookup:** build a `Map<string, string>` from `input.outcomes` mapping `code → id` before calling LLM; after parsing, replace `outcomeCode` with `outcomeDefinitionId` using this map; drop any code not in the map)
- Same retry-on-invalid-JSON pattern as existing `classifier.ts` (one retry with stricter prompt, temperature 0.0)

### `src/server/services/evidence/evidence-pipeline.ts`

```typescript
import { cacheInvalidate } from "../analytics/cache.js";

/**
 * Generate narrative evidence for a batch of comment IDs.
 * Called AFTER TORI extraction and reflection classification complete.
 * Idempotent — skips comments that already have an EvidenceMoment with isLatest=true.
 */
export async function generateEvidenceForComments(
  commentIds: string[],
  institutionId: string
): Promise<{ ok: number; failed: number }>
```

**Flow:**
1. If `commentIds` is empty or `GOOGLE_AI_API_KEY` not set, return early.
2. Query comments LEFT JOIN evidence_moment (WHERE isLatest = true) IS NULL — skip already-processed.
3. Filter to USER role, non-empty text.
4. For each comment, load: thread name (via `comment.thread`), assignment description (via `thread.assignment`), TORI tags (from `CommentToriTag`), reflection category (from `CommentReflectionClassification`).
5. Load active OutcomeDefinitions for the institution (from OutcomeFramework WHERE institutionId AND isActive).
6. Build `code → id` map from outcome definitions.
7. **Batch into groups of 5.** For each batch:
   a. Call `generateNarrativeBatch()` with the batch + outcomes.
   b. For each result, in a transaction:
      - Save `EvidenceMoment` (narrative, sourceText, type, modelVersion, commentId, studentId, isLatest: true)
      - Save `EvidenceOutcomeLink` records (map outcomeCode → outcomeDefinitionId using the map)
   c. On per-comment failure: log warning, increment `failed`, continue.
   d. 250ms delay between batches (not between individual comments).
8. After all batches complete: call `cacheInvalidate({ institutionId })` to clear stale analytics caches.
9. Log summary: `[evidence] complete: ok=N failed=N`.

### Pipeline Integration

**`src/server/index.ts`** — update the upload commit handler (lines 154-162):

```typescript
// Chain: reflection classification → evidence generation
// Both run outside the upload transaction (fire-and-forget from HTTP response).
// Evidence generation awaits classification because it needs TORI tags
// and reflection categories as input context.
void (async () => {
  try {
    await classifyUserCommentsInBackground(result.newUserCommentIds);
  } catch (err) {
    console.error("[reflection] background classification failed:", err);
  }
  try {
    await generateEvidenceForComments(result.newUserCommentIds, institutionId);
  } catch (err) {
    console.error("[evidence] background generation failed:", err);
  }
})();
```

This chains them: classification runs first (awaited), then evidence generation runs after. The whole chain is fire-and-forget from the upload response (the `void` prefix). If classification fails, evidence generation still runs — it just won't have reflection category context for those comments.

## 2.7 Evidence Analytics Service

**`src/server/services/analytics/evidence-analytics.ts`**

```typescript
import { getConsentedStudentIds } from "./consent.js";
import { withCache } from "./cache.js";
import type { AnalyticsScope, AnalyticsResult } from "./types.js";

export interface EvidenceSummary {
  totalMoments: number;
  byType: Record<EvidenceType, number>;
  byOutcome: Array<{
    outcomeId: string;
    outcomeName: string;
    outcomeCode: string;
    frameworkName: string;
    momentCount: number;
    strengthDistribution: Record<StrengthLevel, number>;
  }>;
  recentMoments: Array<EvidenceMomentDetail>;
}

export interface EvidenceMomentDetail {
  id: string;
  narrative: string;
  sourceText: string;
  type: EvidenceType;
  processedAt: string;
  commentId: string | null;
  artifactSectionId: string | null;
  outcomeAlignments: Array<{
    outcomeId: string;
    outcomeName: string;
    outcomeCode: string;
    strengthLevel: StrengthLevel;
    rationale: string | null;
  }>;
}

/**
 * Returns evidence summary for a scope, optionally filtered to a student.
 * Uses resolveScope ONLY for consented student IDs, then queries
 * evidence_moment separately.
 */
export async function getEvidenceSummary(
  scope: AnalyticsScope,
  studentId?: string,
  limit: number = 10
): Promise<AnalyticsResult<EvidenceSummary>>
```

**Implementation pattern** (matching existing services like `getToriAnalysis`):

```typescript
export async function getEvidenceSummary(scope, studentId, limit = 10) {
  // 1. Get consented student IDs (reuse consent helper)
  //    For student-specific queries, just consent-check that one student
  const participatingIds = studentId ? [studentId] : await getParticipatingStudentIds(scope);
  const { consentedStudentIds, excludedCount } = await getConsentedStudentIds(scope, participatingIds);

  if (consentedStudentIds.length === 0) {
    return emptyResult(scope, 0, excludedCount);
  }

  // 2. Cache check
  const cacheKey = `evidence:${JSON.stringify(scope)}:${studentId ?? "all"}`;
  const { data, cached } = await withCache(cacheKey, scope, async () => {
    // 3. Query evidence_moment WHERE studentId IN (consented) AND isLatest = true
    const momentRepo = AppDataSource.getRepository(EvidenceMoment);
    // ... build query with joins to EvidenceOutcomeLink + OutcomeDefinition
    // ... compute byType counts, byOutcome aggregation, recent moments
    return computedSummary;
  });

  // 4. Assemble AnalyticsResult (same as all other services)
  return {
    data,
    meta: {
      scope,
      consentedStudentCount: consentedStudentIds.length,
      excludedStudentCount: excludedCount,
      computedAt: new Date(),
      cached,
    },
  };
}
```

**Helper: `getParticipatingStudentIds`** — queries evidence_moment for distinct studentIds within scope (joins through comment → thread → assignment → course for scope filtering). This replaces the comment-based participation check for evidence queries.

**Paginated query:**
```typescript
export async function getStudentEvidenceMoments(
  scope: AnalyticsScope,
  studentId: string,
  outcomeId?: string,
  limit: number = 20,
  offset: number = 0
): Promise<AnalyticsResult<{ items: EvidenceMomentDetail[]; totalCount: number }>>
```

Same consent-check pattern. Queries evidence_moment WHERE studentId AND isLatest = true, optionally filtered by outcomeId via JOIN to evidence_outcome_link. Pagination via `.limit()` and `.offset()` with separate `COUNT(*)` for totalCount.

## 2.8 GraphQL Schema Additions

Add to `src/server/types/schema.ts`:

```graphql
# ── Evidence Enums ──────────────────────────────────────────
enum EvidenceType { TORI REFLECTION OUTCOME STRUCTURAL }
enum StrengthLevel { EMERGING DEVELOPING DEMONSTRATING EXEMPLARY }
enum FrameworkType { TORI GEN_ED ABET NURSING CUSTOM }

# ── Evidence Types ──────────────────────────────────────────
type OutcomeFramework {
  id: ID!
  institutionId: ID!
  name: String!
  description: String
  type: FrameworkType!
  isDefault: Boolean!
  isActive: Boolean!
  isSystem: Boolean!
  outcomes: [OutcomeDefinition!]!
}

type OutcomeDefinition {
  id: ID!
  code: String!
  name: String!
  description: String
  frameworkId: ID!
  parentId: ID
  sortOrder: Int!
}

type EvidenceMoment {
  id: ID!
  narrative: String!
  sourceText: String!
  type: EvidenceType!
  modelVersion: String!
  processedAt: String!
  commentId: ID
  artifactSectionId: ID
  outcomeAlignments: [OutcomeAlignment!]!
}

type OutcomeAlignment {
  outcomeId: ID!
  outcomeName: String!
  outcomeCode: String!
  strengthLevel: StrengthLevel!
  rationale: String
}

type OutcomeSummary {
  outcomeId: ID!
  outcomeName: String!
  outcomeCode: String!
  frameworkName: String!
  momentCount: Int!
  strengthDistribution: StrengthDistribution!
}

type StrengthDistribution {
  EMERGING: Int!
  DEVELOPING: Int!
  DEMONSTRATING: Int!
  EXEMPLARY: Int!
}

type EvidenceSummaryData {
  totalMoments: Int!
  byType: EvidenceTypeDistribution!
  byOutcome: [OutcomeSummary!]!
  recentMoments: [EvidenceMoment!]!
}

type EvidenceTypeDistribution {
  TORI: Int!
  REFLECTION: Int!
  OUTCOME: Int!
  STRUCTURAL: Int!
}

type EvidenceSummaryResult {
  data: EvidenceSummaryData!
  meta: AnalyticsMeta!
}

type EvidenceMomentsResult {
  items: [EvidenceMoment!]!
  totalCount: Int!
}

# ── Evidence Inputs ─────────────────────────────────────────
input EvidenceSummaryInput {
  scope: AnalyticsScopeInput!
  studentId: ID
  limit: Int
}

input EvidenceMomentsInput {
  scope: AnalyticsScopeInput!
  studentId: ID!
  outcomeId: ID
  limit: Int
  offset: Int
}

# ── Evidence Queries (add to Query type) ────────────────────
# evidenceSummary(input: EvidenceSummaryInput!): EvidenceSummaryResult!
# evidenceMoments(input: EvidenceMomentsInput!): EvidenceMomentsResult!
# outcomeFrameworks(institutionId: ID!): [OutcomeFramework!]!
```

Note: GraphQL types use entity names directly (`EvidenceMoment`, not `EvidenceMomentType`) matching the existing pattern (`Comment`, `Thread`, `Student`).

## 2.9 Resolver

**`src/server/resolvers/evidence.ts`**

```typescript
export const evidenceResolvers = {
  Query: {
    evidenceSummary: async (_: unknown, { input }: ..., ctx: GraphQLContext) => {
      const validated = await validateScope(ctx, input.scope);
      return getEvidenceSummary(validated, input.studentId, input.limit);
    },
    evidenceMoments: async (_: unknown, { input }: ..., ctx: GraphQLContext) => {
      const validated = await validateScope(ctx, input.scope);
      return getStudentEvidenceMoments(validated, input.studentId, input.outcomeId, input.limit, input.offset);
    },
    outcomeFrameworks: async (_: unknown, { institutionId }: ..., ctx: GraphQLContext) => {
      requireAuth(ctx);
      requireInstitutionAccess(ctx, institutionId);
      return AppDataSource.getRepository(OutcomeFramework).find({
        where: { institutionId, isActive: true },
        relations: ["outcomes"],
        order: { createdAt: "ASC" },
      });
    },
  },
};
```

Register in `resolvers/index.ts`.

## 2.10 Client Queries

**`src/lib/queries/evidence.ts`** — `GET_EVIDENCE_SUMMARY`, `GET_EVIDENCE_MOMENTS`, `GET_OUTCOME_FRAMEWORKS`. Fields match the schema above exactly.

## 2.11 Frontend: Evidence Tab in FacultyPanel

**`src/components/faculty-panel/FacultyPanelContext.tsx`** — changes:

```typescript
export type PanelTab = "student" | "thread" | "chat" | "evidence";  // add "evidence"
```

Add to `HistoryEntry`, `FacultyPanelState`, `snapshotEntry`, and `reducer` accordingly. No new actions needed — `SWITCH_TAB` already accepts any `PanelTab`.

**`src/components/faculty-panel/EvidenceTab.tsx`**

```
Props: uses useFacultyPanel() for studentId, useInsightsScope() for scope
Query: GET_EVIDENCE_SUMMARY with { scope, studentId }
  skip: !scope || !panel.studentId

States:
  - No student selected → "Select a student to view evidence"
  - Loading → Skeleton cards
  - Error → Alert with retry button (refetch())
  - Empty → "No evidence moments yet for this student"
  - Data → Outcome summary cards + recent moments

Layout:
  - Header: "Evidence for {studentName}" + "{N} moments"
  - OutcomeSummaryCard (one per outcome):
    - Outcome name + code
    - Moment count
    - Strength distribution as stacked bar (colored segments)
    - Click → expands to show individual EvidenceMomentCards
  - EvidenceMomentCard:
    - Narrative text (primary)
    - Source text (collapsed, expandable via IconButton)
    - Outcome alignment chips: Chip with strength color + outcome name
    - Timestamp (relative, e.g. "2 days ago")

Strength colors:
  EMERGING:       #ffa726 (orange)
  DEVELOPING:     #42a5f5 (blue)
  DEMONSTRATING:  #66bb6a (green)
  EXEMPLARY:      #ab47bc (purple)
```

**`src/components/faculty-panel/FacultyPanel.tsx`** — add Evidence tab:
- Add to `TAB_ORDER` and `TAB_LABELS`
- Render `<EvidenceTab />` when `panel.activeTab === "evidence"`
- Evidence tab enabled whenever a studentId is set (same condition as Student tab)

## 2.12 Tests

### Unit Tests

**`src/server/services/evidence/__tests__/narrative-generator.test.ts`**

```
describe("generateNarrativeBatch")
  it("returns one narrative per comment in the batch")
  it("maps outcomeCode to outcomeDefinitionId correctly")
  it("drops hallucinated outcome codes not in input list")
  it("retries on invalid JSON, succeeds on second attempt")
  it("caps narrative at 500 chars")
  it("handles batch of 1 comment")
  it("handles LLM returning fewer results than batch size (fills gaps with error)")
```

Mock LLM provider with `vi.mock`.

**`src/server/services/evidence/__tests__/evidence-pipeline.test.ts`**

```
describe("generateEvidenceForComments")
  it("creates EvidenceMoment + EvidenceOutcomeLink records for each comment")
  it("skips comments that already have evidence (isLatest=true) — idempotency")
  it("skips non-USER comments")
  it("skips empty text comments")
  it("continues after single comment failure")
  it("batches comments in groups of 5")
  it("calls cacheInvalidate after completion")
  it("loads TORI tags and reflection category as context")
  it("returns ok/failed counts")
```

DB test — uses real AppDataSource. Mock the LLM provider only.

**`src/server/services/evidence/__tests__/seed-tori-framework.test.ts`**

```
describe("seedToriFrameworks")
  it("creates TORI framework for each institution")
  it("creates OutcomeDefinition for each ToriTag")
  it("is idempotent — does not duplicate on second call")
  it("sets isSystem=true on seeded framework")
```

**`src/server/services/analytics/__tests__/evidence-analytics.test.ts`**

```
describe("getEvidenceSummary")
  it("returns summary scoped to institution")
  it("returns summary scoped to course")
  it("filters by studentId when provided")
  it("respects consent exclusions — excluded student's moments not counted")
  it("only includes isLatest=true moments")
  it("returns correct strength distribution counts per outcome")
  it("returns cached results on second call within TTL")
  it("includes byType distribution")

describe("getStudentEvidenceMoments")
  it("returns paginated evidence moments")
  it("filters by outcomeId via EvidenceOutcomeLink join")
  it("includes outcome alignments in each moment")
  it("returns correct totalCount for pagination")
```

**`src/server/services/analytics/__tests__/consent.test.ts`**

```
describe("getConsentedStudentIds")
  it("excludes students with institution-wide exclusion")
  it("excludes students with course-level exclusion")
  it("includes students with no consent record (default included)")
  it("returns empty array when all students excluded")
```

**`src/server/resolvers/__tests__/evidence.test.ts`**

```
describe("evidence resolvers")
  it("rejects unauthenticated requests")
  it("rejects requests without institution access")
  it("returns evidence summary for valid scope")
  it("returns outcome frameworks for institution")
```

### Integration Test

**`src/server/services/evidence/__tests__/evidence-integration.test.ts`**

```
describe("Evidence pipeline integration (end-to-end)")
  it("upload → TORI extracted → classified → evidence generated → queryable via GraphQL")
    // 1. Insert test data: institution, course, assignment, thread, comments
    // 2. Run TORI extraction (extractToriForThread)
    // 3. Run reflection classification (classifyUserCommentsInBackground)
    // 4. Run evidence generation (generateEvidenceForComments)
    // 5. Query via getEvidenceSummary — verify moments exist with correct data
    // 6. Query via getStudentEvidenceMoments — verify pagination works

  it("consent exclusion propagates through the full pipeline")
    // 1. Generate evidence for two students
    // 2. Exclude one student via StudentConsent
    // 3. Query evidence summary — excluded student's moments not in results
```

### Component Tests

**`src/components/faculty-panel/__tests__/EvidenceTab.test.tsx`**

```
describe("EvidenceTab")
  it("shows 'Select a student' when no student in panel")
  it("renders loading skeleton while fetching")
  it("renders outcome summary cards with moment counts")
  it("expands outcome card to show evidence moments on click")
  it("renders strength level chips with correct colors")
  it("shows collapsed source text, expandable on click")
  it("shows error alert with retry button on query failure")
  it("shows empty state when no evidence moments exist")
```

### E2E Tests

**`e2e/evidence.spec.ts`**

```
test.describe("Evidence tab")
  test("redirects to login when unauthenticated")
  test.describe("authenticated faculty")
    test("Evidence tab appears in FacultyPanel tab bar")
    test("clicking Evidence tab shows evidence content for selected student")
    test("outcome summary cards show correct strength colors")
```

### Browser Verification

- [ ] FacultyPanel shows 4 tabs: Student, Thread, Chat, Evidence
- [ ] Select a student → switch to Evidence tab → narrative moments render
- [ ] Outcome summary cards show counts and colored strength bars
- [ ] Click outcome card → expands with individual moments
- [ ] Click source text expand button → full text visible
- [ ] Empty state shown for student with no evidence
- [ ] No console errors

---

# Phase 3: Artifacts & Section-Level Analysis

## 3.1 New Entities

### `src/server/entities/Artifact.ts`

```typescript
export enum ArtifactType {
  PAPER = "PAPER",
  PRESENTATION = "PRESENTATION",
  CODE = "CODE",
  PORTFOLIO = "PORTFOLIO",
  CONVERSATION = "CONVERSATION",
}

export enum ArtifactStatus {
  UPLOADED = "UPLOADED",
  PROCESSING = "PROCESSING",
  ANALYZED = "ANALYZED",
  FAILED = "FAILED",
}

@Entity()
@Index(["studentId"])
@Index(["courseId"])
@Index(["assignmentId"])
export class Artifact {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  studentId!: string;

  @Column({ type: "varchar" })
  courseId!: string;

  @Column({ type: "varchar", nullable: true })
  assignmentId!: string | null;

  @Column({ type: "varchar", nullable: true })
  threadId!: string | null;         // set when type=CONVERSATION

  @Column({ type: "varchar" })
  title!: string;

  @Column({ type: "enum", enum: ArtifactType })
  type!: ArtifactType;

  @Column({ type: "enum", enum: ArtifactStatus, default: ArtifactStatus.UPLOADED })
  status!: ArtifactStatus;

  @Column({ type: "varchar", nullable: true })
  sourceUrl!: string | null;

  @Column({ type: "varchar", nullable: true })
  mimeType!: string | null;

  @Column({ type: "int", nullable: true })
  fileSizeBytes!: number | null;

  @Column({ type: "varchar", nullable: true })
  storagePath!: string | null;      // relative path in data/artifacts/

  @Column({ type: "varchar", nullable: true })
  uploadedById!: string | null;

  @Column({ type: "text", nullable: true })
  errorMessage!: string | null;     // set when status=FAILED

  @CreateDateColumn({ type: "timestamptz" })
  uploadedAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  // relations: student, course, assignment, thread, sections
}
```

### `src/server/entities/ArtifactSection.ts`

```typescript
export enum SectionType {
  PARAGRAPH = "PARAGRAPH",
  SECTION = "SECTION",
  SLIDE = "SLIDE",
  CODE_BLOCK = "CODE_BLOCK",
  HEADING = "HEADING",
  COMMENT = "COMMENT",
}

@Entity()
@Index(["artifactId"])
export class ArtifactSection {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  artifactId!: string;

  @Column({ type: "varchar", nullable: true })
  commentId!: string | null;       // set when parent artifact is CONVERSATION

  @Column({ type: "int" })
  sequenceOrder!: number;

  @Column({ type: "varchar", nullable: true })
  title!: string | null;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "enum", enum: SectionType })
  type!: SectionType;

  @Column({ type: "int", default: 0 })
  wordCount!: number;              // simple split(" ").length — not a tokenizer

  // relations: artifact, comment, evidenceMoments
}
```

Note: `tokenCount` renamed to `wordCount` — simple word count, not LLM tokens. Used for display and rough size estimation only.

**Update EvidenceMoment entity** — add relation for artifactSection:
```typescript
@ManyToOne("ArtifactSection", { nullable: true, onDelete: "CASCADE" })
@JoinColumn({ name: "artifactSectionId" })
artifactSection!: Relation<ArtifactSection> | null;
```

## 3.2 Migration

**`src/server/migrations/1775574700000-AddArtifacts.ts`**

Creates `artifact` and `artifact_section` tables. Adds FK from `evidence_moment.artifactSectionId` to `artifact_section.id`. Adds index on `evidence_moment.artifactSectionId`.

## 3.3 File Storage

**Strategy:** Local disk at `data/artifacts/{institutionId}/{artifactId}/{filename}`. The `storagePath` column on Artifact stores the relative path.

**Serving:** Express static route `app.use("/api/artifacts/files", express.static("data/artifacts"))` with auth middleware. Alternatively, a dedicated endpoint that checks permissions before serving.

**Future:** When S3 is needed, swap the storage backend and update `storagePath` to an S3 key. The rest of the system uses `storagePath` as an opaque string.

## 3.4 Document Parsing Service

**`src/server/services/artifact/document-parser.ts`**

```typescript
export interface ParsedDocument {
  title: string;
  sections: Array<{
    title: string | null;
    content: string;
    type: SectionType;
    sequenceOrder: number;
  }>;
}

export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParsedDocument>
```

**Dependencies:** `pdf-parse` (PDF), `mammoth` (DOCX). PPTX support deferred — document in code as unsupported with a helpful error.

**Section splitting (rule-based):**
- **PDF/DOCX:** Split on headings (detected by mammoth's style info for DOCX; heuristic line-length + caps for PDF). If no headings found, split on double-newlines (paragraph breaks).
- **Min section:** 50 chars (merge smaller sections into previous).
- **Max section:** 2000 chars (split at sentence boundary if exceeded).
- **Title:** Extracted from first heading or filename.

## 3.5 Artifact Upload Endpoint

**In `src/server/index.ts`** — add after existing upload endpoints (inline, matching existing pattern):

```typescript
// ── Artifact upload ─────────────────────────────────────────
app.post(
  "/api/artifacts/upload",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const { studentId, courseId, assignmentId } = req.body;
      if (!studentId || !courseId) {
        return res.status(400).json({ error: "studentId and courseId required" });
      }

      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Only PDF and DOCX files supported" });
      }

      const result = await processArtifactUpload({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        studentId,
        courseId,
        assignmentId: assignmentId || null,
        uploadedById: req.user!.id,
      });

      // Fire-and-forget: analyze sections + generate evidence
      void analyzeArtifactInBackground(result.artifactId).catch(err =>
        console.error("[artifact] background analysis failed:", err)
      );

      res.json({ artifactId: result.artifactId, sectionCount: result.sectionCount });
    } catch (err) {
      console.error("Artifact upload error:", err);
      res.status(500).json({ error: "Failed to upload artifact" });
    }
  }
);
```

### `src/server/services/artifact/artifact-upload.ts`

```typescript
export async function processArtifactUpload(input: {
  buffer: Buffer; filename: string; mimeType: string; fileSize: number;
  studentId: string; courseId: string; assignmentId: string | null;
  uploadedById: string;
}): Promise<{ artifactId: string; sectionCount: number }>
```

Flow:
1. Parse document → sections
2. Save file to `data/artifacts/{institutionId}/{artifactId}/{filename}`
3. Create Artifact record (status: PROCESSING)
4. Create ArtifactSection records
5. Return artifact ID + section count

### `src/server/services/artifact/artifact-analyzer.ts`

```typescript
export async function analyzeArtifactInBackground(artifactId: string): Promise<void>
```

Flow:
1. Load artifact + sections
2. Run evidence pipeline on each section (reuse `generateEvidenceForComments` pattern but for sections — extract shared logic into `generateEvidenceForSources`)
3. Update artifact status to ANALYZED (or FAILED with errorMessage)
4. Call `cacheInvalidate`

## 3.6 Conversation → Artifact Wrapping

**`src/server/services/artifact/conversation-wrapper.ts`**

```typescript
/**
 * Wraps a Thread as an Artifact of type CONVERSATION.
 * Creates ArtifactSection per USER comment (with commentId link).
 * Idempotent — returns existing artifact if already wrapped.
 */
export async function wrapThreadAsArtifact(threadId: string): Promise<Artifact>
```

## 3.7 GraphQL Schema + Resolver + Client Queries

Schema adds: `Artifact`, `ArtifactSection` types, `ArtifactType`/`ArtifactStatus`/`SectionType` enums, `ArtifactListInput`, queries (`artifacts`, `artifact`), mutation (`deleteArtifact` — sets status to a soft-delete state, does NOT hard-delete).

Resolver: `src/server/resolvers/artifact.ts` — list with scope filtering, single by ID, field resolvers for sections/sectionCount.

Client: `src/lib/queries/artifact.ts` — `GET_ARTIFACTS`, `GET_ARTIFACT`.

**Artifact processing status polling:** Client uses `useQuery` with `pollInterval: 3000` when `artifact.status === "PROCESSING"`. Stops polling when status changes to `ANALYZED` or `FAILED`.

```typescript
const { data } = useQuery(GET_ARTIFACT, {
  variables: { id: artifactId },
  pollInterval: artifact?.status === "PROCESSING" ? 3000 : 0,
});
```

## 3.8 Frontend

### Pages

**`src/pages/ArtifactsPage.tsx`** — list view with scope selector, upload button, table/cards.
**`src/pages/ArtifactDetailPage.tsx`** — sections on left, evidence on right. Processing status bar with progress. Error state if FAILED.

### Upload Dialog

**`src/components/artifacts/UploadDialog.tsx`** — file drop zone, student/assignment selectors, file type validation, progress bar.

### Sidebar

**`src/components/layout/Sidebar.tsx`** — add "Artifacts" item for faculty (between Insights and Chat). Icon: `DescriptionOutlined`. Not shown for students (they see artifacts in their dashboard later).

### FacultyPanel Extension

**`src/components/faculty-panel/FacultyPanelContext.tsx`** — add `OPEN_ARTIFACT` action type, `artifactId` to state. Thread tab becomes "Artifact/Thread" tab — renders artifact sections when `artifactId` is set, thread comments when `threadId` is set.

## 3.9 Tests

### Unit Tests

**`src/server/services/artifact/__tests__/document-parser.test.ts`**

```
describe("parseDocument")
  it("extracts sections from PDF with headings")
  it("splits on paragraph breaks when no headings")
  it("handles DOCX with heading styles via mammoth")
  it("merges sections smaller than 50 chars into previous")
  it("splits sections larger than 2000 chars at sentence boundary")
  it("rejects unsupported MIME types with helpful error")
  it("handles empty document gracefully")
  it("extracts title from first heading or filename")
```

Use fixture files in `__fixtures__/`.

**`src/server/services/artifact/__tests__/conversation-wrapper.test.ts`**

```
describe("wrapThreadAsArtifact")
  it("creates Artifact of type CONVERSATION + sections from USER comments")
  it("sets commentId on each section")
  it("is idempotent — returns existing on second call")
  it("only creates sections for USER role comments")
```

**`src/server/services/artifact/__tests__/artifact-analyzer.test.ts`**

```
describe("analyzeArtifactInBackground")
  it("generates evidence for each section")
  it("updates artifact status to ANALYZED on success")
  it("updates artifact status to FAILED with errorMessage on failure")
  it("calls cacheInvalidate after completion")
```

### Component Tests

**`src/pages/__tests__/ArtifactsPage.test.tsx`** — list rendering, upload button, empty state, scope filtering.
**`src/components/artifacts/__tests__/UploadDialog.test.tsx`** — file type validation, required fields, progress.

### E2E Tests

**`e2e/artifacts.spec.ts`** — sidebar nav, list page, upload flow, detail page with sections.

### Browser Verification

- [ ] "Artifacts" in sidebar (faculty only)
- [ ] Upload dialog opens, accepts PDF/DOCX, rejects others
- [ ] After upload, artifact appears with PROCESSING status
- [ ] Status updates to ANALYZED (polling works)
- [ ] Detail page shows sections with evidence
- [ ] No console errors

---

# Phase 4: Conceptual Trees

## 4.1 New Entities

### `src/server/entities/ConceptNode.ts`

```typescript
export enum NodeType {
  IDEA = "IDEA",
  ARGUMENT = "ARGUMENT",
  EVIDENCE = "EVIDENCE",
  QUESTION = "QUESTION",
  REFLECTION = "REFLECTION",
  SYNTHESIS = "SYNTHESIS",
}

@Entity()
@Index(["studentId"])
@Index(["courseId"])
export class ConceptNode {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  studentId!: string;

  @Column({ type: "varchar", nullable: true })
  artifactSectionId!: string | null;

  @Column({ type: "varchar", nullable: true })
  commentId!: string | null;

  @Column({ type: "varchar" })
  label!: string;

  @Column({ type: "text", nullable: true })
  summary!: string | null;

  @Column({ type: "enum", enum: NodeType })
  type!: NodeType;

  @Column({ type: "varchar", nullable: true })
  courseId!: string | null;

  @Column({ type: "varchar", nullable: true })
  semester!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  // relations: student, artifactSection, course, outgoingLinks, incomingLinks
}
```

### `src/server/entities/ConceptLink.ts`

```typescript
export enum LinkType {
  FLOW = "FLOW",
  CROSS_REFERENCE = "CROSS_REFERENCE",
  REVISION = "REVISION",
  BUILDS_ON = "BUILDS_ON",
  CONTRADICTS = "CONTRADICTS",
}

@Entity()
@Index(["sourceNodeId", "targetNodeId"], { unique: true })
export class ConceptLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  sourceNodeId!: string;

  @Column({ type: "varchar" })
  targetNodeId!: string;

  @Column({ type: "enum", enum: LinkType })
  type!: LinkType;

  @Column({ type: "text", nullable: true })
  narrative!: string | null;

  @Column({ type: "float", default: 1.0 })
  strength!: number;

  // relations: sourceNode, targetNode
}
```

## 4.2 Tree Generation Service

**`src/server/services/concept-tree/tree-generator.ts`**

```typescript
export async function generateArtifactTree(artifactId: string): Promise<{
  nodesCreated: number;
  linksCreated: number;
  crossLinksCreated: number;
}>
```

**Within-artifact flow:**
1. Load artifact + sections
2. Single LLM call: send all section labels/summaries, ask for nodes (label, type, summary per section) + flow links between sections + any cross-references within the artifact.
3. Create ConceptNode and ConceptLink records.

**Cross-artifact flow:**
```typescript
export async function findCrossLinks(
  studentId: string,
  newNodeIds: string[]
): Promise<number>
```

1. Load new nodes (just created).
2. Load existing nodes for student (all others). If > 50 existing nodes, use only the most recent 50 (by createdAt) to bound the context window.
3. **Single LLM call per artifact** (not per node): send new node labels+summaries + existing node labels+summaries. Ask for cross-links with type, narrative, strength. Strength threshold: drop links with strength < 0.3.
4. Create ConceptLink records.

**Called from:** `analyzeArtifactInBackground` (Phase 3) after evidence generation completes.

## 4.3 Tree Metrics

**`src/server/services/concept-tree/tree-metrics.ts`**

```typescript
export interface TreeMetrics {
  nodeCount: number;
  linkCount: number;
  crossLinkCount: number;
  branchingFactor: number;      // avg outgoing links per node
  maxDepth: number;             // BFS from earliest node
  revisionCount: number;
  courseSpan: number;
  semesterSpan: number;
}

export async function computeTreeMetrics(studentId: string): Promise<TreeMetrics>
```

## 4.4 Tree Analytics + GraphQL + Resolver

**`src/server/services/analytics/tree-analytics.ts`** — `getStudentTree(scope, studentId)` returns nodes, links, metrics.

Schema adds: `ConceptNode`, `ConceptLink`, `TreeMetrics` types, `NodeType`/`LinkType` enums, `StudentTreeResult`, query `studentTree`.

Resolver: `src/server/resolvers/tree.ts`.

Client: `src/lib/queries/tree.ts` — `GET_STUDENT_TREE`.

## 4.5 Frontend

### Faculty Route: `/insights/student/:studentId/tree`

**`src/pages/StudentTreePage.tsx`** — full-page tree visualization.

### Student Route: `/student/tree`

Replace Phase 1 placeholder. Uses `useStudentContext()` to get studentId. Same `TreeVisualization` component with student-appropriate labels.

### Components

**`src/components/concept-tree/TreeVisualization.tsx`** — D3.js force-directed graph. Dependencies: `d3`, `@types/d3`.

- Nodes colored by course (consistent palette from theme)
- Node shape by type (circle=idea, diamond=argument, square=evidence, etc.)
- Links: solid for FLOW, dashed for CROSS_REFERENCE, dotted for REVISION
- Animated dashed lines for cross-course links
- Zoom + pan + drag
- Click node → `onNodeClick(nodeId)` callback
- Hover → highlights connected nodes

**`src/components/concept-tree/NodeDetailPanel.tsx`** — side panel: label, summary, source text, evidence moments, connected nodes.

**`src/components/concept-tree/TreeMetricsBar.tsx`** — horizontal metric cards.

**`src/components/concept-tree/TimelineSlider.tsx`** — filter nodes by semester range.

### Student Profile Link

**`src/pages/StudentProfilePage.tsx`** — add "View Learning Map" button → navigates to `/insights/student/:studentId/tree`.

## 4.6 Tests

### Unit Tests

Tree generator, cross-linker, metrics, tree analytics. See critique items — add concurrency-safe tests for tree generation.

### Component Tests

TreeVisualization (data transformation + events, not pixel rendering), TreeMetricsBar, NodeDetailPanel.

### E2E Tests

Tree page loads, SVG renders nodes, click node opens detail, timeline slider filters, metrics bar shows counts.

### Browser Verification

- [ ] Faculty: `/insights/student/:id/tree` renders D3 tree
- [ ] Student: `/student/tree` renders same tree with student labels
- [ ] Nodes colored by course, links styled by type
- [ ] Click node → detail panel
- [ ] Timeline slider works
- [ ] "View Learning Map" link on student profile
- [ ] No console errors

---

# Phase 5: Institutional Outcomes & Outcome Mapping

## 5.1 No New Entities

Uses OutcomeFramework + OutcomeDefinition from Phase 2.

## 5.2 AI Outcome Mapping

**`src/server/services/evidence/outcome-mapper.ts`** — given a framework's outcome definitions, propose signal-to-outcome mappings.

## 5.3 Outcome Analytics

**`src/server/services/analytics/outcome-analytics.ts`** — `getOutcomeProfile`, `getOutcomeGrowth`, `getCohortFingerprints`.

## 5.4 Evidence Report Generator

**`src/server/services/evidence/report-generator.ts`** — generates narrative accreditation report from evidence moments.

## 5.5 GraphQL Schema + Resolver

Adds: `OutcomeProfile`, `OutcomeScore`, `OutcomeGrowthPoint`, `CohortFingerprint`, `EvidenceReport` types. Mutations for framework/outcome CRUD (with `isSystem` protection — cannot delete system frameworks). `proposeOutcomeMappings` mutation.

## 5.6 Frontend

### `/admin/outcomes`

Framework + outcome CRUD admin page. "Propose Mappings" button. Protected by `institution_admin`/`digication_admin` role.

### `/insights/outcomes`

Tabs: Radar Profile | Growth | Cohort Comparison | Evidence Report. Dependencies: `recharts` for radar/line charts.

### `/student/outcomes`

Replace Phase 1 placeholder. Expandable outcome cards with evidence moments. Student-appropriate language.

## 5.7 Tests

Admin page CRUD, outcome analytics (profile, growth, fingerprints), report generation, radar chart rendering, E2E for admin access control and insights views.

---

# Phase 6: Guided Reflection

## 6.1 New Entity

### `src/server/entities/GuidedReflection.ts`

```typescript
export enum ReflectionTiming {
  DURING = "DURING",
  AFTER = "AFTER",
  FEEDBACK = "FEEDBACK",
}

@Entity()
@Index(["studentId"])
@Index(["artifactSectionId"])
export class GuidedReflection {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  studentId!: string;

  @Column({ type: "varchar" })
  artifactSectionId!: string;

  @Column({ type: "text" })
  prompt!: string;

  @Column({ type: "text", nullable: true })
  response!: string | null;

  @Column({ type: "varchar", nullable: true })
  evidenceMomentId!: string | null;

  @Column({ type: "enum", enum: ReflectionTiming })
  timing!: ReflectionTiming;

  @Column({ type: "int", default: 0 })
  sequenceOrder!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  // relations: student, artifactSection, evidenceMoment
}
```

## 6.2 Assignment Extension

Add `requiresReflection` boolean column to `assignment` table (migration). Default false.

## 6.3 Reflection Orchestration

**`src/server/services/reflection/reflection-orchestrator.ts`**

- `generateReflectionPrompts(artifactId, timing)` — generates contextual prompts per section
- `processReflectionResponse(reflectionId, response)` — runs evidence pipeline on response, links evidence moment

## 6.4 GraphQL + Resolver

Schema: `GuidedReflection` type, `ReflectionSession` type, `ReflectionTiming` enum. Queries: `reflectionSession`. Mutations: `startReflection`, `submitReflectionResponse`, `updateAssignmentReflection`.

**Permissions:** `startReflection` and `submitReflectionResponse` accept `student` role (students can now log in — Phase 1). `updateAssignmentReflection` requires `instructor`+.

## 6.5 Frontend

### `/reflect/:artifactId`

Split view. Accessible to students AND faculty (both in `RoleProtectedRoute` allowedRoles). Student auth exists from Phase 1.

**`src/pages/ReflectPage.tsx`** — left: artifact sections with highlights. Right: `ReflectionPanel` chat interface.

**`src/components/reflection/ReflectionPanel.tsx`** — Tori prompts, student input, evidence capture cards.

### Faculty Configuration

Assignment settings: toggle `requiresReflection`. Only "After Completion" enabled; "During" and "Feedback" greyed out with "Coming soon" tooltip.

## 6.6 Tests

Reflection orchestrator (prompt generation, response processing), ReflectPage, ReflectionPanel, E2E (student starts reflection, submits response, evidence captured).

---

# Phase 7: Student Dashboard & Views

## 7.1 No New Entities

All data already exists from prior phases.

## 7.2 Student Dashboard

Replace Phase 1 placeholder at `/student`.

**`src/pages/student/StudentDashboard.tsx`**

- Welcome header with student name (from `useStudentContext()`)
- Stats row: evidence moment count, artifact count, course count, reflection count
- Recent activity: latest evidence moments
- My Artifacts: card list with status
- Quick links to tree, growth, outcomes

### GraphQL

```graphql
type StudentDashboardData {
  evidenceMomentCount: Int!
  artifactCount: Int!
  courseCount: Int!
  reflectionCount: Int!
  recentMoments: [EvidenceMoment!]!
  artifacts: [Artifact!]!
}

# Query: myDashboard: StudentDashboardData!
```

Resolver: queries all data scoped to the logged-in student's ID.

## 7.3 Student Growth Page

Replace Phase 1 placeholder at `/student/growth`.

**`src/pages/student/StudentGrowthPage.tsx`** — growth bar cards per outcome with plain-language descriptions.

## 7.4 Tests

StudentDashboard component, StudentGrowthPage, E2E for student flow.

### Browser Verification

- [ ] Student dashboard shows correct stats
- [ ] Recent moments render with narratives
- [ ] Artifacts list shows uploaded documents
- [ ] Growth page shows outcome cards
- [ ] All student pages accessible, all faculty pages blocked
- [ ] No console errors

---

# Cross-Phase Checklists

## Entity Registration (cumulative)

| Phase | Entity | `entities/index.ts` export | `data-source.ts` entities |
|-------|--------|---------------------------|--------------------------|
| 1 | — | Update UserRole enum | — |
| 2 | OutcomeFramework, OutcomeDefinition, EvidenceMoment, EvidenceOutcomeLink | Yes | Yes |
| 3 | Artifact, ArtifactSection | Yes | Yes |
| 4 | ConceptNode, ConceptLink | Yes | Yes |
| 6 | GuidedReflection | Yes | Yes |

## Migration Sequence

| Migration | Phase | Description |
|-----------|-------|-------------|
| `1775574500000-AddStudentRole` | 1 | Add student role, userId on Student |
| `1775574600000-AddEvidenceEntities` | 2 | outcome_framework, outcome_definition, evidence_moment, evidence_outcome_link |
| `1775574700000-AddArtifacts` | 3 | artifact, artifact_section, FK on evidence_moment |
| `1775574800000-AddConceptTree` | 4 | concept_node, concept_link |
| `1775574900000-AddGuidedReflection` | 6 | guided_reflection, requiresReflection on assignment |

## Resolver Registration

| Phase | File | Merge into |
|-------|------|-----------|
| 1 | `student-auth.ts` | Query, Mutation |
| 2 | `evidence.ts` | Query |
| 3 | `artifact.ts` | Query, Mutation, field resolvers |
| 4 | `tree.ts` | Query |
| 5 | `outcome.ts` | Query, Mutation |
| 6 | `reflection.ts` | Query, Mutation |
| 7 | `student-dashboard.ts` | Query |

## npm Dependencies

| Phase | Package | Purpose |
|-------|---------|---------|
| 3 | `pdf-parse` | PDF text extraction |
| 3 | `mammoth` | DOCX → text |
| 4 | `d3`, `@types/d3` | Tree visualization |
| 5 | `recharts` | Radar/line charts |
