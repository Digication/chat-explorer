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
  // Future column: explicitly signals "student" vs "ai_assistant" per comment.
  // When present, this takes priority over all other role-detection heuristics.
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
    // Future column — will explicitly label each comment's author type
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
  };

  const normalized = header.trim().toLowerCase();
  return headerMap[normalized] ?? normalized;
}

export function parseCsvBuffer(buffer: Buffer): RawCsvRow[] {
  const records = parse(buffer, {
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as RawCsvRow[];

  return records.filter((row) => row.commentId?.trim());
}
