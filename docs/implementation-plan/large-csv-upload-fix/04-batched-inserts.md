# Phase 04 — Row-Chunked Inserts with Parent Pre-Pass

You are refactoring the database-write path of `commitUpload` in chat-explorer so it can handle 250k+ comments — even when they all sit inside a **single assignment** (e.g., 8,000 students × one course × one assignment × dozens of comments each) — without hitting Postgres statement timeouts or exhausting memory.

**Context:** After phase 03, `commitUpload` in `src/server/services/upload.ts` receives rows via the streaming parser, writes the file via `saveUploadedFile`, and then enters `AppDataSource.transaction(...)` that contains the entire write path. Inside that single transaction it creates all Course/Assignment/Thread/Student/Comment/CommentToriTag entities one at a time using `manager.save(Entity, obj)`. For 250,000 comments, that's 250,000 individual INSERTs plus SELECT round-trips, all holding row-level locks under one transaction for the full duration.

**Important design note:** An earlier draft of this plan wrapped each assignment in its own transaction. That's not scalable — a single assignment in this system can have 8,000 students with tens of thousands of comments. Per-assignment transactions just re-create the same problem in miniature. This phase instead chunks **by row count**, independent of assignment shape. Parent entities are created in a pre-pass (low volume) so that comment chunks can reference already-committed parents via lookup maps.

## Overview

- **Parent pre-pass**: upsert all needed Courses, Assignments, Threads, Students in chunked transactions (up to 500 entities per commit). Return lookup maps keyed by external/system ID. Total parent volume is bounded by the CSV's distinct-entity count (thousands at most in real data), not by row count.
- **Comment pass**: process rows in chunks of **5,000 rows per transaction**. Inside each transaction, use `manager.insert(Comment, batch)` in batches of **500 rows per INSERT statement**. Each transaction commits quickly and releases locks.
- **TORI pass**: after all comments are committed, run TORI extraction per thread, batch-insert `CommentToriTag` rows.
- **Finalize**: one small transaction for `CourseAccess` + `UploadLog`.
- **Idempotency**: dedup-by-externalId up front makes the whole import safe to re-run after a partial failure. Any chunk that committed stays; any that didn't gets retried on the next upload.

## Tunables (constants at top of upload.ts)

```typescript
// Comment rows per database transaction. At this size, worst-case:
// 5000 × ~60 fields × ~200 bytes = ~60 MB of SQL payload per txn. Postgres's
// max_allocated_packet is 1 GB, so we have plenty of headroom. Each txn
// commits in a few seconds locally, under 30s even against Railway.
const ROW_CHUNK_SIZE = 5000;

// Rows per SQL INSERT statement. 500 keeps each INSERT well under any
// reasonable statement-length limit while amortizing round-trip cost.
const COMMENT_INSERT_BATCH_SIZE = 500;

// Parent entities per transaction. Parents are low volume but 8000 students
// × manager.save() round-trips is still ~minutes. Chunking keeps each txn
// short and avoids long-held locks on the students table.
const PARENT_CHUNK_SIZE = 500;

// TORI tags per INSERT. Typically small per-thread, so 500 is plenty.
const TORI_TAG_INSERT_BATCH_SIZE = 500;
```

## Steps

### 1. Add constants and helpers

**Files to modify:** `src/server/services/upload.ts`

Add the constants above near the other module-level declarations (after `UPLOADS_DIR`).

Add the `chunk` helper below `parseBool`:

```typescript
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
```

### 2. Replace the body of `commitUpload`

**Files to modify:** `src/server/services/upload.ts`

Replace the entire `commitUpload` function (currently lines 276–671) with the new orchestrator that calls four helpers in sequence:

