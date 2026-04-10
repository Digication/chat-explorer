/**
 * Shared constants for the 4 Hatton & Smith (1995) reflection categories.
 * Used by all UI components that display reflection depth. Colors approved
 * by the user (2026-04-09): gray / blue / purple / amber.
 */

export type ReflectionCategory =
  | "DESCRIPTIVE_WRITING"
  | "DESCRIPTIVE_REFLECTION"
  | "DIALOGIC_REFLECTION"
  | "CRITICAL_REFLECTION";

export const CATEGORY_CONFIG: {
  key: ReflectionCategory;
  label: string;
  color: string;
  shortLabel: string;
}[] = [
  {
    key: "DESCRIPTIVE_WRITING",
    label: "Descriptive Writing",
    color: "#9e9e9e",    // gray
    shortLabel: "Descriptive",
  },
  {
    key: "DESCRIPTIVE_REFLECTION",
    label: "Descriptive Reflection",
    color: "#42a5f5",    // blue
    shortLabel: "Desc. Reflection",
  },
  {
    key: "DIALOGIC_REFLECTION",
    label: "Dialogic Reflection",
    color: "#ab47bc",    // purple
    shortLabel: "Dialogic",
  },
  {
    key: "CRITICAL_REFLECTION",
    label: "Critical Reflection",
    color: "#ffa726",    // amber
    shortLabel: "Critical",
  },
];

export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  CATEGORY_CONFIG.map((c) => [c.key, c.color])
);

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_CONFIG.map((c) => [c.key, c.label])
);
