/**
 * Structured report data returned by the server for PDF rendering.
 *
 * This is a client-side duplicate of the interface in
 * src/server/services/export-pdf.ts — keep them in sync.
 */
export interface CourseReport {
  courseName: string;
  generatedAt: string;
  overview: {
    totalComments: number;
    threadCount: number;
    participantCount: number;
    toriTagCount: number;
  };
  toriFrequencies: Array<{
    tagName: string;
    domain: string;
    count: number;
    percent: number;
  }>;
  categoryDistribution: {
    DESCRIPTIVE_WRITING: number;
    DESCRIPTIVE_REFLECTION: number;
    DIALOGIC_REFLECTION: number;
    CRITICAL_REFLECTION: number;
  };
  topCoOccurrences: Array<{
    tags: string[];
    count: number;
  }>;
}
