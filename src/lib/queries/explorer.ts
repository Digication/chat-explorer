import { gql } from "@apollo/client";

/** Fetch the current user (id, role, institutionId). */
export const GET_EXPLORER_ME = gql`
  query ExplorerMe {
    me {
      id
      role
      institutionId
    }
  }
`;

/** Fetch courses, optionally filtered by institution. Includes institutionId for scope building. */
export const GET_EXPLORER_COURSES = gql`
  query ExplorerCourses($institutionId: ID) {
    courses(institutionId: $institutionId) {
      id
      name
      institutionId
    }
  }
`;

/** Fetch assignments for a given course. */
export const GET_EXPLORER_ASSIGNMENTS = gql`
  query ExplorerAssignments($courseId: ID!) {
    assignments(courseId: $courseId) {
      id
      name
    }
  }
`;

/**
 * Fetch student profiles for the selected scope via instructionalInsights.
 * Returns studentId, name, topToriTags, commentCount, and modalCategory.
 */
export const GET_STUDENT_PROFILES = gql`
  query StudentProfiles($scope: AnalyticsScopeInput!) {
    instructionalInsights(scope: $scope) {
      data {
        studentProfiles {
          studentId
          name
          topToriTags
          commentCount
          modalCategory
        }
      }
    }
  }
`;

/** Fetch a single thread by ID with full comments and TORI tags. */
export const GET_THREAD_BY_ID = gql`
  query ThreadById($id: ID!) {
    thread(id: $id) {
      id
      name
      comments {
        id
        role
        text
        timestamp
        orderIndex
        studentId
        student {
          id
          displayName
        }
        toriTags {
          id
          name
          domain
        }
      }
    }
  }
`;

/**
 * Fetch threads with full comments for a course's assignments.
 * Includes student info and TORI tags on each comment.
 */
export const GET_ASSIGNMENT_THREADS = gql`
  query GetAssignmentThreads($courseId: ID!) {
    assignments(courseId: $courseId) {
      id
      name
      threads(limit: 100) {
        id
        name
        externalId
        comments {
          id
          role
          text
          wordCount
          timestamp
          orderIndex
          studentId
          student {
            id
            firstName
            lastName
            displayName
          }
          toriTags {
            id
            name
            domain
          }
        }
      }
    }
  }
`;
