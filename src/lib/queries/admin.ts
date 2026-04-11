import { gql } from "@apollo/client";

// ── Queries ──────────────────────────────────────────────────────

export const GET_USERS = gql`
  query AdminUsers($institutionId: ID, $search: String) {
    users(institutionId: $institutionId, search: $search) {
      id
      name
      email
      role
      institutionId
      institution {
        id
        name
      }
    }
  }
`;

export const GET_INSTITUTIONS = gql`
  query AdminInstitutions {
    institutions {
      id
      name
      domain
      slug
    }
  }
`;

export const GET_COURSE_ACCESS_LIST = gql`
  query AdminCourseAccessList($courseId: ID!) {
    courseAccessList(courseId: $courseId) {
      id
      userId
      courseId
      accessLevel
      grantedAt
      user {
        id
        name
        email
      }
    }
  }
`;

export const GET_COURSES = gql`
  query AdminCourses($institutionId: ID) {
    courses(institutionId: $institutionId) {
      id
      name
      institutionId
    }
  }
`;

// ── Mutations ────────────────────────────────────────────────────

export const INVITE_USER = gql`
  mutation InviteUser(
    $email: String!
    $name: String!
    $institutionId: ID!
    $role: UserRole!
  ) {
    inviteUser(
      email: $email
      name: $name
      institutionId: $institutionId
      role: $role
    ) {
      id
      name
      email
      role
      institutionId
    }
  }
`;

export const ASSIGN_ROLE = gql`
  mutation AssignRole($userId: ID!, $role: UserRole!) {
    assignRole(userId: $userId, role: $role) {
      id
      role
    }
  }
`;

export const UPDATE_USER_INSTITUTION = gql`
  mutation UpdateUserInstitution($userId: ID!, $institutionId: ID) {
    updateUserInstitution(userId: $userId, institutionId: $institutionId) {
      id
      institutionId
      institution {
        id
        name
      }
    }
  }
`;

export const CREATE_INSTITUTION = gql`
  mutation CreateInstitution($name: String!, $domain: String, $slug: String) {
    createInstitution(name: $name, domain: $domain, slug: $slug) {
      id
      name
      domain
      slug
    }
  }
`;

export const UPDATE_INSTITUTION = gql`
  mutation UpdateInstitution(
    $id: ID!
    $name: String
    $domain: String
    $slug: String
  ) {
    updateInstitution(id: $id, name: $name, domain: $domain, slug: $slug) {
      id
      name
      domain
      slug
    }
  }
`;

export const GRANT_COURSE_ACCESS = gql`
  mutation GrantCourseAccess(
    $userId: ID!
    $courseId: ID!
    $accessLevel: AccessLevel!
  ) {
    grantCourseAccess(
      userId: $userId
      courseId: $courseId
      accessLevel: $accessLevel
    ) {
      id
      userId
      courseId
      accessLevel
    }
  }
`;

export const REVOKE_COURSE_ACCESS = gql`
  mutation RevokeCourseAccess($userId: ID!, $courseId: ID!) {
    revokeCourseAccess(userId: $userId, courseId: $courseId)
  }
`;
