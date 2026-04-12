/**
 * Tests for export resolvers — requestExport mutation (CSV + PDF),
 * auth checks, and response shape validation.
 *
 * Run with: docker compose exec chat-explorer pnpm test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportResolvers } from "./export.js";
import type { GraphQLContext } from "../types/context.js";
import { UserRole } from "../entities/User.js";

// Mock the service functions so we don't need a database connection
vi.mock("../services/export-pdf.js", () => ({
  generateCourseReportData: vi.fn().mockResolvedValue({
    courseName: "Test Course",
    generatedAt: "2026-04-01T00:00:00.000Z",
    overview: {
      totalComments: 50,
      threadCount: 5,
      participantCount: 10,
      toriTagCount: 100,
    },
    toriFrequencies: [
      { tagName: "Tag A", domain: "Domain 1", count: 20, percent: 20 },
    ],
    categoryDistribution: {
      DESCRIPTIVE_WRITING: 10,
      DESCRIPTIVE_REFLECTION: 15,
      DIALOGIC_REFLECTION: 12,
      CRITICAL_REFLECTION: 13,
    },
    topCoOccurrences: [{ tags: ["Tag A", "Tag B"], count: 5 }],
  }),
}));

vi.mock("../services/export-csv.js", () => ({
  exportRawDataCsv: vi
    .fn()
    .mockResolvedValue("thread_name,comment_id\nThread 1,c1"),
  exportToriSummaryCsv: vi
    .fn()
    .mockResolvedValue("tag_name,count\nTag A,20"),
}));

// Mock auth middleware — let all calls through by default
vi.mock("./middleware/auth.js", () => ({
  requireAuth: vi.fn((ctx: GraphQLContext) => {
    if (!ctx.user) {
      throw new Error("Not authenticated");
    }
    return ctx.user;
  }),
  requireCourseAccess: vi.fn(),
}));

function makeCtx(
  overrides: Partial<NonNullable<GraphQLContext["user"]>> = {}
): GraphQLContext {
  return {
    user: {
      id: overrides.id ?? "user-1",
      name: overrides.name ?? "Test User",
      email: overrides.email ?? "test@example.com",
      role: overrides.role ?? UserRole.INSTRUCTOR,
      institutionId: overrides.institutionId ?? "inst-1",
      image: null,
    },
  };
}

const noUserCtx: GraphQLContext = { user: null };

describe("export resolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Mutation.requestExport", () => {
    it("rejects unauthenticated requests", async () => {
      await expect(
        exportResolvers.Mutation.requestExport(
          null,
          {
            scope: { institutionId: "inst-1", courseId: "c1" },
            format: "CSV",
          },
          noUserCtx
        )
      ).rejects.toThrow("Not authenticated");
    });

    it("requires a courseId", async () => {
      await expect(
        exportResolvers.Mutation.requestExport(
          null,
          {
            scope: { institutionId: "inst-1" },
            format: "CSV",
          },
          makeCtx()
        )
      ).rejects.toThrow("courseId is required");
    });

    it("returns a CSV data URL for CSV format", async () => {
      const result = await exportResolvers.Mutation.requestExport(
        null,
        {
          scope: { institutionId: "inst-1", courseId: "c1" },
          format: "CSV",
        },
        makeCtx()
      );

      expect(result.format).toBe("CSV");
      expect(result.status).toBe("COMPLETE");
      expect(result.downloadUrl).toMatch(/^data:text\/csv;base64,/);

      // Decode and verify the CSV content is intact
      const base64 = result.downloadUrl.split(",")[1];
      const csv = Buffer.from(base64, "base64").toString("utf-8");
      expect(csv).toContain("thread_name,comment_id");
    });

    it("returns a JSON data URL for PDF format", async () => {
      const result = await exportResolvers.Mutation.requestExport(
        null,
        {
          scope: { institutionId: "inst-1", courseId: "c1" },
          format: "PDF",
        },
        makeCtx()
      );

      expect(result.format).toBe("PDF");
      expect(result.status).toBe("COMPLETE");
      expect(result.downloadUrl).toMatch(/^data:application\/json;base64,/);

      // Decode and verify it's valid CourseReport JSON
      const base64 = result.downloadUrl.split(",")[1];
      const json = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
      expect(json).toHaveProperty("courseName", "Test Course");
      expect(json).toHaveProperty("overview");
      expect(json).toHaveProperty("toriFrequencies");
      expect(json).toHaveProperty("categoryDistribution");
    });

    it("returns a unique id per export", async () => {
      const r1 = await exportResolvers.Mutation.requestExport(
        null,
        {
          scope: { institutionId: "inst-1", courseId: "c1" },
          format: "CSV",
        },
        makeCtx()
      );
      const r2 = await exportResolvers.Mutation.requestExport(
        null,
        {
          scope: { institutionId: "inst-1", courseId: "c1" },
          format: "CSV",
        },
        makeCtx()
      );
      expect(r1.id).not.toBe(r2.id);
    });

    it("includes a createdAt timestamp", async () => {
      const result = await exportResolvers.Mutation.requestExport(
        null,
        {
          scope: { institutionId: "inst-1", courseId: "c1" },
          format: "CSV",
        },
        makeCtx()
      );
      // Should be a valid ISO date string
      expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
    });
  });

  describe("Query.exportStatus", () => {
    it("returns a pending placeholder", async () => {
      const result = await exportResolvers.Query.exportStatus(
        null,
        { id: "some-id" },
        makeCtx()
      );
      expect(result.status).toBe("PENDING");
      expect(result.id).toBe("some-id");
    });
  });

  describe("Query.myExports", () => {
    it("returns an empty list (not persisted yet)", async () => {
      const result = await exportResolvers.Query.myExports(
        null,
        {},
        makeCtx()
      );
      expect(result).toEqual([]);
    });
  });
});