```typescript
export async function commitUpload(
  filePath: string,
  uploadedById: string,
  institutionId: string,
  originalFilename: string,
  replaceMode = false
): Promise<UploadCommitResult> {
  // ── Parse (streaming, outside any transaction) ────────────────────
  const rows = await parseCsvFile(filePath);

  // ── Save the CSV file (no DB) ─────────────────────────────────────
  const savedFilePath = await saveUploadedFile(filePath, originalFilename);

  // ── Dedup lookup (one short query, outside any txn) ───────────────
  const allThreadIds = [...new Set(rows.map((r) => r.threadId).filter(Boolean))];
  const allCommentIds = [
    ...new Set(rows.map((r) => r.commentId).filter(Boolean)),
  ];
  const allStudentSystemIds = [
    ...new Set(rows.map((r) => r.authorSystemId).filter(Boolean)),
  ];
  const allAssignmentIds = [
    ...new Set(rows.map((r) => r.assignmentId).filter(Boolean)),
  ];

  const dedup = await checkDuplicates(
    institutionId,
    allThreadIds,
    allCommentIds,
    allStudentSystemIds,
    allAssignmentIds
  );

  // ── Pass A: parent entities (chunked transactions) ────────────────
  const parents = await importParents({
    rows,
    dedup,
    institutionId,
    replaceMode,
  });

  // ── Pass B: comments (row-chunked transactions) ───────────────────
  const comments = await importComments({
    rows,
    dedup,
    parents,
    uploadedById,
    institutionId,
    replaceMode,
  });

  // ── Pass C: TORI tags (after comments are committed) ──────────────
  const toriTagsExtracted = await importToriTags({
    insertedByThread: comments.insertedByThread,
  });

  // ── Pass D: finalize (CourseAccess + UploadLog) ───────────────────
  const uploadLog = await AppDataSource.transaction(
    async (manager: EntityManager) => {
      for (const courseId of parents.courseIdsForAccess) {
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

      return manager.save(UploadLog, {
        uploadedById,
        institutionId,
        originalFilename,
        filePath: savedFilePath,
        totalRows: rows.length,
        newComments: comments.newCommentsCount,
        skippedDuplicates: allCommentIds.length - comments.newCommentsCount,
        newThreads: parents.newThreadsCount,
        newStudents: parents.newStudentsCount,
        newCourses: parents.newCoursesCount,
        newAssignments: parents.newAssignmentsCount,
        toriTagsExtracted,
      });
    }
  );

  return {
    totalRows: rows.length,
    newComments: comments.newCommentsCount,
    duplicateComments: allCommentIds.length - comments.newCommentsCount,
    newThreads: parents.newThreadsCount,
    newStudents: parents.newStudentsCount,
    newAssignments: parents.newAssignmentsCount,
    newCourses: parents.newCoursesCount,
    detectedInstitutionId: institutionId,
    detectedInstitutionName: null,
    uploadLogId: uploadLog.id,
    toriTagsExtracted,
    courseAccessCreated: parents.courseIdsForAccess.size > 0,
    newUserCommentIds: comments.newUserCommentIds,
    updatedComments: comments.updatedCommentsCount,
  };
}
```

### 3. Implement `importParents`

**Files to modify:** `src/server/services/upload.ts`

Add this new function after `commitUpload`. It is the parent pre-pass: it creates all needed Courses, Assignments, Threads, and Students, each category chunked so transactions stay short. Returns maps keyed by external/system ID that the comment pass uses to wire up foreign keys without re-querying.

