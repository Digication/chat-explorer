import React from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import { useFacultyPanel, PanelTab } from "./FacultyPanelContext";
import StudentProfilePage from "@/pages/StudentProfilePage";
import ThreadPanel from "@/components/insights/ThreadPanel";
import AiChatPanel from "@/components/ai/AiChatPanel";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

const TAB_ORDER: PanelTab[] = ["student", "thread", "chat"];
const TAB_LABELS: Record<PanelTab, string> = {
  student: "Student",
  thread: "Thread",
  chat: "AI Chat",
};

export default function FacultyPanel() {
  const panel = useFacultyPanel();
  const { scope } = useInsightsScope();

  const tabIndex = TAB_ORDER.indexOf(panel.activeTab);

  const handleTabChange = (_: React.SyntheticEvent, newIndex: number) => {
    const tab = TAB_ORDER[newIndex];
    if (tab === "student" && panel.studentId) {
      panel.openStudentProfile(panel.studentId, panel.studentName ?? "");
    } else if (tab === "thread" && panel.threadId) {
      panel.openThread(panel.threadId, panel.threadStudentName ?? "");
    } else if (tab === "chat") {
      panel.openChat();
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
      }}
    >
      {/* ── Header bar with back/close buttons ─────────────────── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <IconButton
          size="small"
          onClick={panel.goBack}
          disabled={panel.history.length === 0}
          aria-label="Go back"
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>

        <Typography
          variant="subtitle2"
          noWrap
          sx={{ flex: 1, ml: 1 }}
        >
          {panel.activeTab === "student" && panel.studentName}
          {panel.activeTab === "thread" && panel.threadStudentName}
          {panel.activeTab === "chat" && "AI Chat"}
        </Typography>

        <IconButton size="small" onClick={panel.close} aria-label="Close panel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <Tabs
        value={tabIndex}
        onChange={handleTabChange}
        variant="fullWidth"
        sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider" }}
      >
        {TAB_ORDER.map((tab) => (
          <Tab
            key={tab}
            label={TAB_LABELS[tab]}
            disabled={
              (tab === "student" && !panel.studentId) ||
              (tab === "thread" && !panel.threadId)
            }
          />
        ))}
      </Tabs>

      {/* ── Tab content ────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflow: panel.activeTab === "chat" ? "hidden" : "auto", minHeight: 0 }}>
        {panel.activeTab === "student" && panel.studentId && (
          <StudentProfilePage studentId={panel.studentId} embedded />
        )}

        {panel.activeTab === "thread" && panel.threadId && (
          <ThreadPanel
            threadId={panel.threadId}
            studentName={panel.threadStudentName ?? ""}
            onClose={panel.close}
            embedded
          />
        )}

        {panel.activeTab === "chat" && (
          <AiChatPanel
            open={true}
            onClose={panel.close}
            anchor="embedded"
            institutionId={scope?.institutionId}
            courseId={scope?.courseId}
            assignmentId={scope?.assignmentId}
          />
        )}
      </Box>
    </Box>
  );
}
