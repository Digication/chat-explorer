import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  Box,
  Drawer,
  Typography,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
  Divider,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import {
  GET_CHAT_SESSIONS,
  GET_CHAT_SESSION,
  CREATE_CHAT_SESSION,
  SEND_CHAT_MESSAGE,
  DELETE_CHAT_SESSION,
} from "@/lib/queries/chat";
import ChatMessageBubble from "./ChatMessageBubble";
import SuggestionChips from "./SuggestionChips";
import ChatHistory from "./ChatHistory";
import ModelPicker from "./ModelPicker";

interface AiChatPanelProps {
  /** Whether the panel is visible. */
  open: boolean;
  /** Called to close the panel (only relevant when anchor="right"). */
  onClose: () => void;
  /** Optional course context for scoping sessions. */
  courseId?: string;
  /** Optional assignment context for scoping sessions. */
  assignmentId?: string;
  /**
   * Display mode:
   * - "right": renders inside a right-anchored MUI Drawer (400px wide)
   * - "full": renders as a full-width layout with session sidebar on the left
   * - "embedded": renders as a plain flex container that fills its parent
   *   (used for the split-screen layout in Chat Explorer)
   */
  anchor?: "right" | "full" | "embedded";
}

/** The width of the drawer when in "right" mode. */
const DRAWER_WIDTH = 400;

/** The width of the session sidebar in "full" mode. */
const SIDEBAR_WIDTH = 260;

/**
 * Main AI chat panel that manages the full chat experience.
 *
 * Works in two modes:
 * - Drawer mode (anchor="right"): slides in from the right, good for Chat Explorer
 * - Full mode (anchor="full"): takes the full width with a sidebar, good for a dedicated page
 */
