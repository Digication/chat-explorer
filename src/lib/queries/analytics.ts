import { gql } from "@apollo/client";

/** Fetch the current user's institution (id + name). */
export const GET_MY_INSTITUTION = gql`
  query MyInstitution {
    myInstitution {
      id
      name
    }
  }
`;

/** Fetch courses, optionally filtered by institution. */
export const GET_COURSES = gql`
  query Courses($institutionId: ID) {
    courses(institutionId: $institutionId) {
      id
      name
    }
  }
`;

/** Fetch assignments for a specific course. */
export const GET_ASSIGNMENTS = gql`
  query Assignments($courseId: ID!) {
    assignments(courseId: $courseId) {
      id
      name
    }
  }
`;

/** High-level overview stats for the selected scope. */
export const GET_OVERVIEW = gql`
  query Overview($scope: AnalyticsScopeInput!) {
    overview(scope: $scope) {
      data {
        totalComments
        userComments
        assistantComments
        threadCount
        participantCount
        wordCountStats {
          min
          max
          mean
          median
        }
        toriTagCount
        dateRange {
          earliest
          latest
        }
      }
      meta {
        cached
      }
    }
  }
`;

/** TORI tag frequencies and co-occurrence pairs. */
export const GET_TORI_ANALYSIS = gql`
  query ToriAnalysis($scope: AnalyticsScopeInput!) {
    toriAnalysis(scope: $scope) {
      data {
        tagFrequencies {
          tagId
          tagName
          domain
          count
          percent
        }
        coOccurrencePairs {
          tags
          tagIds
          count
        }
        coOccurrenceTriples {
          tags
          tagIds
          count
        }
      }
      meta {
        cached
      }
    }
  }
`;

/** Engagement / reflection category analysis (Hatton & Smith). */
export const GET_ENGAGEMENT = gql`
  query Engagement($scope: AnalyticsScopeInput!) {
    engagement(scope: $scope) {
      data {
        categoryDistribution {
          DESCRIPTIVE_WRITING
          DESCRIPTIVE_REFLECTION
          DIALOGIC_REFLECTION
          CRITICAL_REFLECTION
        }
        perStudent {
          studentId
          modalCategory
          categoryDistribution {
            DESCRIPTIVE_WRITING
            DESCRIPTIVE_REFLECTION
            DIALOGIC_REFLECTION
            CRITICAL_REFLECTION
          }
          commentCount
        }
      }
      meta {
        cached
      }
    }
  }
`;

/** Student x TORI-tag heatmap matrix. */
export const GET_HEATMAP = gql`
  query Heatmap($input: HeatmapInput!) {
    heatmap(input: $input) {
      data {
        matrix
        rowLabels
        colLabels
        rowIds
        colIds
        rowOrder
        colOrder
        mode
        scaling
      }
      meta {
        cached
      }
    }
  }
`;

/** Evidence quotes for a specific (student, TORI tag) heatmap cell. */
export const GET_HEATMAP_CELL_EVIDENCE = gql`
  query HeatmapCellEvidence($input: CellEvidenceInput!) {
    heatmapCellEvidence(input: $input) {
      items {
        commentId
        text
        threadId
        threadName
        studentId
        studentName
        timestamp
      }
      totalCount
    }
  }
`;

/** Evidence for a specific reflection category (Growth drill-down). */
export const GET_CATEGORY_EVIDENCE = gql`
  query CategoryEvidence($input: CategoryEvidenceInput!) {
    categoryEvidence(input: $input) {
      items {
        commentId
        text
        threadId
        threadName
        category
        evidenceQuote
        timestamp
      }
      totalCount
    }
  }
`;

/** Evidence for comments containing ALL specified TORI tags (co-occurrence drill-down). */
export const GET_MULTI_TAG_EVIDENCE = gql`
  query MultiTagEvidence($input: MultiTagEvidenceInput!) {
    multiTagEvidence(input: $input) {
      items {
        commentId
        text
        threadId
        threadName
        studentId
        studentName
        timestamp
      }
      totalCount
    }
  }
`;

/** TORI co-occurrence network graph data. */
export const GET_NETWORK = gql`
  query Network($scope: AnalyticsScopeInput!) {
    network(scope: $scope) {
      data {
        nodes {
          id
          name
          domain
          frequency
          degree
          communityId
        }
        edges {
          source
          target
          weight
        }
        communities {
          id
          nodeIds
        }
      }
      meta {
        cached
      }
    }
  }
`;

/** Smart visualization recommendations. */
export const GET_RECOMMENDATIONS = gql`
  query Recommendations($scope: AnalyticsScopeInput!) {
    recommendations(scope: $scope) {
      data {
        visualization
        reason
        priority
      }
      meta {
        cached
      }
    }
  }
`;

