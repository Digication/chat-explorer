import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import SmartRecommendations from "@/components/insights/SmartRecommendations";
import MetricsCards from "@/components/insights/MetricsCards";
import HeatmapView from "@/components/insights/HeatmapView";
import ToriNetworkGraph from "@/components/insights/ToriNetworkGraph";
import DepthBands from "@/components/insights/DepthBands";
import CoOccurrenceList from "@/components/insights/CoOccurrenceList";
import TextSignals from "@/components/insights/TextSignals";
import ToriTagFrequencies from "@/components/insights/ToriTagFrequencies";
import StudentEngagementTable from "@/components/insights/StudentEngagementTable";
import ThreadPanel from "@/components/insights/ThreadPanel";
import GrowthVisualization from "@/components/insights/GrowthVisualization";

/** Consistent wrapper for each analytics section. */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper id={id} variant="outlined" sx={{ p: 4, mb: 4 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

/** localStorage key for hiding the Reflection Depth section. */
const DEPTH_HIDDEN_KEY = "chat-explorer:hideDepthSection";

export default function InsightsPage() {
  const navigate = useNavigate();
  const { scope } = useInsightsScope();
  const showCompareButton = scope && !scope.courseId; // Institution-level only
  const [openThread, setOpenThread] = useState<{
    threadId: string;
    studentName: string;
  } | null>(null);
  const [depthHidden, setDepthHidden] = useState(
    () => localStorage.getItem(DEPTH_HIDDEN_KEY) === "true"
  );

  const handleViewThread = useCallback((threadId: string, studentName: string) => {
    setOpenThread({ threadId, studentName });
  }, []);

  return (
    <Box sx={{ display: "flex", p: 4 }}>
      {/* Main insights content — shrinks when fixed panel is open */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          maxWidth: 1200,
          mx: "auto",
          py: 4,
          px: 2,
          pr: 2,
        }}
      >
        {/* Compare Courses button — visible at institution level */}
        {showCompareButton && (
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CompareArrowsIcon />}
              onClick={() => navigate("/insights/compare")}
            >
              Compare Courses
            </Button>
          </Box>
        )}

        {/* Smart recommendations (top of page) */}
        <SmartRecommendations />

        {/* Overview metric cards */}
        <MetricsCards onViewThread={handleViewThread} />

        {/* Text signal aggregates */}
        <Section id="text-signals" title="Text Signals">
          <TextSignals />
        </Section>

        {/* Heatmap — with drill-down */}
        <Section id="heatmap" title="Reflection Heatmap">
          <HeatmapView onViewThread={handleViewThread} />
        </Section>

        {/* TORI tag frequency bars */}
        <Section id="tori-frequencies" title="TORI Tag Frequencies">
          <ToriTagFrequencies onViewThread={handleViewThread} />
        </Section>

        {/* Network graph */}
        <Section id="network" title="TORI Network">
          <ToriNetworkGraph onViewThread={handleViewThread} />
        </Section>

        {/* Student engagement table */}
        <Section id="engagement-table" title="Student Engagement">
          <StudentEngagementTable onViewThread={handleViewThread} />
        </Section>

        {/* Depth bands — collapsible for classroom sensitivity */}
        <Paper id="depth" variant="outlined" sx={{ p: 4, mb: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: depthHidden ? 0 : 2 }}>
            <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
              Reflection Depth
            </Typography>
            <IconButton
              size="small"
              onClick={() => {
                const next = !depthHidden;
                setDepthHidden(next);
                localStorage.setItem(DEPTH_HIDDEN_KEY, String(next));
              }}
              aria-label={depthHidden ? "Show reflection depth" : "Hide reflection depth"}
            >
              {depthHidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
          </Box>
          {!depthHidden && <DepthBands onViewThread={handleViewThread} />}
        </Paper>

        {/* Student growth over time */}
        <Section id="growth" title="Student Growth Over Time">
          <GrowthVisualization onViewThread={handleViewThread} />
        </Section>

        {/* Co-occurrence patterns */}
        <Section id="cooccurrence" title="Co-Occurrence Patterns">
          <CoOccurrenceList />
        </Section>
      </Box>

      {/* Slide-in thread panel with backdrop */}
      {openThread && (
        <>
          <Box
            onClick={() => setOpenThread(null)}
            sx={{
              position: "fixed",
              inset: 0,
              zIndex: 1099,
              bgcolor: "rgba(0,0,0,0.15)",
            }}
          />
          <ThreadPanel
            threadId={openThread.threadId}
            studentName={openThread.studentName}
            onClose={() => setOpenThread(null)}
          />
        </>
      )}
    </Box>
  );
}