```typescript
interface ParentImportInput {
  rows: RawCsvRow[];
  dedup: Awaited<ReturnType<typeof checkDuplicates>>;
  institutionId: string;
  replaceMode: boolean;
}

interface ParentLookups {
  // Primary-key lookups used by the comment pass.
  courseIdByCourseExtId: Map<string, string>; // CSV course id → DB id
  assignmentIdByExtId: Map<string, string>;   // CSV assignment id → DB id
  threadIdByExtId: Map<string, string>;       // CSV thread id → DB id
  studentIdBySystemId: Map<string, string>;   // author systemId → DB id

  // Counters + side effects for the UploadLog.
  courseIdsForAccess: Set<string>;
  newCoursesCount: number;
  newAssignmentsCount: number;
  newThreadsCount: number;
  newStudentsCount: number;
}

async function importParents(
  input: ParentImportInput
): Promise<ParentLookups> {
  const { rows, dedup, institutionId, replaceMode } = input;

  const courseIdByCourseExtId = new Map<string, string>();
  const assignmentIdByExtId = new Map<string, string>();
  const threadIdByExtId = new Map<string, string>();
  const studentIdBySystemId = new Map<string, string>();
  const courseIdsForAccess = new Set<string>();

  let newCoursesCount = 0;
  let newAssignmentsCount = 0;
  let newThreadsCount = 0;
  let newStudentsCount = 0;

  // ── A. Collect distinct parents from the CSV ──────────────────────
  // Preserve first-occurrence order so the "first row wins" behavior for
  // metadata (thread name, assignment description, etc.) matches what
  // the old implementation did.
  const courseSpecs: Array<{ externalId: string | null; row: RawCsvRow }> = [];
  const seenCourseKeys = new Set<string>();
  const assignmentSpecs: Array<{ externalId: string; row: RawCsvRow }> = [];
  const seenAssignmentIds = new Set<string>();
  const threadSpecs: Array<{
    externalId: string;
    assignmentExternalId: string;
    row: RawCsvRow;
  }> = [];
  const seenThreadIds = new Set<string>();
  const studentSpecs: Array<{ systemId: string; row: RawCsvRow }> = [];
  const seenStudentIds = new Set<string>();

  for (const row of rows) {
    if (!row.assignmentId) continue;

    const csvCourseId = row.courseId?.trim() || null;
    const courseKey = csvCourseId ?? `__assignment__${row.assignmentId}`;
    if (!seenCourseKeys.has(courseKey)) {
      seenCourseKeys.add(courseKey);
      courseSpecs.push({ externalId: csvCourseId, row });
    }

    if (!seenAssignmentIds.has(row.assignmentId)) {
      seenAssignmentIds.add(row.assignmentId);
      assignmentSpecs.push({ externalId: row.assignmentId, row });
    }

    if (row.threadId && !seenThreadIds.has(row.threadId)) {
      seenThreadIds.add(row.threadId);
      threadSpecs.push({
        externalId: row.threadId,
        assignmentExternalId: row.assignmentId,
        row,
      });
    }

    // Students only come from USER rows — we figure that out using
    // resolveCommentRole. Comments that turn out to be ASSISTANT/SYSTEM
    // don't create a student even if the author columns are populated.
    if (row.authorSystemId?.trim() && !seenStudentIds.has(row.authorSystemId)) {
      if (resolveCommentRole(row) === CommentRole.USER) {
        seenStudentIds.add(row.authorSystemId);
        studentSpecs.push({ systemId: row.authorSystemId, row });
      }
    }
  }

  // ── B. Courses (chunked transactions) ─────────────────────────────
  for (const batch of chunk(courseSpecs, PARENT_CHUNK_SIZE)) {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      for (const spec of batch) {
        const course = await ensureCourse(
          manager,
          spec,
          institutionId,
          dedup
        );
        if (course.wasCreated) newCoursesCount++;
        courseIdByCourseExtId.set(courseKeyFor(spec), course.id);
        courseIdsForAccess.add(course.id);
      }
    });
  }

  // ── C. Assignments (chunked transactions) ────────────────────────
  for (const batch of chunk(assignmentSpecs, PARENT_CHUNK_SIZE)) {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      for (const spec of batch) {
        const courseExt = spec.row.courseId?.trim() || null;
        const courseKey = courseExt ?? `__assignment__${spec.externalId}`;
        const courseId = courseIdByCourseExtId.get(courseKey);
        if (!courseId) {
          throw new Error(
            `Internal: course id missing for assignment ${spec.externalId} (courseKey=${courseKey})`
          );
        }
        const a = await ensureAssignment(manager, spec, courseId, dedup);
        if (a.wasCreated) newAssignmentsCount++;
        assignmentIdByExtId.set(spec.externalId, a.id);
      }
    });
  }

  // ── D. Threads (chunked transactions) ────────────────────────────
  for (const batch of chunk(threadSpecs, PARENT_CHUNK_SIZE)) {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      for (const spec of batch) {
        const assignmentId = assignmentIdByExtId.get(spec.assignmentExternalId);
        if (!assignmentId) {
          throw new Error(
            `Internal: assignment id missing for thread ${spec.externalId}`
          );
        }
        const t = await ensureThread(manager, spec, assignmentId, dedup);
        if (t.wasCreated) newThreadsCount++;
        threadIdByExtId.set(spec.externalId, t.id);
      }
    });
  }

  // ── E. Students (chunked transactions) ───────────────────────────
  for (const batch of chunk(studentSpecs, PARENT_CHUNK_SIZE)) {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      for (const spec of batch) {
        const s = await ensureStudent(
          manager,
          spec,
          institutionId,
          dedup,
          replaceMode
        );
        if (s.wasCreated) newStudentsCount++;
        studentIdBySystemId.set(spec.systemId, s.id);
      }
    });
  }

  return {
    courseIdByCourseExtId,
    assignmentIdByExtId,
    threadIdByExtId,
    studentIdBySystemId,
    courseIdsForAccess,
    newCoursesCount,
    newAssignmentsCount,
    newThreadsCount,
    newStudentsCount,
  };
}

function courseKeyFor(spec: { externalId: string | null; row: RawCsvRow }): string {
  return spec.externalId ?? `__assignment__${spec.row.assignmentId}`;
}
```

