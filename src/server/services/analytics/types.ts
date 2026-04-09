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

// Hatton & Smith (1995) reflection categories — the primary depth signal.
// See `project_reflection_framework.md` for operational definitions.
export type ReflectionCategory =
  | "DESCRIPTIVE_WRITING"
  | "DESCRIPTIVE_REFLECTION"
  | "DIALOGIC_REFLECTION"
  | "CRITICAL_REFLECTION";

export const ALL_REFLECTION_CATEGORIES: ReflectionCategory[] = [
  "DESCRIPTIVE_WRITING",
  "DESCRIPTIVE_REFLECTION",
  "DIALOGIC_REFLECTION",
  "CRITICAL_REFLECTION",
];

// Per-category distribution (used by engagement + instructional-insights).
export type ReflectionCategoryDistribution = Record<ReflectionCategory, number>;
