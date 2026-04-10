/**
 * Reflection classifier — labels a single student comment with one of the
 * 4 Hatton & Smith (1995) reflection categories.
 *
 * Backend: Google Gemini, via the project's existing LLM provider abstraction
 * (`src/server/services/llm`). We pick `gemini-2.5-flash` because:
 *  - It's in the project's allowed model catalog (`provider.ts:53-56`).
 *  - It's cheap enough to classify the entire 684-comment backfill for
 *    well under a dollar.
 *  - Quality is more than enough for short student comments.
 *
 * The output is one of:
 *   { category, evidenceQuote, rationale, confidence }
 * — see `ClassificationResult` below. Confidence is recorded for diagnostics
 * but is NEVER shown in the UI per the project's hard "no numerical scores"
 * constraint.
 */

import { getLLMProvider } from "../llm/provider.js";
import { ReflectionCategory } from "../../entities/CommentReflectionClassification.js";
import { GOLDEN_EXAMPLES } from "./golden-examples.js";

// The exact model id from the project catalog. Bump this (and the
// CLASSIFIER_VERSION below) any time you tune the prompt or swap models so
// the backfill script knows to re-classify.
export const CLASSIFIER_MODEL = "gemini-2.5-flash";
export const CLASSIFIER_VERSION = `google/${CLASSIFIER_MODEL}@2026-04-08`;

// Gemini 2.5 Flash uses internal "thinking" tokens that count against
// `maxOutputTokens`. With our first attempt at 400 the model spent most of
// its budget reasoning and then truncated the JSON mid-string, causing ~90%
// of backfill calls to fail. 2048 leaves plenty of room for both reasoning
// and the final structured output (typical JSON output is <200 tokens).
const CLASSIFIER_MAX_TOKENS = 2048;