### 4. Implement `ensureCourse` / `ensureAssignment` / `ensureThread` / `ensureStudent`

**Files to modify:** `src/server/services/upload.ts`

These are the per-entity helpers the parent pass uses. Each one returns `{ id, wasCreated }`. They preserve the existing logic (dedup, legacy-CSV fallback, replace-mode updates) but operate on one entity at a time inside a transaction.

```typescript
async function ensureCourse(
  manager: EntityManager,
  spec: { externalId: string | null; row: RawCsvRow },
  institutionId: string,
  dedup: Awaited<ReturnType<typeof checkDuplicates>>
): Promise<{ id: string; wasCreated: boolean }> {
  const { externalId, row } = spec;

  if (externalId) {
    // New CSV format: look up by externalId within institution.
    const existing = await manager.findOne(Course, {
      where: { externalId, institutionId },
    });
    if (existing) return { id: existing.id, wasCreated: false };

    const created = await manager.save(Course, {
      institutionId,
      externalId,
      name: row.courseName || "Untitled Course",
      url: row.courseUrl || null,
      startDate: parseDateOrNull(row.courseStartDate),
      endDate: parseDateOrNull(row.courseEndDate),
      courseNumber: row.courseNumber || null,
      syncId: row.courseSyncId || null,
      faculty: row.courseFaculty || null,
    });
    return { id: created.id, wasCreated: true };
  }

  // Legacy CSV: no course column → one course per assignment.
  const courseName = `${row.assignmentName ?? "Untitled"} — Course`;
  const assignmentIsKnown = dedup.existingAssignmentIds.has(row.assignmentId);
  if (assignmentIsKnown) {
    const existingAssignment = await manager.findOne(Assignment, {
      where: { externalId: row.assignmentId },
      relations: { course: true },
    });
    if (existingAssignment?.course) {
      return { id: existingAssignment.course.id, wasCreated: false };
    }
  }
  const created = await manager.save(Course, {
    institutionId,
    name: courseName,
  });
  return { id: created.id, wasCreated: true };
}

async function ensureAssignment(
  manager: EntityManager,
  spec: { externalId: string; row: RawCsvRow },
  courseId: string,
  dedup: Awaited<ReturnType<typeof checkDuplicates>>
): Promise<{ id: string; wasCreated: boolean }> {
  const { externalId, row } = spec;
  if (dedup.existingAssignmentIds.has(externalId)) {
    const existing = await manager.findOne(Assignment, {
      where: { externalId, courseId },
    });
    if (existing) return { id: existing.id, wasCreated: false };
  }
  const created = await manager.save(
    Assignment,
    buildAssignmentEntity(row, courseId, externalId)
  );
  return { id: created.id, wasCreated: true };
}

async function ensureThread(
  manager: EntityManager,
  spec: { externalId: string; assignmentExternalId: string; row: RawCsvRow },
  assignmentId: string,
  dedup: Awaited<ReturnType<typeof checkDuplicates>>
): Promise<{ id: string; wasCreated: boolean }> {
  const { externalId, row } = spec;
  if (dedup.existingThreadIds.has(externalId)) {
    const existing = await manager.findOne(Thread, {
      where: { externalId, assignmentId },
    });
    if (existing) return { id: existing.id, wasCreated: false };
  }
  const created = await manager.save(Thread, {
    assignmentId,
    externalId,
    name: row.threadName ?? "Untitled Thread",
    totalInputTokens: parseIntOrNull(row.threadTotalInputTokens),
    totalOutputTokens: parseIntOrNull(row.threadTotalOutputTokens),
    totalCost: parseFloatOrNull(row.threadTotalCost),
    submissionUrl: row.submissionUrl || null,
  });
  return { id: created.id, wasCreated: true };
}

async function ensureStudent(
  manager: EntityManager,
  spec: { systemId: string; row: RawCsvRow },
  institutionId: string,
  dedup: Awaited<ReturnType<typeof checkDuplicates>>,
  replaceMode: boolean
): Promise<{ id: string; wasCreated: boolean }> {
  const { systemId, row } = spec;
  if (dedup.existingStudentSystemIds.has(systemId)) {
    const existing = await manager.findOne(Student, {
      where: { systemId, institutionId },
    });
    if (existing) {
      if (replaceMode) {
        existing.firstName = row.authorFirstName || existing.firstName;
        existing.lastName = row.authorLastName || existing.lastName;
        existing.email = row.authorEmail || existing.email;
        await manager.save(Student, existing);
      }
      return { id: existing.id, wasCreated: false };
    }
  }
  const created = await manager.save(Student, {
    institutionId,
    systemId,
    syncId: row.authorSyncId || null,
    firstName: row.authorFirstName || null,
    lastName: row.authorLastName || null,
    email: row.authorEmail || null,
    systemRole: row.authorSystemRole || null,
    courseRole: row.authorCourseRole || null,
  });
  return { id: created.id, wasCreated: true };
}

function buildAssignmentEntity(
  row: RawCsvRow,
  courseId: string,
  externalId: string
): Partial<Assignment> {
  return {
    courseId,
    externalId,
    name: row.assignmentName ?? "Untitled Assignment",
    description: row.assignmentDescription || null,
    url: row.assignmentUrl || null,
    createdDate: parseDateOrNull(row.assignmentCreatedDate),
    dueDate: parseDateOrNull(row.assignmentDueDate),
    gradeMaxPoints: parseFloatOrNull(row.gradeMaxPoints),
    intendedOutcomes: row.assignmentIntendedOutcomes || null,
    aiAssistantId: row.aiAssistantId || null,
    aiAssistantName: row.aiAssistantName || null,
    aiAssistantDescription: row.aiAssistantDescription || null,
    aiAssistantInstruction: row.aiAssistantInstruction || null,
    aiAssistantRestriction: row.aiAssistantRestriction || null,
    aiAssistantRole: row.aiAssistantRole || null,
    aiAssistantTags: row.aiAssistantTags || null,
    aiAssistantGradeLevel: row.aiAssistantGradeLevel || null,
    aiAssistantResponseLength: row.aiAssistantResponseLength || null,
    aiAssistantVisibility: row.aiAssistantVisibility || null,
    aiAssistantReflections: parseBool(row.aiAssistantReflections),
    aiAssistantGenerateAnswers: parseBool(row.aiAssistantGenerateAnswers),
    aiAssistantIntendedAudience: row.aiAssistantIntendedAudience || null,
  };
}
```

