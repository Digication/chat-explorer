import { describe, it, expect } from "vitest";
import CourseReportPdf from "../CourseReportPdf";
import type { CourseReport } from "../types";

const MOCK_REPORT: CourseReport = {
  courseName: "CS 101 — Introduction to Computer Science",
  generatedAt: "2026-04-01T00:00:00.000Z",
  overview: {
    totalComments: 120,
    threadCount: 15,
    participantCount: 25,
    toriTagCount: 340,
  },
  toriFrequencies: [
    {
      tagName: "Perspective Shifting",
      domain: "Cognitive-Analytical",
      count: 45,
      percent: 13.24,
    },
    {
      tagName: "Emotional Differentiation",
      domain: "Emotional-Affective",
      count: 30,
      percent: 8.82,
    },
  ],
  categoryDistribution: {
    DESCRIPTIVE_WRITING: 40,
    DESCRIPTIVE_REFLECTION: 35,
    DIALOGIC_REFLECTION: 30,
    CRITICAL_REFLECTION: 15,
  },
  topCoOccurrences: [
    { tags: ["Perspective Shifting", "Pattern Recognition"], count: 12 },
    { tags: ["Emotional Differentiation", "Resilience"], count: 8 },
  ],
};

describe("CourseReportPdf", () => {
  it("renders without crashing with standard data", () => {
    // @react-pdf/renderer components don't produce DOM elements in jsdom,
    // but instantiating them should not throw.
    expect(() => <CourseReportPdf report={MOCK_REPORT} />).not.toThrow();
  });

  it("renders with empty arrays", () => {
    const emptyReport: CourseReport = {
      ...MOCK_REPORT,
      toriFrequencies: [],
      topCoOccurrences: [],
    };
    expect(() => <CourseReportPdf report={emptyReport} />).not.toThrow();
  });

  it("renders with zero overview counts", () => {
    const zeroReport: CourseReport = {
      ...MOCK_REPORT,
      overview: {
        totalComments: 0,
        threadCount: 0,
        participantCount: 0,
        toriTagCount: 0,
      },
      categoryDistribution: {
        DESCRIPTIVE_WRITING: 0,
        DESCRIPTIVE_REFLECTION: 0,
        DIALOGIC_REFLECTION: 0,
        CRITICAL_REFLECTION: 0,
      },
    };
    // Zero totals should not cause divide-by-zero errors
    expect(() => <CourseReportPdf report={zeroReport} />).not.toThrow();
  });

  it("renders with many TORI tags (50+)", () => {
    const manyTags = Array.from({ length: 55 }, (_, i) => ({
      tagName: `Tag ${i + 1}`,
      domain: `Domain ${(i % 6) + 1}`,
      count: 100 - i,
      percent: ((100 - i) / 500) * 100,
    }));
    const bigReport: CourseReport = {
      ...MOCK_REPORT,
      toriFrequencies: manyTags,
    };
    // Should not error even with many rows (page breaks handled by react-pdf)
    expect(() => <CourseReportPdf report={bigReport} />).not.toThrow();
  });
});
