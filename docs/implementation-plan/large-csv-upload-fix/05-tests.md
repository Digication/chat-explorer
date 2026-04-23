# Phase 05 — Tests

You are adding unit and integration tests for the upload pipeline rewrite in the chat-explorer project.

**Context:** Phases 01–04 rewrote the CSV upload path. The streaming parser is in `src/server/services/csv-parser.ts` as `parseCsvFile(filePath)`. The batched DB writer is in `src/server/services/upload.ts` as `commitUpload(filePath, ...)` which internally calls four passes — `importParents` (chunked transactions), `importComments` (5,000-row transactions with 500-row INSERT batches), `importToriTags` (per-thread batched inserts), and a final small transaction for `CourseAccess` + `UploadLog`. We need tests that:

1. Lock down the streaming parser's behavior on well-formed, malformed, UTF-8, and Windows-1252 inputs.
2. Verify that a large synthetic CSV (~10,000 rows) is fully imported and yields correct row counts in the database.
3. Confirm that re-running the same upload is safe (idempotent via dedup).

The project uses **Vitest** for unit tests (`pnpm test`) and has an existing Postgres service in `docker-compose.yml`. We run tests inside the container with `docker compose exec app pnpm test`.

## Overview

- Add `scripts/generate-synthetic-csv.mjs` that deterministically creates a CSV fixture with N rows, M assignments, and a mix of large text cells (simulating pasted papers). Checked in.
- Add `src/server/services/csv-parser.test.ts` — unit tests that parse small inline CSVs.
- Add `src/server/services/upload.test.ts` — integration test that imports the 10k-row fixture end-to-end.
- Update `package.json` if needed (no new dev deps expected).
- Ensure tests clean up their data between runs.

## Steps

### 1. Add the synthetic CSV generator

**Files to create:** `scripts/generate-synthetic-csv.mjs`

