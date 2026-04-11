import { describe, it, expect } from "vitest";
import { renderCourseReportPdf } from "../renderPdfBlob";
import type { CourseReport } from "../types";

const MOCK_REPORT: CourseReport = {
  courseName: "CS 101",
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
  ],
  categoryDistribution: {
    DESCRIPTIVE_WRITING: 40,
    DESCRIPTIVE_REFLECTION: 35,
    DIALOGIC_REFLECTION: 30,
    CRITICAL_REFLECTION: 15,
  },
  topCoOccurrences: [
    { tags: ["Perspective Shifting", "Pattern Recognition"], count: 12 },
  ],
};

describe("renderCourseReportPdf", () => {
  it("produces a PDF blob with correct MIME type", async () => {
    const blob = await renderCourseReportPdf(MOCK_REPORT);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  }, 15_000); // PDF rendering can be slow in test environments

  it("handles empty report data without error", async () => {
    const emptyReport: CourseReport = {
      ...MOCK_REPORT,
      toriFrequencies: [],
      topCoOccurrences: [],
    };
    const blob = await renderCourseReportPdf(emptyReport);
    expect(blob.size).toBeGreaterThan(0);
  }, 15_000);
});
