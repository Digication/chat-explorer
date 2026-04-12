import React, { createContext, useContext, useReducer, useCallback, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────────
export type PanelTab = "student" | "thread" | "chat";

interface HistoryEntry {
  tab: PanelTab;
  studentId?: string;
  studentName?: string;
  threadId?: string;
  threadStudentName?: string;
}

export interface FacultyPanelState {
  isOpen: boolean;
  activeTab: PanelTab;

  // Student Profile tab
  studentId: string | null;
  studentName: string | null;

  // Thread tab
  threadId: string | null;
  threadStudentName: string | null;

  // Chat tab
  activeChatSessionId: string | null;

  // Navigation history (for back button)
  history: HistoryEntry[];
}

export interface FacultyPanelActions {
  openStudentProfile: (studentId: string, studentName: string) => void;
  openThread: (threadId: string, studentName: string) => void;
  openChat: () => void;
  goBack: () => void;
  close: () => void;
  setActiveChatSession: (sessionId: string | null) => void;
}

// ── Reducer ─────────────────────────────────────────────────────
type Action =
  | { type: "OPEN_STUDENT"; studentId: string; studentName: string }
  | { type: "OPEN_THREAD"; threadId: string; studentName: string }
  | { type: "OPEN_CHAT" }
  | { type: "GO_BACK" }
  | { type: "CLOSE" }
  | { type: "SET_CHAT_SESSION"; sessionId: string | null };

const initialState: FacultyPanelState = {
  isOpen: false,
  activeTab: "student",
  studentId: null,
  studentName: null,
  threadId: null,
  threadStudentName: null,
  activeChatSessionId: null,
  history: [],
};

/** Snapshot the current tab state so we can restore it on goBack. */
function snapshotEntry(state: FacultyPanelState): HistoryEntry {
  return {
    tab: state.activeTab,
    studentId: state.studentId ?? undefined,
    studentName: state.studentName ?? undefined,
    threadId: state.threadId ?? undefined,
    threadStudentName: state.threadStudentName ?? undefined,
  };
}

function reducer(state: FacultyPanelState, action: Action): FacultyPanelState {
  switch (action.type) {
    case "OPEN_STUDENT":
      return {
        ...state,
        isOpen: true,
        activeTab: "student",
        studentId: action.studentId,
        studentName: action.studentName,
        // Push current state onto history only if panel is already open
        history: state.isOpen ? [...state.history, snapshotEntry(state)] : [],
      };

    case "OPEN_THREAD":
      return {
        ...state,
        isOpen: true,
        activeTab: "thread",
        threadId: action.threadId,
        threadStudentName: action.studentName,
        history: state.isOpen ? [...state.history, snapshotEntry(state)] : [],
      };

    case "OPEN_CHAT":
      return {
        ...state,
        isOpen: true,
        activeTab: "chat",
        history: state.isOpen ? [...state.history, snapshotEntry(state)] : [],
      };

    case "GO_BACK": {
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1];
      return {
        ...state,
        activeTab: prev.tab,
        studentId: prev.studentId ?? null,
        studentName: prev.studentName ?? null,
        threadId: prev.threadId ?? null,
        threadStudentName: prev.threadStudentName ?? null,
        history: state.history.slice(0, -1),
      };
    }

    case "CLOSE":
      return {
        ...state,
        isOpen: false,
        // Preserve tab state so reopening returns to the last viewed tab
        history: [],
      };

    case "SET_CHAT_SESSION":
      return { ...state, activeChatSessionId: action.sessionId };

    default:
      return state;
  }
}

// ── Context ─────────────────────────────────────────────────────
const FacultyPanelContext = createContext<
  (FacultyPanelState & FacultyPanelActions) | null
>(null);

export function FacultyPanelProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const openStudentProfile = useCallback(
    (studentId: string, studentName: string) =>
      dispatch({ type: "OPEN_STUDENT", studentId, studentName }),
    [],
  );

  const openThread = useCallback(
    (threadId: string, studentName: string) =>
      dispatch({ type: "OPEN_THREAD", threadId, studentName }),
    [],
  );

  const openChat = useCallback(() => dispatch({ type: "OPEN_CHAT" }), []);
  const goBack = useCallback(() => dispatch({ type: "GO_BACK" }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);

  const setActiveChatSession = useCallback(
    (sessionId: string | null) =>
      dispatch({ type: "SET_CHAT_SESSION", sessionId }),
    [],
  );

  const value = useMemo(
    () => ({
      ...state,
      openStudentProfile,
      openThread,
      openChat,
      goBack,
      close,
      setActiveChatSession,
    }),
    [state, openStudentProfile, openThread, openChat, goBack, close, setActiveChatSession],
  );

  return (
    <FacultyPanelContext.Provider value={value}>
      {children}
    </FacultyPanelContext.Provider>
  );
}

/** Hook to access FacultyPanel state and actions. */
export function useFacultyPanel(): FacultyPanelState & FacultyPanelActions {
  const ctx = useContext(FacultyPanelContext);
  if (!ctx) {
    throw new Error("useFacultyPanel must be used within a FacultyPanelProvider");
  }
  return ctx;
}
