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
          count
        }
        coOccurrenceTriples {
          tags
          count
        }
      }
      meta {
        cached
      }
    }
  }
`;

/** Engagement / reflection depth analysis. */
export const GET_ENGAGEMENT = gql`
  query Engagement($scope: AnalyticsScopeInput!) {
    engagement(scope: $scope) {
      data {
        depthDistribution {
          SURFACE
          DEVELOPING
          DEEP
        }
        perStudent {
          studentId
          averageScore
          depthBand
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
      commentId
      text
      threadId
      threadName
      timestamp
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
          engagementScore
          depthBand
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

/** All institutions (digication_admin only). */
export const GET_INSTITUTIONS = gql`
  query Institutions {
    institutions {
      id
      name
    }
  }
`;
