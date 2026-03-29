# Phase 07 — Analytics Engine & Cache

## Context

Phases 01-06 established the project scaffold, Docker environment, database schema (Institution, Course, Assignment, Thread, Student, Comment, ToriTag, CommentToriTag, StudentConsent, CourseAccess), authentication with role-based access, CSV upload with TORI tag extraction, and consent management. The consent service provides filtering functions that exclude opted-out students from any data retrieval. This phase builds the analytics engine that powers every visualization and report in the application, along with a caching layer to keep expensive computations fast.

## Goal

Build a consent-aware, scope-aware analytics engine with 10 modules covering overview stats, TORI analysis, text signals, engagement scoring, heatmaps, clustering, network graphs, instructional insights, smart recommendations, and result caching. Every analytics function respects consent filtering and can operate at multiple scopes (assignment, course, cross-course, institution).

## Implementation

### 1. Analytics Scope & Consent Integration

All analytics functions accept a common scope parameter and apply consent filtering before any computation.

**Create `src/server/services/analytics/types.ts`**

Define shared types used across all analytics modules:

```ts
// The scope narrows what data the analytics function operates on.
// At minimum, institutionId is required. Adding courseId narrows to one course,
// adding assignmentId narrows to one assignment, and studentIds filters to
// specific students within that scope.
export interface AnalyticsScope {
  institutionId: string;
  courseId?: string;
  assignmentId?: string;
  studentIds?: string[]; // optional further filtering
}

// Every analytics function returns this wrapper so callers know
// how many students were included vs excluded by consent.
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

// Heatmap supports three visual modes to start (not seven).
export type HeatmapMode = 'CLASSIC' | 'CLUSTERED' | 'DOT';

// Scaling controls how color/size intensity is calculated.
export type ScalingMode = 'RAW' | 'ROW' | 'GLOBAL';

// Engagement depth bands used for scoring.
export type DepthBand = 'SURFACE' | 'DEVELOPING' | 'DEEP';
```

**Create `src/server/services/analytics/scope.ts`**

Shared helper that resolves a scope into a filtered set of student IDs and comments:

- Accept an `AnalyticsScope` and the consent service.
- Call the consent service to get the list of consented student IDs within the scope.
- Query comments filtered to the scope (institution, course, assignment) and only for consented students.
- Return `{ consentedStudentIds, excludedCount, comments, threads }`.
- All other analytics modules call this function first rather than querying the database directly.

### 2. Overview Module

**Create `src/server/services/analytics/overview.ts`**

Computes summary statistics for the given scope:

- **Inputs**: `AnalyticsScope`, consent service, database connection.
- **Outputs**: `AnalyticsResult<OverviewStats>` where `OverviewStats` contains:
  - `totalComments` — count of all comments in scope.
  - `userComments` — count of comments with role = 'user'.
  - `assistantComments` — count of comments with role = 'assistant'.
  - `systemComments` — count of comments with role = 'system'.
  - `threadCount` — number of distinct threads.
  - `participantCount` — number of distinct consented students.
  - `wordCountStats` — min, max, mean, median word counts across user comments.
  - `toriTagCount` — total number of TORI tag applications.
  - `dateRange` — earliest and latest comment timestamps.
- Use the scope helper from step 1 to get filtered data.
- All counts exclude non-consented students.

### 3. TORI Analysis Module

**Create `src/server/services/analytics/tori.ts`**

Analyzes TORI tag usage patterns:

- **Tag frequency**: Count of each TORI tag across all consented comments in scope. Return as `Array<{ tag: string; count: number; percent: number }>`.
- **Student coverage**: For each tag, how many distinct students used it. Return as `Array<{ tag: string; studentCount: number; coveragePercent: number }>`.
- **Co-occurrence**: Find pairs, triples, and quadruples of tags that appear together on the same comment. Return sorted by frequency descending. Limit triples to top 20, quadruples to top 10.
- **Cross-course comparison**: When scope includes multiple courses (courseId is omitted, or multiple courseIds provided), break down tag frequencies per course for side-by-side comparison. Return as `Map<courseId, TagFrequency[]>`.

### 4. Text Signals Module

**Create `src/server/services/analytics/text-signals.ts`**

Extracts linguistic features from comment text. Operates on user comments only (not assistant/system):

- **Question count**: Count sentences ending in `?` per comment.
- **Sentence length**: Average words per sentence per comment.
- **Lexical diversity**: Type-token ratio (unique words / total words) per comment.
- **Hedging count**: Count of hedging phrases ("I think", "maybe", "perhaps", "might", "it seems", "possibly", "I guess", "sort of", "kind of"). Use a configurable word list.
- **Specificity count**: Count of specific references (numbers, proper nouns, citations, quoted text).
- **Evidence count**: Count of evidence phrases ("for example", "such as", "according to", "research shows", "data suggests", "studies indicate").
- **Logical connector count**: Count of connectors ("because", "therefore", "however", "although", "furthermore", "consequently", "in contrast").
- Return per-comment signal arrays plus aggregate stats (mean, median, stddev for each signal across the scope).

