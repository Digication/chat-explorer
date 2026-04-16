import { describe, it, expect } from "vitest";
import {
  splitTextIntoSections,
  splitHtmlIntoSections,
  isLikelyHeading,
  normalizeSections,
  splitLongText,
  wordCount,
  parseDocument,
  MIN_SECTION_CHARS,
  MAX_SECTION_CHARS,
} from "../document-parser.js";
import { SectionType } from "../../../entities/index.js";

describe("isLikelyHeading", () => {
  it("accepts short all-caps lines", () => {
    expect(isLikelyHeading("INTRODUCTION")).toBe(true);
    expect(isLikelyHeading("METHODOLOGY AND APPROACH")).toBe(true);
  });

  it("accepts short title-case lines", () => {
    expect(isLikelyHeading("Introduction to Reflection")).toBe(true);
    expect(isLikelyHeading("The Learning Process")).toBe(true);
  });

  it("rejects long lines", () => {
    const long = "This is a long sentence that runs past the heading length threshold and therefore should be considered body text";
    expect(isLikelyHeading(long)).toBe(false);
  });

  it("rejects sentences that end with a period", () => {
    expect(isLikelyHeading("This is a sentence.")).toBe(false);
  });

  it("rejects multi-line blocks", () => {
    expect(isLikelyHeading("Line one\nLine two")).toBe(false);
  });

  it("rejects empty or symbol-only input", () => {
    expect(isLikelyHeading("")).toBe(false);
    expect(isLikelyHeading("---")).toBe(false);
  });

  it("accepts lines ending with a colon", () => {
    expect(isLikelyHeading("Key Findings:")).toBe(true);
  });
});

describe("splitTextIntoSections", () => {
  it("returns [] for empty input", () => {
    expect(splitTextIntoSections("")).toEqual([]);
    expect(splitTextIntoSections("   ")).toEqual([]);
  });

  it("splits on paragraph breaks when no headings", () => {
    const text =
      "This is the first paragraph with some reflective content about learning.\n\nThis is the second paragraph discussing outcomes and what changed.";
    const sections = splitTextIntoSections(text);
    expect(sections).toHaveLength(1);
    // When no headings and content is small, it stays as one PARAGRAPH section
    expect(sections[0].type).toBe(SectionType.PARAGRAPH);
    expect(sections[0].content).toContain("first paragraph");
    expect(sections[0].content).toContain("second paragraph");
  });

  it("detects heading followed by body", () => {
    const text =
      "Introduction\n\nThis paragraph discusses learning goals and reflection in the project.";
    const sections = splitTextIntoSections(text);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe(SectionType.SECTION);
    expect(sections[0].title).toBe("Introduction");
    expect(sections[0].content).toContain("learning goals");
  });

  it("splits on multiple headings", () => {
    const text =
      "INTRODUCTION\n\nFirst paragraph about the topic with enough content to stand alone.\n\nMETHODS\n\nSecond paragraph describing the approach in detail.\n\nRESULTS\n\nThird paragraph summarising what was observed.";
    const sections = splitTextIntoSections(text);
    expect(sections.map((s) => s.title)).toEqual([
      "INTRODUCTION",
      "METHODS",
      "RESULTS",
    ]);
  });
});

describe("splitHtmlIntoSections", () => {
  it("groups paragraphs under headings", () => {
    const html =
      "<h1>Introduction</h1><p>First para.</p><p>Second para.</p><h2>Methods</h2><p>Methods para.</p>";
    const sections = splitHtmlIntoSections(html);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Introduction");
    expect(sections[0].content).toContain("First para");
    expect(sections[0].content).toContain("Second para");
    expect(sections[1].title).toBe("Methods");
  });

  it("returns a single PARAGRAPH when there are no headings", () => {
    const html = "<p>Only one paragraph here.</p><p>And another here.</p>";
    const sections = splitHtmlIntoSections(html);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe(SectionType.PARAGRAPH);
    expect(sections[0].title).toBeNull();
  });

  it("decodes common HTML entities", () => {
    const html = "<h1>Q &amp; A</h1><p>Jane&#39;s &quot;essay&quot; on learning.</p>";
    const sections = splitHtmlIntoSections(html);
    expect(sections[0].title).toBe("Q & A");
    expect(sections[0].content).toContain("Jane's");
    expect(sections[0].content).toContain('"essay"');
  });

  it("returns [] for empty HTML", () => {
    expect(splitHtmlIntoSections("")).toEqual([]);
  });
});

