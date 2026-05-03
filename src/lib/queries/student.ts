import { gql } from "@apollo/client";

export const GET_MY_STUDENT_PROFILE = gql`
  query MyStudentProfile {
    myStudentProfile {
      id
      firstName
      lastName
      email
      systemId
      institutionId
    }
  }
`;

export const GET_STUDENTS = gql`
  query AdminStudents($institutionId: ID!, $search: String) {
    students(institutionId: $institutionId, search: $search) {
      id
      firstName
      lastName
      email
      userId
      institutionId
    }
  }
`;

export const INVITE_STUDENT = gql`
  mutation InviteStudent($studentId: ID!) {
    inviteStudent(studentId: $studentId) {
      userId
      email
    }
  }
`;

export const BULK_INVITE_STUDENTS = gql`
  mutation BulkInviteStudents($studentIds: [ID!]!) {
    bulkInviteStudents(studentIds: $studentIds) {
      studentId
      userId
      email
      error
    }
  }
`;