```javascript
#!/usr/bin/env node
// Generates a synthetic CSV fixture for upload tests.
//
// Usage:
//   node scripts/generate-synthetic-csv.mjs <outPath> [rowCount] [bigTextChars]
//
// Defaults: rowCount=10000, bigTextChars=10000 (10 KB per comment for every
// 50th row, to simulate a student pasting a paper into chat).
//
// Shape matches the real Digication AI chat report CSV so the parser and
// uploader are exercised with realistic headers.

import { writeFile } from "node:fs/promises";

const outPath = process.argv[2];
if (!outPath) {
  console.error("usage: generate-synthetic-csv.mjs <outPath> [rowCount] [bigTextChars]");
  process.exit(1);
}
const rowCount = Number(process.argv[3] ?? 10000);
const bigTextChars = Number(process.argv[4] ?? 10000);

const HEADERS = [
  "Thread ID", "Thread Name", "Thread total input tokens",
  "Thread total output tokens", "Thread total cost", "Submission URL",
  "Comment ID", "Comment Role", "Comment full text", "Comment timestamp",
  "Comment order #", "Total # of comments", "Comment author system ID",
  "Comment author sync ID", "Comment author first name",
  "Comment author last name", "Comment author email",
  "Comment author system role", "Comment author course role",
  "Assignment ID", "Assignment created date", "Assignment name",
  "Assignment description", "Assignment URL", "Assignment due date",
  "Grade max points", "Grade", "Assignment intended outcomes",
  "Assignment creator system ID", "Assignment creator sync ID",
  "Assignment creator first name", "Assignment creator last name",
  "Assignment creator email", "AI assistant creator system ID",
  "AI assistant creator sync ID", "AI assistant creator first name",
  "AI assistant creator last name", "AI assistant creator email",
  "AI assistant ID", "AI assistant name", "AI assistant description",
  "AI assistant instruction", "AI assistant restriction",
  "AI assistant tags", "AI assistant role", "AI assistant reflections",
  "AI assistant generate answers / content", "AI assistant intended audience",
  "AI assistant grade level", "AI assistant response length",
  "AI assistant visibility", "Course ID", "Course Name", "Course URL",
  "Course Start Date", "Course End Date", "Course Number", "Course Sync ID",
  "Course Faculty",
];

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Deterministic pseudo-random so fixture contents are stable.
let seed = 42;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

// 10 assignments × 50 threads × ~20 comments each → ~10,000 rows.
const ASSIGNMENT_COUNT = 10;
const THREADS_PER_ASSIGNMENT = 50;
const COMMENTS_PER_THREAD = Math.ceil(rowCount / (ASSIGNMENT_COUNT * THREADS_PER_ASSIGNMENT));

const bigText = "This is a student essay paragraph. ".repeat(
  Math.ceil(bigTextChars / 35)
).slice(0, bigTextChars);

const submissionUrlBase = "https://example.digication.com/app/c/test-course/!/assessment/";

const lines = [HEADERS.map(csvEscape).join(",")];
let commentCounter = 0;

for (let a = 1; a <= ASSIGNMENT_COUNT; a++) {
  const assignmentId = String(20000 + a);
  const courseId = String(3000 + a);
  for (let t = 1; t <= THREADS_PER_ASSIGNMENT; t++) {
    const threadId = String(a * 1000 + t);
    const studentSysId = String(4000000 + t);
    for (let c = 1; c <= COMMENTS_PER_THREAD; c++) {
      commentCounter++;
      if (commentCounter > rowCount) break;
      const isAssistant = c % 2 === 1;
      const isBig = c % 50 === 0;
      const role = isAssistant ? "ASSISTANT" : "USER";
      const text = isBig
        ? bigText
        : (isAssistant
            ? `Assistant reply ${c} in thread ${threadId}.`
            : `Student message ${c} in thread ${threadId}.`);
      const row = {
        "Thread ID": threadId,
        "Thread Name": `Thread ${threadId}`,
        "Thread total input tokens": "1000",
        "Thread total output tokens": "500",
        "Thread total cost": "0.01",
        "Submission URL": `${submissionUrlBase}${assignmentId}?revieweeId=${studentSysId}`,
        "Comment ID": String(1_000_000 + commentCounter),
        "Comment Role": role,
        "Comment full text": text,
        "Comment timestamp": "Thu Mar 26 2026 22:26:38 GMT+0000 (GMT+00:00)",
        "Comment order #": String(c),
        "Total # of comments": String(COMMENTS_PER_THREAD),
        "Comment author system ID": isAssistant ? "" : studentSysId,
        "Comment author sync ID": isAssistant ? "" : `user${studentSysId}`,
        "Comment author first name": isAssistant ? "" : "Test",
        "Comment author last name": isAssistant ? "" : `Student${t}`,
        "Comment author email": isAssistant ? "" : `student${t}@example.edu`,
        "Comment author system role": "",
        "Comment author course role": isAssistant ? "" : "Student",
        "Assignment ID": assignmentId,
        "Assignment created date": "Tue Feb 24 2026 20:48:50 GMT+0000 (GMT+00:00)",
        "Assignment name": `Assignment ${assignmentId}`,
        "Assignment description": "Test assignment description.",
        "Assignment URL": `${submissionUrlBase}${assignmentId}`,
        "Assignment due date": "Tue Mar 31 2026 03:55:00 GMT+0000 (GMT+00:00)",
        "Grade max points": "100",
        "Grade": "",
        "Assignment intended outcomes": "",
        "Assignment creator system ID": "3000001",
        "Assignment creator sync ID": "teacher1",
        "Assignment creator first name": "Test",
        "Assignment creator last name": "Teacher",
        "Assignment creator email": "teacher@example.edu",
        "AI assistant creator system ID": "3000001",
        "AI assistant creator sync ID": "teacher1",
        "AI assistant creator first name": "Test",
        "AI assistant creator last name": "Teacher",
        "AI assistant creator email": "teacher@example.edu",
        "AI assistant ID": "1000",
        "AI assistant name": "Test AI",
        "AI assistant description": "A test AI assistant.",
        "AI assistant instruction": "Help students.",
        "AI assistant restriction": "",
        "AI assistant tags": "",
        "AI assistant role": "",
        "AI assistant reflections": "true",
        "AI assistant generate answers / content": "true",
        "AI assistant intended audience": "students",
        "AI assistant grade level": "college",
        "AI assistant response length": "medium",
        "AI assistant visibility": "assignment",
        "Course ID": courseId,
        "Course Name": `Test Course ${courseId}`,
        "Course URL": `${submissionUrlBase}${assignmentId}`.replace("/assessment/" + assignmentId, ""),
        "Course Start Date": "Mon Jan 20 2026 00:00:00 GMT+0000 (GMT+00:00)",
        "Course End Date": "Sun May 10 2026 00:00:00 GMT+0000 (GMT+00:00)",
        "Course Number": `TEST-${courseId}`,
        "Course Sync ID": `sync${courseId}`,
        "Course Faculty": "Test Teacher",
      };
      lines.push(HEADERS.map((h) => csvEscape(row[h])).join(","));
    }
    if (commentCounter >= rowCount) break;
  }
  if (commentCounter >= rowCount) break;
}

await writeFile(outPath, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${commentCounter} rows (${lines.length - 1} data lines) to ${outPath}`);
```

### 2. Unit tests for the streaming parser

**Files to create:** `src/server/services/csv-parser.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseCsvFile, parseCsvBuffer } from "./csv-parser.js";

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "csv-parser-test-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function writeFixture(name: string, content: string | Buffer): Promise<string> {
  const p = join(workDir, name);
  await writeFile(p, content);
  return p;
}

