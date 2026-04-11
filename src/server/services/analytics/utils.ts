import type { ReflectionCategory } from "./types.js";

const DEFAULT_CATEGORY: ReflectionCategory = "DESCRIPTIVE_WRITING";

// Ordered from lowest to highest reflective depth.
// Ties break toward higher depth (later in this array wins).
const CATEGORY_ORDER: ReflectionCategory[] = [
  "DESCRIPTIVE_WRITING",
  "DESCRIPTIVE_REFLECTION",
  "DIALOGIC_REFLECTION",
  "CRITICAL_REFLECTION",
];

/**
 * Returns the most common category from a list. Ties break toward
 * higher reflective depth (critical > dialogic > descriptive reflection > descriptive writing).
 */
export function modalOf(categories: ReflectionCategory[]): ReflectionCategory {
  if (categories.length === 0) return DEFAULT_CATEGORY;
  const counts = new Map<ReflectionCategory, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: ReflectionCategory = DEFAULT_CATEGORY;
  let bestCount = -1;
  for (const cat of CATEGORY_ORDER) {
    const n = counts.get(cat) ?? 0;
    if (n >= bestCount) {
      best = cat;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Returns an empty category distribution (all zeros).
 */
export function emptyCategoryDistribution(): Record<ReflectionCategory, number> {
  return {
    DESCRIPTIVE_WRITING: 0,
    DESCRIPTIVE_REFLECTION: 0,
    DIALOGIC_REFLECTION: 0,
    CRITICAL_REFLECTION: 0,
  };
}
