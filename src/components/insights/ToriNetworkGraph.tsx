import React, { useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_NETWORK } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import EvidencePopover from "@/components/insights/EvidencePopover";

// Six distinct community colors.
const COMMUNITY_COLORS = [
  "#1976d2", // blue
  "#e53935", // red
  "#43a047", // green
  "#fb8c00", // orange
  "#8e24aa", // purple
  "#00acc1", // teal
];

// Light fills per community (used as node background).
const COMMUNITY_FILLS = [
  "#e3f2fd", // blue
  "#ffebee", // red
  "#e8f5e9", // green
  "#fff3e0", // orange
  "#f3e5f5", // purple
  "#e0f7fa", // teal
];

/** Layout constants */
const NODE_HEIGHT_MIN = 24;
const NODE_HEIGHT_MAX = 36;
const NODE_PAD_X = 12; // horizontal padding inside rect
const NODE_PAD_Y = 8;  // vertical padding between nodes in collision
const FONT = "12px Inter, system-ui, sans-serif";
const MAX_VISIBLE_NODES = 30;
const MIN_FREQ_THRESHOLD = 3; // collapse nodes below this when count > MAX_VISIBLE_NODES

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

interface LayoutNode extends NodeData {
  labelWidth: number; // measured text width
  boxWidth: number;   // labelWidth + padding
  boxHeight: number;  // scaled by frequency
}

interface PopoverState {
  anchorEl: HTMLElement;
  toriTagId: string;
  toriTagName: string;
}

interface ToriNetworkGraphProps {
  onViewThread?: (threadId: string, studentName: string, studentId?: string, initialToriTag?: string) => void;
  onStudentClick?: (studentId: string, studentName: string) => void;
}

/** Measure text width using an off-screen canvas. */
function measureTextWidths(nodes: NodeData[]): Map<string, number> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = FONT;
  const widths = new Map<string, number>();
  for (const node of nodes) {
    widths.set(node.id, ctx.measureText(node.name).width);
  }
  return widths;
}

/** Get the set of node IDs connected to a given node via edges. */
function getConnectedNodes(nodeId: string, edges: EdgeData[]): Set<string> {
  const connected = new Set<string>();
  connected.add(nodeId);
  for (const e of edges) {
    if (e.source === nodeId) connected.add(e.target);
    if (e.target === nodeId) connected.add(e.source);
  }
  return connected;
}

