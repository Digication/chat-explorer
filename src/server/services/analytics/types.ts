// The scope narrows what data an analytics function operates on.
export interface AnalyticsScope {
  institutionId: string;
  courseId?: string;
  assignmentId?: string;
  studentIds?: string[];
}

// Wrapper so callers know how many students were included/excluded.
export interface AnalyticsResult<T> {
  data: T;
  meta: {
    scope: AnalyticsScope;
    consentedStudentCount: number;
    excludedStudentCount: number;
    computedAt: Date;
    cached: boolean;
  };
}

// Heatmap visual modes
export type HeatmapMode = "CLASSIC";

// How color/size intensity is calculated
export type ScalingMode = "RAW" | "ROW" | "GLOBAL";

// Engagement depth bands
export type DepthBand = "SURFACE" | "DEVELOPING" | "DEEP";
