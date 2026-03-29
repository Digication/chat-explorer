import { gql } from "@apollo/client";

/** Fetch chat sessions, optionally filtered by course or assignment. */
export const GET_CHAT_SESSIONS = gql`
  query ChatSessions($courseId: ID, $assignmentId: ID) {
    chatSessions(courseId: $courseId, assignmentId: $assignmentId) {
      id
      title
      courseId
      createdAt
      updatedAt
    }
  }
`;

/** Fetch a single chat session with its full message history. */
export const GET_CHAT_SESSION = gql`
  query ChatSession($id: ID!) {
    chatSession(id: $id) {
      id
      title
      messages {
        id
        role
        content
        createdAt
      }
    }
  }
`;

/** Create a new chat session. */
export const CREATE_CHAT_SESSION = gql`
  mutation CreateChatSession($courseId: ID, $assignmentId: ID, $title: String) {
    createChatSession(courseId: $courseId, assignmentId: $assignmentId, title: $title) {
      id
      title
      courseId
      createdAt
      updatedAt
    }
  }
`;

/** Send a message in a chat session and receive the assistant reply. */
export const SEND_CHAT_MESSAGE = gql`
  mutation SendChatMessage($sessionId: ID!, $content: String!) {
    sendChatMessage(sessionId: $sessionId, content: $content) {
      id
      sessionId
      role
      content
      createdAt
    }
  }
`;

/** Delete a chat session. */
export const DELETE_CHAT_SESSION = gql`
  mutation DeleteChatSession($id: ID!) {
    deleteChatSession(id: $id)
  }
`;

/** Rename a chat session. */
export const RENAME_CHAT_SESSION = gql`
  mutation RenameChatSession($id: ID!, $title: String!) {
    renameChatSession(id: $id, title: $title) {
      id
      title
    }
  }
`;
