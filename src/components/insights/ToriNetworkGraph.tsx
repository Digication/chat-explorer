import React, { useState, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import { GET_NETWORK } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

// Six distinct community colors.
const COMMUNITY_COLORS = [
  "#1976d2", // blue
  "#e53935", // red
  "#43a047", // green
  "#fb8c00", // orange
  "#8e24aa", // purple
  "#00acc1", // teal
];

interface NodeData {
  id: string;
  name: string;
  domain: string;
  frequency: number;
  degree: number;
  communityId: number;
}

interface EdgeData {
  source: string;
  target: string;
  weight: number;
}

export default function ToriNetworkGraph() {
  const { scope } = useInsightsScope();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const { data, loading, error, refetch } = useQuery<any>(GET_NETWORK, {
    variables: { scope },
    skip: !scope,
  });

  // Lay out nodes in a circle, computing x/y for each.
  const layout = useMemo(() => {
    if (!data?.network?.data) return null;

    const nodes: NodeData[] = data.network.data.nodes;
    const edges: EdgeData[] = data.network.data.edges;

    if (nodes.length === 0) return { nodes: [], edges: [], positions: {} as Record<string, { x: number; y: number }> };

    const cx = 200; // center x
    const cy = 200; // center y
    const radius = 160;
    const maxFreq = Math.max(...nodes.map((n) => n.frequency), 1);
    const maxWeight = Math.max(...edges.map((e) => e.weight), 1);

    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      positions[node.id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });

    return { nodes, edges, positions, maxFreq, maxWeight };
  }, [data]);

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        Failed to load network data.
      </Alert>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading || !layout) {
    return <Skeleton variant="rectangular" height={400} />;
  }

  const { nodes, edges, positions, maxFreq, maxWeight } = layout;

  if (nodes.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
        No network data available for this scope.
      </Box>
    );
  }

  // Build a set of edges connected to the hovered node for highlighting.
  const connectedEdges = new Set<number>();
  if (hoveredNode) {
    edges.forEach((e, i) => {
      if (e.source === hoveredNode || e.target === hoveredNode) {
        connectedEdges.add(i);
      }
    });
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <svg
        width={400}
        height={400}
        viewBox="0 0 400 400"
        style={{ maxWidth: "100%", height: "auto" }}
      >
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = positions[edge.source];
          const to = positions[edge.target];
          if (!from || !to) return null;

          const highlighted =
            hoveredNode === null || connectedEdges.has(i);
          const thickness = 1 + (edge.weight / maxWeight!) * 4;

          return (
            <line
              key={`e-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={highlighted ? "#999" : "#eee"}
              strokeWidth={highlighted ? thickness : 0.5}
              strokeOpacity={highlighted ? 0.7 : 0.2}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;

          const r = 6 + (node.frequency / maxFreq!) * 14;
          const color =
            COMMUNITY_COLORS[node.communityId % COMMUNITY_COLORS.length];

          return (
            <Tooltip
              key={node.id}
              title={`${node.name} (${node.domain}) — freq: ${node.frequency}, degree: ${node.degree}`}
              arrow
            >
              <g
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: "pointer" }}
              >
                <circle cx={pos.x} cy={pos.y} r={r} fill={color} />
                <text
                  x={pos.x}
                  y={pos.y + r + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                >
                  {node.name.length > 14
                    ? node.name.slice(0, 12) + "..."
                    : node.name}
                </text>
              </g>
            </Tooltip>
          );
        })}
      </svg>
    </Box>
  );
}
