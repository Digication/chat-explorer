import { AppDataSource } from "../data-source.js";
import { ToriTag } from "../entities/ToriTag.js";

let cachedToriTags: ToriTag[] | null = null;

async function getToriTags(): Promise<ToriTag[]> {
  if (cachedToriTags) return cachedToriTags;
  const repo = AppDataSource.getRepository(ToriTag);
  cachedToriTags = await repo.find();
  return cachedToriTags;
}

export function resetToriCache(): void {
  cachedToriTags = null;
}

const EXPLICIT_TORI_REGEX = /\(TORI:\s*([^)]+)\)/gi;

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

export async function extractToriTags(
  aiResponseText: string
): Promise<ExtractedTori[]> {
  const allTags = await getToriTags();
  const found = new Map<string, ExtractedTori>();

  // Strategy 1: Explicit (TORI: ...) format
  let match: RegExpExecArray | null;
  // Reset lastIndex for global regex
  EXPLICIT_TORI_REGEX.lastIndex = 0;
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

export interface ToriAssociation {
  studentCommentId: string;
  toriTagId: string;
  sourceCommentId: string;
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
  // A thread can have several assistant replies after the same student
  // message — if two of them mention the same TORI tag, we'd emit the
  // same (studentCommentId, toriTagId) pair twice, and the unique index
  // on comment_tori_tag would reject the second insert. Dedupe here.
  const seen = new Set<string>();

  for (const comment of sorted) {
    if (comment.role !== "ASSISTANT") continue;

    const precedingStudent = sorted
      .filter((c) => c.role === "USER" && c.orderIndex < comment.orderIndex)
      .pop();

    if (!precedingStudent) continue;
    if (isDoneMessage(precedingStudent.text)) continue;

    const extracted = await extractToriTags(comment.text);

    for (const tag of extracted) {
      const key = `${precedingStudent.id}\0${tag.toriTagId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      associations.push({
        studentCommentId: precedingStudent.id,
        toriTagId: tag.toriTagId,
        sourceCommentId: comment.externalId,
      });
    }
  }

  return associations;
}
