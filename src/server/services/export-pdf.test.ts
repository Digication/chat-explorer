/**
 * Tests for the export-pdf service — generateCourseReportData().
 *
 * Mocks the analytics services (overview, tori, engagement) and the
 * Course repository to test the data aggregation logic without DB.
 *
 * Run with: docker compose exec chat-explorer pnpm test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock analytics services
const mockGetOverview = vi.fn();
const mockGetToriAnalysis = vi.fn();
const mockGetEngagement = vi.fn();

vi.mock("./analytics/overview.js", () => ({
  getOverview: (...args: unknown[]) => mockGetOverview(...args),
}));
vi.mock("./analytics/tori.js", () => ({
  getToriAnalysis: (...args: unknown[]) => mockGetToriAnalysis(...args),
}));
vi.mock("./analytics/engagement.js", () => ({
  getEngagement: (...args: unknown[]) => mockGetEngagement(...args),
}));

// Mock the Course repository
const mockFindOne = vi.fn();
vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: () => ({
      findOne: mockFindOne,
    }),
  },
}));

import { generateCourseReportData } from "./export-pdf.js";

// Default analytics responses
function defaultOverview() {
  return {
    data: {
      totalComments: 100,
      threadCount: 10,
      participantCount: 20,
      toriTagCount: 250,
    },
  };
}

function defaultTori() {
  return {
    data: {
      tagFrequencies: [
        { tagName: "Tag A", domain: "Domain 1", count: 50, percent: 20.0 },
        { tagName: "Tag B", domain: "Domain 2", count: 30, percent: 12.345 },
      ],
      coOccurrencePairs: Array.from({ length: 15 }, (_, i) => ({
        tags: [`Tag ${i}`, `Tag ${i + 1}`],
        count: 15 - i,
      })),
    },
  };
}

function defaultEngagement() {
  return {
    data: {
      categoryDistribution: {
        DESCRIPTIVE_WRITING: 30,
        DESCRIPTIVE_REFLECTION: 25,
        DIALOGIC_REFLECTION: 28,
        CRITICAL_REFLECTION: 17,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOverview.mockResolvedValue(defaultOverview());
  mockGetToriAnalysis.mockResolvedValue(defaultTori());
  mockGetEngagement.mockResolvedValue(defaultEngagement());
  mockFindOne.mockResolvedValue(null);
});

describe("generateCourseReportData", () => {
  it("returns all required CourseReport fields", async () => {
    const report = await generateCourseReportData({
      institutionId: "inst-1",
      courseId: "c1",
    });

    expect(report).toHaveProperty("courseName");
    expect(report).toHaveProperty("generatedAt");
    expect(report).toHaveProperty("overview");
    expect(report).toHaveProperty("toriFrequencies");
    expect(report).toHaveProperty("categoryDistribution");
    expect(report).toHaveProperty("topCoOccurrences");
  });

  it("defaults courseName to 'All Courses' when no courseId", async () => {
    const report = await generateCourseReportData({
      institutionId: "inst-1",
    });
    expect(report.courseName).toBe("All Courses");
  });

  it("uses actual course name when courseId is provided", async () => {
    mockFindOne.mockResolvedValue({ id: "c1", name: "Intro to CS" });
    const report = await generateCourseReportData({
      institutionId: "inst-1",
      courseId: "c1",
    });
    expect(report.courseName).toBe("Intro to CS");
  });

  it("falls back to 'All Courses' when course is not found", async () => {
    mockFindOne.mockResolvedValue(null);
    const report = await generateCourseReportData({
      institutionId: "inst-1",
      courseId: "nonexistent",
    });
    expect(report.courseName).toBe("All Courses");
  });

  it("rounds toriFrequencies percent to 2 decimal places", async () => {
    const report = await generateCourseReportData({
      institutionId: "inst-1",
      courseId: "c1",
    });
    // 12.345 should become 12.35 (Math.round(12.345 * 100) / 100)
    const tagB = report.toriFrequencies.find((f) => f.tagName === "Tag B");
    expect(tagB?.percent).toBe(12.35);
  });

  it("limits topCoOccurrences to 10", async () => {
    const report = await generateCourseReportData({
      institutionId: "inst-1",
      courseId: "c1",
    });
    // defaultTori has 15 co-occurrence pairs; only 10 should come through
    expect(report.topCoOccurrences).toHaveLength(10);
  });

  it("preserves overview counts as-is", async () => {
    const report = await generateCourseReportData({
      institutionId: "inst-1",
      courseId: "c1",
    });
    expect(report.overview.totalComments).toBe(100);
    expect(report.overview.threadCount).toBe(10);
    expect(report.overview.participantCount).toBe(20);
    expect(report.overview.toriTagCount).toBe(250);
  });

  it("preserves categoryDistribution as-is", async () => {
    const report = await generateCourseReportData({
      institutionId: "inst-1",
      courseId: "c1",
    });
    expect(report.categoryDistribution).toEqual({
      DESCRIPTIVE_WRITING: 30,
      DESCRIPTIVE_REFLECTION: 25,
      DIALOGIC_REFLECTION: 28,
      CRITICAL_REFLECTION: 17,
    });
  });

  it("generatedAt is a valid ISO timestamp", async () => {
    const report = await generateCourseReportData({
      institutionId: "inst-1",
      courseId: "c1",
    });
    expect(new Date(report.generatedAt).toISOString()).toBe(
      report.generatedAt
    );
  });
});