### 5. Engagement Module

**Create `src/server/services/analytics/engagement.ts`**

Computes a weighted composite engagement score (0 to 1) for each comment and each student:

- **Per-comment score**: Weighted combination of:
  - TORI tag count (normalized) — weight 0.3
  - Lexical diversity — weight 0.2
  - Evidence count (normalized) — weight 0.2
  - Logical connector count (normalized) — weight 0.15
  - Question count (normalized) — weight 0.15
- **Depth band assignment**: Map score ranges to bands:
  - 0.0-0.33 = SURFACE
  - 0.34-0.66 = DEVELOPING
  - 0.67-1.0 = DEEP
- **Per-student score**: Average of their comment scores.
- **Per-student depth band**: Based on their average score.
- Normalization: Use min-max normalization within the current scope so scores are relative to the dataset.

### 6. Heatmap Module

**Create `src/server/services/analytics/heatmap.ts`**

Builds a student-by-TORI-tag matrix for heatmap visualization:

- **Matrix construction**: Rows = consented students, columns = TORI tags. Cell value = count of times that student's comments received that tag.
- **Three modes** (start with these, not seven):
  - `CLASSIC` — Direct color intensity mapping. Higher count = darker color.
  - `CLUSTERED` — Same as classic but rows and columns reordered by similarity (uses clustering module).
  - `DOT` — Circle size represents count instead of color intensity.
