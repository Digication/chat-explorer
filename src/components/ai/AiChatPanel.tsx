import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  Box,
  Collapse,
  Drawer,
  Typography,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import HistoryIcon from "@mui/icons-material/History";
import {
  GET_CHAT_SESSIONS,
  GET_CHAT_SESSION,
  CREATE_CHAT_SESSION,
  SEND_CHAT_MESSAGE,
  DELETE_CHAT_SESSION,
  UPDATE_CHAT_SESSION_SCOPE,
} from "@/lib/queries/chat";
import ChatMessageBubble from "./ChatMessageBubble";
import SuggestionChips from "./SuggestionChips";
import ChatHistory from "./ChatHistory";
import { useUserSettings } from "@/lib/UserSettingsContext";

interface AiChatPanelProps {
  /** Whether the panel is visible. */
  open: boolean;
  /** Called to close the panel (only relevant when anchor="right"). */
  onClose: () => void;
  /** Institution ID for institutional isolation. Required for session queries. */
  institutionId?: string;
  /** Optional course context for scoping sessions. */
  courseId?: string;
  /** Optional assignment context for scoping sessions. */
  assignmentId?: string;
  /** Optional student context — narrows AI focus to this student's data. */
  studentId?: string;
  /** Display name for the selected student (shown in the context indicator). */
  studentName?: string;
  /** TORI tags to focus the AI conversation on. */
  selectedToriTags?: string[];
  /** Analytics context summary from Insights page sections (passed to AI system prompt). */
  analyticsContext?: string;
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
  institutionId,
  courseId,
  assignmentId,
  studentId,
  studentName,
  selectedToriTags,
  analyticsContext,
  anchor = "right",
}: AiChatPanelProps) {
  const { getDisplayName } = useUserSettings();
  // ── State ──────────────────────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Scope toggles: track each axis independently
  const [scopeCourse, setScopeCourse] = useState<"this" | "all">(courseId ? "this" : "all");
  const [scopeStudent, setScopeStudent] = useState<"this" | "all">(studentId ? "this" : "all");
  const [scopeAssignment, setScopeAssignment] = useState<"this" | "all">(assignmentId ? "this" : "all");

  // Ref for auto-scrolling the message area to the bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Queries ────────────────────────────────────────────────────────

  // Fetch all sessions for this institution (unfiltered by scope so full history is visible)
  const {
    data: sessionsData,
    loading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useQuery<any>(GET_CHAT_SESSIONS, {
    variables: { institutionId },
    skip: !open || !institutionId,
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
  const [updateScope] = useMutation<any>(UPDATE_CHAT_SESSION_SCOPE);

  // ── Auto-load the most recent session when panel opens ─────────────
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll when messages change ───────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // ── Handlers ───────────────────────────────────────────────────────

  /** Derive the backend scope enum from the toggle state. */
  const chatScope =
    scopeStudent === "this" && studentId ? "SELECTION" :
    scopeCourse === "this" && courseId ? "COURSE" :
    "CROSS_COURSE";

  /** Persist scope change to backend. */
  const persistScopeChange = useCallback(async (
    newCourse: "this" | "all",
    newStudent: "this" | "all",
    newAssignment: "this" | "all",
  ) => {
    if (!activeSessionId) return;
    const newScope =
      newStudent === "this" && studentId ? "SELECTION" :
      newCourse === "this" && courseId ? "COURSE" :
      "CROSS_COURSE";
    try {
      await updateScope({
        variables: {
          id: activeSessionId,
          scope: newScope,
          studentId: newStudent === "this" ? studentId : undefined,
          courseId: newCourse === "this" ? courseId : undefined,
          assignmentId: newCourse === "this" && newAssignment === "this" ? assignmentId : undefined,
        },
      });
      await refetchSession();
    } catch (err) {
      console.error("Failed to update scope:", err);
    }
  }, [activeSessionId, studentId, courseId, assignmentId, updateScope, refetchSession]);

  /** Create a new session and make it active. */
  const handleNewChat = useCallback(async () => {
    if (!institutionId) return;
    try {
      const { data } = await createSession({
        variables: {
          institutionId,
          courseId,
          assignmentId,
          studentId,
          scope: chatScope,
          selectedToriTags: selectedToriTags?.length ? selectedToriTags : undefined,
          title: "New chat",
        },
      });
      if (data?.createChatSession?.id) {
        setActiveSessionId(data.createChatSession.id);
        await refetchSessions();
      }
    } catch (err) {
      // Error will show via sessionsError on next render
      console.error("Failed to create session:", err);
    }
  }, [institutionId, courseId, assignmentId, studentId, chatScope, selectedToriTags, createSession, refetchSessions]);

  /** Send a message (either typed or from a suggestion chip). */
  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? inputValue).trim();
      if (!content || isSending) return;

      // If no active session exists, create one first
      let sessionId = activeSessionId;
      if (!sessionId) {
        if (!institutionId) return;
        try {
          const { data } = await createSession({
            variables: {
              institutionId,
              courseId,
              assignmentId,
              studentId,
              scope: chatScope,
              selectedToriTags: selectedToriTags?.length ? selectedToriTags : undefined,
              title: content.slice(0, 60),
            },
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
        await sendMessage({ variables: { sessionId, content, analyticsContext: analyticsContext || undefined } });
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
      studentId,
      chatScope,
      selectedToriTags,
      analyticsContext,
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
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {sessionData?.chatSession?.title || "AI Chat"}
          </Typography>
          {/* 2x2 scope selector toggles */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
            {/* Course axis */}
            {courseId && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={scopeCourse}
                onChange={(_, v) => {
                  if (!v) return;
                  setScopeCourse(v);
                  // When switching to "all courses", reset assignment to "all"
                  const newAssignment = v === "all" ? "all" : scopeAssignment;
                  if (v === "all") setScopeAssignment("all");
                  void persistScopeChange(v, scopeStudent, newAssignment);
                }}
                sx={{ height: 22 }}
              >
                <ToggleButton value="this" sx={{ fontSize: "0.65rem", px: 1, py: 0, textTransform: "none" }}>
                  This course
                </ToggleButton>
                <ToggleButton value="all" sx={{ fontSize: "0.65rem", px: 1, py: 0, textTransform: "none" }}>
                  All courses
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            {/* Student axis */}
            {studentId && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={scopeStudent}
                onChange={(_, v) => {
                  if (!v) return;
                  setScopeStudent(v);
                  void persistScopeChange(scopeCourse, v, scopeAssignment);
                }}
                sx={{ height: 22 }}
              >
                <ToggleButton value="this" sx={{ fontSize: "0.65rem", px: 1, py: 0, textTransform: "none" }}>
                  {studentName ? getDisplayName(studentName) : "This student"}
                </ToggleButton>
                <ToggleButton value="all" sx={{ fontSize: "0.65rem", px: 1, py: 0, textTransform: "none" }}>
                  All students
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            {/* Assignment axis — shown when in "this course" mode */}
            {courseId && scopeCourse === "this" && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={scopeAssignment}
                onChange={(_, v) => {
                  if (!v) return;
                  setScopeAssignment(v);
                  void persistScopeChange(scopeCourse, scopeStudent, v);
                }}
                sx={{ height: 22 }}
              >
                <ToggleButton
                  value="this"
                  disabled={!assignmentId}
                  sx={{ fontSize: "0.65rem", px: 1, py: 0, textTransform: "none" }}
                >
                  This assignment
                </ToggleButton>
                <ToggleButton value="all" sx={{ fontSize: "0.65rem", px: 1, py: 0, textTransform: "none" }}>
                  All assignments
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            {/* Fallback when no context toggles are available */}
            {!courseId && !studentId && (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: "22px" }}>
                All courses
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {/* History toggle (embedded & drawer modes) */}
          {anchor !== "full" && sessions.length > 0 && (
            <IconButton
              size="small"
              onClick={() => setShowHistory((p) => !p)}
              aria-label="Toggle chat history"
              sx={{ color: showHistory ? "primary.main" : "text.secondary" }}
            >
              <HistoryIcon fontSize="small" />
            </IconButton>
          )}
          {/* New chat button */}
          {anchor !== "full" && (
            <IconButton size="small" onClick={handleNewChat} aria-label="New chat">
              <AddIcon fontSize="small" />
            </IconButton>
          )}
          {anchor === "right" && (
            <IconButton size="small" onClick={onClose} aria-label="Close chat">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Collapsible session history (embedded & drawer modes) */}
      {anchor !== "full" && (
        <Collapse in={showHistory}>
          <Box sx={{ maxHeight: 200, overflowY: "auto", borderBottom: 1, borderColor: "divider" }}>
            <ChatHistory
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={(id) => { setActiveSessionId(id); setShowHistory(false); }}
              onDelete={handleDelete}
              onNew={handleNewChat}
            />
          </Box>
        </Collapse>
      )}

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
        onSend={(text) => setInputValue(text)}
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