/** Text signal aggregates (question count, sentence length, etc.). */
export const GET_TEXT_SIGNALS = gql`
  query TextSignals($scope: AnalyticsScopeInput!) {
    textSignals(scope: $scope) {
      data {
        aggregates {
          questionCount { mean median stddev }
          avgSentenceLength { mean median stddev }
          lexicalDiversity { mean median stddev }
          hedgingCount { mean median stddev }
          specificityCount { mean median stddev }
          evidenceCount { mean median stddev }
          logicalConnectorCount { mean median stddev }
        }
      }
      meta { cached }
    }
  }
`;

/** Student engagement profiles from instructional insights. */
export const GET_STUDENT_ENGAGEMENT = gql`
  query StudentEngagement($scope: AnalyticsScopeInput!) {
    instructionalInsights(scope: $scope) {
      data {
        studentProfiles {
          studentId
          name
          modalCategory
          commentCount
          topToriTags
        }
      }
      meta { cached }
    }
  }
`;

/** Current authenticated user. */
export const GET_ME = gql`
  query Me {
    me {
      id
      role
      institutionId
    }
  }
`;

/** Consent summary for an institution (optionally filtered by course). */
export const GET_CONSENT_SUMMARY = gql`
  query ConsentSummary($institutionId: ID!, $courseId: ID) {
    consentSummary(institutionId: $institutionId, courseId: $courseId) {
      consented
      excluded
      total
    }
  }
`;

/** Set consent status for a single student. */
export const SET_STUDENT_CONSENT = gql`
  mutation SetStudentConsent($input: ConsentInput!) {
    setStudentConsent(input: $input) {
      studentId
      institutionId
      courseId
      status
    }
  }
`;

/** Set consent status for multiple students at once. */
export const BULK_SET_CONSENT = gql`
  mutation BulkSetConsent(
    $studentIds: [ID!]!
    $institutionId: ID!
    $courseId: ID
    $status: ConsentStatus!
  ) {
    bulkSetConsent(
      studentIds: $studentIds
      institutionId: $institutionId
      courseId: $courseId
      status: $status
    ) {
      updated
    }
  }
`;

/** Student growth over time (engagement per assignment). */
export const GET_GROWTH = gql`
  query Growth($scope: AnalyticsScopeInput!) {
    growth(scope: $scope) {
      data {
        studentId
        name
        dataPoints {
          assignmentId
          assignmentName
          date
          category
        }
      }
      meta {
        cached
      }
    }
  }
`;

/** Student profile report for a single student. */
export const GET_STUDENT_PROFILE = gql`
  query StudentProfile($scope: AnalyticsScopeInput!, $studentId: ID!) {
    studentProfile(scope: $scope, studentId: $studentId) {
      data {
        studentId
        name
        totalComments
        totalWordCount
        avgWordCount
        threadCount
        assignmentCount
        overallCategoryDistribution {
          DESCRIPTIVE_WRITING
          DESCRIPTIVE_REFLECTION
          DIALOGIC_REFLECTION
          CRITICAL_REFLECTION
        }
        perAssignment {
          assignmentId
          assignmentName
          date
          modalCategory
          commentCount
          categoryDistribution {
            DESCRIPTIVE_WRITING
            DESCRIPTIVE_REFLECTION
            DIALOGIC_REFLECTION
            CRITICAL_REFLECTION
          }
        }
        toriTagDistribution {
          tagId
          tagName
          domain
          count
          percent
        }
        perAssignmentToriTags {
          assignmentId
          assignmentName
          date
          tags {
            tagId
            tagName
            domain
            count
          }
        }
        topToriTags
        evidenceHighlights {
          commentId
          text
          category
          evidenceQuote
          rationale
          assignmentName
          threadId
          timestamp
        }
      }
      meta {
        consentedStudentCount
        excludedStudentCount
        computedAt
        cached
      }
    }
  }
`;

/** Cross-course comparison metrics. */
export const GET_CROSS_COURSE_COMPARISON = gql`
  query CrossCourseComparison($input: CrossCourseInput!) {
    crossCourseComparison(input: $input) {
      data {
        courses {
          courseId
          courseName
          studentCount
          commentCount
          threadCount
          assignmentCount
          categoryDistribution {
            DESCRIPTIVE_WRITING
            DESCRIPTIVE_REFLECTION
            DIALOGIC_REFLECTION
            CRITICAL_REFLECTION
          }
          topToriTags
          avgWordCount
          growthRate
        }
      }
      meta {
        computedAt
        cached
      }
    }
  }
`;

/** All institutions (digication_admin only). */
export const GET_INSTITUTIONS = gql`
  query Institutions {
    institutions {
      id
      name
    }
  }
`;