- **Three scaling modes**:
  - `RAW` — Absolute counts as-is.
  - `ROW` — Each row normalized to 0-1 (shows each student's relative tag distribution).
  - `GLOBAL` — All cells normalized against the global max (shows absolute magnitude differences).
- Return the matrix, row labels (student identifiers), column labels (tag names), and the ordering indices if clustered.

### 7. Clustering Module

**Create `src/server/services/analytics/clustering.ts`**

Greedy hierarchical ordering for heatmap rows and columns:

- **Algorithm**: Greedy nearest-neighbor ordering using Euclidean distance.
  1. Start with the first item.
  2. Find the nearest unvisited item (by Euclidean distance of their row/column vectors).
  3. Add it to the ordering.
  4. Repeat until all items are ordered.
- **For students**: Distance between two students = Euclidean distance of their TORI tag count vectors.
- **For tags**: Distance between two tags = Euclidean distance of their student count vectors (transposed matrix).
- Return ordering indices for both rows and columns.
- This is simpler than full hierarchical clustering but produces good visual grouping for heatmaps.

### 8. Network Module

**Create `src/server/services/analytics/network.ts`**

Builds a TORI tag co-occurrence network graph:

- **Nodes**: Each TORI tag is a node. Node size = total frequency of that tag.
- **Edges**: An edge connects two tags if they co-occur on the same comment. Edge weight = number of comments where both tags appear.
- **Node degree**: Number of edges connected to each node.
- **Community detection**: Implement Louvain community detection algorithm to identify clusters of related tags.
  - Start with each node in its own community.
  - Iteratively move nodes to the community that maximizes modularity gain.
  - Stop when no move improves modularity.
- Return `{ nodes: NetworkNode[], edges: NetworkEdge[], communities: Community[] }`.
- Filter out edges below a configurable minimum weight threshold (default: 2) to reduce visual noise.

### 9. Instructional Insights Module

**Create `src/server/services/analytics/instructional-insights.ts`**

Higher-level analysis aimed at instructors:

- **Student profiles**: For each consented student, compile:
  - Top 3 most-used TORI tags.
  - Engagement score and depth band.
  - Comment count and average word count.
  - Strongest and weakest text signals.
- **Exemplars per TORI tag**: For each tag, find the top 3 comments (by engagement score) that received that tag. Return comment text excerpts (first 200 characters) with student identifiers.
- **Prompt pattern analysis**: Group threads by the assistant's first message (the prompt). For each unique prompt pattern, compute average engagement score and TORI tag distribution. This reveals which prompts elicit deeper thinking.
- **Depth band distribution**: Count and percentage of students in each depth band (SURFACE/DEVELOPING/DEEP) for the scope.

### 10. Recommendations Module

**Create `src/server/services/analytics/recommendations.ts`**

Analyzes the dataset and recommends which visualizations are most informative:

- **Clustering strength**: Compute the silhouette score of the student clustering. If high (> 0.3), recommend the CLUSTERED heatmap mode.
- **Tag diversity**: If TORI tag usage is heavily concentrated (top 3 tags account for > 60% of all applications), recommend the tag frequency chart and suggest investigating why certain tags dominate.
- **Engagement spread**: If engagement scores have high variance (stddev > 0.2), recommend the depth band distribution view and student profiles.
- **Network density**: If the co-occurrence network has high average degree (> 3), recommend the network graph view.
- **Growth potential**: If comparing across assignments chronologically, check if engagement scores trend upward. If so, recommend highlighting student growth.
- Return `Array<{ visualization: string; reason: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }>` sorted by priority.

### 11. Cache Module

**Create `src/server/services/analytics/cache.ts`**

Caching layer for expensive analytics computations:

- **Cache key generation**: Hash of `JSON.stringify({ scope, functionName, additionalParams, consentStateHash })`. The consent state hash is a hash of the sorted list of consented student IDs, so any consent change invalidates the cache.
- **Storage**: In-memory `Map<string, { result: unknown; expiresAt: number }>`.
- **TTL**: Default 10 minutes. Configurable per function.
- **Invalidation triggers**:
  - New CSV upload for any course/assignment in the scope: clear all cache entries whose scope overlaps.
  - Consent change for any student in the scope: clear all cache entries whose consent state hash no longer matches.
- **API**:
  - `cacheGet<T>(key: string): T | null`
  - `cacheSet<T>(key: string, value: T, ttlMs?: number): void`
  - `cacheInvalidate(scope: AnalyticsScope): void` — clears all entries overlapping with the given scope.
  - `withCache<T>(key: string, compute: () => Promise<T>, ttlMs?: number): Promise<T>` — check cache first, compute and store if miss.
- Design for future upgrade to Redis by keeping the interface abstract (could swap the Map for a Redis client later).

### 12. Analytics Index

**Create `src/server/services/analytics/index.ts`**

Barrel export that re-exports all modules. Also export a convenience `AnalyticsService` class or object that bundles all modules with shared scope resolution and caching:

```ts
export class AnalyticsService {
  constructor(
    private db: DatabaseConnection,
    private consentService: ConsentService,
    private cache: AnalyticsCache
  ) {}

  async getOverview(scope: AnalyticsScope): Promise<AnalyticsResult<OverviewStats>> { ... }
  async getToriAnalysis(scope: AnalyticsScope): Promise<AnalyticsResult<ToriAnalysis>> { ... }
  async getTextSignals(scope: AnalyticsScope): Promise<AnalyticsResult<TextSignals>> { ... }
  async getEngagement(scope: AnalyticsScope): Promise<AnalyticsResult<EngagementResult>> { ... }
  async getHeatmap(scope: AnalyticsScope, mode: HeatmapMode, scaling: ScalingMode): Promise<AnalyticsResult<HeatmapData>> { ... }
  async getNetwork(scope: AnalyticsScope): Promise<AnalyticsResult<NetworkData>> { ... }
  async getInsights(scope: AnalyticsScope): Promise<AnalyticsResult<InstructionalInsights>> { ... }
  async getRecommendations(scope: AnalyticsScope): Promise<AnalyticsResult<Recommendation[]>> { ... }
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/server/services/analytics/types.ts` | Shared types: AnalyticsScope, AnalyticsResult, HeatmapMode, ScalingMode, DepthBand |
| `src/server/services/analytics/scope.ts` | Scope resolution + consent filtering helper |
| `src/server/services/analytics/overview.ts` | Summary statistics (counts, word stats, date ranges) |
| `src/server/services/analytics/tori.ts` | TORI tag frequency, coverage, co-occurrence, cross-course comparison |
| `src/server/services/analytics/text-signals.ts` | Linguistic feature extraction (questions, hedging, evidence, etc.) |
| `src/server/services/analytics/engagement.ts` | Weighted composite engagement score + depth bands |
| `src/server/services/analytics/heatmap.ts` | Student x TORI tag matrix with 3 modes and 3 scaling options |
| `src/server/services/analytics/clustering.ts` | Greedy hierarchical ordering using Euclidean distance |
| `src/server/services/analytics/network.ts` | TORI co-occurrence graph with Louvain community detection |
| `src/server/services/analytics/instructional-insights.ts` | Student profiles, exemplars, prompt patterns, depth distribution |
| `src/server/services/analytics/recommendations.ts` | Smart visualization recommendations based on data characteristics |
| `src/server/services/analytics/cache.ts` | In-memory cache with TTL and scope-based invalidation |
| `src/server/services/analytics/index.ts` | Barrel exports + AnalyticsService class |

## Verification

Run from the project root:

```bash
# Type-check the new analytics modules
docker compose exec chat-explorer pnpm tsc --noEmit

# Run analytics unit tests
docker compose exec chat-explorer pnpm test -- --grep "analytics"
```

Verify:
- [ ] All 13 files exist in `src/server/services/analytics/`.
- [ ] TypeScript compiles with no errors.
- [ ] The scope helper correctly filters out non-consented students (write a test with 5 students, 2 opted out, verify counts).
- [ ] Overview stats match manual count for a small test dataset.
- [ ] TORI co-occurrence correctly identifies pairs that appear on the same comment.
- [ ] Engagement scores fall between 0 and 1, and depth bands are assigned correctly.
- [ ] Heatmap matrix dimensions match (consented students x TORI tags).
- [ ] Clustering produces a valid permutation (all indices present, no duplicates).
- [ ] Network edges only connect tags that genuinely co-occur.
- [ ] Recommendations return at least one suggestion for any non-empty dataset.
- [ ] Cache returns cached result on second call; returns fresh result after invalidation.
- [ ] No analytics function returns data for non-consented students.
