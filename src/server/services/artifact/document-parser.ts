/**
 * Document parser — turns a PDF or DOCX buffer into structured sections
 * for the evidence pipeline.
 *
 * Design notes:
 * - Pure parsing: no DB access, no I/O beyond the libraries below.
 * - Section splitting is rule-based and intentionally conservative. The
 *   worst-case fallback (paragraph split) always works; heading detection
 *   is a nice-to-have that fires when the input is clean enough.
 * - PPTX is out of scope for Phase 3 — we reject it with a helpful error.
 */

import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";
import { SectionType } from "../../entities/index.js";

export interface ParsedSection {
  title: string | null;
  content: string;
  type: SectionType;
  sequenceOrder: number;
}

export interface ParsedDocument {
  title: string;
  sections: ParsedSection[];
}

export const MIME_PDF = "application/pdf";
export const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MIME_PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const MIN_SECTION_CHARS = 50;
export const MAX_SECTION_CHARS = 2000;

/**
 * Main entry point. Pick a parser based on mime type, then normalize the
 * resulting sections (merge tiny sections, split huge ones, assign order).
 */
export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParsedDocument> {
  if (mimeType === MIME_PPTX) {
    throw new Error(
      "PPTX files are not yet supported. Please export the deck as a PDF and upload that instead."
    );
  }

  let raw: { title: string | null; sections: ParsedSection[] };
  if (mimeType === MIME_PDF) {
    raw = await parsePdf(buffer);
  } else if (mimeType === MIME_DOCX) {
    raw = await parseDocx(buffer);
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const normalized = normalizeSections(raw.sections);
  const title =
    raw.title?.trim() ||
    normalized.find((s) => s.type === SectionType.HEADING)?.title ||
    stripExtension(filename);

  return { title, sections: normalized };
}

// ── PDF ───────────────────────────────────────────────────────────────────

/**
 * PDF parsing: pdf-parse → plain text → heuristic heading detection.
 * We never trust PDF structure — we just look at the text.
 */
async function parsePdf(buffer: Buffer): Promise<{
  title: string | null;
  sections: ParsedSection[];
}> {
  // pdf-parse mutates the input — clone the bytes to avoid surprises.
  const data = new Uint8Array(buffer);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const text = result.text ?? "";
    const sections = splitTextIntoSections(text);
    const title = sections.find((s) => s.type === SectionType.HEADING)?.title ?? null;
    return { title, sections };
  } finally {
    await parser.destroy();
  }
}

// ── DOCX ──────────────────────────────────────────────────────────────────

/**
 * DOCX parsing: mammoth.convertToHtml → walk the HTML to group paragraphs
 * under headings. Mammoth maps Word heading styles to <h1>..<h6>, which is
 * the signal we rely on.
 */
async function parseDocx(buffer: Buffer): Promise<{
  title: string | null;
  sections: ParsedSection[];
}> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const sections = splitHtmlIntoSections(html);
  const title = sections.find((s) => s.type === SectionType.HEADING)?.title ?? null;
  return { title, sections };
}

/**
 * Walk mammoth's HTML output sequentially: each <h1..h6> starts a new
 * section whose content is accumulated from the paragraphs that follow,
 * until the next heading.
 *
 * Exported for unit tests.
 */
export function splitHtmlIntoSections(html: string): ParsedSection[] {
  // Mammoth emits a flat stream of <h1..h6>, <p>, <ul>/<ol> elements.
  // We use a simple tag-aware splitter — no need for a DOM library.
  const blockRegex = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  type Block = { tag: string; text: string };
  const blocks: Block[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const text = stripHtml(match[2]).trim();
    if (text) blocks.push({ tag, text });
  }

  if (blocks.length === 0) return [];

  const sections: ParsedSection[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n\n").trim();
    if (!content && !currentHeading) return;
    // Emit a HEADING section when we have a heading but empty body,
    // otherwise emit the body as a SECTION with the heading as title.
    if (content) {
      sections.push({
        title: currentHeading,
        content,
        type: currentHeading ? SectionType.SECTION : SectionType.PARAGRAPH,
        sequenceOrder: 0,
      });
    } else if (currentHeading) {
      sections.push({
        title: currentHeading,
        content: currentHeading,
        type: SectionType.HEADING,
        sequenceOrder: 0,
      });
    }
    buffer = [];
  };

  for (const block of blocks) {
    if (/^h[1-6]$/.test(block.tag)) {
      flush();
      currentHeading = block.text;
    } else {
      buffer.push(block.text);
    }
  }
  flush();

  return sections;
}

