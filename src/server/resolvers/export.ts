import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../types/context.js";
import { requireAuth, requireCourseAccess } from "./middleware/auth.js";
import { generateCourseReportData } from "../services/export-pdf.js";
import {
  exportRawDataCsv,
  exportToriSummaryCsv,
} from "../services/export-csv.js";

interface ExportScope {
  institutionId: string;
  courseId?: string;
  assignmentId?: string;
  studentIds?: string[];
}

export const exportResolvers = {
  Query: {
    exportStatus: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      // Individual export status tracking is not persisted yet.
      // Return a simple "not found" placeholder.
      return {
        id,
        format: "PDF",
        status: "PENDING",
        downloadUrl: null,
        message: "Export not found.",
        createdAt: new Date().toISOString(),
      };
    },

    myExports: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      // Export history is not persisted yet — return empty list
      return [];
    },
  },

  Mutation: {
    requestExport: async (
      _: unknown,
      { scope, format }: { scope: ExportScope; format: "CSV" | "PDF" },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);

      // Verify the caller has access to the requested course
      if (scope.courseId) {
        await requireCourseAccess(ctx, scope.courseId);
      }

      if (!scope.courseId) {
        throw new GraphQLError(
          "A courseId is required for exports at this time.",
          { extensions: { code: "BAD_USER_INPUT" } }
        );
      }

      if (format === "CSV") {
        const csv = await exportRawDataCsv(
          scope.courseId,
          scope.institutionId,
          scope.assignmentId
        );

        // Return the CSV as a base64 data URL so the client can trigger
        // a browser download without a separate REST endpoint.
        return {
          id: crypto.randomUUID(),
          format: "CSV",
          status: "COMPLETE",
          downloadUrl: `data:text/csv;base64,${Buffer.from(csv).toString("base64")}`,
          message: "Export complete",
          createdAt: new Date().toISOString(),
        };
      }

      // PDF — return structured report data as a JSON data URL.
      // The frontend renders this into a PDF using @react-pdf/renderer.
      const reportData = await generateCourseReportData(scope);
      return {
        id: crypto.randomUUID(),
        format: "PDF",
        status: "COMPLETE",
        downloadUrl: `data:application/json;base64,${Buffer.from(JSON.stringify(reportData)).toString("base64")}`,
        message: "Report data ready",
        createdAt: new Date().toISOString(),
      };
    },
  },
};
