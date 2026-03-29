import type { AnalyticsScope, AnalyticsResult } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";

// Configurable word lists for signal detection
const HEDGING_PHRASES = [
  "i think",
  "maybe",
  "perhaps",
  "might",
  "it seems",
  "possibly",
  "i guess",
  "sort of",
  "kind of",
];

const EVIDENCE_PHRASES = [
  "for example",
  "such as",
  "according to",
  "research shows",
  "data suggests",
  "studies indicate",
];

const LOGICAL_CONNECTORS = [
  "because",
  "therefore",
  "however",
  "although",
  "furthermore",
  "consequently",
  "in contrast",
];

export interface CommentSignals {
  commentId: string;
  studentId: string | null;
  questionCount: number;
  avgSentenceLength: number;
  lexicalDiversity: number;
  hedgingCount: number;
  specificityCount: number;
  evidenceCount: number;
  logicalConnectorCount: number;
}

export interface AggregateStats {
  mean: number;
  median: number;
  stddev: number;
}

export interface TextSignals {
  perComment: CommentSignals[];
  aggregates: {
    questionCount: AggregateStats;
    avgSentenceLength: AggregateStats;
    lexicalDiversity: AggregateStats;
    hedgingCount: AggregateStats;
    specificityCount: AggregateStats;
    evidenceCount: AggregateStats;
    logicalConnectorCount: AggregateStats;
  };
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countPhraseOccurrences(text: string, phrases: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const phrase of phrases) {
    let idx = 0;
    while ((idx = lower.indexOf(phrase, idx)) !== -1) {
      count++;
      idx += phrase.length;
    }
  }
  return count;
}

function computeSignals(
  commentId: string,
  studentId: string | null,
  text: string
): CommentSignals {
  const sentences = splitSentences(text);
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const uniqueWords = new Set(words);

  // Questions: count sentences ending with ?
  const questionCount = (text.match(/\?/g) ?? []).length;

  // Average sentence length in words
  const sentenceLengths = sentences.map(countWords);
  const avgSentenceLength =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
      : 0;

  // Lexical diversity (type-token ratio)
  const lexicalDiversity = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Phrase counts
  const hedgingCount = countPhraseOccurrences(text, HEDGING_PHRASES);
  const evidenceCount = countPhraseOccurrences(text, EVIDENCE_PHRASES);
  const logicalConnectorCount = countPhraseOccurrences(text, LOGICAL_CONNECTORS);

  // Specificity: numbers, quoted text, proper nouns (capitalized words mid-sentence)
  const numberMatches = text.match(/\b\d+(\.\d+)?\b/g) ?? [];
  const quoteMatches = text.match(/"[^"]+"/g) ?? [];
  const specificityCount = numberMatches.length + quoteMatches.length;

  return {
    commentId,
    studentId,
    questionCount,
    avgSentenceLength,
    lexicalDiversity,
    hedgingCount,
    specificityCount,
    evidenceCount,
    logicalConnectorCount,
  };
}

function calcStats(values: number[]): AggregateStats {
  if (values.length === 0) return { mean: 0, median: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  return { mean, median, stddev };
}

export async function getTextSignals(
  scope: AnalyticsScope
): Promise<AnalyticsResult<TextSignals>> {
  const cacheKey = `textSignals:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);
  const userComments = resolved.comments.filter((c) => c.role === "USER");

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    const perComment = userComments.map((c) =>
      computeSignals(c.id, c.studentId, c.text)
    );

    const aggregates = {
      questionCount: calcStats(perComment.map((c) => c.questionCount)),
      avgSentenceLength: calcStats(perComment.map((c) => c.avgSentenceLength)),
      lexicalDiversity: calcStats(perComment.map((c) => c.lexicalDiversity)),
      hedgingCount: calcStats(perComment.map((c) => c.hedgingCount)),
      specificityCount: calcStats(perComment.map((c) => c.specificityCount)),
      evidenceCount: calcStats(perComment.map((c) => c.evidenceCount)),
      logicalConnectorCount: calcStats(
        perComment.map((c) => c.logicalConnectorCount)
      ),
    };

    return { perComment, aggregates };
  });

  return {
    data,
    meta: {
      scope,
      consentedStudentCount: resolved.consentedStudentIds.length,
      excludedStudentCount: resolved.excludedCount,
      computedAt: new Date(),
      cached,
    },
  };
}
