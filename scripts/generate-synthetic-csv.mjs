#!/usr/bin/env node
// Generates a synthetic CSV fixture for upload tests.
//
// Usage:
//   node scripts/generate-synthetic-csv.mjs <outPath> [rowCount] [bigTextChars] [shape]
//
// Defaults: rowCount=10000, bigTextChars=10000 (10 KB per comment for every
// 50th row, to simulate a student pasting a paper into chat).
//
// shape: "many-assignments" (default) or "single-assignment"
//   many-assignments  → 10 assignments × 50 threads each (exercises cross-assignment chunking)
//   single-assignment → 1 assignment × many threads (exercises within-assignment / 8k-student case)
//
// Shape matches the real Digication AI chat report CSV so the parser and
// uploader are exercised with realistic headers.

import { writeFile } from "node:fs/promises";

const outPath = process.argv[2];
if (!outPath) {
  console.error("usage: generate-synthetic-csv.mjs <outPath> [rowCount] [bigTextChars] [shape]");
  process.exit(1);
}
const rowCount = Number(process.argv[3] ?? 10000);
const bigTextChars = Number(process.argv[4] ?? 10000);

// After the existing arg parsing:
const shape = process.argv[5] || "many-assignments"; // or "single-assignment"
// commentOffset and entityOffset allow callers to shift ID ranges so that two
// fixtures generated with different shapes don't share external IDs when they
// are imported into the same institution (which dedup checks institution-wide).
const commentOffset = Number(process.argv[6] ?? 0);
const entityOffset = Number(process.argv[7] ?? 0);

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

// Replace the existing constants with shape-based values:
const ASSIGNMENT_COUNT = shape === "single-assignment" ? 1 : 10;
const THREADS_PER_ASSIGNMENT = shape === "single-assignment"
  ? Math.ceil(rowCount / 20) // 1 thread per student, ~20 comments each
  : 50;
const COMMENTS_PER_THREAD = Math.ceil(rowCount / (ASSIGNMENT_COUNT * THREADS_PER_ASSIGNMENT));

const bigText = "This is a student essay paragraph. ".repeat(
  Math.ceil(bigTextChars / 35)
).slice(0, bigTextChars);

const submissionUrlBase = "https://example.digication.com/app/c/test-course/!/assessment/";

const lines = [HEADERS.map(csvEscape).join(",")];
let commentCounter = 0;

for (let a = 1; a <= ASSIGNMENT_COUNT; a++) {
  const assignmentId = String(20000 + entityOffset + a);
  const courseId = String(3000 + entityOffset + a);
  for (let t = 1; t <= THREADS_PER_ASSIGNMENT; t++) {
    const threadId = String((entityOffset + a) * 1000 + t);
    const studentSysId = String(4000000 + entityOffset + t);
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
        "Comment ID": String(1_000_000 + commentOffset + commentCounter),
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
