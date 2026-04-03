import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import ScopeSelector from "@/components/insights/ScopeSelector";
import SmartRecommendations from "@/components/insights/SmartRecommendations";
import MetricsCards from "@/components/insights/MetricsCards";
import HeatmapView from "@/components/insights/HeatmapView";
import ToriNetworkGraph from "@/components/insights/ToriNetworkGraph";
import DepthBands from "@/components/insights/DepthBands";
import CoOccurrenceList from "@/components/insights/CoOccurrenceList";

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

export default function InsightsPage() {
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", py: 4, px: 2 }}>
      {/* Scope breadcrumb selector */}
      <ScopeSelector />

      {/* Smart recommendations (top of page) */}
      <SmartRecommendations />

      {/* Overview metric cards */}
      <MetricsCards />

      {/* Heatmap */}
      <Section id="heatmap" title="Reflection Heatmap">
        <HeatmapView />
      </Section>

      {/* Network graph */}
      <Section id="network" title="TORI Network">
        <ToriNetworkGraph />
      </Section>

      {/* Depth bands */}
      <Section id="depth" title="Reflection Depth">
        <DepthBands />
      </Section>

      {/* Co-occurrence patterns */}
      <Section id="cooccurrence" title="Co-Occurrence Patterns">
        <CoOccurrenceList />
      </Section>
    </Box>
  );
}
