/**
 * GraphQL schema defined as SDL (Schema Definition Language).
 * GraphQL Yoga will parse this and match it against resolver functions.
 */
export const typeDefs = /* GraphQL */ `
  # ── Enums ─────────────────────────────────────────────────────

  enum UserRole {
    instructor
    institution_admin
    digication_admin
  }

  enum CommentRole {
    USER
    ASSISTANT
    SYSTEM
  }

  enum ConsentStatus {
    INCLUDED
    EXCLUDED
  }

  enum AccessLevel {
    owner
    collaborator
  }

  enum HeatmapMode {
    CLASSIC
    CLUSTERED
    DOT
  }

  enum ScalingMode {
    RAW
    ROW
    GLOBAL
  }

  enum DepthBand {
    SURFACE
    DEVELOPING
    DEEP
  }

  enum ExportFormat {
    PDF
    CSV
  }

  enum ExportStatus {
    PENDING
    PROCESSING
    COMPLETE
    FAILED
  }

  enum Priority {
    HIGH
    MEDIUM
    LOW
  }

  # ── Core Entity Types ─────────────────────────────────────────

  type Institution {
    id: ID!
    name: String!
    domain: String
    slug: String
    createdAt: String!
    courses: [Course!]!
  }

  type Course {
    id: ID!
    name: String!
    description: String
    institutionId: ID!
    institution: Institution
    assignments: [Assignment!]!
    studentCount: Int!
    createdAt: String!
  }

  type Assignment {
    id: ID!
    name: String!
    description: String
    externalId: String!
    courseId: ID!
    course: Course
    url: String
    dueDate: String
    gradeMaxPoints: Float
    threadCount: Int!
    commentCount: Int!
    threads(limit: Int, offset: Int): [Thread!]!
    importedAt: String!
  }

  type Thread {
    id: ID!
    externalId: String!
    name: String!
    assignmentId: ID!
    submissionUrl: String
    totalInputTokens: Int
    totalOutputTokens: Int
    totalCost: Float
    comments: [Comment!]!
    commentCount: Int!
  }

  type Student {
    id: ID!
    systemId: String!
    firstName: String
    lastName: String
    email: String
    displayName: String!
  }

  type Comment {
    id: ID!
    externalId: String!
    role: CommentRole!
    text: String!
    wordCount: Int!
    timestamp: String
    orderIndex: Int!
    threadId: ID!
    studentId: ID
    student: Student
    grade: String
    toriTags: [ToriTag!]!
  }

  type ToriTag {
    id: ID!
    name: String!
    domain: String!
    domainNumber: Int!
    categoryNumber: Int!
    description: String
    parentCategory: String
  }

  type User {
    id: ID!
    name: String!
    email: String!
    role: UserRole!
    institutionId: ID
    institution: Institution
  }

  type CourseAccessRecord {
    id: ID!
    userId: ID!
    courseId: ID!
    accessLevel: AccessLevel!
    user: User
    grantedAt: String!
  }

  # ── Analytics Types ───────────────────────────────────────────

  type WordCountStats {
    min: Float!
    max: Float!
    mean: Float!
    median: Float!
  }

  type DateRange {
    earliest: String
    latest: String
  }

  type OverviewStats {
    totalComments: Int!
    userComments: Int!
    assistantComments: Int!
    systemComments: Int!
    threadCount: Int!
    participantCount: Int!
    wordCountStats: WordCountStats!
    toriTagCount: Int!
    dateRange: DateRange!
  }

  type TagFrequency {
    tagId: ID!
    tagName: String!
    domain: String!
    count: Int!
    percent: Float!
  }

  type TagCoverage {
    tagId: ID!
    tagName: String!
    studentCount: Int!
    coveragePercent: Float!
  }

  type CoOccurrence {
    tags: [String!]!
    count: Int!
  }

  type ToriAnalysis {
    tagFrequencies: [TagFrequency!]!
    tagCoverage: [TagCoverage!]!
    coOccurrencePairs: [CoOccurrence!]!
    coOccurrenceTriples: [CoOccurrence!]!
    coOccurrenceQuadruples: [CoOccurrence!]!
  }

  type AggregateStats {
    mean: Float!
    median: Float!
    stddev: Float!
  }

  type CommentSignals {
    commentId: ID!
    studentId: ID
    questionCount: Int!
    avgSentenceLength: Float!
    lexicalDiversity: Float!
    hedgingCount: Int!
    specificityCount: Int!
    evidenceCount: Int!
    logicalConnectorCount: Int!
  }

  type TextSignalsAggregates {
    questionCount: AggregateStats!
    avgSentenceLength: AggregateStats!
    lexicalDiversity: AggregateStats!
    hedgingCount: AggregateStats!
    specificityCount: AggregateStats!
    evidenceCount: AggregateStats!
    logicalConnectorCount: AggregateStats!
  }

  type TextSignals {
    perComment: [CommentSignals!]!
    aggregates: TextSignalsAggregates!
  }

  type EngagementComponents {
    toriTagCountNorm: Float!
    lexicalDiversity: Float!
    evidenceCountNorm: Float!
    logicalConnectorCountNorm: Float!
    questionCountNorm: Float!
  }

  type CommentEngagement {
    commentId: ID!
    studentId: ID
    score: Float!
    depthBand: DepthBand!
    components: EngagementComponents!
  }

  type StudentEngagement {
    studentId: ID!
    averageScore: Float!
    depthBand: DepthBand!
    commentCount: Int!
  }

  type DepthDistribution {
    SURFACE: Int!
    DEVELOPING: Int!
    DEEP: Int!
  }

  type EngagementResult {
    perComment: [CommentEngagement!]!
    perStudent: [StudentEngagement!]!
    depthDistribution: DepthDistribution!
  }

  type HeatmapData {
    matrix: [[Float!]!]!
    rowLabels: [String!]!
    colLabels: [String!]!
    rowOrder: [Int!]!
    colOrder: [Int!]!
    mode: HeatmapMode!
    scaling: ScalingMode!
  }

  type NetworkNode {
    id: ID!
    name: String!
    domain: String!
    frequency: Int!
    degree: Int!
    communityId: Int!
  }

  type NetworkEdge {
    source: ID!
    target: ID!
    weight: Int!
  }

  type Community {
    id: Int!
    nodeIds: [ID!]!
  }

  type NetworkData {
    nodes: [NetworkNode!]!
    edges: [NetworkEdge!]!
    communities: [Community!]!
  }

  type StudentProfile {
    studentId: ID!
    name: String!
    topToriTags: [String!]!
    engagementScore: Float!
    depthBand: DepthBand!
    commentCount: Int!
    avgWordCount: Float!
  }

  type TagExemplarComment {
    commentId: ID!
    studentLabel: String!
    textExcerpt: String!
    engagementScore: Float!
  }

  type TagExemplar {
    tagName: String!
    exemplars: [TagExemplarComment!]!
  }

  type PromptPattern {
    promptExcerpt: String!
    threadCount: Int!
    avgEngagement: Float!
    topToriTags: [String!]!
  }

  type DepthDistributionDetail {
    count: Int!
    percent: Float!
  }

  type InstructionalInsights {
    studentProfiles: [StudentProfile!]!
    tagExemplars: [TagExemplar!]!
    promptPatterns: [PromptPattern!]!
    depthDistribution: DepthDistributionInsight!
  }

  type DepthDistributionInsight {
    SURFACE: DepthDistributionDetail!
    DEVELOPING: DepthDistributionDetail!
    DEEP: DepthDistributionDetail!
  }

  type Recommendation {
    visualization: String!
    reason: String!
    priority: Priority!
  }

  type AnalyticsMeta {
    consentedStudentCount: Int!
    excludedStudentCount: Int!
    computedAt: String!
    cached: Boolean!
  }

  # Wrapped analytics results
  type OverviewResult {
    data: OverviewStats!
    meta: AnalyticsMeta!
  }

  type ToriAnalysisResult {
    data: ToriAnalysis!
    meta: AnalyticsMeta!
  }

  type TextSignalsResult {
    data: TextSignals!
    meta: AnalyticsMeta!
  }

  type EngagementAnalysisResult {
    data: EngagementResult!
    meta: AnalyticsMeta!
  }

  type HeatmapResult {
    data: HeatmapData!
    meta: AnalyticsMeta!
  }

  type NetworkResult {
    data: NetworkData!
    meta: AnalyticsMeta!
  }

  type InsightsResult {
    data: InstructionalInsights!
    meta: AnalyticsMeta!
  }

  type RecommendationsResult {
    data: [Recommendation!]!
    meta: AnalyticsMeta!
  }

  # ── Chat Types ────────────────────────────────────────────────

  type ChatSession {
    id: ID!
    userId: ID!
    title: String
    courseId: ID
    assignmentId: ID
    createdAt: String!
    updatedAt: String!
    messages: [ChatMessage!]!
  }

  type ChatMessage {
    id: ID!
    sessionId: ID!
    role: String!
    content: String!
    createdAt: String!
  }

  # ── Export Types ──────────────────────────────────────────────

  type ExportRequest {
    id: ID!
    format: ExportFormat!
    status: ExportStatus!
    downloadUrl: String
    message: String
    createdAt: String!
  }

  # ── Consent Types ─────────────────────────────────────────────

  type StudentConsent {
    studentId: ID!
    institutionId: ID!
    courseId: ID
    status: ConsentStatus!
    updatedById: ID!
    updatedAt: String!
  }

  type ConsentSummary {
    consented: Int!
    excluded: Int!
    total: Int!
  }

  type BulkConsentResult {
    updated: Int!
  }

  # ── Input Types ───────────────────────────────────────────────

  input AnalyticsScopeInput {
    institutionId: ID!
    courseId: ID
    assignmentId: ID
    studentIds: [ID!]
  }

  input HeatmapInput {
    scope: AnalyticsScopeInput!
    mode: HeatmapMode
    scaling: ScalingMode
  }

  input ConsentInput {
    studentId: ID!
    institutionId: ID!
    courseId: ID
    status: ConsentStatus!
  }

  # ── Root Types ────────────────────────────────────────────────

  type Query {
    # Institution
    institutions: [Institution!]!
    institution(id: ID!): Institution
    myInstitution: Institution

    # Course
    courses(institutionId: ID): [Course!]!
    course(id: ID!): Course
    assignments(courseId: ID!): [Assignment!]!
    assignment(id: ID!): Assignment

    # Analytics
    overview(scope: AnalyticsScopeInput!): OverviewResult!
    toriAnalysis(scope: AnalyticsScopeInput!): ToriAnalysisResult!
    textSignals(scope: AnalyticsScopeInput!): TextSignalsResult!
    engagement(scope: AnalyticsScopeInput!): EngagementAnalysisResult!
    heatmap(input: HeatmapInput!): HeatmapResult!
    network(scope: AnalyticsScopeInput!): NetworkResult!
    instructionalInsights(scope: AnalyticsScopeInput!): InsightsResult!
    recommendations(scope: AnalyticsScopeInput!): RecommendationsResult!

    # Chat
    chatSessions(courseId: ID, assignmentId: ID): [ChatSession!]!
    chatSession(id: ID!): ChatSession

    # Consent
    studentConsent(studentId: ID!, institutionId: ID!): [StudentConsent!]!
    consentSummary(institutionId: ID!, courseId: ID): ConsentSummary!

    # Export
    exportStatus(id: ID!): ExportRequest
    myExports: [ExportRequest!]!

    # Admin
    users(institutionId: ID): [User!]!
    courseAccessList(courseId: ID!): [CourseAccessRecord!]!

    # TORI tags (reference data)
    toriTags: [ToriTag!]!

    # Current user
    me: User
  }

  type Mutation {
    # Chat
    createChatSession(courseId: ID, assignmentId: ID, title: String): ChatSession!
    sendChatMessage(sessionId: ID!, content: String!): ChatMessage!
    deleteChatSession(id: ID!): Boolean!
    renameChatSession(id: ID!, title: String!): ChatSession!

    # Consent
    setStudentConsent(input: ConsentInput!): StudentConsent!
    bulkSetConsent(
      studentIds: [ID!]!
      institutionId: ID!
      courseId: ID
      status: ConsentStatus!
    ): BulkConsentResult!

    # Export
    requestExport(scope: AnalyticsScopeInput!, format: ExportFormat!): ExportRequest!

    # Admin
    assignRole(userId: ID!, role: UserRole!): User!
    grantCourseAccess(userId: ID!, courseId: ID!, accessLevel: AccessLevel!): CourseAccessRecord!
    revokeCourseAccess(userId: ID!, courseId: ID!): Boolean!
  }
`;
