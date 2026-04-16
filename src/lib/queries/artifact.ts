/**
 * GraphQL queries and mutations for artifacts (Phase 3 of outcomes/evidence).
 */
import { gql } from "@apollo/client";

/** List artifacts, scoped by role server-side + optional filter. */
export const GET_ARTIFACTS = gql`
  query Artifacts($filter: ArtifactsFilter) {
    artifacts(filter: $filter) {
      id
      title
      type
      status
      mimeType
      fileSizeBytes
      hasStoredFile
      sectionCount
      uploadedAt
      errorMessage
      student {
        id
        displayName
      }
      course {
        id
        name
      }
      assignment {
        id
        name
      }
    }
  }
`;

/** Fetch a single artifact with its sections + evidence moments. */
export const GET_ARTIFACT = gql`
  query Artifact($id: ID!) {
    artifact(id: $id) {
      id
      title
      type
      status
      mimeType
      fileSizeBytes
      hasStoredFile
      uploadedAt
      errorMessage
      student {
        id
        displayName
      }
      course {
        id
        name
      }
      assignment {
        id
        name
      }
      sections {
        id
        sequenceOrder
        title
        content
        type
        wordCount
        evidenceMoments {
          id
          narrative
          sourceText
          processedAt
          outcomeAlignments {
            outcomeCode
            outcomeName
            strengthLevel
            rationale
          }
        }
      }
    }
  }
`;

/** Soft-delete an artifact (keeps rows/files, flips status to DELETED). */
export const DELETE_ARTIFACT = gql`
  mutation DeleteArtifact($id: ID!) {
    deleteArtifact(id: $id)
  }
`;

/** Wrap an existing chat thread as a CONVERSATION artifact (idempotent). */
export const WRAP_THREAD_AS_ARTIFACT = gql`
  mutation WrapThreadAsArtifact($threadId: ID!) {
    wrapThreadAsArtifact(threadId: $threadId) {
      id
      title
      type
      status
      sectionCount
    }
  }
`;