/** Strip tags, decode the handful of entities mammoth actually emits. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ── PDF / plain-text section splitting ────────────────────────────────────

/**
 * For PDF (and any text-only input), split on paragraph breaks. A line
 * is treated as a heading if it is short, mostly uppercase / title case,
 * and sits on its own line.
 *
 * Exported for unit tests.
 */
export function splitTextIntoSections(text: string): ParsedSection[] {
  if (!text || !text.trim()) return [];

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\r/g, "").trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const sections: ParsedSection[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n\n").trim();
    if (!content) {
      if (currentHeading) {
        sections.push({
          title: currentHeading,
          content: currentHeading,
          type: SectionType.HEADING,
          sequenceOrder: 0,
        });
      }
      return;
    }
    sections.push({
      title: currentHeading,
      content,
      type: currentHeading ? SectionType.SECTION : SectionType.PARAGRAPH,
      sequenceOrder: 0,
    });
    buffer = [];
  };

  for (const para of paragraphs) {
    if (isLikelyHeading(para)) {
      flush();
      currentHeading = para.replace(/\s+/g, " ").trim();
    } else {
      buffer.push(para);
    }
  }
  flush();

  return sections;
}

/**
 * Heuristic heading detection for plain text. A heading is usually:
 *   - short (< 80 chars)
 *   - single line (no internal newlines)
 *   - either all-caps OR title-case (each major word capitalized)
 *   - does not end in a sentence-terminating punctuation beyond ':'
 *
 * False positives are tolerable — worst case the heading becomes a tiny
 * section that gets merged into the next one during normalization.
 *
 * Exported for unit tests.
 */
export function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  if (trimmed.includes("\n")) return false;
  if (/[.!?]$/.test(trimmed) && !trimmed.endsWith("...")) return false;

  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;

  const upperLetters = letters.replace(/[^A-Z]/g, "");
  const upperRatio = upperLetters.length / letters.length;
  if (upperRatio > 0.7) return true; // ALL CAPS-ish

  // Title case: each major word starts with a capital. Conventional English
  // title case lowercases short articles/prepositions/conjunctions, so we
  // exclude those from the denominator — otherwise "Introduction to
  // Reflection" (2/3 capitalized) would fail a naive threshold check.
  const stopWords = new Set([
    "a", "an", "and", "as", "at", "but", "by", "for", "if", "in",
    "nor", "of", "on", "or", "so", "the", "to", "up", "yet",
  ]);
  const words = trimmed.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length > 0 && words.length <= 10) {
    const major = words.filter((w) => !stopWords.has(w.toLowerCase()));
    const denominator = major.length || words.length;
    const capitalized = major.filter((w) => /^[A-Z]/.test(w)).length;
    if (capitalized / denominator >= 0.75) return true;
  }

  return false;
}

// ── Normalization ─────────────────────────────────────────────────────────

/**
 * Post-process raw sections to honour size constraints and assign
 * sequenceOrder. Exported for unit tests.
 */
export function normalizeSections(sections: ParsedSection[]): ParsedSection[] {
  // First pass: merge small sections into the previous one.
  const merged: ParsedSection[] = [];
  for (const section of sections) {
    const last = merged[merged.length - 1];
    if (
      last &&
      section.content.length < MIN_SECTION_CHARS &&
      section.type !== SectionType.HEADING
    ) {
      last.content = `${last.content}\n\n${section.content}`.trim();
      continue;
    }
    merged.push({ ...section });
  }

  // Second pass: split oversized sections on sentence boundaries.
  const split: ParsedSection[] = [];
  for (const section of merged) {
    if (section.content.length <= MAX_SECTION_CHARS) {
      split.push(section);
      continue;
    }
    const parts = splitLongText(section.content, MAX_SECTION_CHARS);
    parts.forEach((part, i) => {
      split.push({
        title: i === 0 ? section.title : null,
        content: part,
        type: section.type,
        sequenceOrder: 0,
      });
    });
  }

  // Third pass: assign sequential order.
  return split.map((s, i) => ({ ...s, sequenceOrder: i }));
}

/**
 * Break a long string into chunks of at most `max` chars, preferring
 * sentence boundaries (., !, ?) near the limit. Exported for tests.
 */
export function splitLongText(content: string, max: number): string[] {
  const parts: string[] = [];
  let remaining = content;
  while (remaining.length > max) {
    // Find the last sentence terminator within the window.
    const window = remaining.slice(0, max);
    const sentenceEnd = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("\n\n")
    );
    const cut = sentenceEnd > max / 2 ? sentenceEnd + 1 : max;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^./\\]+$/, "").trim() || filename;
}
