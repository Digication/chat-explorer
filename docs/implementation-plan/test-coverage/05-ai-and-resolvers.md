# Phase 5 — AI Chat Service + Resolvers (42 tests)

**Context:** No prior phases required. This is the largest phase — covers ai-chat service (most complex service in the app) plus 3 resolver files. All dependencies mocked.

## Files to Read Before Writing Tests

- `src/server/services/ai-chat.ts` — buildContext + sendChatMessage
- `src/server/entities/ChatSession.ts` — ChatScope enum, session fields
- `src/server/entities/ChatMessage.ts` — ChatMessageRole enum
- `src/server/resolvers/chat.ts` — 2 queries, 4 mutations, field resolvers
- `src/server/resolvers/consent.ts` — 2 queries, 2 mutations
- `src/server/resolvers/institution.ts` — 3 queries, 2 mutations, courses field resolver
- `src/server/resolvers/middleware/auth.ts` — requireAuth, requireRole, requireInstitutionAccess

## Step 1: ai-chat.test.ts (20 tests)

**File to create:** `src/server/services/ai-chat.test.ts`

### Mock setup

**CRITICAL: `ai-chat.ts` imports `getLLMProvider` from `"./llm/index.js"` (barrel), NOT from `"./llm/provider.js"`.** The vi.mock path must match the import path in the source file exactly.

```typescript
vi.mock("../data-source.js", () => ({
  AppDataSource: { getRepository: vi.fn() },
}));

const mockSendChat = vi.fn().mockResolvedValue("AI response text");
vi.mock("./llm/index.js", () => ({
  getLLMProvider: vi.fn(() => ({
    name: "google",
    sendChat: (...args: unknown[]) => mockSendChat(...args),
  })),
}));

vi.mock("./ai-instructions.js", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("System prompt text"),
}));
```

Mock repositories using a Map-based router (same pattern as Phase 4). `sendChatMessage` uses `sessionRepo.findOneBy()` (NOT `findOne`) — the mock must include `findOneBy`.

```typescript
function makeMockRepo(overrides = {}) {
  return {
    findOneBy: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: entity.id ?? "mock-id" })),
    create: vi.fn().mockImplementation((data) => data),
    ...overrides,
  };
}

const repos = new Map();
repos.set(ChatSession, makeMockRepo());
repos.set(ChatMessage, makeMockRepo());
repos.set(Comment, makeMockRepo());
repos.set(Student, makeMockRepo());
repos.set(Thread, makeMockRepo());
repos.set(Assignment, makeMockRepo());
repos.set(Course, makeMockRepo());
repos.set(CommentToriTag, makeMockRepo());
repos.set(ToriTag, makeMockRepo());

const mockGetRepository = vi.fn((entity: unknown) => repos.get(entity) ?? makeMockRepo());
// Wire into the AppDataSource mock
```

### buildContext — 8 distinct branches (from source audit)

The `session.scope` switch has these paths:
1. SELECTION + selectedCommentIds (line 44)
2. SELECTION + studentId + assignmentId (line 57)
3. SELECTION + studentId + courseId (line 70)
4. SELECTION + studentId only (line 91)
5. SELECTION fallback (no selectedCommentIds, no studentId) (line 99)
6. COURSE + courseId (line 107)
7. CROSS_COURSE + courseId → delegates to COURSE (line 141)
8. CROSS_COURSE without courseId (empty) (line 136)

Plus:
- TORI tag filtering (line 151-154): `selectedToriTags?.length > 0` AND comments exist
- PII masking (line 206-209): showPII true → full name, false → initials

### Test list: buildContext (10)

1. **SELECTION + selectedCommentIds → fetches only those comments** — session has `selectedCommentIds: ["c1","c2"]` → repo.find called with those IDs, output contains those comments
2. **SELECTION + studentId + assignmentId → filters by assignment** — verify query chain includes assignment filter
3. **SELECTION + studentId + courseId → filters by course** — verify query chain includes course join
4. **SELECTION + studentId only → fetches all student comments** — no course/assignment filter, just studentId
5. **COURSE scope → fetches all comments in course** — verify query chain goes course → assignments → threads → comments
6. **Empty scope (no comments) → returns minimal context string** — no matching comments → context string is not empty but has no student data
7. **TORI tag filtering: selectedToriTags filters comments** — session has toriTagIds, mock CommentToriTag query → comments narrowed to those with matching tags
8. **showPII=false → uses initials** — student firstName="John", lastName="Smith" → context contains "J.S." not "John Smith"
9. **showPII=true → uses full names** — student firstName="John", lastName="Smith" → context contains "John Smith"
10. **Student with no name → falls back to systemId** — firstName and lastName both null → uses systemId

### Test list: sendChatMessage (10)

11. **Session not found → throws** — findOneBy returns null → error
12. **Session belongs to different user → throws** — session.userId !== passed userId → error
13. **Saves user message to DB** — verify ChatMessage repo.save called with role=USER, content matching input
14. **Calls buildContext with the session** — verify buildContext received the session object
15. **Calls LLM provider with correct message history** — verify mockSendChat called with messages array including system + previous + new user message
16. **Uses session's providerName (default "google")** — verify getLLMProvider called with "google"
17. **Uses session's modelId (default "gemini-3.1-pro-preview")** — verify sendChat options include this model
18. **Saves assistant response to DB** — verify second ChatMessage repo.save called with role=ASSISTANT and the LLM response text
19. **Auto-generates title on first message (session.title is null)** — session has no title → LLM called a second time for title → session.title updated
20. **Title generation failure does NOT throw** — mock second LLM call to reject → sendChatMessage still returns successfully (silent catch)