export default function AiChatPanel({
  open,
  onClose,
  courseId,
  assignmentId,
  anchor = "right",
}: AiChatPanelProps) {
  // ── State ──────────────────────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Ref for auto-scrolling the message area to the bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Queries ────────────────────────────────────────────────────────

  // Fetch all sessions for this course/assignment scope
  const {
    data: sessionsData,
    loading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useQuery<any>(GET_CHAT_SESSIONS, {
    variables: { courseId, assignmentId },
    skip: !open,
  });
  const sessions = sessionsData?.chatSessions ?? [];

  // Fetch the active session's messages
  const {
    data: sessionData,
    loading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useQuery<any>(GET_CHAT_SESSION, {
    variables: { id: activeSessionId },
    skip: !activeSessionId,
  });
  const messages = sessionData?.chatSession?.messages ?? [];

  // ── Mutations ──────────────────────────────────────────────────────

  const [createSession] = useMutation<any>(CREATE_CHAT_SESSION);
  const [sendMessage] = useMutation<any>(SEND_CHAT_MESSAGE);
  const [deleteSession] = useMutation<any>(DELETE_CHAT_SESSION);

  // ── Auto-scroll when messages change ───────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // ── Handlers ───────────────────────────────────────────────────────

  /** Create a new session and make it active. */
  const handleNewChat = useCallback(async () => {
    try {
      const { data } = await createSession({
        variables: { courseId, assignmentId, title: "New chat" },
      });
      if (data?.createChatSession?.id) {
        setActiveSessionId(data.createChatSession.id);
        await refetchSessions();
      }
    } catch (err) {
      // Error will show via sessionsError on next render
      console.error("Failed to create session:", err);
    }
  }, [courseId, assignmentId, createSession, refetchSessions]);

  /** Send a message (either typed or from a suggestion chip). */
  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? inputValue).trim();
      if (!content || isSending) return;

      // If no active session exists, create one first
      let sessionId = activeSessionId;
      if (!sessionId) {
        try {
          const { data } = await createSession({
            variables: { courseId, assignmentId, title: content.slice(0, 60) },
          });
          sessionId = data?.createChatSession?.id ?? null;
          if (sessionId) {
            setActiveSessionId(sessionId);
            await refetchSessions();
          }
        } catch (err) {
          console.error("Failed to create session:", err);
          return;
        }
      }

      if (!sessionId) return;

      setInputValue("");
      setIsSending(true);

      try {
        await sendMessage({ variables: { sessionId, content } });
        // Refetch session to get both the user message and assistant reply
        await refetchSession();
        await refetchSessions(); // Update the session list (updatedAt changes)
      } catch (err) {
        console.error("Failed to send message:", err);
      } finally {
        setIsSending(false);
      }
    },
    [
      inputValue,
      isSending,
      activeSessionId,
      courseId,
      assignmentId,
      createSession,
      sendMessage,
      refetchSession,
      refetchSessions,
    ]
  );

  /** Delete a session and clear it if it was active. */
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteSession({ variables: { id } });
        if (activeSessionId === id) {
          setActiveSessionId(null);
        }
        await refetchSessions();
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [activeSessionId, deleteSession, refetchSessions]
  );

  /** Handle Enter key in the input field. */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Shared chat UI (used in both drawer and full modes) ────────────

  const chatContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {sessionData?.chatSession?.title || "AI Chat"}
          </Typography>
          <ModelPicker />
        </Box>
        {anchor === "right" && (
          <IconButton size="small" onClick={onClose} aria-label="Close chat">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Error displays */}
      {(sessionsError || sessionError) && (
        <Alert severity="error" sx={{ m: 1 }}>
          {sessionsError?.message || sessionError?.message || "Something went wrong."}
        </Alert>
      )}

      {/* Messages area */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          py: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {sessionLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : messages.length === 0 && !isSending ? (
          /* Empty state */
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
              px: 3,
              textAlign: "center",
            }}
          >
            <Typography variant="body2" sx={{ mb: 1 }}>
              Ask a question about the conversation data.
            </Typography>
            <Typography variant="caption" color="text.disabled">
              The AI can help you find patterns, summarize insights, and suggest teaching
              strategies.
            </Typography>
          </Box>
        ) : (
          /* Message bubbles */
          messages.map((msg: any) => (
            <ChatMessageBubble key={msg.id} message={msg} />
          ))
        )}

        {/* Typing indicator while waiting for a response */}
        {isSending && (
          <ChatMessageBubble
            message={{
              id: "__typing__",
              role: "ASSISTANT",
              content: "",
              createdAt: new Date().toISOString(),
            }}
            isTyping
          />
        )}

        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </Box>

      {/* Suggestion chips (visible only when no messages yet) */}
      <SuggestionChips
        onSend={(text) => handleSend(text)}
        visible={messages.length === 0 && !isSending}
      />

      <Divider />

      {/* Input area */}
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, p: 1.5 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          size="small"
          placeholder="Ask about the data..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: "12px",
            },
          }}
        />
        <IconButton
          color="primary"
          onClick={() => handleSend()}
          disabled={!inputValue.trim() || isSending}
          aria-label="Send message"
        >
          {isSending ? <CircularProgress size={20} /> : <SendIcon />}
        </IconButton>
      </Box>
    </Box>
  );

  // ── Render: drawer mode ────────────────────────────────────────────
  if (anchor === "right") {
    return (
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: DRAWER_WIDTH,
            // Sit above the bottom bar (which is ~60px tall)
            bottom: 60,
            height: "auto",
            top: 0,
          },
        }}
      >
        {chatContent}
      </Drawer>
    );
  }

  // ── Render: embedded mode (split-screen in Chat Explorer) ──────────
  if (anchor === "embedded") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          borderLeft: 1,
          borderColor: "divider",
        }}
      >
        {chatContent}
      </Box>
    );
  }

  // ── Render: full-page mode ─────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", height: "100%" }}>
      {/* Session sidebar on the left */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          borderRight: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        {sessionsLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <ChatHistory
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onDelete={handleDelete}
            onNew={handleNewChat}
          />
        )}
      </Box>

      {/* Chat area on the right */}
      <Box sx={{ flex: 1, minWidth: 0 }}>{chatContent}</Box>
    </Box>
  );
}