### 5. Implement `importComments`

**Files to modify:** `src/server/services/upload.ts`

This is the main scale lever. Process rows in chunks of 5,000 per transaction. Inside each transaction, bulk-insert with `manager.insert(Comment, batchOf500)`. Also handle replace-mode updates inside each chunk's transaction (UPDATE-in-place, unavoidably one-at-a-time for now).

```typescript
interface CommentImportInput {
  rows: RawCsvRow[];
  dedup: Awaited<ReturnType<typeof checkDuplicates>>;
  parents: ParentLookups;
  uploadedById: string;
  institutionId: string;
  replaceMode: boolean;
}

interface InsertedCommentMeta {
  id: string;
  externalId: string;
  role: CommentRole;
  text: string;
  orderIndex: number;
}

interface CommentImportResult {
  newCommentsCount: number;
  updatedCommentsCount: number;
  newUserCommentIds: string[];
  // Inserted comments grouped by their threadId (DB id, not external id).
  // The TORI pass reads this to extract tags per-thread without re-querying.
  insertedByThread: Map<string, InsertedCommentMeta[]>;
}

async function importComments(
  input: CommentImportInput
): Promise<CommentImportResult> {
  const { rows, dedup, parents, uploadedById, institutionId, replaceMode } =
    input;

  const newUserCommentIds: string[] = [];
  const insertedByThread = new Map<string, InsertedCommentMeta[]>();
  let newCommentsCount = 0;
  let updatedCommentsCount = 0;

  // De-dup within the CSV itself (same commentId appearing twice in one
  // file) — tracked globally across chunks because a dup might span chunks.
  const insertedExternalIds = new Set<string>();

  for (const rowChunk of chunk(rows, ROW_CHUNK_SIZE)) {
    const { chunkNewCount, chunkUpdatedCount } = await AppDataSource.transaction(
      async (manager: EntityManager) => {
        let chunkNewCount = 0;
        let chunkUpdatedCount = 0;

        // ── Build insert drafts for this chunk ──────────────────────
        interface NewCommentDraft {
          threadId: string;
          studentId: string | null;
          externalId: string;
          role: CommentRole;
          text: string;
          timestamp: Date | null;
          orderIndex: number;
          totalComments: number | null;
          grade: string | null;
        }
        const drafts: NewCommentDraft[] = [];
        // Rows that are dupes and need replace-mode UPDATE handled below.
        const replaceRows: RawCsvRow[] = [];

        for (const row of rowChunk) {
          if (!row.assignmentId || !row.threadId) continue;
          if (!row.commentId) continue;

          if (dedup.existingCommentIds.has(row.commentId)) {
            if (replaceMode) replaceRows.push(row);
            continue;
          }
          if (insertedExternalIds.has(row.commentId)) continue;
          insertedExternalIds.add(row.commentId);

          const threadId = parents.threadIdByExtId.get(row.threadId);
          if (!threadId) {
            throw new Error(
              `Internal: threadId missing for row with externalId ${row.commentId} (thread ${row.threadId})`
            );
          }

          const role = resolveCommentRole(row);
          let studentId: string | null = null;
          if (role === CommentRole.USER && row.authorSystemId?.trim()) {
            studentId = parents.studentIdBySystemId.get(row.authorSystemId) ?? null;
          }

          drafts.push({
            threadId,
            studentId,
            externalId: row.commentId,
            role,
            text: decodeEntities(row.commentFullText ?? ""),
            timestamp: parseDateOrNull(row.commentTimestamp),
            orderIndex: parseIntOrNull(row.commentOrder) ?? 0,
            totalComments: parseIntOrNull(row.totalComments),
            grade: row.grade || null,
          });
        }

        // ── Insert in batches of 500 ───────────────────────────────
        for (const batch of chunk(drafts, COMMENT_INSERT_BATCH_SIZE)) {
          const toInsert = batch.map((d) => ({
            threadId: d.threadId,
            studentId: d.studentId,
            externalId: d.externalId,
            role: d.role,
            text: d.text,
            timestamp: d.timestamp,
            orderIndex: d.orderIndex,
            totalComments: d.totalComments,
            grade: d.grade,
            uploadedById,
          }));
          const result = await manager.insert(Comment, toInsert);

          // Sanity check: TypeORM's RETURNING-based insert is supposed to
          // give us the same number of identifiers as input rows, in the
          // same order. If this ever fails the rest of the function would
          // silently associate the wrong ID with the wrong externalId for
          // TORI tagging — better to fail loudly here.
          if (result.identifiers.length !== batch.length) {
            throw new Error(
              `Internal: insert returned ${result.identifiers.length} identifiers for ${batch.length} rows`
            );
          }

          // result.identifiers is same-length, same-order as the input.
          for (let i = 0; i < batch.length; i++) {
            const id = (result.identifiers[i] as { id: string }).id;
            const d = batch[i];
            chunkNewCount++;
            if (d.role === CommentRole.USER) {
              newUserCommentIds.push(id);
            }
            const list = insertedByThread.get(d.threadId) ?? [];
            list.push({
              id,
              externalId: d.externalId,
              role: d.role,
              text: d.text,
              orderIndex: d.orderIndex,
            });
            insertedByThread.set(d.threadId, list);
          }
        }

        // ── Replace-mode updates (one at a time; only runs when the
        //    user has enabled replaceMode, which is the uncommon path) ─
        if (replaceMode && replaceRows.length > 0) {
          for (const row of replaceRows) {
            const existing = await manager
              .createQueryBuilder(Comment, "c")
              .innerJoin("c.thread", "t")
              .innerJoin("t.assignment", "a")
              .innerJoin("a.course", "co")
              .where("co.institutionId = :institutionId", { institutionId })
              .andWhere("c.externalId = :externalId", {
                externalId: row.commentId,
              })
              .getOne();
            if (existing) {
              existing.text = decodeEntities(row.commentFullText ?? "");
              existing.timestamp =
                parseDateOrNull(row.commentTimestamp) ?? existing.timestamp;
              existing.grade = row.grade || existing.grade;
              await manager.save(Comment, existing);
              chunkUpdatedCount++;
            }
          }
        }

        return { chunkNewCount, chunkUpdatedCount };
      }
    );

    newCommentsCount += chunkNewCount;
    updatedCommentsCount += chunkUpdatedCount;
  }

  return {
    newCommentsCount,
    updatedCommentsCount,
    newUserCommentIds,
    insertedByThread,
  };
}
```