## Step 2: chat.test.ts (10 tests)

**File to create:** `src/server/resolvers/chat.test.ts`

### Mock setup
```typescript
vi.mock("../services/ai-chat.js", () => ({
  sendChatMessage: vi.fn().mockResolvedValue({ id: "msg-1", role: "ASSISTANT", content: "response" }),
}));
vi.mock("./middleware/auth.js", () => ({
  requireAuth: vi.fn((ctx) => {
    if (!ctx.user) throw new Error("Not authenticated");
    return ctx.user;
  }),
}));
vi.mock("../data-source.js", () => ({
  AppDataSource: { getRepository: vi.fn() },
}));
```

### Test list

1. **chatSessions: requires auth** — no user in ctx → throws
2. **chatSessions: returns sessions for current user only** — verify `where` includes `userId: user.id`
3. **chatSessions: filters by courseId when provided** — pass courseId arg → where includes it
4. **chatSession: not found → throws NOT_FOUND** — findOne returns null → GraphQLError
5. **chatSession: wrong user → throws NOT_FOUND** — session.userId !== user.id → GraphQLError
6. **createChatSession: creates with defaults** — no optional args → scope defaults to SELECTION, title to "New Chat"
7. **sendChatMessage: ownership check before service call** — session belongs to different user → throws before service is called
8. **sendChatMessage: delegates to service** — valid session → sendChatMessageService called with (sessionId, content, userId)
9. **deleteChatSession: removes session** — valid session → repo.remove called, returns true
10. **renameChatSession: updates title** — valid session → session.title updated, repo.save called

## Step 3: consent.test.ts (resolver) (7 tests)

**File to create:** `src/server/resolvers/consent.test.ts`

### Mock setup
```typescript
vi.mock("../services/consent.js", () => ({
  getStudentConsent: vi.fn(),
  setStudentConsent: vi.fn(),
  setAllStudentsConsent: vi.fn(),
}));
vi.mock("./middleware/auth.js", () => ({
  requireAuth: vi.fn((ctx) => { if (!ctx.user) throw new Error("Not authenticated"); return ctx.user; }),
  requireRole: vi.fn((ctx, roles) => { /* check role */ }),
  requireInstitutionAccess: vi.fn(),
}));
vi.mock("../services/analytics/cache.js", () => ({
  cacheInvalidate: vi.fn(),
}));
vi.mock("../data-source.js", () => ({
  AppDataSource: { getRepository: vi.fn(), createQueryBuilder: vi.fn() },
}));
```

### Test list

1. **studentConsent: calls requireInstitutionAccess** — verify the middleware was called with the institutionId arg
2. **studentConsent: delegates to getStudentConsent service** — verify service called with (studentId, institutionId)
3. **setStudentConsent: calls requireRole with [INSTITUTION_ADMIN, DIGICATION_ADMIN]** — verify role check
4. **setStudentConsent: calls cacheInvalidate after success** — verify cacheInvalidate called with correct scope
5. **bulkSetConsent: loops through studentIds** — pass 3 studentIds → setStudentConsent called 3 times
6. **bulkSetConsent: calls cacheInvalidate once after all updates** — verify cacheInvalidate called once (not per student)
7. **bulkSetConsent: returns correct count** — 3 studentIds → `{ updated: 3 }`

## Step 4: institution.test.ts (10 tests)

**File to create:** `src/server/resolvers/institution.test.ts`

### Mock setup
```typescript
vi.mock("./middleware/auth.js", () => ({
  requireAuth: vi.fn((ctx) => { if (!ctx.user) throw new Error("Not authenticated"); return ctx.user; }),
  requireRole: vi.fn((ctx, roles) => {
    const user = ctx.user;
    if (!user) throw new Error("Not authenticated");
    if (!roles.includes(user.role)) throw new Error("Forbidden");
    return user;
  }),
  requireInstitutionAccess: vi.fn(),
}));
vi.mock("../data-source.js", () => ({
  AppDataSource: { getRepository: vi.fn() },
}));
```

### Test list

1. **institutions: requires DIGICATION_ADMIN role** — non-admin user → throws
2. **institutions: returns all institutions sorted by name** — verify repo.find called with `order: { name: "ASC" }`
3. **institution: calls requireInstitutionAccess** — verify middleware called with id
4. **myInstitution: returns null when user has no institutionId** — user.institutionId is null → returns null (line 34)
5. **myInstitution: returns institution for user's institutionId** — user has institutionId → findOne called with it
6. **createInstitution: duplicate name → throws BAD_REQUEST** — findOne returns existing → GraphQLError
7. **createInstitution: succeeds with unique name** — findOne returns null → save called
8. **updateInstitution: not found → throws NOT_FOUND** — findOne returns null → GraphQLError
9. **Institution.courses: admin sees all courses** — DIGICATION_ADMIN → courseRepo.find with institutionId filter
10. **Institution.courses: instructor sees only granted courses** — INSTRUCTOR role → CourseAccess queried → courses filtered by access. Empty access → returns []

## Verification

```bash
docker compose exec app pnpm test -- --reporter=verbose
```

Expected: 42 new tests pass (including export.test.ts resolver rename collision check — the consent resolver test file needs a unique name since `consent.test.ts` already exists for the service).

**Important:** The consent service test is `src/server/services/consent.test.ts` and the consent resolver test is `src/server/resolvers/consent.test.ts` — different directories, no conflict.

## When done

Report: files created, test counts per file, total new tests, any failures.