export default function ToriNetworkGraph({ onViewThread, onStudentClick }: ToriNetworkGraphProps) {
  const { scope } = useInsightsScope();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [lockedNode, setLockedNode] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const { data, loading, error, refetch } = useQuery<any>(GET_NETWORK, {
    variables: { scope },
    skip: !scope,
  });

  // Force-directed layout with AABB collision avoidance and rectangle nodes.
  const layout = useMemo(() => {
    if (!data?.network?.data) return null;

    let nodes: NodeData[] = data.network.data.nodes;
    const edges: EdgeData[] = data.network.data.edges;

    if (nodes.length === 0) return { nodes: [] as LayoutNode[], edges: [], positions: {} as Record<string, { x: number; y: number }>, W: 500, H: 400 };

    // Dense graph handling: collapse low-frequency nodes when there are too many
    if (nodes.length > MAX_VISIBLE_NODES) {
      const sorted = [...nodes].sort((a, b) => b.frequency - a.frequency);
      nodes = sorted.filter((n) => n.frequency >= MIN_FREQ_THRESHOLD).slice(0, MAX_VISIBLE_NODES);
      // If we still have too many, just take the top N
      if (nodes.length > MAX_VISIBLE_NODES) {
        nodes = nodes.slice(0, MAX_VISIBLE_NODES);
      }
    }

    // Measure text widths
    const textWidths = measureTextWidths(nodes);

    // Build layout nodes with measured dimensions (height scales with frequency)
    const maxFreq = Math.max(...nodes.map((n) => n.frequency), 1);
    const layoutNodes: LayoutNode[] = nodes.map((n) => {
      const labelWidth = textWidths.get(n.id) ?? 60;
      const freqRatio = n.frequency / maxFreq;
      const boxHeight = NODE_HEIGHT_MIN + (NODE_HEIGHT_MAX - NODE_HEIGHT_MIN) * freqRatio;
      return { ...n, labelWidth, boxWidth: labelWidth + NODE_PAD_X * 2, boxHeight };
    });

    // Filter edges to only include visible nodes
    const nodeIds = new Set(layoutNodes.map((n) => n.id));
    const visibleEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    const W = 700;
    const H = Math.max(400, layoutNodes.length * 16);
    const maxWeight = Math.max(...visibleEdges.map((e) => e.weight), 1);

    // Build a node-index lookup
    const nodeIndex: Record<string, number> = {};
    layoutNodes.forEach((n, i) => { nodeIndex[n.id] = i; });

    // Initialize positions (seeded by index for stability)
    const pos = layoutNodes.map((_, i) => ({
      x: W * 0.15 + (W * 0.7) * ((i * 7 + 13) % layoutNodes.length) / Math.max(layoutNodes.length - 1, 1),
      y: H * 0.15 + (H * 0.7) * ((i * 11 + 7) % layoutNodes.length) / Math.max(layoutNodes.length - 1, 1),
    }));

    const ITERATIONS = 300;
    for (let iter = 0; iter < ITERATIONS; iter++) {
      const temp = 1 - iter / ITERATIONS;

      // Repulsion between all node pairs (Coulomb-like, scaled by label width)
      for (let i = 0; i < layoutNodes.length; i++) {
        for (let j = i + 1; j < layoutNodes.length; j++) {
          const dx = pos[i].x - pos[j].x;
          const dy = pos[i].y - pos[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          // Increase repulsion for wider nodes
          const avgWidth = (layoutNodes[i].boxWidth + layoutNodes[j].boxWidth) / 2;
          const force = (4000 * temp * (avgWidth / 60)) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          pos[i].x += fx;
          pos[i].y += fy;
          pos[j].x -= fx;
          pos[j].y -= fy;
        }
      }

      // Attraction along edges (Hooke-like)
      for (const edge of visibleEdges) {
        const si = nodeIndex[edge.source];
        const ti = nodeIndex[edge.target];
        if (si === undefined || ti === undefined) continue;
        const dx = pos[ti].x - pos[si].x;
        const dy = pos[ti].y - pos[si].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 100) * 0.008 * (edge.weight / maxWeight) * temp;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        pos[si].x += fx;
        pos[si].y += fy;
        pos[ti].x -= fx;
        pos[ti].y -= fy;
      }

      // Centering force
      for (let i = 0; i < layoutNodes.length; i++) {
        pos[i].x += (W / 2 - pos[i].x) * 0.01;
        pos[i].y += (H / 2 - pos[i].y) * 0.01;
      }

      // AABB collision resolution — push overlapping rectangles apart
      for (let i = 0; i < layoutNodes.length; i++) {
        for (let j = i + 1; j < layoutNodes.length; j++) {
          const dx = pos[i].x - pos[j].x;
          const dy = pos[i].y - pos[j].y;

          const halfW_i = layoutNodes[i].boxWidth / 2 + NODE_PAD_Y;
          const halfW_j = layoutNodes[j].boxWidth / 2 + NODE_PAD_Y;
          const halfH_i = layoutNodes[i].boxHeight / 2 + NODE_PAD_Y;
          const halfH_j = layoutNodes[j].boxHeight / 2 + NODE_PAD_Y;

          const overlapX = (halfW_i + halfW_j) - Math.abs(dx);
          const overlapY = (halfH_i + halfH_j) - Math.abs(dy);

          if (overlapX > 0 && overlapY > 0) {
            // Resolve along the axis with smallest overlap
            if (overlapX < overlapY) {
              const push = overlapX / 2;
              const sign = dx >= 0 ? 1 : -1;
              pos[i].x += sign * push;
              pos[j].x -= sign * push;
            } else {
              const push = overlapY / 2;
              const sign = dy >= 0 ? 1 : -1;
              pos[i].y += sign * push;
              pos[j].y -= sign * push;
            }
          }
        }
      }
    }

    // Post-layout: interleaved clamp + collision resolution.
    // Allow canvas to expand so boundary-clamped nodes don't get stuck overlapping.
    let finalW = W, finalH = H;
    for (let pass = 0; pass < 100; pass++) {
      // Clamp to left/top boundary
      for (let i = 0; i < layoutNodes.length; i++) {
        const halfW = layoutNodes[i].boxWidth / 2;
        pos[i].x = Math.max(halfW + 4, pos[i].x);
        pos[i].y = Math.max(layoutNodes[i].boxHeight / 2 + 4, pos[i].y);
      }
      // Resolve overlaps
      let hadOverlap = false;
      for (let i = 0; i < layoutNodes.length; i++) {
        for (let j = i + 1; j < layoutNodes.length; j++) {
          const dx = pos[i].x - pos[j].x;
          const dy = pos[i].y - pos[j].y;
          const halfW_i = layoutNodes[i].boxWidth / 2 + NODE_PAD_Y;
          const halfW_j = layoutNodes[j].boxWidth / 2 + NODE_PAD_Y;
          const halfH_i = layoutNodes[i].boxHeight / 2 + NODE_PAD_Y;
          const halfH_j = layoutNodes[j].boxHeight / 2 + NODE_PAD_Y;
          const overlapX = (halfW_i + halfW_j) - Math.abs(dx);
          const overlapY = (halfH_i + halfH_j) - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            hadOverlap = true;
            if (overlapX < overlapY) {
              const push = overlapX / 2 + 1;
              const sign = dx >= 0 ? 1 : -1;
              pos[i].x += sign * push;
              pos[j].x -= sign * push;
            } else {
              const push = overlapY / 2 + 1;
              const sign = dy >= 0 ? 1 : -1;
              pos[i].y += sign * push;
              pos[j].y -= sign * push;
            }
          }
        }
      }
      if (!hadOverlap) break;
    }
    // Compute final canvas size to fit all nodes
    for (let i = 0; i < layoutNodes.length; i++) {
      const halfW = layoutNodes[i].boxWidth / 2;
      pos[i].x = Math.max(halfW + 4, pos[i].x);
      pos[i].y = Math.max(layoutNodes[i].boxHeight / 2 + 4, pos[i].y);
      finalW = Math.max(finalW, pos[i].x + halfW + 8);
      finalH = Math.max(finalH, pos[i].y + layoutNodes[i].boxHeight / 2 + 8);
    }

    const positions: Record<string, { x: number; y: number }> = {};
    layoutNodes.forEach((node, i) => {
      positions[node.id] = pos[i];
    });

    return { nodes: layoutNodes, edges: visibleEdges, positions, maxWeight, W: finalW, H: finalH };
  }, [data]);

  // The "active" node is whichever is locked, or hovered if none is locked
  const activeNode = lockedNode ?? hoveredNode;

  // Connected nodes for highlighting
  const connectedNodes = useMemo(() => {
    if (!activeNode || !layout) return null;
    return getConnectedNodes(activeNode, layout.edges);
  }, [activeNode, layout]);

  const handleNodeHover = useCallback((nodeId: string | null) => {
    // Don't change hover state while a node is locked
    if (!lockedNode) {
      setHoveredNode(nodeId);
    }
  }, [lockedNode]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: LayoutNode) => {
    if (!anchorRef.current || !layout) return;

    // Toggle lock: clicking the locked node unlocks it, otherwise lock the new one
    if (lockedNode === node.id) {
      setLockedNode(null);
      setPopover(null);
      return;
    }

    setLockedNode(node.id);

    // Position hidden anchor for popover
    const svgEl = (event.currentTarget as Element).closest("svg")!;
    const rect = svgEl.getBoundingClientRect();
    const svgPos = layout.positions[node.id];
    const scaleX = rect.width / layout.W;
    const scaleY = rect.height / layout.H;
    anchorRef.current.style.position = "fixed";
    anchorRef.current.style.left = `${rect.left + svgPos.x * scaleX}px`;
    anchorRef.current.style.top = `${rect.top + svgPos.y * scaleY + (node.boxHeight / 2) * scaleY}px`;
    setPopover({ anchorEl: anchorRef.current, toriTagId: node.id, toriTagName: node.name });
  }, [lockedNode, layout]);

  const handleBackgroundClick = useCallback(() => {
    setLockedNode(null);
    setPopover(null);
  }, []);

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

  const { nodes, edges, positions, maxWeight, W, H } = layout;

  if (nodes.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
        No network data available for this scope.
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative" }}>
      {/* Hidden anchor for popover positioning */}
      <div ref={anchorRef} style={{ position: "fixed", width: 1, height: 1, pointerEvents: "none" }} />

      {/* Hint text */}
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
        Hover to highlight connections. Click a tag to lock and view evidence.
      </Typography>

      <Box sx={{ overflowX: "auto" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ minWidth: 500, maxWidth: 900, height: "auto", display: "block", margin: "0 auto" }}
        >
          {/* Background click target to unlock */}
          <rect
            x={0} y={0} width={W} height={H}
            fill="transparent"
            onClick={handleBackgroundClick}
          />

          {/* Edges */}
          {edges.map((edge, i) => {
            const from = positions[edge.source];
            const to = positions[edge.target];
            if (!from || !to) return null;

            const isHighlighted = !activeNode
              || (connectedNodes?.has(edge.source) && connectedNodes?.has(edge.target));
            const thickness = 1 + (edge.weight / maxWeight!) * 2; // 1-3px range

            return (
              <line
                key={`e-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={isHighlighted ? "#bbb" : "#eee"}
                strokeWidth={isHighlighted ? thickness : 0.5}
                strokeOpacity={isHighlighted ? 0.6 : 0.15}
              />
            );
          })}

          {/* Nodes — rounded rectangles with text labels */}
          {nodes.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;

            const colorIdx = node.communityId % COMMUNITY_COLORS.length;
            const strokeColor = COMMUNITY_COLORS[colorIdx];
            const fillColor = COMMUNITY_FILLS[colorIdx];
            const isActive = activeNode === node.id;
            const isConnected = !activeNode || connectedNodes?.has(node.id);

            // Font size scales with node height
            const fontSize = 10 + (node.boxHeight - NODE_HEIGHT_MIN) / (NODE_HEIGHT_MAX - NODE_HEIGHT_MIN) * 3; // 10-13px

            return (
              <g
                key={node.id}
                onMouseEnter={() => handleNodeHover(node.id)}
                onMouseLeave={() => handleNodeHover(null)}
                onClick={(e) => { e.stopPropagation(); handleNodeClick(e, node); }}
                style={{ cursor: "pointer" }}
                opacity={isConnected ? 1 : 0.15}
              >
                <rect
                  x={pos.x - node.boxWidth / 2}
                  y={pos.y - node.boxHeight / 2}
                  width={node.boxWidth}
                  height={node.boxHeight}
                  rx={6}
                  ry={6}
                  fill={isActive ? strokeColor : fillColor}
                  stroke={strokeColor}
                  strokeWidth={isActive ? 2 : 1}
                />
                {/* Frequency count badge */}
                <text
                  x={pos.x + node.boxWidth / 2 - 4}
                  y={pos.y - node.boxHeight / 2 + 4}
                  textAnchor="end"
                  dominantBaseline="hanging"
                  fill={isActive ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.35)"}
                  fontSize={9}
                  fontFamily="Inter, system-ui, sans-serif"
                  fontWeight={600}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {node.frequency}
                </text>
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isActive ? "#fff" : "#333"}
                  fontSize={fontSize}
                  fontFamily="Inter, system-ui, sans-serif"
                  fontWeight={isActive ? 600 : 400}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </Box>

      {/* Evidence popover — shown when a node is clicked (locked) */}
      {popover && scope && (
        <EvidencePopover
          anchorEl={popover.anchorEl}
          toriTagId={popover.toriTagId}
          toriTagName={popover.toriTagName}
          scope={scope}
          onClose={() => { setPopover(null); setLockedNode(null); }}
          onViewThread={(threadId, studentName, studentId, initialToriTag) => {
            setPopover(null);
            setLockedNode(null);
            onViewThread?.(threadId, studentName, studentId, initialToriTag);
          }}
          onStudentClick={onStudentClick ? (id, name) => {
            setPopover(null);
            setLockedNode(null);
            onStudentClick(id, name);
          } : undefined}
        />
      )}
    </Box>
  );
}
