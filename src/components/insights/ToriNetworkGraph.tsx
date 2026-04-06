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

  // Force-directed layout: positions nodes based on repulsion + edge attraction.
  const layout = useMemo(() => {
    if (!data?.network?.data) return null;

    const nodes: NodeData[] = data.network.data.nodes;
    const edges: EdgeData[] = data.network.data.edges;

    if (nodes.length === 0) return { nodes: [], edges: [], positions: {} as Record<string, { x: number; y: number }> };

    const W = 500;
    const H = 400;
    const maxFreq = Math.max(...nodes.map((n) => n.frequency), 1);
    const maxWeight = Math.max(...edges.map((e) => e.weight), 1);

    // Build a node-index lookup for edge references
    const nodeIndex: Record<string, number> = {};
    nodes.forEach((n, i) => { nodeIndex[n.id] = i; });

    // Initialize positions randomly (seeded by index for stability)
    const pos = nodes.map((_, i) => ({
      x: W * 0.2 + (W * 0.6) * ((i * 7 + 13) % nodes.length) / Math.max(nodes.length - 1, 1),
      y: H * 0.2 + (H * 0.6) * ((i * 11 + 7) % nodes.length) / Math.max(nodes.length - 1, 1),
    }));

    // Run force simulation iterations
    const ITERATIONS = 200;
    for (let iter = 0; iter < ITERATIONS; iter++) {
      const temp = 1 - iter / ITERATIONS; // cooling factor

      // Repulsion between all node pairs (Coulomb-like)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = pos[i].x - pos[j].x;
          const dy = pos[i].y - pos[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (2000 * temp) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          pos[i].x += fx;
          pos[i].y += fy;
          pos[j].x -= fx;
          pos[j].y -= fy;
        }
      }

      // Attraction along edges (Hooke-like)
      for (const edge of edges) {
        const si = nodeIndex[edge.source];
        const ti = nodeIndex[edge.target];
        if (si === undefined || ti === undefined) continue;
        const dx = pos[ti].x - pos[si].x;
        const dy = pos[ti].y - pos[si].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 80) * 0.01 * (edge.weight / maxWeight) * temp;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        pos[si].x += fx;
        pos[si].y += fy;
        pos[ti].x -= fx;
        pos[ti].y -= fy;
      }

      // Centering force
      for (let i = 0; i < nodes.length; i++) {
        pos[i].x += (W / 2 - pos[i].x) * 0.01;
        pos[i].y += (H / 2 - pos[i].y) * 0.01;
      }
    }

    // Clamp positions to stay within bounds (with padding)
    const pad = 30;
    for (const p of pos) {
      p.x = Math.max(pad, Math.min(W - pad, p.x));
      p.y = Math.max(pad, Math.min(H - pad, p.y));
    }

    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node, i) => {
      positions[node.id] = pos[i];
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
        width={500}
        height={400}
        viewBox="0 0 500 400"
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