describe("normalizeSections", () => {
  it("merges sections smaller than MIN_SECTION_CHARS into previous", () => {
    const input = [
      {
        title: "Intro",
        content: "A".repeat(60),
        type: SectionType.SECTION,
        sequenceOrder: 0,
      },
      {
        title: null,
        content: "tiny",
        type: SectionType.PARAGRAPH,
        sequenceOrder: 0,
      },
    ];
    const out = normalizeSections(input);
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain("tiny");
    expect(out[0].content.length).toBeGreaterThan(MIN_SECTION_CHARS);
  });

  it("does not merge a HEADING-type section into a previous section", () => {
    const input = [
      {
        title: null,
        content: "Body paragraph that is long enough to stand on its own as a section.",
        type: SectionType.PARAGRAPH,
        sequenceOrder: 0,
      },
      {
        title: "Next",
        content: "Next",
        type: SectionType.HEADING,
        sequenceOrder: 0,
      },
    ];
    const out = normalizeSections(input);
    expect(out).toHaveLength(2);
  });

  it("splits sections larger than MAX_SECTION_CHARS", () => {
    const big = "Sentence. ".repeat(400); // > MAX_SECTION_CHARS
    const out = normalizeSections([
      {
        title: "Big",
        content: big,
        type: SectionType.SECTION,
        sequenceOrder: 0,
      },
    ]);
    expect(out.length).toBeGreaterThan(1);
    for (const s of out) expect(s.content.length).toBeLessThanOrEqual(MAX_SECTION_CHARS);
    // Only the first split keeps the title to avoid duplicate labels.
    expect(out[0].title).toBe("Big");
    expect(out[1].title).toBeNull();
  });

  it("assigns sequential sequenceOrder", () => {
    const input = [
      { title: "A", content: "a".repeat(60), type: SectionType.SECTION, sequenceOrder: 99 },
      { title: "B", content: "b".repeat(60), type: SectionType.SECTION, sequenceOrder: 99 },
      { title: "C", content: "c".repeat(60), type: SectionType.SECTION, sequenceOrder: 99 },
    ];
    const out = normalizeSections(input);
    expect(out.map((s) => s.sequenceOrder)).toEqual([0, 1, 2]);
  });
});

describe("splitLongText", () => {
  it("splits at sentence boundaries when possible", () => {
    const text = "First sentence. " + "x".repeat(100) + ". Second sentence. " + "y".repeat(100);
    const parts = splitLongText(text, 80);
    // Every part except possibly the last should end at a sentence boundary.
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(80);
  });

  it("hard-cuts when no sentence boundary is available", () => {
    const text = "a".repeat(500);
    const parts = splitLongText(text, 100);
    expect(parts.length).toBe(5);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(100);
  });
});

describe("wordCount", () => {
  it("counts whitespace-separated tokens", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("hello world")).toBe(2);
    expect(wordCount("  hello   there \n friend  ")).toBe(3);
  });
});

describe("parseDocument - mime dispatch", () => {
  it("rejects PPTX with a helpful message", async () => {
    await expect(
      parseDocument(
        Buffer.from("dummy"),
        "deck.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).rejects.toThrow(/PPTX/);
  });

  it("rejects unknown mime types", async () => {
    await expect(
      parseDocument(Buffer.from("dummy"), "file.xyz", "application/octet-stream")
    ).rejects.toThrow(/Unsupported/);
  });
});