### 6. Implement `importToriTags`

**Files to modify:** `src/server/services/upload.ts`

After all comments are committed, run TORI extraction per thread. Each thread's tags go in a short transaction; tags are batched 500 per INSERT.

```typescript
async function importToriTags(input: {
  insertedByThread: Map<string, InsertedCommentMeta[]>;
}): Promise<number> {
  const { insertedByThread } = input;
  let total = 0;

  for (const [, threadComments] of insertedByThread) {
    if (threadComments.length === 0) continue;
    const associations = await extractToriForThread(threadComments);
    if (associations.length === 0) continue;

    const tagRows = associations.map((assoc) => ({
      commentId: assoc.studentCommentId,
      toriTagId: assoc.toriTagId,
      sourceCommentId: assoc.sourceCommentId,
      extractionMethod: "extracted" as const,
    }));

    for (const tagBatch of chunk(tagRows, TORI_TAG_INSERT_BATCH_SIZE)) {
      await AppDataSource.transaction(async (manager: EntityManager) => {
        await manager.insert(CommentToriTag, tagBatch);
      });
      total += tagBatch.length;
    }
  }

  return total;
}
```

### 7. Confirm the Comment entity contracts (verified facts)

These were verified against `src/server/entities/Comment.ts` during planning — they should still be true. Re-verify quickly:

