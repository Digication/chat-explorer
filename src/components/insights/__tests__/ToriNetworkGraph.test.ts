import { describe, it, expect } from "vitest";

/**
 * Tests the collision avoidance logic extracted from ToriNetworkGraph.
 * We test the layout algorithm directly rather than rendering the full
 * component (which requires Apollo + scope context).
 */

interface NodeData {
  id: string;
  name: string;
  domain: string;
  frequency: number;
  degree: number;
  communityId: number;
}

/** Compute layout positions using the same algorithm as the component. */
function computeLayout(nodes: NodeData[], edges: { source: string; target: string; weight: number }[]) {
  const W = 500;
  const H = 400;
  const COLLISION_PADDING = 8;
  const maxFreq = Math.max(...nodes.map((n) => n.frequency), 1);
  const maxWeight = Math.max(...edges.map((e) => e.weight), 1);
  const radii = nodes.map((n) => 6 + (n.frequency / maxFreq) * 14);

  const nodeIndex: Record<string, number> = {};
  nodes.forEach((n, i) => { nodeIndex[n.id] = i; });

  const pos = nodes.map((_, i) => ({
    x: W * 0.2 + (W * 0.6) * ((i * 7 + 13) % nodes.length) / Math.max(nodes.length - 1, 1),
    y: H * 0.2 + (H * 0.6) * ((i * 11 + 7) % nodes.length) / Math.max(nodes.length - 1, 1),
  }));

  const ITERATIONS = 200;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const temp = 1 - iter / ITERATIONS;

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

    for (let i = 0; i < nodes.length; i++) {
      pos[i].x += (W / 2 - pos[i].x) * 0.01;
      pos[i].y += (H / 2 - pos[i].y) * 0.01;
    }

    // Collision resolution
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
        const minDist = radii[i] + radii[j] + COLLISION_PADDING;
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          pos[i].x += nx * overlap;
          pos[i].y += ny * overlap;
          pos[j].x -= nx * overlap;
          pos[j].y -= ny * overlap;
        }
      }
    }
  }

  const pad = 30;
  for (const p of pos) {
    p.x = Math.max(pad, Math.min(W - pad, p.x));
    p.y = Math.max(pad, Math.min(H - pad, p.y));
  }

  return { pos, radii };
}

describe("ToriNetworkGraph layout", () => {
  const makeNode = (id: string, frequency: number): NodeData => ({
    id,
    name: `Tag ${id}`,
    domain: "Test",
    frequency,
    degree: 2,
    communityId: 0,
  });

  it("nodes do not overlap after layout (distance >= sum of radii)", () => {
    const nodes = [
      makeNode("a", 10),
      makeNode("b", 8),
      makeNode("c", 6),
      makeNode("d", 4),
      makeNode("e", 10),
    ];
    const edges = [
      { source: "a", target: "b", weight: 5 },
      { source: "b", target: "c", weight: 3 },
      { source: "c", target: "d", weight: 2 },
      { source: "d", target: "e", weight: 4 },
      { source: "a", target: "e", weight: 6 },
    ];

    const { pos, radii } = computeLayout(nodes, edges);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = radii[i] + radii[j];
        // Allow a small tolerance for floating point
        expect(dist).toBeGreaterThanOrEqual(minDist - 1);
      }
    }
  });

  it("all nodes stay within bounds", () => {
    const nodes = Array.from({ length: 15 }, (_, i) =>
      makeNode(String(i), Math.random() * 10 + 1)
    );
    const edges = nodes.slice(1).map((n, i) => ({
      source: nodes[i].id,
      target: n.id,
      weight: Math.random() * 5 + 1,
    }));

    const { pos } = computeLayout(nodes, edges);

    for (const p of pos) {
      expect(p.x).toBeGreaterThanOrEqual(30);
      expect(p.x).toBeLessThanOrEqual(470);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThanOrEqual(370);
    }
  });

  it("handles single node without error", () => {
    const nodes = [makeNode("solo", 5)];
    const edges: { source: string; target: string; weight: number }[] = [];

    const { pos } = computeLayout(nodes, edges);

    expect(pos.length).toBe(1);
    expect(pos[0].x).toBeGreaterThanOrEqual(30);
    expect(pos[0].y).toBeGreaterThanOrEqual(30);
  });
});
