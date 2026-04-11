import { pdf } from "@react-pdf/renderer";
import CourseReportPdf from "./CourseReportPdf";
import type { CourseReport } from "./types";

/**
 * Renders a CourseReport into a PDF Blob using @react-pdf/renderer.
 *
 * This is the single entry point for client-side PDF generation.
 * Call it imperatively (e.g. on button click) and use the returned
 * Blob to trigger a browser download.
 */
export async function renderCourseReportPdf(
  report: CourseReport
): Promise<Blob> {
  const blob = await pdf(<CourseReportPdf report={report} />).toBlob();
  return blob;
}