- **`id` column** is `@PrimaryGeneratedColumn("uuid")` (line 25). Postgres generates the UUID; TypeORM fetches it back via `RETURNING`. So `manager.insert(Comment, batch)` returns IDs in `result.identifiers`, in the same order as the input array.
- **`studentId` column** is `@Column({ type: "varchar", nullable: true })` (line 31–32). Inserting `null` for ASSISTANT/SYSTEM rows is valid.
- **Unique index** on `["externalId", "threadId"]` (line 23). Inserting the same `commentId` twice within one thread will throw a unique-constraint violation. Our in-memory `insertedExternalIds` Set prevents duplicates within one CSV; cross-upload duplicates are filtered by `dedup.existingCommentIds`.

**Defensive assertion in the first batch:** add this sanity check to detect identifier-ordering surprises early:

```typescript
const result = await manager.insert(Comment, toInsert);
if (result.identifiers.length !== batch.length) {
  throw new Error(
    `Internal: insert returned ${result.identifiers.length} identifiers for ${batch.length} rows`
  );
}
```

### 8. Clean up unused imports

**Files to modify:** `src/server/services/upload.ts`

After the refactor, some previously-used helpers are gone (the per-row `manager.save(Comment, ...)` is replaced by batched insert). Run typecheck and clean up anything the compiler flags as unused.