export interface ClassificationResult {
  category: ReflectionCategory;
  evidenceQuote: string | null;
  rationale: string | null;
  confidence: number | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt construction
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert on Hatton & Smith's (1995) framework for reflective writing in education. You classify short student comments from engineering courses into exactly one of four reflection categories.

The four categories, in increasing order of reflective depth:

1. DESCRIPTIVE_WRITING — Pure narration or summary. Reports what happened or what was read. NOT reflective: contains no rationale, no challenge, no self-talk, no broader connection.

2. DESCRIPTIVE_REFLECTION — Explains rationale or mentions a challenge rooted in the environment or the nature of the work. Often describes iterating, redoing, or putting in extra effort to reach a goal. Still focused on the task, not on the self.

3. DIALOGIC_REFLECTION — Discourse with oneself. Personal history, interests, emotion, recognized lack of skill, desire for expertise, or metacognition (thinking about one's own thinking or learning patterns).

4. CRITICAL_REFLECTION — Connects the topic to broader historical, social, political, or cross-domain contexts beyond the writer. Examples: transferring skills from course to job, from engineering to non-engineering, or to societal issues.

CLASSIFICATION RULES:
- Pick the SINGLE highest category whose definition the comment satisfies. If a comment shows critical reflection, label it CRITICAL_REFLECTION even if it also describes events.
- If unsure between two adjacent categories, pick the LOWER one (more conservative).
- The "evidenceQuote" MUST be a verbatim substring of the input comment, no longer than 200 characters. Choose the phrase that most directly justifies your label. If the entire comment is descriptive narration with no salient anchor, you may return null.
- The "rationale" must be a single sentence (≤ 30 words).
- "confidence" is a float in [0, 1] reflecting how confident you are in the label.

OUTPUT FORMAT — return STRICT JSON only, no prose, no markdown fences:
{
  "category": "DESCRIPTIVE_WRITING" | "DESCRIPTIVE_REFLECTION" | "DIALOGIC_REFLECTION" | "CRITICAL_REFLECTION",
  "evidenceQuote": string | null,
  "rationale": string,
  "confidence": number
}`;

function buildFewShotBlock(): string {
  const lines: string[] = ["EXAMPLES:"];
  for (const ex of GOLDEN_EXAMPLES) {
    lines.push("");
    lines.push(`COMMENT: ${ex.text}`);
    lines.push(
      `OUTPUT: {"category":"${ex.expected}","evidenceQuote":${
        JSON.stringify(firstSubstring(ex.text, 80))
      },"rationale":${JSON.stringify(ex.note)},"confidence":0.9}`
    );
  }
  return lines.join("\n");
}

function firstSubstring(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  // Cut at the last space within maxLen so we don't slice mid-word.
  const slice = trimmed.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
}

function buildUserPrompt(commentText: string): string {
  return `${buildFewShotBlock()}

NOW CLASSIFY THIS COMMENT. Return JSON only.

COMMENT: ${commentText.trim()}
OUTPUT:`;
}

// ────────────────────────────────────────────────────────────────────────────
// Output parsing & validation
// ────────────────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = new Set<string>(Object.values(ReflectionCategory));

export class ClassifierError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message);
    this.name = "ClassifierError";
  }
}

/**
 * Pulls the first {...} JSON object out of a string. Tolerates code-fence
 * wrappers and stray prose around the JSON, which Gemini occasionally adds
 * even when told not to.
 */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  // Strip ```json ... ``` fences if present.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  // Find the first balanced object.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new ClassifierError("No JSON object found in model output", raw);
  }
  const jsonStr = candidate.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new ClassifierError(
      `Failed to parse JSON: ${(e as Error).message}`,
      raw
    );
  }
}

function parseAndValidate(
  raw: string,
  commentText: string
): ClassificationResult {
  const parsed = extractJsonObject(raw) as Record<string, unknown>;

  const category = parsed.category;
  if (typeof category !== "string" || !ALL_CATEGORIES.has(category)) {
    throw new ClassifierError(
      `Invalid category: ${JSON.stringify(category)}`,
      raw
    );
  }

  let evidenceQuote: string | null = null;
  if (typeof parsed.evidenceQuote === "string" && parsed.evidenceQuote.length > 0) {
    const q = parsed.evidenceQuote.trim();
    // Anti-hallucination: the quote must actually appear in the comment.
    // We compare case-insensitively and collapse internal whitespace so we
    // don't reject quotes the model lightly normalized.
    if (containsNormalized(commentText, q)) {
      evidenceQuote = q.length > 200 ? q.slice(0, 200) : q;
    }
    // If it doesn't match, silently drop it — the label is still useful.
  }

  const rationale =
    typeof parsed.rationale === "string" && parsed.rationale.length > 0
      ? parsed.rationale.slice(0, 500)
      : null;

  let confidence: number | null = null;
  if (typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)) {
    confidence = Math.max(0, Math.min(1, parsed.confidence));
  }

  return {
    category: category as ReflectionCategory,
    evidenceQuote,
    rationale,
    confidence,
  };
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsNormalized(haystack: string, needle: string): boolean {
  return normalizeForMatch(haystack).includes(normalizeForMatch(needle));
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface ClassifyOptions {
  // Override the default model. Tests pass `null` provider via dependency
  // injection rather than touching this.
  model?: string;
}

/**
 * Classify a single student comment. Calls Gemini with a strict-JSON prompt
 * and parses the response. On a malformed response we retry exactly once
 * with a stricter "JSON only" reminder; if the retry also fails, we throw
 * `ClassifierError` and let the caller decide what to do (ingest = log+skip,
 * backfill = record-failure-and-continue).
 */
export async function classifyComment(
  commentText: string,
  options: ClassifyOptions = {}
): Promise<ClassificationResult> {
  if (!commentText || commentText.trim().length === 0) {
    throw new ClassifierError("Cannot classify empty text");
  }
  const provider = getLLMProvider("google");
  const model = options.model ?? CLASSIFIER_MODEL;

  const userPrompt = buildUserPrompt(commentText);

  let raw: string;
  try {
    raw = await provider.sendChat(
      [{ role: "user", content: userPrompt }],
      {
        model,
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.1,
        maxTokens: CLASSIFIER_MAX_TOKENS,
      }
    );
  } catch (e) {
    throw new ClassifierError(
      `LLM call failed: ${(e as Error).message}`
    );
  }

  try {
    return parseAndValidate(raw, commentText);
  } catch (firstErr) {
    // One retry with a stricter reminder.
    const retryRaw = await provider.sendChat(
      [
        { role: "user", content: userPrompt },
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            "Your previous response was not valid JSON. Output ONLY a single JSON object matching the schema, no prose, no code fences.",
        },
      ],
      {
        model,
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.0,
        maxTokens: CLASSIFIER_MAX_TOKENS,
      }
    );
    try {
      return parseAndValidate(retryRaw, commentText);
    } catch {
      throw firstErr;
    }
  }
}

// Re-export for convenience.
export { ReflectionCategory };
