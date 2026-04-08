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
  // Explicit role label per comment: "ASSISTANT" or "USER"
  commentRole: string;
  // Legacy alias — older CSVs may use "Comment Author Type" instead
  commentAuthorType: string;
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
  // Course columns (new in 2026-04 CSV format)
  courseId: string;
  courseName: string;
  courseUrl: string;
  courseStartDate: string;
  courseEndDate: string;
  courseNumber: string;
  courseSyncId: string;
  courseFaculty: string;
  // Assignment creator columns (new)
  assignmentCreatorSyncId: string;
  assignmentCreatorFirstName: string;
  assignmentCreatorLastName: string;
  assignmentCreatorEmail: string;
  // AI assistant creator columns (new)
  aiAssistantCreatorSystemId: string;
  aiAssistantCreatorSyncId: string;
  aiAssistantCreatorFirstName: string;
  aiAssistantCreatorLastName: string;
  aiAssistantCreatorEmail: string;
}

function normalizeHeader(header: string): string {
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
    // Explicit role column (new CSV format)
    "comment role": "commentRole",
    // Legacy alias
    "comment author type": "commentAuthorType",
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
    // Course columns
    "course id": "courseId",
    "course name": "courseName",
    "course url": "courseUrl",
    "course start date": "courseStartDate",
    "course end date": "courseEndDate",
    "course number": "courseNumber",
    "course sync id": "courseSyncId",
    "course faculty": "courseFaculty",
    // Assignment creator columns
    "assignment creator sync id": "assignmentCreatorSyncId",
    "assignment creator first name": "assignmentCreatorFirstName",
    "assignment creator last name": "assignmentCreatorLastName",
    "assignment creator email": "assignmentCreatorEmail",
    // AI assistant creator columns
    "ai assistant creator system id": "aiAssistantCreatorSystemId",
    "ai assistant creator sync id": "aiAssistantCreatorSyncId",
    "ai assistant creator first name": "aiAssistantCreatorFirstName",
    "ai assistant creator last name": "aiAssistantCreatorLastName",
    "ai assistant creator email": "aiAssistantCreatorEmail",
  };

  const normalized = header.trim().toLowerCase();
  return headerMap[normalized] ?? normalized;
}

/**
 * Converts HTML entities back to their normal characters.
 * CSV exports from some systems encode special characters as HTML entities
 * (e.g. apostrophes become &#39; or &apos;). This reverses that encoding
 * so text displays correctly in the app.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Decodes a CSV buffer to a string, handling both UTF-8 and Windows-1252.
 *
 * Why: many CSV exports (especially those that have round-tripped through
 * Excel) are Windows-1252 encoded, not UTF-8. If we hand a Windows-1252
 * buffer to csv-parse and let it assume UTF-8, characters like the curly
 * apostrophe (byte 0x92) become U+FFFD replacement characters — which
 * render as a diamond-question-mark and can never be recovered.
 *
 * Strategy: try strict UTF-8 first; if it throws, fall back to Windows-1252.
 * Also strips a UTF-8 BOM if present so it doesn't end up in the first header.
 */
function decodeCsvBuffer(buffer: Buffer): string {
  const noBom =
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
      ? buffer.subarray(3)
      : buffer;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(noBom);
  } catch {
    return new TextDecoder("windows-1252").decode(noBom);
  }
}

export function parseCsvBuffer(buffer: Buffer): RawCsvRow[] {
  const text = decodeCsvBuffer(buffer);
  const records = parse(text, {
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as RawCsvRow[];

  return records.filter((row) => row.commentId?.trim());
}