describe("parseCsvFile", () => {
  it("parses a small UTF-8 CSV and normalizes headers", async () => {
    const csv =
      "Thread ID,Comment ID,Comment Role,Comment full text,Assignment ID\n" +
      "t1,c1,USER,Hello,a1\n" +
      "t1,c2,ASSISTANT,Hi there,a1\n";
    const p = await writeFixture("small-utf8.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(2);
    expect(rows[0].threadId).toBe("t1");
    expect(rows[0].commentId).toBe("c1");
    expect(rows[0].commentRole).toBe("USER");
    expect(rows[0].commentFullText).toBe("Hello");
    expect(rows[1].commentRole).toBe("ASSISTANT");
  });

  it("filters rows with no commentId", async () => {
    const csv =
      "Thread ID,Comment ID,Comment Role,Comment full text\n" +
      "t1,c1,USER,Real row\n" +
      "t1,,USER,Junk row with no commentId\n" +
      "t1,c2,USER,Another real row\n";
    const p = await writeFixture("no-commentid.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.commentId)).toEqual(["c1", "c2"]);
  });

  it("strips a UTF-8 BOM without including it in the first header", async () => {
    const csv =
      "\ufeffThread ID,Comment ID,Comment Role,Comment full text\n" +
      "t1,c1,USER,Hello\n";
    const p = await writeFixture("bom.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].threadId).toBe("t1");
  });

  it("decodes Windows-1252 when the file is not valid UTF-8", async () => {
    // 0x92 is a curly apostrophe in Windows-1252 and invalid UTF-8.
    const headerUtf8 = Buffer.from(
      "Thread ID,Comment ID,Comment Role,Comment full text\n",
      "utf8"
    );
    const row = Buffer.concat([
      Buffer.from("t1,c1,USER,It", "utf8"),
      Buffer.from([0x92]),
      Buffer.from("s working\n", "utf8"),
    ]);
    const p = await writeFixture("win1252.csv", Buffer.concat([headerUtf8, row]));

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(1);
    // The right-single-quote is U+2019 in Windows-1252 decode.
    expect(rows[0].commentFullText).toBe("It\u2019s working");
  });

  it("handles rows with many columns (relax_column_count)", async () => {
    const csv =
      "Thread ID,Comment ID,Comment Role,Comment full text\n" +
      "t1,c1,USER,hello,extra1,extra2\n";
    const p = await writeFixture("extra-cols.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].commentId).toBe("c1");
  });

  it("handles embedded newlines inside quoted cells", async () => {
    const csv =
      'Thread ID,Comment ID,Comment Role,Comment full text\n' +
      't1,c1,USER,"line1\nline2\nline3"\n';
    const p = await writeFixture("multiline.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].commentFullText).toBe("line1\nline2\nline3");
  });

  it("agrees with parseCsvBuffer on the same input", async () => {
    const csv =
      "Thread ID,Comment ID,Comment Role,Comment full text,Assignment ID\n" +
      "t1,c1,USER,Hello,a1\n" +
      "t2,c2,ASSISTANT,Hi,a1\n";
    const p = await writeFixture("compat.csv", csv);

    const streamed = await parseCsvFile(p);
    const sync = parseCsvBuffer(Buffer.from(csv, "utf8"));
    expect(streamed).toEqual(sync);
  });
});
```

### 3. Add a "single assignment, many students" fixture mode to the generator

**Files to modify:** `scripts/generate-synthetic-csv.mjs`

The default generator above produces 10 assignments × 50 threads each — exercises chunking ACROSS assignments but doesn't exercise the user's worst case (one assignment with thousands of students). Add a third optional CLI argument `shape`:

```javascript
// After the existing arg parsing:
const shape = process.argv[5] || "many-assignments"; // or "single-assignment"
// ...
// Replace the existing constants with:
const ASSIGNMENT_COUNT = shape === "single-assignment" ? 1 : 10;
const THREADS_PER_ASSIGNMENT = shape === "single-assignment"
  ? Math.ceil(rowCount / 20) // 1 thread per student, ~20 comments each
  : 50;
```

This lets the integration test generate both shapes with the same script.

### 4. Integration test for `commitUpload`

**Files to create:** `src/server/services/upload.test.ts`

This test hits the real database that docker compose already provisions. It creates a throwaway institution + user (uniquely suffixed per run so concurrent test runs don't collide), runs the upload, asserts row counts, and cleans up. **It does NOT call `AppDataSource.initialize()` itself** — that already happens in `src/server/test-setup.ts` which Vitest runs as `setupFiles`.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { AppDataSource } from "../data-source.js";
import { Institution } from "../entities/Institution.js";
import { User } from "../entities/User.js";
import { Comment } from "../entities/Comment.js";
import { Assignment } from "../entities/Assignment.js";
import { UploadLog } from "../entities/UploadLog.js";
import { previewUpload, commitUpload } from "./upload.js";

// Unique-per-run identifiers so concurrent test runs (and stale data from
// prior failed runs) don't cause UNIQUE-constraint or FK conflicts. The
// suffix also lets the cleanup query match this run's data only.
const RUN_SUFFIX = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const TEST_INSTITUTION_DOMAIN = `upload-test-${RUN_SUFFIX}.digication.com`;
const TEST_INSTITUTION_SLUG = `upload-test-${RUN_SUFFIX}`;
const TEST_USER_ID = `upload-test-user-${RUN_SUFFIX}`;
const TEST_USER_EMAIL = `upload-test-${RUN_SUFFIX}@example.com`;

let fixtureDir: string;
let manyAssignmentsFixturePath: string;
let singleAssignmentFixturePath: string;
let institutionId: string;

async function generateFixture(
  outPath: string,
  rows: number,
  shape: "many-assignments" | "single-assignment" = "many-assignments"
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ["scripts/generate-synthetic-csv.mjs", outPath, String(rows), "10000", shape],
      { stdio: "inherit" }
    );
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`generator exited ${code}`))
    );
  });
}

beforeAll(async () => {
  // AppDataSource is initialized by src/server/test-setup.ts via vitest's
  // setupFiles. Do NOT initialize it again here — duplicate initialize
  // would fail with "DataSource is already initialized".

  fixtureDir = await mkdtemp(join(tmpdir(), "upload-test-"));
  manyAssignmentsFixturePath = join(fixtureDir, "many-assignments.csv");
  singleAssignmentFixturePath = join(fixtureDir, "single-assignment.csv");

  // 2000 rows × 10 assignments × 50 threads → exercises cross-assignment chunking.
  await generateFixture(manyAssignmentsFixturePath, 2000, "many-assignments");
  // 2000 rows × 1 assignment × ~100 threads → exercises within-assignment chunking
  // (the 8000-student worst case in miniature). 2000 rows / 5000 chunk size → 1
  // comment-pass transaction; bump to 10000 rows if you want multiple chunks.
  await generateFixture(singleAssignmentFixturePath, 2000, "single-assignment");

  // Throwaway institution + user. Unique per run via RUN_SUFFIX.
  const inst = await AppDataSource.getRepository(Institution).save({
    domain: TEST_INSTITUTION_DOMAIN,
    slug: TEST_INSTITUTION_SLUG,
    name: `Upload Test Institution ${RUN_SUFFIX}`,
  });
  institutionId = inst.id;

  await AppDataSource.getRepository(User).save({
    id: TEST_USER_ID, // explicit — User.id is @PrimaryColumn (no auto-gen)
    name: "Upload Test User",
    email: TEST_USER_EMAIL,
    role: "instructor",      // matches the user_role_enum lowercase values
    institutionId,
  });
}, 60_000);

afterAll(async () => {
  if (!AppDataSource.isInitialized) return;

  // Clean up THIS RUN's data. Order matters for FK constraints. Table names
  // are SINGULAR (TypeORM default naming) — confirmed against the Initial
  // migration: "user", "institution", "course", "assignment", "thread",
  // "student", "comment", "upload_log", "course_access", "comment_tori_tag".
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  try {
    await qr.query(
      `DELETE FROM "comment_tori_tag" WHERE "commentId" IN (SELECT id FROM "comment" WHERE "uploadedById" = $1)`,
      [TEST_USER_ID]
    );
    await qr.query(`DELETE FROM "comment" WHERE "uploadedById" = $1`, [TEST_USER_ID]);
    await qr.query(
      `DELETE FROM "thread" WHERE "assignmentId" IN (SELECT a.id FROM "assignment" a JOIN "course" c ON a."courseId" = c.id WHERE c."institutionId" = $1)`,
      [institutionId]
    );
    await qr.query(
      `DELETE FROM "assignment" WHERE "courseId" IN (SELECT id FROM "course" WHERE "institutionId" = $1)`,
      [institutionId]
    );
    await qr.query(`DELETE FROM "upload_log" WHERE "institutionId" = $1`, [institutionId]);
    await qr.query(`DELETE FROM "course_access" WHERE "userId" = $1`, [TEST_USER_ID]);
    await qr.query(`DELETE FROM "course" WHERE "institutionId" = $1`, [institutionId]);
    await qr.query(`DELETE FROM "student" WHERE "institutionId" = $1`, [institutionId]);
    await qr.query(`DELETE FROM "user" WHERE id = $1`, [TEST_USER_ID]);
    await qr.query(`DELETE FROM "institution" WHERE id = $1`, [institutionId]);
  } finally {
    await qr.release();
  }

  await rm(fixtureDir, { recursive: true, force: true });
}, 60_000);

describe("commitUpload — many assignments shape", () => {
  it("previews and commits a 2000-row CSV across 10 assignments", async () => {
    // Copy to a fresh path because commitUpload renames its input.
    const previewPath = join(fixtureDir, `preview-many-${RUN_SUFFIX}.csv`);
    await copyFile(manyAssignmentsFixturePath, previewPath);

    const preview = await previewUpload(previewPath);
    expect(preview.totalRows).toBe(2000);
    expect(preview.newComments).toBe(2000);
    expect(preview.duplicateComments).toBe(0);

    const commitPath = join(fixtureDir, `commit-many-${RUN_SUFFIX}.csv`);
    await copyFile(manyAssignmentsFixturePath, commitPath);

    const result = await commitUpload(
      commitPath,
      TEST_USER_ID,
      institutionId,
      "synthetic.csv"
    );

    expect(result.totalRows).toBe(2000);
    expect(result.newComments).toBe(2000);
    expect(result.newThreads).toBeGreaterThan(0);
    expect(result.newAssignments).toBe(10);
    expect(result.newCourses).toBe(10);
    expect(result.uploadLogId).toBeTruthy();

    // DB row counts.
    const commentCount = await AppDataSource.getRepository(Comment).count({
      where: { uploadedById: TEST_USER_ID },
    });
    expect(commentCount).toBe(2000);

    const assignmentCount = await AppDataSource.getRepository(Assignment).count({
      where: { course: { institutionId } },
      relations: { course: true },
    });
    expect(assignmentCount).toBe(10);

    const logCount = await AppDataSource.getRepository(UploadLog).count({
      where: { institutionId },
    });
    expect(logCount).toBe(1);
  }, 120_000);

  it("is idempotent — re-uploading the same file produces zero new rows", async () => {
    const path = join(fixtureDir, `idempotent-${RUN_SUFFIX}.csv`);
    await copyFile(manyAssignmentsFixturePath, path);

    const result = await commitUpload(
      path,
      TEST_USER_ID,
      institutionId,
      "synthetic.csv"
    );

    expect(result.totalRows).toBe(2000);
    expect(result.newComments).toBe(0);
    expect(result.duplicateComments).toBe(2000);
  }, 120_000);
});

describe("commitUpload — single assignment shape (8000-student-style)", () => {
  it("previews and commits a 2000-row CSV in one assignment with many threads", async () => {
    const path = join(fixtureDir, `single-${RUN_SUFFIX}.csv`);
    await copyFile(singleAssignmentFixturePath, path);

    const result = await commitUpload(
      path,
      TEST_USER_ID,
      institutionId,
      "single-assignment.csv"
    );

    expect(result.totalRows).toBe(2000);
    expect(result.newComments).toBe(2000);
    // Single-assignment shape: exactly 1 new assignment in this run.
    expect(result.newAssignments).toBe(1);
    expect(result.newThreads).toBeGreaterThan(50); // many threads in one assignment
  }, 120_000);
});
```

### 5. Confirm the test config (no changes expected)

**Files to inspect:** `vitest.config.ts`, `src/server/test-setup.ts`

Confirmed during planning:
- `vitest.config.ts` has `setupFiles: ['./src/server/test-setup.ts']`.
- `src/server/test-setup.ts` initializes `AppDataSource` in a `beforeAll` hook and destroys it in `afterAll`.
- The integration test above relies on this — it does NOT call `AppDataSource.initialize()` directly.

If `pnpm test` reports "DataSource is not initialized" in the new test, check that the file path matches the `setupFiles` glob (must end in `.test.ts` and live where Vitest's `include` covers).

### 6. Run the test suite

**Verification commands:**

```bash
# Generate a throwaway fixture to sanity-check the generator independently.
docker compose exec app node scripts/generate-synthetic-csv.mjs /tmp/synth.csv 500
# Use python's csv reader (NOT wc -l) — quoted fields can contain newlines.
docker compose exec app python3 -c "
import csv
with open('/tmp/synth.csv', encoding='utf-8', newline='') as f:
    rows = sum(1 for _ in csv.reader(f))
print('rows including header:', rows)
"
# Expected: 501

# Run the streaming-parser unit tests.
docker compose exec app pnpm test csv-parser

# Run the upload integration tests.
docker compose exec app pnpm test upload

# Run the full suite (catches regressions in unrelated tests).
docker compose exec app pnpm test
```

Expected: all tests pass. Integration tests take ~60–90 s total (2 large fixtures × ~30 s each).

## When done

Report:
- Files created (3: `scripts/generate-synthetic-csv.mjs`, `src/server/services/csv-parser.test.ts`, `src/server/services/upload.test.ts`).
- Output of `pnpm test` (last screen — test counts, timings, all green).
- Confirmation that the integration test covers (a) cross-assignment chunking via the many-assignments shape, (b) within-assignment chunking via the single-assignment shape, (c) idempotency via the re-upload test.
- Any issues with test DB isolation or cleanup.

**Commit this phase:**

```bash
git add scripts/generate-synthetic-csv.mjs src/server/services/csv-parser.test.ts src/server/services/upload.test.ts
git commit -m "test(upload): phase 05 - unit + integration tests for upload pipeline"
```
