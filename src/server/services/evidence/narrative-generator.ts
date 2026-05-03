/**
 * Narrative evidence generator — takes a batch of student comments and
 * produces interpretive narratives with outcome alignments using Gemini.
 *
 * Follows the same patterns as the reflection classifier
 * (`src/server/services/reflection/classifier.ts`): Google LLM provider,
 * strict-JSON prompt, one retry on malformed output, graceful validation
 * that drops bad alignments rather than failing the whole batch.
 */

import { getLLMProvider } from "../llm/provider.js";
import { StrengthLevel } from "../../entities/EvidenceOutcomeLink.js";

// Model config — bump the version string whenever you change the prompt
// or swap models so the pipeline knows to re-process.
export const NARRATIVE_MODEL = "gemini-2.5-flash";
export const NARRATIVE_VERSION = `google/${NARRATIVE_MODEL}@2026-04-08`;
const MAX_TOKENS = 4096;
export const MAX_BATCH_SIZE = 5;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface NarrativeInputComment {
  commentId: string;
  studentId: string;
  text: string;
  threadName: string;
  assignmentDescription: string | null;
  toriTags: string[];
  reflectionCategory: string | null;
}

export interface NarrativeInputOutcome {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface NarrativeInput {
  comments: NarrativeInputComment[];
  outcomes: NarrativeInputOutcome[];
}

export interface OutcomeAlignment {
  outcomeDefinitionId: string;
  strengthLevel: StrengthLevel;
  rationale: string;
}

export interface NarrativeOutput {
  commentId: string;
  narrative: string;
  outcomeAlignments: OutcomeAlignment[];
}

// ────────────────────────────────────────────────────────────────────────────
// Error class
// ────────────────────────────────────────────────────────────────────────────

export class NarrativeError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message);
    this.name = "NarrativeError";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert educational assessment analyst. You generate concise narrative evidence summaries from student comments in higher education courses.

For each student comment, you will:
1. Write a 2–3 sentence interpretive narrative (max 500 characters) that captures what the comment reveals about the student's learning, growth, or competency development. Do NOT just restate the comment — interpret its significance as evidence of learning.
2. Assess alignment to the provided learning outcomes. For each relevant outcome, assign a strength level and a 1-sentence rationale.

STRENGTH LEVELS (pick the highest one the evidence supports):
- EMERGING — The comment hints at awareness of the outcome but shows no concrete demonstration.
- DEVELOPING — The comment shows partial understanding or early application of the outcome.
- DEMONSTRATING — The comment clearly shows competence in the outcome area.
- EXEMPLARY — The comment shows sophisticated, transferable, or metacognitive mastery.

RULES:
- Only align to outcomes where the comment provides genuine evidence. Do NOT force alignments.
- A comment may align to 0–3 outcomes. Most will align to 1–2.
- The "outcomeCode" in your response must exactly match one of the provided outcome codes.
- Return STRICT JSON only — no prose, no markdown fences, no explanation outside the JSON.

OUTPUT FORMAT — return a JSON array:
[
  {
    "commentId": "<id>",
    "narrative": "<2-3 sentence narrative, max 500 chars>",
    "outcomeAlignments": [
      {
        "outcomeCode": "<exact code from the outcomes list>",
        "strengthLevel": "EMERGING" | "DEVELOPING" | "DEMONSTRATING" | "EXEMPLARY",
        "rationale": "<1 sentence>"
      }
    ]
  }
]`;

function buildUserPrompt(input: NarrativeInput): string {
  const outcomesBlock = input.outcomes
    .map((o) => `  - ${o.code}: ${o.name}${o.description ? ` — ${o.description}` : ""}`)
    .join("\n");

  const commentsBlock = input.comments
    .map((c) => {
      const parts = [`COMMENT ID: ${c.commentId}`];
      parts.push(`THREAD: ${c.threadName}`);
      if (c.assignmentDescription) {
        parts.push(`ASSIGNMENT: ${c.assignmentDescription}`);
      }
      if (c.toriTags.length > 0) {
        parts.push(`TORI TAGS: ${c.toriTags.join(", ")}`);
      }
      if (c.reflectionCategory) {
        parts.push(`REFLECTION LEVEL: ${c.reflectionCategory}`);
      }
      parts.push(`TEXT: ${c.text.trim()}`);
      return parts.join("\n");
    })
    .join("\n---\n");

  return `AVAILABLE OUTCOMES:
${outcomesBlock}

COMMENTS TO ANALYZE (${input.comments.length}):
${commentsBlock}

