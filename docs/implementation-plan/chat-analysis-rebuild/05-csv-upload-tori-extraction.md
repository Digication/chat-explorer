# Phase 05 — CSV Upload & TORI Extraction

You are building the CSV upload pipeline and TORI tag extraction system for the **Chat Analysis** app.

**Context:** Phases 01–04 set up the project, Docker environment, database schema, and authentication with roles. PostgreSQL is running with TypeORM entities for Institution, User (with role enum), Course, Assignment, Thread, Student, Comment, ToriTag, CommentToriTag, StudentConsent, CourseAccess, UploadLog, ChatSession, ChatMessage, and UserState. Better Auth handles Google OAuth login. The Express server runs with auth middleware (`requireAuth`) and role guard middleware (`requireRole`, `requireInstitutionAccess`).

## Goal

Build a CSV upload pipeline that:
- Accepts `.csv` files containing chat report data
- Parses rows into Institution, Course, Assignment, Thread, Student, and Comment entities
- Extracts TORI tags from AI response text and associates them with student comments
- Deduplicates by Thread ID + Comment ID (merges into institution's data pool)
- Provides an upload preview (dry-run) before committing
- Tracks provenance via UploadLog
- Automatically creates CourseAccess (OWNER) for the uploader

## CSV Structure

The CSV follows the format from `docs/reference/chat-report-examples/`. Key headers:

```
Thread ID, Thread Name, Thread total input tokens, Thread total output tokens,
Thread total cost, Submission URL, Comment ID, Comment full text,
Comment timestamp, Comment order #, Total # of comments,
Comment author system ID, Comment author sync ID, Comment author first name,
Comment author last name, Comment author email, Comment author system role,
Comment author course role, Assignment ID, Assignment created date,
Assignment name, Assignment description, Assignment URL, Assignment due date,
Grade max points, Grade, Assignment intended outcomes,
Assignment creator system ID, AI assistant ID, AI assistant name,
AI assistant description, AI assistant instruction, AI assistant restriction,
AI assistant role, AI assistant tags, AI assistant grade level,
AI assistant response length, AI assistant visibility,
AI assistant reflections, AI assistant generate answers / content,
AI assistant intended audience
```

## Steps

### 1. Create the CSV parser service

**Files to create:** `src/server/services/csv-parser.ts`

This service reads a CSV file buffer and converts it into structured row objects. It handles header normalization (the CSV headers contain spaces and special characters) and basic validation.

```typescript
import { parse } from "csv-parse/sync";

export interface RawCsvRow {
  threadId: string;
  threadName: string;
  threadTotalInputTokens: string;
  threadTotalOutputTokens: string;
  threadTotalCost: string;
  submissionUrl: string;
  commentId: string;
  commentFullText: string;
  commentTimestamp: string;
  commentOrder: string;
  totalComments: string;
  authorSystemId: string;
  authorSyncId: string;
  authorFirstName: string;
  authorLastName: string;
  authorEmail: string;
  authorSystemRole: string;
  authorCourseRole: string;
  assignmentId: string;
  assignmentCreatedDate: string;
  assignmentName: string;
  assignmentDescription: string;
  assignmentUrl: string;
  assignmentDueDate: string;
  gradeMaxPoints: string;
  grade: string;
  assignmentIntendedOutcomes: string;
  assignmentCreatorSystemId: string;
  aiAssistantId: string;
  aiAssistantName: string;
  aiAssistantDescription: string;
  aiAssistantInstruction: string;
  aiAssistantRestriction: string;
  aiAssistantRole: string;
  aiAssistantTags: string;
  aiAssistantGradeLevel: string;
  aiAssistantResponseLength: string;
  aiAssistantVisibility: string;
  aiAssistantReflections: string;
  aiAssistantGenerateAnswers: string;
  aiAssistantIntendedAudience: string;
}

/**
 * Normalizes a CSV header string into a camelCase key.
 * "Comment full text" → "commentFullText"
 * "AI assistant generate answers / content" → "aiAssistantGenerateAnswers"
 */
function normalizeHeader(header: string): string {
  // Map of original CSV header → camelCase key
  const headerMap: Record<string, string> = {
    "thread id": "threadId",
    "thread name": "threadName",
    "thread total input tokens": "threadTotalInputTokens",
    "thread total output tokens": "threadTotalOutputTokens",
    "thread total cost": "threadTotalCost",
    "submission url": "submissionUrl",
    "comment id": "commentId",
    "comment full text": "commentFullText",
    "comment timestamp": "commentTimestamp",
    "comment order #": "commentOrder",
    "total # of comments": "totalComments",
    "comment author system id": "authorSystemId",
    "comment author sync id": "authorSyncId",
    "comment author first name": "authorFirstName",
    "comment author last name": "authorLastName",
    "comment author email": "authorEmail",
    "comment author system role": "authorSystemRole",
    "comment author course role": "authorCourseRole",
    "assignment id": "assignmentId",
    "assignment created date": "assignmentCreatedDate",
    "assignment name": "assignmentName",
    "assignment description": "assignmentDescription",
    "assignment url": "assignmentUrl",
    "assignment due date": "assignmentDueDate",
    "grade max points": "gradeMaxPoints",
    "grade": "grade",
    "assignment intended outcomes": "assignmentIntendedOutcomes",
    "assignment creator system id": "assignmentCreatorSystemId",
    "ai assistant id": "aiAssistantId",
    "ai assistant name": "aiAssistantName",
    "ai assistant description": "aiAssistantDescription",
    "ai assistant instruction": "aiAssistantInstruction",
    "ai assistant restriction": "aiAssistantRestriction",
    "ai assistant role": "aiAssistantRole",
    "ai assistant tags": "aiAssistantTags",
    "ai assistant grade level": "aiAssistantGradeLevel",
    "ai assistant response length": "aiAssistantResponseLength",
    "ai assistant visibility": "aiAssistantVisibility",
    "ai assistant reflections": "aiAssistantReflections",
    "ai assistant generate answers / content": "aiAssistantGenerateAnswers",
    "ai assistant intended audience": "aiAssistantIntendedAudience",
  };

  const normalized = header.trim().toLowerCase();
  return headerMap[normalized] ?? normalized;
}

/**
 * Parses a CSV buffer into an array of normalized row objects.
 * Skips rows where commentId is empty (metadata-only rows).
 */
export function parseCsvBuffer(buffer: Buffer): RawCsvRow[] {
  const records = parse(buffer, {
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as RawCsvRow[];

  // Filter out rows with no comment ID (these are empty/metadata rows)
  return records.filter((row) => row.commentId?.trim());
}
```

### 2. Create the TORI extractor service

**Files to create:** `src/server/services/tori-extractor.ts`

This service extracts TORI category names from AI assistant response text and matches them against the ToriTag database table.

```typescript
import { AppDataSource } from "../data-source.js";
import { ToriTag } from "../entities/ToriTag.js";

// Cache TORI tag names after first DB lookup
let cachedToriTags: ToriTag[] | null = null;

async function getToriTags(): Promise<ToriTag[]> {
  if (cachedToriTags) return cachedToriTags;
  const repo = AppDataSource.getRepository(ToriTag);
  cachedToriTags = await repo.find();
  return cachedToriTags;
}

/** Reset cache (call after seeding or in tests) */
export function resetToriCache(): void {
  cachedToriTags = null;
}

/**
 * Regex pattern for explicit TORI format in AI responses:
 *   (TORI: Category1, Category2)
 *   (TORI: Category1, Category2, Category3)
 */
const EXPLICIT_TORI_REGEX = /\(TORI:\s*([^)]+)\)/gi;

/**
 * Patterns that indicate a "done" message from the student.
 * When the student says something like this, the next AI response
 * is a conversation summary — skip TORI extraction for it.
 */
const DONE_PATTERNS = [
  /\bi'?m\s+done\b/i,
  /\bthat'?s\s+all\b/i,
  /\bi'?m\s+finished\b/i,
  /\bno\s+more\s+questions?\b/i,
  /\bnothing\s+else\b/i,
  /\bthank\s+you,?\s+that'?s\s+(it|all)\b/i,
  /\bdone\s+for\s+now\b/i,
];

export function isDoneMessage(text: string): boolean {
  return DONE_PATTERNS.some((pattern) => pattern.test(text));
}

interface ExtractedTori {
  toriTagId: string;
  toriTagName: string;
}

/**
 * Extracts TORI tag matches from an AI response text.
 *
 * Two extraction strategies (both run, results are merged and deduped):
 * 1. Explicit format: looks for (TORI: Category1, Category2) patterns
 * 2. Natural language: case-insensitive search for known TORI category names
 *    anywhere in the AI text
 *
 * All extracted names are validated against the ToriTag table.
 */
export async function extractToriTags(
  aiResponseText: string
): Promise<ExtractedTori[]> {
  const allTags = await getToriTags();
  const found = new Map<string, ExtractedTori>(); // dedup by tag ID

  // Strategy 1: Explicit (TORI: ...) format
  let match: RegExpExecArray | null;
  while ((match = EXPLICIT_TORI_REGEX.exec(aiResponseText)) !== null) {
    const categories = match[1].split(",").map((s) => s.trim());
    for (const catName of categories) {
      const tag = allTags.find(
        (t) => t.name.toLowerCase() === catName.toLowerCase()
      );
      if (tag) {
        found.set(tag.id, { toriTagId: tag.id, toriTagName: tag.name });
      }
    }
  }

  // Strategy 2: Natural language mention of any TORI category name
  const textLower = aiResponseText.toLowerCase();
  for (const tag of allTags) {
    if (textLower.includes(tag.name.toLowerCase())) {
      found.set(tag.id, { toriTagId: tag.id, toriTagName: tag.name });
    }
  }

  return Array.from(found.values());
}

/**
 * Core TORI extraction algorithm for a thread's comments.
 *
 * For each thread:
 * 1. Sort comments by orderIndex ascending
 * 2. For each ASSISTANT comment, extract TORI categories from its text
 * 3. Associate extracted tags with the STUDENT comment immediately preceding
 *    the AI response (highest orderIndex less than the AI comment's order,
 *    with role = USER)
 * 4. If the preceding student comment matches "done" patterns, skip extraction
 *    for this AI response (it's a conversation summary)
 * 5. If no student comment precedes the AI response (e.g., first comment is
 *    the AI's opening prompt), skip TORI extraction
 *
 * Returns an array of associations to create in CommentToriTag.
 */
export interface ToriAssociation {
  studentCommentId: string; // The student comment this tag applies to
  toriTagId: string;
  sourceCommentId: string; // The AI comment where the tag was found
}

export async function extractToriForThread(
  comments: Array<{
    id: string;
    externalId: string;
    role: string;
    text: string;
    orderIndex: number;
  }>
): Promise<ToriAssociation[]> {
  const sorted = [...comments].sort((a, b) => a.orderIndex - b.orderIndex);
  const associations: ToriAssociation[] = [];

  for (const comment of sorted) {
    if (comment.role !== "ASSISTANT") continue;

    // Find the preceding student comment
    const precedingStudent = sorted
      .filter((c) => c.role === "USER" && c.orderIndex < comment.orderIndex)
      .pop(); // Last USER comment before this ASSISTANT comment

    // Skip if no preceding student comment (AI opening prompt)
    if (!precedingStudent) continue;

    // Skip if preceding student comment is a "done" message (summary response)
    if (isDoneMessage(precedingStudent.text)) continue;

    // Extract TORI tags from this AI response
    const extracted = await extractToriTags(comment.text);

    for (const tag of extracted) {
      associations.push({
        studentCommentId: precedingStudent.id,
        toriTagId: tag.toriTagId,
        sourceCommentId: comment.externalId,
      });
    }
  }

  return associations;
}
```

### 3. Create the deduplication service

**Files to create:** `src/server/services/dedup.ts`

This service checks whether threads and comments already exist in the database by their external IDs. It powers the upload preview (showing new vs. duplicate counts) and prevents double-insertion.

```typescript
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Thread } from "../entities/Thread.js";
import { Comment } from "../entities/Comment.js";
import { Student } from "../entities/Student.js";
import { Assignment } from "../entities/Assignment.js";

export interface DedupResult {
  existingThreadIds: Set<string>; // external IDs that already exist
  existingCommentIds: Set<string>; // external IDs that already exist
  existingStudentSystemIds: Set<string>; // systemId values that already exist
  existingAssignmentIds: Set<string>; // external IDs that already exist
}

/**
 * Checks which threads, comments, students, and assignments already exist
 * in the database for a given institution. Uses external IDs for matching.
 */
export async function checkDuplicates(
  institutionId: string,
  threadExternalIds: string[],
  commentExternalIds: string[],
  studentSystemIds: string[],
  assignmentExternalIds: string[]
): Promise<DedupResult> {
  const threadRepo = AppDataSource.getRepository(Thread);
  const commentRepo = AppDataSource.getRepository(Comment);
  const studentRepo = AppDataSource.getRepository(Student);
  const assignmentRepo = AppDataSource.getRepository(Assignment);

  // Query existing records in parallel
  const [existingThreads, existingComments, existingStudents, existingAssignments] =
    await Promise.all([
      threadRepo
        .createQueryBuilder("t")
        .select("t.externalId")
        .innerJoin("t.assignment", "a")
        .innerJoin("a.course", "c")
        .where("c.institutionId = :institutionId", { institutionId })
        .andWhere("t.externalId IN (:...ids)", { ids: threadExternalIds.length ? threadExternalIds : ["__none__"] })
        .getMany(),
      commentRepo
        .createQueryBuilder("c")
        .select("c.externalId")
        .innerJoin("c.thread", "t")
        .innerJoin("t.assignment", "a")
        .innerJoin("a.course", "co")
        .where("co.institutionId = :institutionId", { institutionId })
        .andWhere("c.externalId IN (:...ids)", { ids: commentExternalIds.length ? commentExternalIds : ["__none__"] })
        .getMany(),
      studentRepo.find({
        where: { institutionId, systemId: In(studentSystemIds.length ? studentSystemIds : ["__none__"]) },
        select: ["systemId"],
      }),
      assignmentRepo
        .createQueryBuilder("a")
        .select("a.externalId")
        .innerJoin("a.course", "c")
        .where("c.institutionId = :institutionId", { institutionId })
        .andWhere("a.externalId IN (:...ids)", { ids: assignmentExternalIds.length ? assignmentExternalIds : ["__none__"] })
        .getMany(),
    ]);

  return {
    existingThreadIds: new Set(existingThreads.map((t) => t.externalId)),
    existingCommentIds: new Set(existingComments.map((c) => c.externalId)),
    existingStudentSystemIds: new Set(existingStudents.map((s) => s.systemId)),
    existingAssignmentIds: new Set(existingAssignments.map((a) => a.externalId)),
  };
}
```

### 4. Create the upload service

**Files to create:** `src/server/services/upload.ts`

This is the orchestrator service that ties together CSV parsing, deduplication, TORI extraction, and database writes. It supports two modes: **preview** (dry-run returning counts) and **commit** (actually writes to the database).

```typescript
import { AppDataSource } from "../data-source.js";
import { parseCsvBuffer, RawCsvRow } from "./csv-parser.js";
import { checkDuplicates } from "./dedup.js";
import { extractToriForThread } from "./tori-extractor.js";
import { Institution } from "../entities/Institution.js";
import { Course } from "../entities/Course.js";
import { Assignment } from "../entities/Assignment.js";
import { Thread } from "../entities/Thread.js";
import { Student } from "../entities/Student.js";
import { Comment, CommentRole } from "../entities/Comment.js";
import { CommentToriTag } from "../entities/CommentToriTag.js";
import { CourseAccess, AccessLevel } from "../entities/CourseAccess.js";
import { UploadLog } from "../entities/UploadLog.js";

export interface UploadPreviewResult {
  totalRows: number;
  newComments: number;
  duplicateComments: number;
  newThreads: number;
  newStudents: number;
  newAssignments: number;
  newCourses: number;
  detectedInstitutionId: string | null;
  detectedInstitutionName: string | null;
}

export interface UploadCommitResult extends UploadPreviewResult {
  uploadLogId: string;
  toriTagsExtracted: number;
  courseAccessCreated: boolean;
}

/**
 * Detects the institution from CSV rows by examining the Submission URL domain.
 * Matches against Institution.domain field (e.g., "lagcc-cuny.digication.com").
 */
async function detectInstitution(
  rows: RawCsvRow[]
): Promise<Institution | null> {
  // Find the first row with a submission URL
  const rowWithUrl = rows.find((r) => r.submissionUrl?.trim());
  if (!rowWithUrl) return null;

  try {
    const url = new URL(rowWithUrl.submissionUrl);
    const hostname = url.hostname; // e.g., "lagcc-cuny.digication.com"

    const repo = AppDataSource.getRepository(Institution);
    return await repo.findOne({ where: { domain: hostname } });
  } catch {
    return null;
  }
}

/**
 * Preview mode: parses the CSV and returns counts of new vs. duplicate data
 * without writing anything to the database.
 */
export async function previewUpload(
  fileBuffer: Buffer
): Promise<UploadPreviewResult> {
  const rows = parseCsvBuffer(fileBuffer);
  const institution = await detectInstitution(rows);

  if (!institution) {
    return {
      totalRows: rows.length,
      newComments: rows.length,
      duplicateComments: 0,
      newThreads: 0,
      newStudents: 0,
      newAssignments: 0,
      newCourses: 0,
      detectedInstitutionId: null,
      detectedInstitutionName: null,
    };
  }

  // Collect unique external IDs from the CSV
  const threadIds = [...new Set(rows.map((r) => r.threadId).filter(Boolean))];
  const commentIds = [...new Set(rows.map((r) => r.commentId).filter(Boolean))];
  const studentIds = [...new Set(rows.map((r) => r.authorSystemId).filter(Boolean))];
  const assignmentIds = [...new Set(rows.map((r) => r.assignmentId).filter(Boolean))];

  const dedup = await checkDuplicates(
    institution.id,
    threadIds,
    commentIds,
    studentIds,
    assignmentIds
  );

  const newComments = commentIds.filter((id) => !dedup.existingCommentIds.has(id)).length;

  return {
    totalRows: rows.length,
    newComments,
    duplicateComments: commentIds.length - newComments,
    newThreads: threadIds.filter((id) => !dedup.existingThreadIds.has(id)).length,
    newStudents: studentIds.filter((id) => !dedup.existingStudentSystemIds.has(id)).length,
    newAssignments: assignmentIds.filter((id) => !dedup.existingAssignmentIds.has(id)).length,
    newCourses: 0, // Course detection is a future feature
    detectedInstitutionId: institution.id,
    detectedInstitutionName: institution.name,
  };
}

/**
 * Commit mode: parses CSV, deduplicates, inserts new records, extracts
 * TORI tags, creates CourseAccess, and logs the upload.
 *
 * All operations run inside a single database transaction — if anything
 * fails, nothing is written (all-or-nothing).
 */
export async function commitUpload(
  fileBuffer: Buffer,
  uploadedById: string,
  institutionId: string,
  originalFilename: string
): Promise<UploadCommitResult> {
  const rows = parseCsvBuffer(fileBuffer);

  return AppDataSource.transaction(async (manager) => {
    // --- Deduplication ---
    const threadIds = [...new Set(rows.map((r) => r.threadId).filter(Boolean))];
    const commentIds = [...new Set(rows.map((r) => r.commentId).filter(Boolean))];
    const studentIds = [...new Set(rows.map((r) => r.authorSystemId).filter(Boolean))];
    const assignmentIds = [...new Set(rows.map((r) => r.assignmentId).filter(Boolean))];

    const dedup = await checkDuplicates(
      institutionId,
      threadIds,
      commentIds,
      studentIds,
      assignmentIds
    );

    // --- Group rows by assignment for processing ---
    const rowsByAssignment = new Map<string, RawCsvRow[]>();
    for (const row of rows) {
      if (!row.assignmentId) continue;
      const group = rowsByAssignment.get(row.assignmentId) ?? [];
      group.push(row);
      rowsByAssignment.set(row.assignmentId, group);
    }

    // --- Track creation counts ---
    let newCommentsCount = 0;
    let newThreadsCount = 0;
    let newStudentsCount = 0;
    let newAssignmentsCount = 0;
    let newCoursesCount = 0;
    let toriTagsExtracted = 0;
    const courseIdsForAccess = new Set<string>();

    // --- Process each assignment group ---
    // For each assignment: ensure Course exists, ensure Assignment exists,
    // then process threads and comments within that assignment.

    // (Implementation creates or finds Course, Assignment, Thread, Student,
    //  Comment entities. Skips any comment whose externalId is in
    //  dedup.existingCommentIds. After all comments for a thread are inserted,
    //  runs extractToriForThread to create CommentToriTag associations.)

    // --- Create CourseAccess for uploader ---
    for (const courseId of courseIdsForAccess) {
      const existing = await manager.findOne(CourseAccess, {
        where: { userId: uploadedById, courseId },
      });
      if (!existing) {
        await manager.save(CourseAccess, {
          userId: uploadedById,
          courseId,
          accessLevel: AccessLevel.OWNER,
          grantedById: uploadedById,
        });
      }
    }

    // --- Create UploadLog ---
    const uploadLog = await manager.save(UploadLog, {
      uploadedById,
      institutionId,
      originalFilename,
      totalRows: rows.length,
      newComments: newCommentsCount,
      skippedDuplicates: commentIds.length - newCommentsCount,
      newThreads: newThreadsCount,
      newStudents: newStudentsCount,
      newCourses: newCoursesCount,
      newAssignments: newAssignmentsCount,
      toriTagsExtracted,
    });

    return {
      totalRows: rows.length,
      newComments: newCommentsCount,
      duplicateComments: commentIds.length - newCommentsCount,
      newThreads: newThreadsCount,
      newStudents: newStudentsCount,
      newAssignments: newAssignmentsCount,
      newCourses: newCoursesCount,
      detectedInstitutionId: institutionId,
      detectedInstitutionName: null,
      uploadLogId: uploadLog.id,
      toriTagsExtracted,
      courseAccessCreated: courseIdsForAccess.size > 0,
    };
  });
}
```

### 5. Create the upload API endpoints

**Files to modify:** `src/server/index.ts` (or a new router file)

Add two endpoints:

```typescript
import multer from "multer";
import { requireAuth } from "./middleware/auth.js";
import { previewUpload, commitUpload } from "./services/upload.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Preview endpoint — dry-run, returns counts
app.post("/api/upload/preview", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  if (!req.file.originalname.endsWith(".csv")) {
    res.status(400).json({ error: "Only .csv files are accepted" });
    return;
  }

  const result = await previewUpload(req.file.buffer);
  res.json(result);
});

// Commit endpoint — actually processes and stores
app.post("/api/upload/commit", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const institutionId = req.body.institutionId || req.user!.institutionId;
  if (!institutionId) {
    res.status(400).json({ error: "Institution ID required" });
    return;
  }

  const result = await commitUpload(
    req.file.buffer,
    req.user!.id,
    institutionId,
    req.file.originalname
  );
  res.json(result);
});
```

### 6. Key implementation details

**Institution auto-detection:** The `detectInstitution` function extracts the hostname from the first `Submission URL` in the CSV (e.g., `lagcc-cuny.digication.com`) and matches it against the `domain` field on the Institution entity.

**CourseAccess OWNER grant:** After a successful upload, the uploader automatically gets `OWNER` access to every course that was created or updated during the upload. This ensures they can immediately see the data they uploaded.

**UploadLog creation:** Every upload (successful commit) creates an UploadLog record with counts of new vs. skipped records, the original filename, and who uploaded it. This provides a complete audit trail.

**Transactional processing:** The `commitUpload` function wraps all database operations in a single TypeORM transaction via `AppDataSource.transaction()`. If any step fails (bad data, constraint violation, etc.), the entire upload is rolled back — no partial data.

**Course field:** The CSV currently does not include an explicit Course column. For now, derive course context from the assignment grouping (all assignments with the same metadata belong to one course) or prompt the user to select a course during upload. A dedicated Course column is planned for a future CSV format update.

## TORI Extraction Algorithm Summary

For each thread in the uploaded data:

1. Sort the thread's comments by `orderIndex` (ascending)
2. Walk through each comment:
   - If the comment role is `ASSISTANT`:
     a. Find the preceding `USER` comment (highest orderIndex less than this comment's orderIndex)
     b. If no preceding USER comment exists (e.g., AI opening prompt at order 1), skip
     c. If the preceding USER comment matches a "done" pattern, skip (the AI response is a summary)
     d. Extract TORI tags from the AI text using:
        - Regex match for explicit `(TORI: Category1, Category2)` format
        - Case-insensitive string search for all known TORI category names
     e. Validate each extracted name against the ToriTag table
     f. Create CommentToriTag associations linking the **student comment** to each extracted tag, with `sourceCommentId` pointing to the AI comment

## Files Summary

| File | Purpose |
|------|---------|
| `src/server/services/csv-parser.ts` | CSV file parsing with header normalization |
| `src/server/services/tori-extractor.ts` | TORI tag extraction from AI response text |
| `src/server/services/dedup.ts` | Deduplication checks against existing data |
| `src/server/services/upload.ts` | Upload orchestrator (preview + commit modes) |

## Verification

```bash
# Build and start
docker compose up -d --build
docker compose exec app pnpm typecheck

# Test upload preview with a sample CSV (requires auth):
# 1. Sign in via Google OAuth in the browser
# 2. Use the session cookie to call the preview endpoint:
curl -k -X POST https://chat-analysis.localhost/api/upload/preview \
  -H "Cookie: <session-cookie>" \
  -F "file=@docs/reference/chat-report-examples/sample.csv"
# Expected: JSON with totalRows, newComments, duplicateComments, etc.

# Test upload commit:
curl -k -X POST https://chat-analysis.localhost/api/upload/commit \
  -H "Cookie: <session-cookie>" \
  -F "file=@docs/reference/chat-report-examples/sample.csv" \
  -F "institutionId=<institution-uuid>"
# Expected: JSON with uploadLogId and all counts

# Verify data was inserted:
docker compose exec db psql -U dev -d chat-analysis \
  -c "SELECT COUNT(*) FROM comment;"
# Expected: Count matches newComments from the commit response
```

Expected: TypeScript compiles without errors. Preview endpoint returns correct new/duplicate counts. Commit endpoint inserts data and returns an upload log ID. Running commit a second time with the same file shows all comments as duplicates (newComments = 0).

## When done

Report: files created/modified (with summary per file), verification results, and any issues encountered.