## Verification

### Typecheck

```bash
docker compose exec app pnpm typecheck
```

Expected: exits 0.

### Transaction structure check

Read back the final `upload.ts` and confirm:
- `commitUpload` no longer contains a top-level `AppDataSource.transaction` wrapping the whole function.
- The main orchestration is: parse → save file → dedup → `importParents` → `importComments` → `importToriTags` → final transaction.
- `importComments` chunks rows via `chunk(rows, ROW_CHUNK_SIZE)` and each chunk's `AppDataSource.transaction` body uses `manager.insert(Comment, batch)`.

### Log inspection during a real upload

Boot the app, upload a modestly-sized CSV (say, 1,000 rows), and watch `docker compose logs -f chat-explorer`. You should see:
- Short transactions one after another (START/COMMIT pairs), NOT one long-running transaction.
- Multi-row INSERTs: a single INSERT statement with many parameterized VALUES tuples, not 500 individual single-row INSERTs.

## When done

Report:
- Files modified (one: `src/server/services/upload.ts`).
- Output of `pnpm typecheck`.
- Confirm the structural shape: **four passes** (`importParents`, `importComments`, `importToriTags`, final `AppDataSource.transaction` for finalize), with all per-chunk `AppDataSource.transaction` calls scoped to row-count chunks of ≤ 5,000.
- Confirm `manager.insert(Comment, batch)` is used for new comments, with batch size 500.
- Confirm the identifier-length assertion is in place inside the comment-insert loop.
- Any surprises, especially around the Comment entity's id generation interacting with `manager.insert`.

**8,000-student scenario coverage:** Phase 05 includes a fixture variant with 1 assignment × 1000 students × 20 comments per student to exercise the row-chunking-within-one-assignment shape. If you discover anything in this phase that would change how that test should be written (e.g., new transactional behavior worth covering), note it in your report.

**Commit this phase:**

```bash
git add src/server/services/upload.ts
git commit -m "perf(upload): phase 04 - row-chunked transactions with batched inserts"
```