Return a JSON array with one entry per comment. JSON only, no prose.`;
}

// ────────────────────────────────────────────────────────────────────────────
// JSON extraction & validation
// ────────────────────────────────────────────────────────────────────────────

const ALL_STRENGTH_LEVELS = new Set<string>(Object.values(StrengthLevel));

/**
 * Extracts the first JSON array from the LLM response. Tolerates code-fence
 * wrappers and stray prose around the JSON.
 */
function extractJsonArray(raw: string): unknown[] {
  const trimmed = raw.trim();
  // Strip ```json ... ``` fences if present.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  // Find the first balanced array.
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new NarrativeError("No JSON array found in model output", raw);
  }
  const jsonStr = candidate.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      throw new NarrativeError("Parsed JSON is not an array", raw);
    }
    return parsed;
  } catch (e) {
    if (e instanceof NarrativeError) throw e;
    throw new NarrativeError(
      `Failed to parse JSON: ${(e as Error).message}`,
      raw
    );
  }
}

/**
 * Validates and cleans the LLM output. Drops invalid alignments rather than
 * failing the whole batch — a narrative without alignments is still useful.
 */
function parseAndValidateNarratives(
  raw: string,
  input: NarrativeInput
): NarrativeOutput[] {
  const parsed = extractJsonArray(raw);

  // Build code → id map for outcome validation
  const codeToId = new Map<string, string>();
  for (const o of input.outcomes) {
    codeToId.set(o.code, o.id);
  }

  const commentIds = new Set(input.comments.map((c) => c.commentId));
  const results: NarrativeOutput[] = [];

  for (const item of parsed) {
    const obj = item as Record<string, unknown>;

    // Validate commentId
    const commentId = obj.commentId;
    if (typeof commentId !== "string" || !commentIds.has(commentId)) {
      // Skip entries with unknown comment IDs — LLM hallucinated an ID
      continue;
    }

    // Validate narrative
    let narrative = typeof obj.narrative === "string" ? obj.narrative.trim() : "";
    if (!narrative) continue; // Skip if no narrative
    if (narrative.length > 500) {
      narrative = narrative.slice(0, 500);
    }

    // Validate outcome alignments — drop invalid ones
    const rawAlignments = Array.isArray(obj.outcomeAlignments)
      ? obj.outcomeAlignments
      : [];
    const outcomeAlignments: OutcomeAlignment[] = [];

    for (const align of rawAlignments) {
      const a = align as Record<string, unknown>;
      const code = a.outcomeCode;
      if (typeof code !== "string") continue;

      const outcomeDefinitionId = codeToId.get(code);
      if (!outcomeDefinitionId) continue; // Unknown outcome code — drop

      const strength = a.strengthLevel;
      if (typeof strength !== "string" || !ALL_STRENGTH_LEVELS.has(strength)) {
        continue; // Invalid strength level — drop
      }

      const rationale =
        typeof a.rationale === "string" ? a.rationale.slice(0, 500) : "";

      outcomeAlignments.push({
        outcomeDefinitionId,
        strengthLevel: strength as StrengthLevel,
        rationale,
      });
    }

    results.push({ commentId, narrative, outcomeAlignments });
  }

  // Every input comment should have a result. If some are missing, that's
  // a partial success — we return what we got and let the caller decide.
  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface NarrativeOptions {
  model?: string;
}

/**
 * Generate narrative evidence for a batch of comments (max 5). Calls Gemini
 * with a strict-JSON prompt and parses the response. On malformed output
 * we retry once with a stricter prompt; if that also fails we throw.
 */
export async function generateNarrativeBatch(
  input: NarrativeInput,
  options: NarrativeOptions = {}
): Promise<NarrativeOutput[]> {
  if (input.comments.length === 0) {
    return [];
  }
  if (input.comments.length > MAX_BATCH_SIZE) {
    throw new NarrativeError(
      `Batch size ${input.comments.length} exceeds max ${MAX_BATCH_SIZE}`
    );
  }
  if (input.outcomes.length === 0) {
    throw new NarrativeError("No outcomes provided for alignment");
  }

  const provider = getLLMProvider("google");
  const model = options.model ?? NARRATIVE_MODEL;
  const userPrompt = buildUserPrompt(input);

  let raw: string;
  try {
    raw = await provider.sendChat([{ role: "user", content: userPrompt }], {
      model,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.1,
      maxTokens: MAX_TOKENS,
    });
  } catch (e) {
    throw new NarrativeError(`LLM call failed: ${(e as Error).message}`);
  }

  try {
    return parseAndValidateNarratives(raw, input);
  } catch (firstErr) {
    // One retry with a stricter reminder
    const retryRaw = await provider.sendChat(
      [
        { role: "user", content: userPrompt },
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            "Your previous response was not valid JSON. Output ONLY a JSON array matching the schema, no prose, no code fences.",
        },
      ],
      {
        model,
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.0,
        maxTokens: MAX_TOKENS,
      }
    );
    try {
      return parseAndValidateNarratives(retryRaw, input);
    } catch {
      throw firstErr;
    }
  }
}
